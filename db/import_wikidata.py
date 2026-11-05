"""Import family-relevant items in Hamburg from Wikidata (CC0): name, official website, image file name, opening times.

Two ways in:
1. Bounding-box query (wikibase:box, fast), filtered by direct class (P31, no subclass walk).
2. The wikidata ids that OSM objects carry, whatever their class.

Linking: an item with a wikidata id in OSM belongs to that OSM place; other items are matched by category, distance and name.
A linked record takes the coordinates, name and category of its place, so merge.py finds the same place again (distance 0)
without knowing about wikidata ids. An item without a match keeps its own data and becomes a new place in merge.py.

Images: Commons files have their own licences and need their own attribution, so only the file name ('File:Name.jpg') is
stored; the app links to the Commons file page for author and licence.
"""
import csv
import io
import json
import re
import time
from collections import defaultdict
from urllib.parse import unquote

from common import connect, fetch, register_source, replace_records, save_raw
from merge import Grid, compatible, dist, norm, similar

ENDPOINT = 'https://query.wikidata.org/sparql'
TYPES = {  # direct Wikidata class (P31, no subclass walk: fast) -> Djuu category
    # museums and science
    'Q33506': 'museum', 'Q207694': 'museum', 'Q17431399': 'museum', 'Q1595639': 'museum', 'Q588140': 'museum', 'Q2087181': 'museum',
    'Q13866185': 'museum', 'Q130326199': 'museum', 'Q1254933': 'ausflug', 'Q148319': 'ausflug',
    # animals, gardens, parks
    'Q43501': 'ausflug', 'Q2281788': 'ausflug', 'Q22698': 'park', 'Q22652': 'park', 'Q1107656': 'park', 'Q167346': 'park', 'Q11875349': 'spielplatz',
    # trips
    'Q194195': 'ausflug', 'Q2516357': 'ausflug', 'Q39715': 'ausflug', 'Q38720': 'ausflug', 'Q185187': 'ausflug', 'Q751876': 'ausflug', 'Q23413': 'ausflug',
    # swimming and sport
    'Q1501': 'baden', 'Q1076486': 'freizeit',
    # culture and meeting places
    'Q24354': 'kultur', 'Q153562': 'kultur', 'Q41253': 'kultur', 'Q1060829': 'kultur', 'Q1329623': 'kultur', 'Q1302299': 'treffpunkt',
    # libraries (filtered by name below)
    'Q7075': 'buecherei', 'Q28564': 'buecherei', 'Q2326815': 'buecherei',
}
BOX = """SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(9.72 53.39)"^^geo:wktLiteral ;
                    wikibase:cornerNorthEast "Point(10.33 53.75)"^^geo:wktLiteral . }"""
QUERY = """SELECT ?item ?itemLabel ?type ?coord ?website ?image ?osm WHERE {
  %s
  VALUES ?type { %s }
  ?item wdt:P31 ?type .
  FILTER NOT EXISTS { ?item wdt:P576 [] } FILTER NOT EXISTS { ?item wdt:P3999 [] }
  OPTIONAL { ?item wdt:P856 ?website } OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P402 ?osm }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}"""
BY_ID = """SELECT ?item ?itemLabel ?coord ?website ?image ?closed WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item wdt:P625 ?coord } OPTIONAL { ?item wdt:P856 ?website } OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P576 ?closed }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}"""
HOURS = """SELECT ?item ?daysLabel ?closedOnLabel ?from ?to ?fromLabel ?toLabel WHERE {
  VALUES ?item { %s }
  { ?item p:P3025 ?st . ?st ps:P3025 ?days . OPTIONAL { ?st pq:P8626 ?from } OPTIONAL { ?st pq:P8627 ?to } }
  UNION { ?item wdt:P3026 ?closedOn }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}"""
LIBRARY_NAME = re.compile(r'bücherhalle|stadtbibliothek|kinder|jugend', re.I)
OWN_CATS = {'kita', 'schule'}  # never matched from the class query
NEAR_M = 80  # the match distance of merge.py
FAR_M = 300  # large places: Wikidata point and OSM centre can be far apart when the names agree


def sparql(query):
    time.sleep(1)
    return fetch(ENDPOINT, method='POST', data={'query': query}, headers={'Accept': 'text/csv'}, timeout=120, retries=4).text


def file_name(url):
    """Commons file page or file path URL -> 'File:Name_of_file.jpg'. Keeps only the characters a URL path cannot carry escaped."""
    m = re.search(r'(?:Special:FilePath/|File:)(.+)$', url or '')
    if not m: return ''
    name = unquote(m[1]).replace(' ', '_').replace('%', '%25').replace('?', '%3F').replace('#', '%23')
    return 'File:' + name


def point(coord):
    m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', coord or '')
    return (float(m[2]), float(m[1])) if m else None


def best_url(urls):
    urls = [u for u in urls if u]
    return sorted(urls, key=lambda u: (not u.startswith('https'), not re.search(r'\.de\b', u), len(u)))[0] if urls else ''


def collect(text, items, type_of=None):
    for row in csv.DictReader(io.StringIO(text)):
        q = row['item'].rsplit('/', 1)[1]
        it = items.setdefault(q, {'q': q, 'name': row['itemLabel'], 'coord': None, 'websites': set(), 'images': [], 'osm': '', 'types': []})
        it['coord'] = it['coord'] or point(row.get('coord'))
        if row.get('website'): it['websites'].add(row['website'])
        if row.get('image') and row['image'] not in it['images']: it['images'].append(row['image'])
        if row.get('osm'): it['osm'] = row['osm']
        if row.get('closed'): it['closed'] = True
        if row.get('type'): it['types'].append(row['type'].rsplit('/', 1)[1])


