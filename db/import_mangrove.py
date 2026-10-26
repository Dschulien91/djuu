"""Import open reviews from Mangrove.reviews (CC BY 4.0) for places in Hamburg.

spieli.eu and kinderfreundlicheorte.de write their reviews there. Subjects look like
'geo:53.57850,9.95519?q=osm_playground_33879016&u=50'. Reviews from kinderfreundlicheorte.de append
structured attributes to the text: '... | kfo:changing_table=yes,play_corner=yes'.
"""
import json
import re

from common import connect, fetch, register_source, replace_records, save_raw

API = 'https://api.mangrove.reviews/reviews'
BBOX = (53.39, 9.72, 53.75, 10.33)
LABEL_CAT = {'playground': 'spielplatz', 'cafe': 'cafe', 'restaurant': 'restaurant', 'ice_cream': 'eis', 'fast_food': 'imbiss',
             'toilets': 'wc', 'library': 'buecherei', 'museum': 'museum', 'indoor_play': 'indoor'}
KFO_KEYS = {'changing_table': 'changing_table', 'play_corner': 'kids_area', 'kids_area': 'kids_area', 'highchair': 'highchair',
            'baby_feeding': 'baby_feeding', 'stroller': 'stroller', 'toilets': 'toilets', 'dog': 'dog'}


def run():
    con = connect()
    register_source(con, 'mangrove', 'Mangrove Reviews', 'https://mangrove.reviews', 'CC BY 4.0',
                    'Bewertungen: Mangrove.reviews (CC BY 4.0)', priority=40)
    reviews, offset = [], 0
    while True:
        batch = fetch(API, params={'q': 'geo:53', 'limit': 3500, 'offset': offset}).json().get('reviews', [])
        reviews += batch
        if len(batch) < 3500: break
        offset += 3500
    save_raw('mangrove_geo53.json', json.dumps(reviews, ensure_ascii=False))
    recs = []
    for r in reviews:
        p = r['payload']
        m = re.match(r'geo:([\d.]+),([\d.]+)', p.get('sub', ''))
        if not m: continue
        la, lo = float(m[1]), float(m[2])
        if not (BBOX[0] < la < BBOX[2] and BBOX[1] < lo < BBOX[3]): continue
        q = re.search(r'q=([^&]+)', p['sub'])
        label = q[1] if q else ''
        om = re.match(r'osm_([a-z_]+?)_(\d+)$', label)
        cat = LABEL_CAT.get(om[1], 'familienfreundlich') if om else 'familienfreundlich'
        text, attrs = p.get('opinion') or '', {}
        if '| kfo:' in text:
            text, kfo = text.split('| kfo:', 1)
            for kv in kfo.split(','):
                if '=' in kv:
                    k, v = kv.strip().split('=', 1)
                    if k in KFO_KEYS: attrs[KFO_KEYS[k]] = (v, 'user', 0.8)
        facts = {'rating': p.get('rating'), 'review_text': text.strip() or None, **attrs}
        recs.append({'ref': f"{label or 'geo'}#{r['signature'][:16]}", 'category': cat, 'name': None if om else label.replace('+', ' '),
                     'lat': la, 'lon': lo, 'url': f"https://mangrove.reviews/search?q={label}", 'raw': p,
                     'facts': facts, 'observed_at': __import__('datetime').datetime.utcfromtimestamp(p.get('iat', 0)).strftime('%Y-%m-%dT%H:%M:%SZ')})
    print(f'mangrove: {len(reviews)} reviews around lat 53, {replace_records(con, "mangrove", recs)} in Hamburg')


if __name__ == '__main__':
    run()
