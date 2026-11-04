"""Import hvv public-transport stations from the hvv GTFS feed (Hamburg Transparenzportal), read locally.

The newest feed is looked up through the portal's CKAN API and kept in data/raw/. Its licence is checked on every
run: the import stops if the dataset is no longer published under dl-de-by-2.0.

The feed has no station hierarchy (parent_station and location_type are never filled), so platforms are merged here:
1. Platforms sharing the station part of their IFOPT id ('de:02000:11950' of 'de:02000:11950:1:119004') are one station.
2. Groups with the same normalized name within MERGE_M of each other are one station, which covers a station published
   under several ids ('Jungfernstieg' / 'U S Jungfernstieg', 'Bf. Dammtor' / 'Hamburg Dammtor').

wheelchair_boarding: in GTFS 0 means "no information", not "no", so it never produces a fact on its own.
  every platform confirmed -> yes; only some confirmed -> limited; every platform stated inaccessible -> no.
  Rail platforms decide when they state anything, otherwise all platforms of the station count.

License: Datenlizenz Deutschland - Namensnennung - 2.0. Merging platforms is a change that the source note must mention.

Usage: python import_gtfs.py [--dry-run]
"""
import csv
import io
import math
import re
import sys
import zipfile
from collections import Counter, defaultdict

from common import RAW_DIR, connect, fetch, now, register_source, replace_records

SOURCE_ID = 'hvv_gtfs'
CATEGORY = 'haltestelle'
LICENSE = 'dl-de-by-2.0'
SEARCH_URL = 'https://suche.transparenz.hamburg.de/api/3/action/package_search'
DATASET_URL = 'https://suche.transparenz.hamburg.de/dataset/'
ATTRIBUTION = ('Hamburger Verkehrsverbund GmbH, hvv Fahrplandaten (GTFS), Datenlizenz Deutschland – Namensnennung – 2.0 '
               '(www.govdata.de/dl-de/by-2-0); Steige zu Stationen zusammengefasst')

LAT_MIN, LAT_MAX = 53.39, 53.75
LON_MIN, LON_MAX = 9.72, 10.33
MERGE_M = 300  # stops with the same normalized name closer than this are one station

NOT_PUBLIC = re.compile(r'nur für Betriebsange', re.I)  # works stops on the Airbus site, closed to the public
MODE_PREFIX = re.compile(r'^(?:(?:U|S|A|Bf\.|Hamburg)[ -])+')
PARENS = re.compile(r'\s*\(([^)]*)\)')
# On an ordinary street stop these mark separate stops along the street, so they stay part of the name.
STREET_QUALIFIER = re.compile(r'^(nord|süd|ost|west|mitte|kehre)$', re.I)
REPLACEMENT_LINE = re.compile(r'-(SEV|ERSATZ|Bus)$|^SEV$')  # temporary rail replacement services

MODE_RANK = {'subway': 0, 'suburban': 1, 'rail': 2, 'bus': 3, 'ferry': 4, 'other': 5}


def mode_of(route_type):
    """Map a basic or extended GTFS route_type to a mode."""
    t = int(route_type)
    if t == 109: return 'suburban'
    if t == 1 or 400 <= t < 500: return 'subway'
    if t == 2 or 100 <= t < 200: return 'rail'
    if t == 3 or 200 <= t < 300 or 700 <= t < 800: return 'bus'
    if t == 4 or 1000 <= t < 1300: return 'ferry'
    return 'other'


def find_feed():
    """Newest hvv GTFS dataset on the portal, as (package, zip resource). Stops if the licence has changed."""
    params = {'q': 'hvv fahrplandaten gtfs', 'rows': 20, 'sort': 'metadata_modified desc'}
    results = fetch(SEARCH_URL, params=params).json()['result']['results']
    feeds = [p for p in results if re.search(r'hvv fahrplandaten \(gtfs\)', p['title'], re.I)]
    if not feeds:
        raise RuntimeError('no hvv GTFS dataset found on the Transparenzportal')
    pkg = feeds[0]
    if pkg.get('license_id') != LICENSE:
        raise RuntimeError(f"licence of {pkg['name']} is {pkg.get('license_id')}, expected {LICENSE}: review before importing")
    zips = [r for r in pkg['resources'] if (r.get('format') or '').upper() == 'ZIP']
    if not zips:
        raise RuntimeError(f"no ZIP resource in {pkg['name']}")
    return pkg, zips[0]


