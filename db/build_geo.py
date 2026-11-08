"""Hamburg's 104 Stadtteile in 7 Bezirke, and the postcodes, from the official administrative boundaries in the OSM extract.

Writes
  data/geo.json             for the app: Stadtteil -> Bezirk and centre point, postcode -> centre point and Stadtteil (small)
  data/stadtteile_poly.json for export.py: simplified Stadtteil polygons, so offers get their Stadtteil by coordinates
                            without needing shapely (the nightly refresh on the server has no geo libraries)
Centre = a point inside the area (representative point), rounded to about 100 m: a home location is never stored more exactly.
Run after tools/download-osm.sh when boundaries change (rarely).
"""
import json
import sys

from common import RAW_DIR, ROOT

# Official list (Statistikamt Nord, 104 Stadtteile). OSM names that differ are mapped here.
BEZIRKE = {
    'Hamburg-Mitte': 'Hamburg-Altstadt HafenCity Neustadt|St. Pauli|St. Georg|Hammerbrook|Borgfelde|Hamm|Horn|Billstedt|Billbrook|Rothenburgsort|Veddel|Wilhelmsburg|Kleiner Grasbrook|Steinwerder|Waltershof|Finkenwerder|Neuwerk',
    'Altona': 'Altona-Altstadt|Sternschanze|Altona-Nord|Ottensen|Bahrenfeld|Groß Flottbek|Othmarschen|Lurup|Osdorf|Nienstedten|Blankenese|Iserbrook|Sülldorf|Rissen',
    'Eimsbüttel': 'Eimsbüttel|Rotherbaum|Harvestehude|Hoheluft-West|Lokstedt|Niendorf|Schnelsen|Eidelstedt|Stellingen',
    'Hamburg-Nord': 'Hoheluft-Ost|Eppendorf|Groß Borstel|Alsterdorf|Winterhude|Uhlenhorst|Hohenfelde|Barmbek-Süd|Dulsberg|Barmbek-Nord|Ohlsdorf|Fuhlsbüttel|Langenhorn',
    'Wandsbek': 'Eilbek|Wandsbek|Marienthal|Jenfeld|Tonndorf|Farmsen-Berne|Bramfeld|Steilshoop|Wellingsbüttel|Sasel|Poppenbüttel|Hummelsbüttel|Lemsahl-Mellingstedt|Duvenstedt|Wohldorf-Ohlstedt|Bergstedt|Volksdorf|Rahlstedt',
    'Bergedorf': 'Lohbrügge|Bergedorf|Curslack|Altengamme|Neuengamme|Kirchwerder|Ochsenwerder|Reitbrook|Allermöhe|Billwerder|Moorfleet|Tatenberg|Spadenland|Neuallermöhe',
    'Harburg': 'Harburg|Neuland|Gut Moor|Wilstorf|Rönneburg|Langenbek|Sinstorf|Marmstorf|Eißendorf|Heimfeld|Moorburg|Altenwerder|Hausbruch|Neugraben-Fischbek|Francop|Neuenfelde|Cranz',
}
BEZIRKE['Hamburg-Mitte'] = BEZIRKE['Hamburg-Mitte'].replace('Hamburg-Altstadt HafenCity Neustadt', 'Hamburg-Altstadt|HafenCity|Neustadt')
OFFICIAL = {name: bz for bz, names in BEZIRKE.items() for name in names.split('|')}
assert len(OFFICIAL) == 104, len(OFFICIAL)
OSM_TO_OFFICIAL = {'Altstadt': 'Hamburg-Altstadt', 'Stove': 'Kirchwerder'}  # Stove is part of Kirchwerder


def collect():
    import osmium
    from shapely import wkb
    fab = osmium.geom.WKBFactory()
    stadtteile, plz = {}, {}
    for o in osmium.FileProcessor(str(RAW_DIR / 'hamburg-latest.osm.pbf')).with_areas().with_filter(osmium.filter.KeyFilter('boundary')):
        if not o.is_area(): continue
        t = o.tags
        try:
            if t.get('boundary') == 'administrative' and t.get('admin_level') == '10' and t.get('name'):
                stadtteile.setdefault(t['name'], []).append(wkb.loads(fab.create_multipolygon(o), hex=True))
            elif t.get('boundary') == 'postal_code' and (t.get('postal_code') or '').startswith(('20', '21', '22')):
                plz.setdefault(t['postal_code'], []).append(wkb.loads(fab.create_multipolygon(o), hex=True))
        except Exception:
            pass
    return stadtteile, plz


def run():
    from shapely.ops import unary_union
    stadtteile, plz = collect()
    geoms = {}
    for name, parts in stadtteile.items():
        off = OSM_TO_OFFICIAL.get(name, name)
        if off in OFFICIAL: geoms[off] = unary_union(parts + ([geoms[off]] if off in geoms else []))
    missing = sorted(set(OFFICIAL) - set(geoms))
    extra = sorted(n for n in stadtteile if OSM_TO_OFFICIAL.get(n, n) not in OFFICIAL)
    print(f'{len(geoms)} of 104 Stadtteile found; missing: {missing}; OSM names not official: {extra}')
    if missing: sys.exit('fix OSM_TO_OFFICIAL first')
    r = lambda v: round(v, 3)  # about 100 m
    out = {'stadtteile': [], 'plz': []}
    for bz, names in BEZIRKE.items():
        for name in names.split('|'):
            p = geoms[name].representative_point()
            out['stadtteile'].append([name, bz, r(p.y), r(p.x)])
    for code, parts in sorted(plz.items()):
        g = unary_union(parts); p = g.representative_point()
        inside = next((n for n, sg in geoms.items() if sg.contains(p)), None)
        if inside: out['plz'].append([code, r(p.y), r(p.x), inside])  # postcodes in Hamburg only
    (ROOT / 'data' / 'geo.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    polys = []
    for name, g in geoms.items():
        g = g.simplify(0.0003, preserve_topology=True)  # about 30 m
        rings = [list(map(lambda c: [round(c[0], 5), round(c[1], 5)], poly.exterior.coords)) for poly in getattr(g, 'geoms', [g])]
        polys.append([name, OFFICIAL[name], rings])
    (ROOT / 'data' / 'stadtteile_poly.json').write_text(json.dumps(polys, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"{len(out['stadtteile'])} Stadtteile, {len(out['plz'])} postcodes -> data/geo.json; polygons -> data/stadtteile_poly.json")


if __name__ == '__main__':
    run()
