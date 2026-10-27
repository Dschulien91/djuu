"""Export the merged database into data/places.json for the app (v0.2 format).

Format (compact arrays to keep the file small):
{
  "version": 2, "generated": "...",
  "sources": [[id, name, license, attribution, url], ...],
  "places": [[id, name, category, lat, lon, district, {key: [value, sourceIndex, method, confidence, evidence?]}], ...]
}
"""
import json
import math
import re
from collections import defaultdict

from common import ROOT, connect, now
from tipps import auto_reason, editorial_match

SKIP_CATS = {'spielplatz_privat', 'geraet'}
KEYS = ['changing_table', 'changing_table_location', 'highchair', 'kids_area', 'kids_menu', 'dog', 'dog_rule', 'wheelchair',
        'stroller', 'toilets', 'baby_feeding', 'babyccino', 'indoor', 'fee', 'opening_hours', 'website', 'phone', 'address',
        'street', 'housenumber', 'for_baby', 'for_toddler', 'fenced', 'shade', 'water_play', 'device_count', 'bench_count',
        'description', 'image', 'age_groups', 'type', 'operator', 'water_status', 'water_quality_eu', 'season', 'services',
        'maternity', 'emergency', 'rating', 'review_text', 'drinking_water', 'cuisine', 'care_types', 'transit']
WC_NEAR_M = 300

# Category refinement: official sources and clear names beat the generic OSM category.
SOURCE_CAT = {'hh_ekiz': 'kurs', 'hh_elternschule': 'kurs', 'hh_familienbildung_konf': 'kurs',
              'hh_spielhaus': 'spielhaus', 'hh_bauspielplatz': 'abenteuer', 'hh_kindertreff': 'spielhaus'}
NAME_CAT = [(r'geburtshaus|haus für geburt', 'geburtshaus'),
            (r'bauspielplatz|abenteuerspielplatz|aktivspielplatz', 'abenteuer'),
            (r'^spielhaus|spielhaus ', 'spielhaus'),
            (r'familienbildung|familien-bildung|elternschule|eltern-kind-zentrum|ekiz|haus der familie|kinder- und familienzentrum|familienzentrum|kifaz', 'kurs')]
NAME_CAT_FROM = {'treffpunkt', 'beratung', 'hebamme', 'kita', 'spielplatz', 'park', 'familienfreundlich', 'kultur'}


def refine(cat, name, srcs):
    for s in srcs:
        if s in SOURCE_CAT and not (SOURCE_CAT[s] == 'kurs' and cat == 'kita'):
            return SOURCE_CAT[s]
    if cat in NAME_CAT_FROM and name:
        for rx, c in NAME_CAT:
            if re.search(rx, name, re.I) and not (c == 'kurs' and cat == 'kita'):
                return c
    return cat


def run():
    con = connect()
    sources = [list(r) for r in con.execute('SELECT id, name, license, attribution, url FROM sources ORDER BY priority DESC, id')]
    sidx = {s[0]: i for i, s in enumerate(sources)}

    facts = defaultdict(dict)
    q = f"""SELECT place_id, key, value, source_id, method, n_sources FROM place_facts WHERE key IN ({','.join('?' * len(KEYS))})"""
    for pid, key, value, src, method, n in con.execute(q, KEYS):
        facts[pid][key] = [value, sidx[src], method]
    # evidence snippets and confidence for website facts
    for pid, key, value in con.execute("""SELECT sr.place_id, f.key, f.value FROM facts f JOIN source_records sr USING (source_id, source_ref)
                                          WHERE f.source_id = 'website' AND f.key LIKE 'evidence_%' AND sr.place_id IS NOT NULL"""):
        k = key[len('evidence_'):]
        if k in facts[pid] and sources[facts[pid][k][1]][0] == 'website':
            facts[pid][k] += [0.6, value[:220]]
    # all playground equipment of a place (several device nodes)
    gear = defaultdict(set)
    for pid, value in con.execute("""SELECT sr.place_id, f.value FROM facts f JOIN source_records sr USING (source_id, source_ref)
                                     WHERE f.key IN ('playground_equipment', 'playground_features') AND sr.place_id IS NOT NULL"""):
        for v in value.replace(';', ',').split(','):
            if v.strip(): gear[pid].add(v.strip())
    # names of all sources per place
    srcs, srcnames = defaultdict(set), defaultdict(set)
    for pid, src in con.execute('SELECT place_id, source_id FROM source_records WHERE place_id IS NOT NULL'):
        srcs[pid].add(sidx[src]); srcnames[pid].add(src)

    rows = con.execute('SELECT id, name, category, lat, lon, district FROM places WHERE district IS NOT NULL').fetchall()
    rows = [(pid, name, refine(cat, name, srcnames[pid]), lat, lon, d) for pid, name, cat, lat, lon, d in rows if cat not in SKIP_CATS]
    wcs = [(r[3], r[4]) for r in rows if r[2] == 'wc' or facts[r[0]].get('toilets', [None])[0] == 'yes']

    places = []
    for pid, name, cat, lat, lon, district in rows:
        f = facts.get(pid, {})
        if gear.get(pid): f['gear'] = [','.join(sorted(gear[pid])), sidx['osm_geraete'], 'source']
        if cat == 'spielplatz' and wcs:
            d = min(dist(lat, lon, a, b) for a, b in wcs if abs(a - lat) < 0.004 and abs(b - lon) < 0.007) if any(abs(a - lat) < 0.004 and abs(b - lon) < 0.007 for a, b in wcs) else None
            if d is not None and d <= WC_NEAR_M: f['wc_near'] = [str(round(d)), sidx['osm'], 'computed']
        tip = editorial_match(name, district)
        if tip: f['tipp'] = [tip, -1, 'redaktion']
        elif (r := auto_reason(cat, f)): f['tipp'] = [r, -1, 'auto']
        places.append([pid, name or '', cat, round(lat, 6), round(lon, 6), district, f, sorted(srcs[pid])])
    out = {'version': 2, 'generated': now(), 'sources': sources, 'places': places}
    path = ROOT / 'data' / 'places.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    from collections import Counter
    print(f'{len(places)} places, {path.stat().st_size / 1e6:.1f} MB -> {path}')
    print('categories:', dict(Counter(p[2] for p in places).most_common()))
    print('tipps:', Counter(p[6]['tipp'][2] for p in places if 'tipp' in p[6]))


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    return 6371000 * math.hypot((lo2 - lo1) * k * math.cos((la1 + la2) * k / 2), (la2 - la1) * k)


if __name__ == '__main__':
    run()
