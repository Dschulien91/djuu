"""Give nameless places a helpful label from their surroundings: the named park they lie in, else the nearest named street.

Result: table derived_names (place_id, near, basis, dist_m). export.py passes it to the app as the fact 'near_name'; the app
shows "Spielplatz Fischers Allee". It is a label computed from OSM geometry, not an official name, and the app says so.
Run after merge.py, before export.py. Reads data/raw/hamburg-latest.osm.pbf.
"""
import math
import re
from collections import defaultdict

from common import RAW_DIR, connect, now

MAX_STREET_M = 150
STREET_TYPES = {'residential', 'living_street', 'unclassified', 'tertiary', 'secondary', 'primary', 'pedestrian', 'service', 'footway', 'path', 'cycleway', 'tertiary_link', 'secondary_link'}
PARK_CATS_SKIP = {'park'}  # a nameless park inside a named park is not "Park Parkname"
# Technical codes that reach us as names (stop ids, building numbers): treated as nameless.
BAD_NAME = re.compile(r'\d{3,}|H\d{1,3}|Haus \d{1,3}[a-z]?', re.I)
GRID = 0.003  # about 300 m north-south, 200 m east-west


def is_bad_name(name):
    return bool(name) and BAD_NAME.fullmatch(name.strip()) is not None


def collect(pbf):
    import osmium
    segs, parks = defaultdict(list), []
    for o in osmium.FileProcessor(str(pbf)).with_locations().with_areas():
        if not o.tags: continue
        name = o.tags.get('name')
        if not name: continue
        if o.is_way() and o.tags.get('highway') in STREET_TYPES:
            pts = [(n.lat, n.lon) for n in o.nodes if n.location.valid()]
            for a, b in zip(pts, pts[1:]):
                for cell in {(int(p[0] / GRID), int(p[1] / GRID)) for p in (a, b, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))}:
                    segs[cell].append((a, b, name))
        elif o.is_area() and o.tags.get('leisure') == 'park':
            for ring in o.outer_rings():
                pts = [(n.lat, n.lon) for n in ring if n.location.valid()]
                if len(pts) >= 4:
                    parks.append((name, pts, min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)))
    return segs, parks


def in_ring(la, lo, pts):
    inside = False
    for i in range(len(pts)):
        (y1, x1), (y2, x2) = pts[i], pts[i - 1]
        if (y1 > la) != (y2 > la) and lo < (x2 - x1) * (la - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def seg_dist(la, lo, a, b):
    """Metres from a point to a short segment, on a local flat projection."""
    kx = 111320 * math.cos(math.radians(la)); ky = 110540
    ax, ay = (a[1] - lo) * kx, (a[0] - la) * ky
    bx, by = (b[1] - lo) * kx, (b[0] - la) * ky
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) if dx or dy else 0
    return math.hypot(ax + t * dx, ay + t * dy)


def run():
    segs, parks = collect(RAW_DIR / 'hamburg-latest.osm.pbf')
    print(f'{sum(map(len, segs.values()))} street segment entries, {len(parks)} park rings')
    con = connect()
    con.execute("""CREATE TABLE IF NOT EXISTS derived_names (place_id TEXT PRIMARY KEY, near TEXT NOT NULL, basis TEXT NOT NULL, dist_m INTEGER, derived_at TEXT NOT NULL)""")
    con.execute('DELETE FROM derived_names')
    rows = [r for r in con.execute('SELECT id, name, category, lat, lon FROM places') if not r[1] or is_bad_name(r[1])]
    stamp, out, by = now(), [], defaultdict(int)
    for pid, _, cat, la, lo in rows:
        near = None
        if cat not in PARK_CATS_SKIP:
            for name, pts, a, b, c, d in parks:
                if a <= la <= b and c <= lo <= d and in_ring(la, lo, pts):
                    near = (name, 'park', 0); break
        if not near:
            best, bd = None, MAX_STREET_M
            gi, gj = int(la / GRID), int(lo / GRID)
            for i in (-1, 0, 1):
                for j in (-1, 0, 1):
                    for a, b, name in segs.get((gi + i, gj + j), ()):
                        m = seg_dist(la, lo, a, b)
                        if m < bd: best, bd = name, m
            if best: near = (best, 'strasse', round(bd))
        if near:
            out.append((pid, near[0], near[1], near[2], stamp)); by[near[1]] += 1
    con.executemany('INSERT INTO derived_names VALUES (?,?,?,?,?)', out)
    con.commit()
    print(f'{len(rows)} nameless, labelled {len(out)}: {dict(by)}')
    con.close()


if __name__ == '__main__':
    run()
