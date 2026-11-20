"""Hand-checked places that open data misses, from data/redaktion/orte.json (source 'redaktion_orte').

Each entry was found by targeted search (web search, Reddit names only as leads) and checked on the place's OWN
website (url, required). Only facts are stored: name, category, address, coordinates, opening hours, phone, prices,
ages, a short description in our own words (<= 200 characters). Coordinates come from the place's site (JSON-LD,
map embed) or from the local OSM extract (tools/redaktion_build.py address index); never an online geocoder.

Entries with "attach_to": "<place id>" add facts to a place that already exists (e.g. a children's emergency room on
a hospital, the temporary address of KL!CK): the record takes that place's current coordinates, so merge.py joins it.
Entries without it are meant to become new places (checked by name and within 150 m before they were added).

Priority 50: above the website keyword scan (45), below OSM (60) and the city's open data (70), so a curated value
fills gaps and never overrides a register.
Internal fields (found_via, coords_from, checked) stay in the raw record and are not exported.

Run: cd db && python import_redaktion_orte.py      (no network; prints for each record what merge.py would do)
"""
import json
import re
import sqlite3
import sys

from common import ROOT, connect, register_source, replace_records

SOURCE_ID = 'redaktion_orte'
PATH = ROOT / 'data' / 'redaktion' / 'orte.json'
BLOCKED = re.compile(r'facebook\.com|fb\.me|instagram\.com|kinderflohmarkt\.com|meine-flohmarkt-termine|rausgegangen|kindaling|'
                     r'weekend-willi|hh-mit-kindern|flohsonntag|kinder-in-hamburg|kinderfreundlicheorte|spielplatztreff|hamburg-tourism|'
                     r'eventbrite|meinestadt|tripadvisor|yelp|google\.|elbphilharmonie|museumsdienst|reddit\.com', re.I)
REQUIRED = ('ref', 'name', 'category', 'lat', 'lon', 'url', 'checked')
INTERNAL = ('found_via', 'coords_from', 'checked', 'attach_to')


def load(con):
    entries = json.loads(PATH.read_text(encoding='utf-8'))
    cats = {r[0] for r in con.execute('SELECT DISTINCT category FROM places')}
    keys = {r[0] for r in con.execute('SELECT DISTINCT key FROM facts')}
    from export import KEYS
    keys |= set(KEYS)
    records, refs = [], set()
    for e in entries:
        miss = [k for k in REQUIRED if e.get(k) in (None, '')]
        if miss: raise ValueError(f"{e.get('ref')}: missing {miss}")
        if e['ref'] in refs: raise ValueError(f"duplicate ref {e['ref']}")
        refs.add(e['ref'])
        if e['category'] not in cats: raise ValueError(f"{e['ref']}: unknown category {e['category']}")
        if BLOCKED.search(e['url']): raise ValueError(f"{e['ref']}: url is not the place's own site: {e['url']}")
        facts = dict(e.get('facts') or {})
        bad = sorted(set(facts) - keys)
        if bad: raise ValueError(f"{e['ref']}: unknown fact keys {bad}")
        if len(facts.get('description') or '') > 200: raise ValueError(f"{e['ref']}: description longer than 200 characters")
        lat, lon = e['lat'], e['lon']
        if e.get('attach_to'):
            row = con.execute('SELECT lat, lon FROM places WHERE id=?', (e['attach_to'],)).fetchone()
            if row: lat, lon = row
            else: print(f"  warning: {e['ref']}: place {e['attach_to']} not found, using the file's coordinates")
        facts.setdefault('website', e['url'])
        facts.setdefault('name', e['name'])
        if e.get('address'): facts.setdefault('address', e['address'])
        facts = {k: ('yes' if v is True else v) for k, v in facts.items() if v is not None}
        records.append({'ref': e['ref'], 'category': e['category'], 'name': e['name'], 'lat': lat, 'lon': lon, 'url': e['url'],
                        'raw': {k: e[k] for k in INTERNAL if e.get(k)}, 'facts': facts, 'observed_at': e['checked'] + 'T12:00:00Z',
                        'attach_to': e.get('attach_to')})
    return records


def merge_check(con, records):
    """Dry run of merge.py's rule for other sources (read-only): nearest place within MATCH_M, compatible category, similar name."""
    from merge import MATCH_M, compatible, dist, similar
    attach = new = 0
    for r in records:
        best, bd = None, MATCH_M
        for pid, name, cat, la, lo in con.execute('SELECT id, name, category, lat, lon FROM places WHERE abs(lat-?)<0.002 AND abs(lon-?)<0.003',
                                                  (r['lat'], r['lon'])):
            if not compatible(r['category'], cat) or not similar(r['name'], name): continue
            d = dist(r['lat'], r['lon'], la, lo)
            if d < bd: best, bd = (pid, name, cat), d
        if r['lat'] is None: verdict = 'SKIP (no coordinates)'
        elif best: verdict = f'-> {best[0]} {best[1]} [{best[2]}, {bd:.0f} m]'; attach += 1
        else: verdict = 'NEW'; new += 1
        flag = ''
        if r['attach_to'] and (not best or best[0] != r['attach_to']): flag = f"   !! meant for {r['attach_to']}"
        if not r['attach_to'] and best: flag = '   !! meant to be new'
        print(f"  {r['ref']:38} {r['category']:12} {verdict}{flag}")
    print(f'merge check: {attach} attach to existing places, {new} new')
    return attach, new


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    con = connect()
    register_source(con, SOURCE_ID, 'Djuu-Redaktion: geprüfte Orte', 'https://djuu.de/data/redaktion/orte.json',
                    'Fakten mit Link', 'Djuu-Redaktion (geprüft auf den Seiten der Orte)', 50)
    records = load(con)
    for _ in range(5):
        try:
            n = replace_records(con, SOURCE_ID, records)
            break
        except sqlite3.OperationalError as e:  # a parallel importer holds the lock
            print('  database busy:', e)
    else:
        return 0
    print(f'{SOURCE_ID}: {n} records')
    merge_check(con, records)
    return n


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