def download(resource):
    """Path of the feed in data/raw, downloading it only when this version is not there yet."""
    m = re.search(r'(\d{8})\D*\.zip$', resource['url'], re.I)
    path = RAW_DIR / f"hvv_gtfs_{m.group(1) if m else resource['id']}.zip"
    if path.exists() and zipfile.is_zipfile(path):
        print('Using', path.name)
        return path
    print('Downloading', resource['url'])
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.part')
    tmp.write_bytes(fetch(resource['url'], timeout=600).content)
    if not zipfile.is_zipfile(tmp):
        tmp.unlink()
        raise RuntimeError('download is not a ZIP file')
    tmp.replace(path)
    return path


def rows(archive, name):
    with archive.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig', newline=''))


def distance_m(a, b):
    dy = (a['lat'] - b['lat']) * 111320
    dx = (a['lon'] - b['lon']) * 111320 * math.cos(math.radians(53.55))
    return math.hypot(dx, dy)


def station_key(name):
    """Normalized station name: 'U S Jungfernstieg', 'Bf. Dammtor (Messe)' -> 'jungfernstieg', 'dammtor'."""
    s = re.sub(r'\s*-\s*SEV$', '', name.strip())
    bare = MODE_PREFIX.sub('', s)
    has_prefix = bare != s
    bare = PARENS.sub(lambda m: m.group(0) if not has_prefix and STREET_QUALIFIER.match(m.group(1).strip()) else '', bare)
    key = ' '.join(bare.split()).casefold()
    if re.match(r'(hauptbahnhof|hbf)\b', key):  # Hamburg Hbf, Hauptbahnhof Nord/Süd/ZOB, HBF/Kirchenallee, ...
        return 'hauptbahnhof'
    return key


def group_id(stop_id):
    parts = stop_id.split(':')
    return ':'.join(parts[:3]) if len(parts) >= 3 else stop_id


def load_stops(archive):
    stops, not_public = [], 0
    for r in rows(archive, 'stops.txt'):
        if r.get('location_type') not in ('', '0', None):  # entrances, nodes, areas: not boardable
            continue
        lat, lon = float(r['stop_lat']), float(r['stop_lon'])
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            continue
        if NOT_PUBLIC.search(r['stop_name']):
            not_public += 1
            continue
        stops.append({'id': r['stop_id'], 'name': r['stop_name'].strip(), 'lat': lat, 'lon': lon,
                      'wheelchair': r.get('wheelchair_boarding') or '0', 'parent': r.get('parent_station') or ''})
    return stops, not_public


def load_lines(archive, stop_ids):
    """stop_id -> set of (line, mode), via trips and stop_times."""
    routes = {r['route_id']: (r['route_short_name'].strip() or r['route_long_name'].strip(), mode_of(r['route_type']))
              for r in rows(archive, 'routes.txt')}
    trip_route = {r['trip_id']: r['route_id'] for r in rows(archive, 'trips.txt')}
    stop_routes = defaultdict(set)
    for r in rows(archive, 'stop_times.txt'):
        if r['stop_id'] in stop_ids and r['trip_id'] in trip_route:
            stop_routes[r['stop_id']].add(trip_route[r['trip_id']])
    return {s: {routes[x] for x in rs if x in routes and routes[x][0]} for s, rs in stop_routes.items()}


def cluster(stops):
    """Union platforms by parent_station or IFOPT station, then by normalized name + proximity."""
    parent = {s['id']: s['id'] for s in stops}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    by_group = defaultdict(list)
    for s in stops:
        by_group[s['parent'] or group_id(s['id'])].append(s)
    for members in by_group.values():
        for s in members[1:]:
            parent[find(s['id'])] = find(members[0]['id'])

    by_key = defaultdict(list)
    for s in stops:
        by_key[station_key(s['name'])].append(s)
    for members in by_key.values():
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if find(a['id']) != find(b['id']) and distance_m(a, b) <= MERGE_M:
                    parent[find(a['id'])] = find(b['id'])

    clusters = defaultdict(list)
    for s in stops:
        clusters[find(s['id'])].append(s)
    return list(clusters.values())


def pick_name(members):
    """Most frequent name among the platforms, preferring names without a parenthesis, then with a mode prefix."""
    counts = Counter(s['name'] for s in members)
    return max(counts, key=lambda n: ('(' not in n, counts[n], bool(MODE_PREFIX.match(n)), -len(n), n))