def opening_times(qids):
    """What Wikidata states on opening days and hours. Rarely filled and not in OSM syntax, so kept under its own key."""
    out = defaultdict(lambda: {'days': set(), 'closed': set()})
    for i in range(0, len(qids), 300):
        text = sparql(HOURS % ' '.join('wd:' + q for q in qids[i:i + 300]))
        for row in csv.DictReader(io.StringIO(text)):
            q = row['item'].rsplit('/', 1)[1]
            if row.get('daysLabel'):
                span = row["daysLabel"]
                if re.search(r"Tdd:dd", row.get("from", "")): span += f" {row['from'][11:16]}-{row.get('to', '')[11:16]}"
                out[q]['days'].add(span)
            if row.get('closedOnLabel'): out[q]['closed'].add(row['closedOnLabel'])
    return out


def run():
    con = connect()
    register_source(con, 'wikidata', 'Wikidata', 'https://www.wikidata.org', 'CC0 1.0', 'Wikidata (CC0)', priority=50)
    places = {r[0]: r for r in con.execute('SELECT id, name, category, lat, lon FROM places')}
    grid = Grid()
    for p in places.values():
        if p[2] not in OWN_CATS: grid.add(p[3], p[4], p)
    osm_links = defaultdict(list)
    for value, pid in con.execute("""SELECT f.value, sr.place_id FROM facts f JOIN source_records sr USING (source_id, source_ref)
                                     WHERE f.source_id = 'osm' AND f.key = 'wikidata' AND sr.place_id IS NOT NULL"""):
        for q in re.findall(r'Q\d+', value):
            if pid not in osm_links[q]: osm_links[q].append(pid)
    con.commit()  # no lock during the downloads

    items, dump = {}, []
    text = sparql(QUERY % (BOX, ' '.join('wd:' + q for q in TYPES)))
    dump.append(text); collect(text, items)
    print('class query:', len(items), flush=True)
    qids = sorted(osm_links)
    for i in range(0, len(qids), 200):
        text = sparql(BY_ID % ' '.join('wd:' + q for q in qids[i:i + 200]))
        dump.append(text); collect(text, items)
    print('with OSM ids:', len(items), f'({len(qids)} ids in OSM)', flush=True)
    hours = opening_times(sorted(items))
    print('with opening data:', len(hours), json.dumps({k: {a: sorted(b) for a, b in v.items()} for k, v in list(hours.items())[:10]}, ensure_ascii=False))

    recs, pid_of, stats = {}, {}, defaultdict(int)

    def add(it, ref, cat, name, la, lo, pid=None):
        facts = {'name': it['name'], 'website': best_url(it['websites']), 'image': file_name(it['images'][0]) if it['images'] else '', 'osm_relation': it['osm']}
        h = hours.get(it['q'])
        if h and h['days']: facts['opening_days_wikidata'] = '; '.join(sorted(h['days']))
        if h and h['closed']: facts['closed_on_wikidata'] = '; '.join(sorted(h['closed']))
        recs[ref] = {'ref': ref, 'category': cat, 'name': name, 'lat': la, 'lon': lo, 'url': 'http://www.wikidata.org/entity/' + it['q'],
                     'raw': {'item': it['q'], 'types': sorted(set(it['types'])), 'websites': sorted(it['websites']), 'images': it['images'][:3]}, 'facts': facts}
        if pid: pid_of[ref] = pid

    for q, it in items.items():
        if it.get('closed') and q not in osm_links: continue
        name = it['name']
        if re.fullmatch(r'Q\d+', name or ''): name = ''
        linked = [p for p in osm_links.get(q, []) if p in places]
        if linked:
            stats['linked_via_osm_id'] += 1
            for n, pid in enumerate(linked):
                p = places[pid]
                add(it, q if n == 0 else f'{q}@{pid}', p[2], p[1] or name, p[3], p[4], pid)
            continue
        cats = [TYPES[t] for t in it['types'] if t in TYPES]
        if not cats or not it['coord'] or not name: continue
        cat = cats[0]
        if cat == 'buecherei' and not LIBRARY_NAME.search(name): continue
        la, lo = it['coord']
        best, bd = None, FAR_M
        for dla, dlo in ((0, 0), (0.0025, 0), (-0.0025, 0), (0, 0.004), (0, -0.004), (0.0025, 0.004), (-0.0025, -0.004), (0.0025, -0.004), (-0.0025, 0.004)):
            for p in grid.near(la + dla, lo + dlo):
                if not compatible(cat, p[2]): continue
                d = dist(la, lo, p[3], p[4])
                if d >= bd: continue
                a, b = norm(name), norm(p[1])
                ok = similar(name, p[1]) if d < NEAR_M else bool(a and b and (a == b or (len(a) > 5 and a in b) or (len(b) > 5 and b in a)))
                if ok: best, bd = p, d
        if best:
            stats['matched_by_name_and_distance'] += 1
            add(it, q, best[2], best[1] or name, best[3], best[4], best[0])
        else:
            stats['new_place_at_next_merge'] += 1
            add(it, q, cat, name, la, lo)

    save_raw('wikidata.csv', '\n'.join(dump))
    n = replace_records(con, 'wikidata', list(recs.values()))
    con.executemany("UPDATE source_records SET place_id = ? WHERE source_id = 'wikidata' AND source_ref = ?", [(p, r) for r, p in pid_of.items()])
    con.commit()
    counts = defaultdict(int)
    for r in recs.values():
        for k, v in r['facts'].items():
            if v: counts[k] += 1
    print('wikidata records:', n, dict(stats), dict(counts))


if __name__ == '__main__':
    run()
