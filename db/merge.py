"""Merge source records into places.

Rules:
1. OSM records are the backbone: each becomes (or stays) one place.
2. Records from other sources with the same OSM reference (spieli) join that place directly.
3. Playground equipment joins the nearest playground within 80 m.
4. All other records join the nearest place within MATCH_M of a compatible category whose name is similar,
   otherwise they become a new place. Their category is kept.
Finally every place gets its Stadtteil and Bezirk from the OSM boundaries.
"""
import hashlib
import math
import re
from collections import defaultdict
from difflib import SequenceMatcher

from common import RAW_DIR, connect, now

MATCH_M = 80
GROUPS = [  # categories that may describe the same real place
    {'spielplatz', 'indoor', 'park', 'spielplatz_privat'},
    {'cafe', 'restaurant', 'imbiss', 'eis', 'familienfreundlich'},
    {'baden'}, {'buecherei'}, {'museum', 'ausflug', 'kultur'}, {'wc', 'wickel'}, {'kita'},
    {'treffpunkt', 'kultur'}, {'apotheke'}, {'kinderarzt', 'klinik'}, {'windeln', 'laden'}, {'hundeauslauf', 'park'},
]


def compatible(a, b):
    return a == b or any(a in g and b in g for g in GROUPS)


def norm(s):
    s = (s or '').lower()
    s = re.sub(r'\b(spielplatz|hamburg|e\.?\s?v\.?|gmbh|cafe|café|restaurant)\b', ' ', s)
    return re.sub(r'[^a-z0-9äöüß]+', ' ', s).strip()


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b: return True  # unnamed: rely on distance and category
    return a in b or b in a or SequenceMatcher(None, a, b).ratio() >= 0.6


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    x = (lo2 - lo1) * k * math.cos((la1 + la2) * k / 2)
    y = (la2 - la1) * k
    return 6371000 * math.hypot(x, y)


class Grid:
    def __init__(self, cell=0.002):
        self.cell, self.g = cell, defaultdict(list)
    def key(self, la, lo):
        return int(la // self.cell), int(lo // (self.cell * 1.7))
    def add(self, la, lo, item):
        self.g[self.key(la, lo)].append(item)
    def near(self, la, lo):
        i, j = self.key(la, lo)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                yield from self.g.get((i + di, j + dj), ())


def pid(source_id, ref):
    return 'dj_' + hashlib.sha1(f'{source_id}:{ref}'.encode()).hexdigest()[:12]


def run():
    con = connect()
    ts = now()
    places = {}  # id -> dict
    for row in con.execute('SELECT id, name, category, lat, lon, created_at FROM places'):
        places[row[0]] = {'id': row[0], 'name': row[1], 'category': row[2], 'lat': row[3], 'lon': row[4], 'created_at': row[5], 'used': False}
    links = []  # (place_id, source_id, ref)

    def make(source_id, ref, name, cat, la, lo):
        i = pid(source_id, ref)
        p = places.get(i) or {'id': i, 'created_at': ts}
        p.update(name=name, category=cat, lat=la, lon=lo, used=True)
        places[i] = p
        return p

    grid = Grid()
    osm_refs = {}
    for ref, name, cat, la, lo in con.execute("SELECT source_ref, name, category, lat, lon FROM source_records WHERE source_id='osm'"):
        p = make('osm', ref, name, cat, la, lo)
        links.append((p['id'], 'osm', ref)); grid.add(la, lo, p); osm_refs[ref] = p

    for src, ref, name, cat, la, lo in con.execute("SELECT source_id, source_ref, name, category, lat, lon FROM source_records WHERE source_id NOT IN ('osm','osm_geraete') ORDER BY source_id"):
        p = osm_refs.get(ref) if src == 'spieli' else None
        if src == 'website' and places.get(ref, {}).get('used'):
            p = places[ref]  # website scans are keyed by place id
        if src == 'mangrove' and (m := re.match(r'osm_[a-z_]+?_(\d+)#', ref)):
            p = next((osm_refs[k] for k in (f'node/{m[1]}', f'way/{m[1]}', f'relation/{m[1]}') if k in osm_refs), None)
        if p is None and la is not None:
            best, bd = None, MATCH_M
            for q in grid.near(la, lo):
                if not compatible(cat, q['category']) or not similar(name, q['name']): continue
                d = dist(la, lo, q['lat'], q['lon'])
                if d < bd: best, bd = q, d
            p = best
        if p is None:
            if la is None: continue
            p = make(src, ref, name, cat, la, lo); grid.add(la, lo, p)
        elif not p.get('name') and name:
            p['name'] = name
        links.append((p['id'], src, ref))

    for ref, la, lo in con.execute("SELECT source_ref, lat, lon FROM source_records WHERE source_id='osm_geraete'"):
        best, bd = None, 80
        for q in grid.near(la, lo):
            if q['category'] not in ('spielplatz', 'indoor', 'spielplatz_privat'): continue
            d = dist(la, lo, q['lat'], q['lon'])
            if d < bd: best, bd = q, d
        if best: links.append((best['id'], 'osm_geraete', ref))

    used = [p for p in places.values() if p.get('used')]
    districts = load_districts()
    for p in used:
        p['district'], p['borough'] = locate(districts, p['lat'], p['lon'])

    con.execute('UPDATE source_records SET place_id = NULL')
    con.execute('DELETE FROM places')
    con.executemany('INSERT INTO places(id, name, category, lat, lon, district, borough, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
                    [(p['id'], p.get('name'), p['category'], p['lat'], p['lon'], p['district'], p['borough'], p['created_at'], ts) for p in used])
    con.executemany('UPDATE source_records SET place_id=? WHERE source_id=? AND source_ref=?', links)
    con.commit()
    multi = con.execute('SELECT COUNT(*) FROM (SELECT place_id FROM source_records WHERE place_id IS NOT NULL AND source_id != \'osm_geraete\' GROUP BY place_id HAVING COUNT(DISTINCT source_id) > 1)').fetchone()[0]
    print(f'places: {len(used)}, with 2+ sources: {multi}')


def load_districts():
    """Stadtteile (admin_level 10) and Bezirke (admin_level 9) from the OSM extract."""
    import osmium
    from shapely import wkb
    from shapely.strtree import STRtree
    fab = osmium.geom.WKBFactory()
    levels = {'9': [], '10': []}
    pbf = RAW_DIR / 'hamburg-latest.osm.pbf'
    for o in osmium.FileProcessor(str(pbf)).with_areas().with_filter(osmium.filter.TagFilter(('boundary', 'administrative'))):
        if o.is_area() and o.tags.get('admin_level') in levels and o.tags.get('name'):
            try:
                levels[o.tags['admin_level']].append((wkb.loads(fab.create_multipolygon(o), hex=True), o.tags['name']))
            except Exception:
                pass
    out = {}
    for lv, items in levels.items():
        out[lv] = (STRtree([g for g, _ in items]), items)
    print(f"boundaries: {len(levels['10'])} Stadtteile, {len(levels['9'])} Bezirke")
    return out


def locate(districts, la, lo):
    from shapely.geometry import Point
    pt = Point(lo, la)
    res = []
    for lv in ('10', '9'):
        tree, items = districts[lv]
        name = None
        for i in tree.query(pt):
            if items[i][0].contains(pt):
                name = items[i][1]; break
        res.append(name)
    return res[0], res[1]


if __name__ == '__main__':
    run()
