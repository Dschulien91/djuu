"""Merge research files into data/redaktion/termine.json: validate, drop school performances, add coordinates.

Usage: python tools/redaktion_build.py <research.json> [...]
Existing entries in termine.json are kept (same ref = replaced by the new version). Past events are dropped.
Coordinates: first an OSM name match in the local DB, then an offline address index built from the local
OSM extract (data/raw/hamburg-latest.osm.pbf). No online geocoder, so nothing leaves this machine.
"""
import json
import re
import sqlite3
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'redaktion' / 'termine.json'
DB = ROOT / 'data' / 'djuu.db'
PBF = ROOT / 'data' / 'raw' / 'hamburg-latest.osm.pbf'
ADDR_CACHE = ROOT / 'data' / 'raw' / 'addresses.json'
WINTER_BREAK = ('2026-12-21', '2027-01-01')
BLOCKED = re.compile(r'facebook\.com|fb\.me|instagram\.com|kinderflohmarkt\.com|meine-flohmarkt-termine|rausgegangen|kindaling|'
                     r'weekend-willi|hh-mit-kindern|flohsonntag|kinder-in-hamburg|hamburg-tourism|eventbrite|meinestadt|'
                     r'elbphilharmonie|museumsdienst', re.I)
KEEP = ['ref', 'title', 'kind', 'date', 'end_date', 'weekday', 'schedule', 'time_from', 'time_to', 'venue', 'address', 'lat', 'lon',
        'provider', 'url', 'price', 'free', 'registration', 'age', 'topic', 'found_via', 'checked']


def school_show(e):
    """Weekday morning theatre performances outside the holidays are sold to school classes."""
    if e.get('topic') != 'theater' or not e.get('time_from') or e.get('end_date'):
        return False
    d = date.fromisoformat(e['date'])
    holidays = WINTER_BREAK[0] <= e['date'] <= WINTER_BREAK[1]
    return d.weekday() < 5 and e['time_from'] < '13:00' and not holidays


def norm_street(s):
    s = unicodedata.normalize('NFKC', s or '').lower().replace('ß', 'ss')
    s = re.sub(r'(str\.|strasse)(?=\W|$)', 'strasse', s)
    return re.sub(r'[^a-z0-9äöü]', '', s)


def address_index():
    """{'street|number': [lat, lon], 'street': [lat, lon]} from the local OSM extract, cached as JSON."""
    if ADDR_CACHE.exists() and ADDR_CACHE.stat().st_mtime >= PBF.stat().st_mtime:
        return json.loads(ADDR_CACHE.read_text(encoding='utf8'))
    import osmium
    idx, streets = {}, {}
    for o in osmium.FileProcessor(str(PBF)).with_locations():
        street, num = o.tags.get('addr:street'), o.tags.get('addr:housenumber')
        if not street or not num:
            continue
        try:
            if o.is_node():
                lat, lon = o.location.lat, o.location.lon
            elif o.is_way():
                pts = [(n.location.lat, n.location.lon) for n in o.nodes if n.location.valid()]
                if not pts:
                    continue
                lat, lon = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            else:
                continue
        except osmium.InvalidLocationError:
            continue
        k = norm_street(street)
        idx.setdefault(f'{k}|{num.lower().replace(" ", "")}', [round(lat, 6), round(lon, 6)])
        streets.setdefault(k, []).append((lat, lon))
    for k, pts in streets.items():
        idx[k] = [round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6)]
    ADDR_CACHE.write_text(json.dumps(idx), encoding='utf8')
    return idx


def geocode(address, idx):
    """'Musterstraße 12a, 22000 Hamburg' -> exact house number, else the street's centre."""
    m = re.match(r'\s*([^,\d]+?)\s+(\d+(?:\s?[a-zA-Z](?![a-zA-Z]))?)', address or '')
    if not m:
        return None
    k = norm_street(m.group(1))
    return idx.get(f'{k}|{m.group(2).lower().replace(" ", "")}') or idx.get(k)


def coords(con, e, cache):
    key = e.get('address') or e.get('venue')
    if key in cache:
        return cache[key]
    row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND name=? AND lat IS NOT NULL LIMIT 1",
                      (e.get('venue'),)).fetchone() if e.get('venue') else None
    if not row and e.get('address'):
        if 'addr' not in cache:
            cache['addr'] = address_index()
        row = geocode(e['address'], cache['addr'])
    if row and not (53.38 <= row[0] <= 53.75 and 9.70 <= row[1] <= 10.35):  # outside Hamburg
        row = None
    cache[key] = row
    return row


def main(paths):
    today = date.today().isoformat()
    old = json.loads(OUT.read_text(encoding='utf8')) if OUT.exists() else []
    by_ref = {e['ref']: e for e in old if (e.get('end_date') or e.get('date') or '9999') >= today}
    con, cache, dropped = sqlite3.connect(DB), {}, {}

    def drop(why, e):
        dropped.setdefault(why, []).append(f"{e.get('date')} {e.get('title')}")

    for p in paths:
        for e in json.loads(Path(p).read_text(encoding='utf8')):
            if BLOCKED.search(e.get('url', '')):
                drop('blocked link', e); continue
            if not e.get('date') or (e.get('end_date') or e['date']) < today:
                drop('past or no date', e); continue
            if school_show(e):
                drop('school performance', e); continue
            if e.get('lat') is None:
                c = coords(con, e, cache)
                if not c:
                    drop('no coordinates', e); continue
                e['lat'], e['lon'] = round(c[0], 6), round(c[1], 6)
            e['ref'] = e.get('ref') or f"{e['provider']}|{e['title']}|{e['date']}|{e.get('time_from') or ''}"
            by_ref[e['ref']] = {k: e.get(k) for k in KEEP if e.get(k) is not None}
    rows = sorted(by_ref.values(), key=lambda e: (e['date'], e.get('time_from') or '', e['title']))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('[\n' + ',\n'.join(json.dumps(e, ensure_ascii=False) for e in rows) + '\n]\n', encoding='utf8')
    print(f'{len(rows)} entries in {OUT.relative_to(ROOT)}')
    for why, items in dropped.items():
        print(f'dropped ({why}): {len(items)}')
        for i in items[:6]:
            print('   ', i)


if __name__ == '__main__':
    main(sys.argv[1:])
