"""Kinder-Notinseln (shops and offices where children find help) as facts on our places (source 'notinsel').

Source: https://www.notinsel.de/notinsel-finden, the public finder of the Deutsche Kinderschutzstiftung Hänsel+Gretel. Its map
loads one JSON list from the same page (?type=11880&groups=11,12&latitude=..&longitude=..&distance=<km>; groups 11 = Notinseln,
12 = Notinseln of branch partners); no key, no login. robots.txt only disallows /typo3/. One request per run.
State 20 Nov 2026: there is no Notinsel project in Hamburg itself (no Projektträger); within 40 km of the Rathaus the finder
lists 118 Notinseln, all in Norderstedt (97) and Trittau (21). Only the ones at the Hamburg border match our places. The
importer keeps working unchanged once Hamburg districts join.

Kept: kinder_notinsel 'yes', notinsel_url (the Notinsel's detail page). Records only for Notinseln that match an existing place:
nearest place within 60 m whose name matches (without legal forms such as GmbH, e.K., 'Inh.', 'Filiale'), the record carrying the
place's own name, category and coordinates so merge.py joins it at distance 0. New places are only made for a clearly
identifiable shop inside Hamburg (postcode 20xxx-22xxx, city 'Hamburg') with no place within 60 m, as category 'laden'.
Run monthly.

Run: cd db && python import_notinsel.py      (1 request to notinsel.de)
"""
import math
import re
import sqlite3
import sys
import time
from difflib import SequenceMatcher

from common import connect, register_source, replace_records
from offers_util import get

SOURCE_ID = 'notinsel'
PAGE = 'https://www.notinsel.de/notinsel-finden'
CENTER, RADIUS_KM = (53.5503, 9.9927), 40
NOISE = {'gmbh', 'co', 'kg', 'ohg', 'ag', 'eg', 'e', 'k', 'ek', 'v', 'ev', 'inh', 'inhaber', 'filiale', 'und', 'der', 'die', 'das',
         'am', 'im', 'an', 'in', 'hamburg', 'norderstedt', 'gbr', 'mbh', 'ug', 'apotheker', 'markt'}
SHOPS = {'laden', 'windeln', 'apotheke', 'buecherei', 'cafe', 'eis', 'restaurant', 'imbiss', 'familienfreundlich', 'physio', 'treffpunkt',
         'beratung', 'kultur', 'freizeit', 'indoor', 'musikschule', 'tanzschule', 'kreativschule', 'sprachschule'}


def fold(s):
    s = (s or '').lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        s = s.replace(a, b)
    return s


def tokens(s):
    return [t for t in re.findall(r'[a-z0-9]+', fold(s)) if t not in NOISE and len(t) > 1]


def same_name(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return False
    sa, sb = ' '.join(ta), ' '.join(tb)
    # all words of the shorter name appear in the longer one ('Glashütter Apotheke' in 'Glashütter Apotheke Apotheker ... e.K.')
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return set(short) <= set(long_) or SequenceMatcher(None, sa, sb).ratio() >= 0.85


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    return 6371000 * math.hypot((lo2 - lo1) * k * math.cos((la1 + la2) * k / 2), (la2 - la1) * k)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    d = get(PAGE, params={'type': '11880', 'groups': '11,12', 'latitude': CENTER[0], 'longitude': CENTER[1], 'distance': RADIUS_KM}).json()
    locs = d.get('locations') or []
    if not locs:
        print(f'{SOURCE_ID}: no Notinseln listed; keeping existing data')
        return 0
    con = connect()
    register_source(con, SOURCE_ID, 'Notinsel (Deutsche Kinderschutzstiftung Hänsel+Gretel)', PAGE, 'Fakten mit Link',
                    'Deutsche Kinderschutzstiftung Hänsel+Gretel, notinsel.de', 60)
    records, unmatched, near_other = [], [], []
    for l in locs:
        la, lo = l.get('latitude'), l.get('longitude')
        if la is None or lo is None:
            continue
        cands = []
        for pid, name, cat, pla, plo in con.execute('SELECT id, name, category, lat, lon FROM places WHERE abs(lat-?)<0.0008 AND abs(lon-?)<0.0012',
                                                    (la, lo)):
            m = dist(la, lo, pla, plo)
            if m <= 60:
                cands.append((m, pid, name, cat, pla, plo))
        cands.sort()
        hit = next((c for c in cands if c[3] in SHOPS and c[2] and same_name(l['company'], c[2])), None)
        facts = {'kinder_notinsel': 'yes', 'notinsel_url': l.get('detailsPageUrl') or PAGE}
        company = re.split(r'\s*\b(?:Inh\.|Inhaber(?:in)?\b|Apotheker(?:in)?\s)', l.get('company') or '')[0].strip()  # no owner names
        raw = {'uid': l.get('uid'), 'company': company, 'address': f"{l.get('street')} {l.get('houseNumber') or ''}, {l.get('zip')} {l.get('city')}".strip()}
        if hit:
            m, pid, name, cat, pla, plo = hit
            records.append({'ref': f"place:{pid}", 'category': cat, 'name': name, 'lat': pla, 'lon': plo, 'url': facts['notinsel_url'],
                            'facts': facts, 'raw': raw | {'match_m': round(m)}, '_pid': pid})
        elif not cands and l.get('city') == 'Hamburg' and re.match(r'2[0-2]\d{3}$', str(l.get('zip') or '')):
            records.append({'ref': f"notinsel:{l['uid']}", 'category': 'laden', 'name': company, 'lat': la, 'lon': lo,
                            'url': facts['notinsel_url'], 'facts': facts | {'address': raw['address']}, 'raw': raw, '_pid': None})
        else:
            (near_other if cands else unmatched).append(f"{company} ({raw['address']})")
    if not records:
        print(f'{SOURCE_ID}: {len(locs)} Notinseln listed, none matches a place; nothing stored')
        return 0
    seen, uniq = set(), []
    for r in records:
        if r['ref'] not in seen:
            seen.add(r['ref']); uniq.append(r)
    for attempt in range(6):
        try:
            n = replace_records(con, SOURCE_ID, uniq)
            con.executemany('UPDATE source_records SET place_id=? WHERE source_id=? AND source_ref=? AND place_id IS NULL',
                            [(r['_pid'], SOURCE_ID, r['ref']) for r in uniq if r['_pid']])
            con.commit()
            break
        except sqlite3.OperationalError as ex:
            if 'locked' not in str(ex) or attempt == 5:
                raise
            con.rollback()
            time.sleep(10 * (attempt + 1))
    new = sum(1 for r in uniq if not r['_pid'])
    print(f'{SOURCE_ID}: {len(locs)} Notinseln within {RADIUS_KM} km, {n} records ({n - new} on existing places, {new} new); '
          f'{len(near_other)} next to a place with another name, {len(unmatched)} with no place nearby (outside our area)')
    for r in uniq:
        print(f"  {r['raw']['company']} ({r['raw']['address']}) -> {r['name']} [{r['category']}]")
    return n


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
