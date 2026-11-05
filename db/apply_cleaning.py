"""Apply the data review of 2026-11-05: read verdict files, write reversible flags (db/flags.py), export CSV lists.

Usage: python apply_cleaning.py <folder with verdict_*.jsonl and duplicates_places.jsonl>
Output: data/cleaning/*.csv. Nothing is deleted; `python flags.py undo <batch>` reverts a batch.
"""
import csv
import glob
import json
import os
import re
import sys

from common import ROOT, connect
from flags import ensure, flag_offer, flag_place
from tags import ADULT, ADULT_OSM

REVIEW, DUP, RULE = 'review-2026-11-05', 'dup-2026-11-05', 'rule-2026-11-05'
CATEGORIES = set('cafe restaurant imbiss eis spielplatz abenteuer indoor spielhaus freizeit sportstaette sportverein reiten bolzplatz baden park garten naturschutz museum kultur ausflug tierhof '
                 'buecherei laden windeln apotheke kinderarzt hebamme geburtshaus klinik zahnarzt physio therapie frauenarzt hno augenarzt kinderpsychologie beratung treffpunkt jugend pfadfinder '
                 'kita schule kurs musikschule tanzschule sprachschule kreativschule nachhilfe wc wickel trinkwasser'.split())
CANCELLED = re.compile(r'entf[äa]llt|f[äa]llt aus|abgesagt', re.I)


def lines(path):
    with open(path, encoding='utf-8') as f:
        for raw in f:
            if raw.strip(): yield json.loads(raw)


def run(folder):
    con = connect()
    ensure(con)
    places = {r[0]: r[1:] for r in con.execute('SELECT id, name, category FROM places')}
    hours = {r[0] for r in con.execute("""SELECT DISTINCT sr.place_id FROM facts f JOIN source_records sr USING (source_id, source_ref) WHERE f.key='opening_hours' AND sr.place_id IS NOT NULL""")}
    stats, skipped, missing = {}, {}, 0
    offers = {r[0] for r in con.execute('SELECT id FROM offers')}

    def skip(why): skipped[why] = skipped.get(why, 0) + 1

    for path in sorted(glob.glob(os.path.join(folder, 'verdict_r*.jsonl'))):
        for v in lines(path):
            i, st, why = v['id'], v['status'], v.get('reason', '')
            if i in offers:
                stats['offer ' + st] = stats.get('offer ' + st, 0) + flag_offer(con, i, st, why, 'review', REVIEW)
                continue
            if i not in places: missing += 1; continue
            name, cat = places[i]
            # owner-facing overrides of the review, see report
            if cat == 'aufzug': skip('Aufzüge: nützlich für Kinderwagen'); continue
            if cat == 'trinkwasser' and st == 'unpassend' and name: skip('Refill-Stationen in Büros und Banken bleiben'); continue
            if cat in ('windeln', 'imbiss') and st == 'unpassend' and not name and i in hours: skip('Namenlose Läden mit Öffnungszeiten bleiben'); continue
            nc = v.get('new_category')
            if st == 'kategorie':
                if nc not in CATEGORIES: skip('Kategorie unbekannt'); continue
                stats[st] = stats.get(st, 0) + flag_place(con, i, st, why or 'falsche Kategorie', 'review', REVIEW, duplicate_of=nc)
            else:
                stats[st] = stats.get(st, 0) + flag_place(con, i, st, why, 'review', REVIEW)
    con.commit()

    # rules: pitches that are not open to the public, adult names, cancelled offers
    for pid, val in con.execute("""SELECT DISTINCT sr.place_id, f.value FROM facts f JOIN source_records sr USING (source_id, source_ref)
                                   WHERE f.key='pitch_setting' AND f.value IN ('schule','sportanlage') AND sr.place_id IS NOT NULL""").fetchall():
        if places.get(pid, (None, None))[1] == 'bolzplatz':
            stats['unpassend'] = stats.get('unpassend', 0) + flag_place(con, pid, 'unpassend', 'Spielfeld auf Schul- oder Vereinsgelände', 'rule', RULE)
    for pid, (name, cat) in places.items():
        if name and ADULT.search(name):
            stats['unpassend'] = stats.get('unpassend', 0) + flag_place(con, pid, 'unpassend', 'Erotik oder Glücksspiel', 'rule', RULE)
    for pid, raw in con.execute("SELECT place_id, raw FROM source_records WHERE source_id='osm' AND place_id IS NOT NULL AND raw IS NOT NULL").fetchall():
        t = json.loads(raw)
        if any(t.get(k) == val for k, val in ADULT_OSM):
            stats['unpassend'] = stats.get('unpassend', 0) + flag_place(con, pid, 'unpassend', 'Erotik oder Glücksspiel', 'rule', RULE)
    for oid, title in con.execute('SELECT id, title FROM offers').fetchall():
        if CANCELLED.search(title or ''):
            stats['offer abgesagt'] = stats.get('offer abgesagt', 0) + flag_offer(con, oid, 'unpassend', 'abgesagt', 'rule', RULE)
    con.commit()

    # duplicates: skip when the keeper itself left the app, then the record stays as the visible one
    hidden = {r[0] for r in con.execute("SELECT place_id FROM place_flags WHERE status != 'kategorie'")}
    for d in lines(os.path.join(folder, 'duplicates_places.jsonl')):
        i, keep = d['id'], d['duplicate_of']
        if i not in places or keep not in places: missing += 1; continue
        if keep in hidden: skip('Dublette bleibt, weil der Hauptort ausgeblendet ist'); continue
        stats['duplikat'] = stats.get('duplikat', 0) + flag_place(con, i, 'duplikat', d.get('reason', 'Dublette'), 'review', DUP, duplicate_of=keep)
    con.commit()

    out = ROOT / 'data' / 'cleaning'
    out.mkdir(exist_ok=True)
    for st in ('unpassend', 'duplikat', 'kategorie', 'datenschutz'):
        with open(out / f'{st}.csv', 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f, delimiter=';')
            w.writerow(['id', 'name', 'kategorie', 'stadtteil', 'grund', 'duplikat_von_oder_neue_kategorie', 'methode'])
            w.writerows(con.execute('SELECT place_id, name, category, district, reason, duplicate_of, method FROM place_flags WHERE status=? ORDER BY category, name', (st,)))
    with open(out / 'angebote.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['id', 'titel', 'quelle', 'grund', 'methode'])
        w.writerows(con.execute('SELECT offer_id, title, source_id, reason, method FROM offer_flags ORDER BY source_id, title'))
    print('flags', stats, 'skipped', skipped, 'unknown ids', missing)
    print('by category', con.execute("SELECT category, status, count(*) FROM place_flags GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40").fetchall())


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    run(sys.argv[1])