def wheelchair_value(members, lines):
    """Rail platforms decide when they state anything: bus bays beside them almost never carry a value."""
    rail = [s for s in members if any(m in ('subway', 'suburban', 'rail') for _, m in lines.get(s['id'], ()))]
    scope = rail if any(s['wheelchair'] != '0' for s in rail) else members
    states = Counter(s['wheelchair'] for s in scope)
    yes, no, total = states['1'], states['2'], len(scope)
    if yes == total: return ('yes', 'source', 1.0)
    if yes: return ('limited', 'source', 0.7)  # derived: some platforms confirmed, the others not
    if no == total: return ('no', 'source', 1.0)
    return None


def line_sort_key(item):
    line, mode = item
    m = re.match(r'([^\d]*)(\d*)(.*)', line)
    return (MODE_RANK[mode], m.group(1), int(m.group(2) or 0), m.group(3))


def transit_text(lines):
    regular = {l for l in lines if not REPLACEMENT_LINE.search(l[0])}
    best = {}
    for line, mode in sorted(regular or lines, key=lambda x: MODE_RANK[x[1]]):
        best.setdefault(line, mode)
    return ', '.join(line for line, _ in sorted(best.items(), key=line_sort_key))


def build_records(stops, lines, feed_version, dataset_url, observed):
    records = []
    for members in cluster(stops):
        served = set().union(*(lines.get(s['id'], set()) for s in members))
        states = Counter(s['wheelchair'] for s in members)
        modes = sorted({m for _, m in served}, key=MODE_RANK.get)
        records.append({
            # The smallest IFOPT station id stays stable as platforms come and go between feed versions.
            'ref': min(group_id(s['id']) for s in members),
            'category': CATEGORY,
            'name': pick_name(members),
            'lat': round(sum(s['lat'] for s in members) / len(members), 6),
            'lon': round(sum(s['lon'] for s in members) / len(members), 6),
            'url': dataset_url,
            'raw': {'names': sorted({s['name'] for s in members}), 'stop_ids': sorted(s['id'] for s in members),
                    'platforms': len(members), 'wheelchair_confirmed': states['1'], 'wheelchair_inaccessible': states['2'],
                    'modes': modes, 'feed_version': feed_version},
            'facts': {'wheelchair': wheelchair_value(members, lines), 'transit': transit_text(served)},
            'observed_at': observed,
        })
    return records


def report(stops, records, not_public):
    n = len(records)
    with_info = Counter(r['facts']['wheelchair'][0] for r in records if r['facts']['wheelchair'])
    confirmed = sum(1 for s in stops if s['wheelchair'] == '1')
    print(f'Platforms in bbox: {len(stops)} (left out, not public: {not_public}), stations: {n}')
    print(f'Platforms with wheelchair_boarding=1: {confirmed} ({confirmed / len(stops):.1%}), '
          f"=2: {sum(1 for s in stops if s['wheelchair'] == '2')}")
    print(f'Stations with wheelchair fact: {sum(with_info.values())} ({sum(with_info.values()) / n:.1%}) {dict(with_info)}')
    print(f"Stations with transit fact: {sum(1 for r in records if r['facts']['transit'])}")


def run(dry_run=False):
    pkg, resource = find_feed()
    path = download(resource)
    print('Dataset:', pkg['title'], '|', pkg['license_id'])
    with zipfile.ZipFile(path) as archive:
        info = next(rows(archive, 'feed_info.txt'), {})
        stops, not_public = load_stops(archive)
        lines = load_lines(archive, {s['id'] for s in stops})
    feed_version = info.get('feed_version')
    print('Feed version:', feed_version, 'valid', info.get('feed_start_date'), '-', info.get('feed_end_date'))
    observed = f'{feed_version}Z' if feed_version else now()
    dataset_url = DATASET_URL + pkg['name']
    records = build_records(stops, lines, feed_version, dataset_url, observed)
    report(stops, records, not_public)
    if dry_run:
        return records
    # All parsing is done before the database is opened: the shared write lock is held only for the inserts.
    con = connect()
    try:
        register_source(con, SOURCE_ID, 'hvv Fahrplandaten (GTFS)', dataset_url, LICENSE, ATTRIBUTION, priority=60)
        print('hvv GTFS:', replace_records(con, SOURCE_ID, records), 'records')
    finally:
        con.close()
    return records


if __name__ == '__main__':
    run(dry_run='--dry-run' in sys.argv)
