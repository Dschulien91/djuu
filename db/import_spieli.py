"""Import computed playground details from spieli.eu (Hamburg instance, public PostgREST API).

Values are derived from OpenStreetMap, so ODbL applies. spieli marks a feature 'false' when it is
simply not mapped, so only positive values and counts are stored as facts.
"""
from common import connect, fetch, register_source, replace_records, save_raw
import json

API = 'https://hamburg.spieli.osm-fulda.de/api/rpc/get_playgrounds_bbox'
BBOX = (53.39, 9.72, 53.75, 10.33)  # lat_min, lon_min, lat_max, lon_max
STEP = 0.06
FLAGS = {'for_baby': 'for_baby', 'for_toddler': 'for_toddler', 'for_wheelchair': 'playground_wheelchair',
         'has_shade': 'shade', 'has_fence': 'fenced', 'is_water': 'water_play', 'has_theme': 'playground_theme_flag',
         'has_soccer': 'soccer', 'has_basketball': 'basketball'}
COUNTS = ['device_count', 'bench_count', 'tree_count', 'picnic_count', 'shelter_count', 'table_tennis_count', 'area']
TYPES = {'W': 'way', 'N': 'node', 'R': 'relation'}


def centroid(geom):
    pts = []
    def walk(c):
        if isinstance(c[0], (int, float)): pts.append(c)
        else:
            for x in c: walk(x)
    walk(geom['coordinates'])
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


def run():
    con = connect()
    register_source(con, 'spieli', 'spieli.eu (aus OpenStreetMap berechnet)', 'https://spieli.eu', 'ODbL 1.0',
                    '© OpenStreetMap-Mitwirkende, Auswertung spieli.eu', priority=55)
    feats = {}
    lat = BBOX[0]
    while lat < BBOX[2]:
        lon = BBOX[1]
        while lon < BBOX[3]:
            r = fetch(API, params={'min_lon': lon, 'min_lat': lat, 'max_lon': lon + STEP, 'max_lat': lat + STEP})
            for f in r.json().get('features') or []:
                p = f['properties']
                feats[f"{TYPES.get(p.get('osm_type'), 'way')}/{p['osm_id']}"] = f
            lon += STEP
        lat += STEP
        print(f'  lat {lat:.2f}: {len(feats)} playgrounds')
    save_raw('spieli_hamburg.json', json.dumps(list(feats.values()), ensure_ascii=False))
    recs = []
    for ref, f in feats.items():
        p = f['properties']
        la, lo = centroid(f['geometry'])
        facts = {k2: 'yes' for k1, k2 in FLAGS.items() if p.get(k1) is True}
        facts.update({c: p[c] for c in COUNTS if p.get(c)})
        if p.get('description:de'): facts['description'] = p['description:de']
        recs.append({'ref': ref, 'category': 'spielplatz', 'name': p.get('name'), 'lat': la, 'lon': lo,
                     'url': f'https://spieli.eu/#{ref}', 'raw': p, 'facts': facts})
    print('spieli:', replace_records(con, 'spieli', recs))


if __name__ == '__main__':
    run()
