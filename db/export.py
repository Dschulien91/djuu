"""Export the merged database into data/places.json for the app (v0.2 format).

Format (compact arrays to keep the file small):
{
  "version": 2, "generated": "...",
  "sources": [[id, name, license, attribution, url], ...],
  "places": [[id, name, category, lat, lon, district, {key: [value, sourceIndex, method, confidence, evidence?]}, [sourceIndex], [tag]], ...]
}
Tags (db/tags.py) drive the sub-category chips and the indoor/outdoor switch of the app (v0.7).
"""
import json
import math
import re
from collections import defaultdict

from common import ROOT, connect, now
from derive_names import is_bad_name
from flags import ensure as ensure_flags, flagged_offers
from tags import drop, place_tags
from tipps import auto_reason, editorial_match

SKIP_CATS = {'spielplatz_privat', 'geraet'}
STOP_NEAR_M = 400
# Places where the nearest stop helps: everything parents travel to, not the stops themselves.
STOP_CATS = {'spielplatz', 'abenteuer', 'indoor', 'spielhaus', 'freizeit', 'cafe', 'restaurant', 'eis', 'park', 'baden', 'museum', 'kultur', 'ausflug',
             'buecherei', 'kurs', 'treffpunkt', 'geburtshaus', 'klinik', 'kinderarzt', 'hundeauslauf', 'bolzplatz', 'wochenmarkt', 'schule',
             'sportstaette', 'sportverein', 'reiten', 'tierhof', 'garten', 'naturschutz', 'musikschule', 'tanzschule', 'sprachschule', 'kreativschule', 'jugend',
             'physio', 'therapie', 'zahnarzt', 'frauenarzt', 'hno', 'augenarzt', 'kinderpsychologie', 'hebamme', 'apotheke'}
KEYS = ['changing_table', 'changing_table_location', 'highchair', 'kids_area', 'kids_menu', 'dog', 'dog_rule', 'wheelchair',
        'stroller', 'toilets', 'baby_feeding', 'babyccino', 'indoor', 'fee', 'opening_hours', 'website', 'phone', 'address',
        'street', 'housenumber', 'for_baby', 'for_toddler', 'fenced', 'shade', 'water_play', 'device_count', 'bench_count',
        'description', 'image', 'age_groups', 'type', 'operator', 'water_status', 'water_quality_eu', 'season', 'services',
        'maternity', 'emergency', 'rating', 'review_text', 'drinking_water', 'cuisine', 'care_types', 'transit',
        'sport', 'min_age', 'max_age', 'toilets_children', 'fee_text', 'area_ha', 'unisex', 'table_tennis_count', 'picnic_count', 'soccer', 'basketball']
WC_NEAR_M = 300

# Category refinement: official sources and clear names beat the generic OSM category.
SOURCE_CAT = {'hh_ekiz': 'kurs', 'hh_elternschule': 'kurs', 'hh_familienbildung_konf': 'kurs',
              'hh_spielhaus': 'spielhaus', 'hh_bauspielplatz': 'abenteuer', 'hh_kindertreff': 'spielhaus'}
NAME_CAT = [(r'geburtshaus|haus für geburt', 'geburtshaus'),
            (r'bauspielplatz|abenteuerspielplatz|aktivspielplatz', 'abenteuer'),
            (r'^spielhaus|spielhaus ', 'spielhaus'),
            (r'familienbildung|familien-bildung|elternschule|eltern-kind-zentrum|(?<!\w)ekiz(?!\w)|haus der familie|kinder- und familienzentrum|familienzentrum|kifaz', 'kurs')]
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

    # raw OSM tags of all linked OSM records (diet, cuisine, shop type, ...) for the tags
    osm_raw = defaultdict(dict)
    for pid, raw in con.execute("SELECT place_id, raw FROM source_records WHERE source_id = 'osm' AND place_id IS NOT NULL AND raw IS NOT NULL"):
        for k, v in json.loads(raw).items(): osm_raw[pid].setdefault(k, v)

    # reversible cleaning (db/flags.py): flagged places stay in the database but leave the app
    ensure_flags(con)
    flags = con.execute('SELECT place_id, status, duplicate_of FROM place_flags').fetchall()
    hidden = {i for i, st, _ in flags if st != 'kategorie'}
    new_cat = {i: c for i, st, c in flags if st == 'kategorie' and c}
    # a duplicate hands its facts and sources to the place that stays
    dup_of = {i: k for i, st, k in flags if st == 'duplikat' and k}
    for dup, keep in dup_of.items():
        for k, v in facts.get(dup, {}).items(): facts[keep].setdefault(k, v)
        gear[keep] |= gear.get(dup, set())
        srcs[keep] |= srcs.get(dup, set()); srcnames[keep] |= srcnames.get(dup, set())
    rows = con.execute('SELECT id, name, category, lat, lon, district FROM places WHERE district IS NOT NULL').fetchall()
    n_all = len(rows)
    names = {i: n for i, n, *_ in rows}
    for dup, keep in dup_of.items():
        if not names.get(keep): names[keep] = names.get(dup)  # a duplicate may know the name
    rows = [(i, names[i], new_cat.get(i, c), la, lo, d) for i, n, c, la, lo, d in rows if i not in hidden]
    print(f'{n_all - len(rows)} places hidden by flags, {len(new_cat)} recategorised')
    rows = [(pid, name, refine(cat, name, srcnames[pid]), lat, lon, d) for pid, name, cat, lat, lon, d in rows if cat not in SKIP_CATS]
    dropped = [r for r in rows if drop(r[2], r[1], osm_raw[r[0]])]
    rows = [r for r in rows if not drop(r[2], r[1], osm_raw[r[0]])]
    print(f'dropped {len(dropped)} (adult, gambling, nameless viewpoints):', sorted({r[1] for r in dropped if r[1]})[:20])
    # devices of the green-space register per green area: playground size where the park register knows the area
    area_place = {}
    for pid, gid in con.execute("""SELECT sr.place_id, f.value FROM facts f JOIN source_records sr USING (source_id, source_ref)
                                   WHERE f.source_id = 'hh_gruenplan' AND f.key = 'gruen_id' AND sr.place_id IS NOT NULL"""):
        area_place[gid] = pid
    devices = defaultdict(int)
    for gid, n in con.execute("SELECT value, COUNT(*) FROM facts WHERE source_id = 'hh_spielgeraete' AND key = 'gruen_id' GROUP BY value"):
        if gid in area_place: devices[area_place[gid]] += n
    stops = defaultdict(list)
    for r in rows:
        if r[2] == 'haltestelle' and r[1]: stops[(int(r[3] / 0.004), int(r[4] / 0.007))].append((r[3], r[4], r[1]))
    # the hvv feed has one record per station; OSM railway stations next to one are duplicates (often per platform)
    def near_stop(la, lo, m):
        gi, gj = int(la / 0.004), int(lo / 0.007)
        return any(dist(la, lo, a, b) <= m for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b, _ in stops.get((gi + i, gj + j), ()))
    rows = [r for r in rows if not (r[2] == 'bahnhof' and near_stop(r[3], r[4], 350))]
    for r in rows:
        if r[2] in ('bahnhof', 'faehre') and r[1]: stops[(int(r[3] / 0.004), int(r[4] / 0.007))].append((r[3], r[4], r[1]))
    wcs = [(r[3], r[4]) for r in rows if r[2] == 'wc' or facts[r[0]].get('toilets', [None])[0] == 'yes']

    derived = {r[0]: r[1:] for r in con.execute('SELECT place_id, near, basis FROM derived_names')} if con.execute("SELECT 1 FROM sqlite_master WHERE name='derived_names'").fetchone() else {}
    places = []
    for pid, name, cat, lat, lon, district in rows:
        f = facts.get(pid, {})
        if is_bad_name(name): name = None  # stop ids and building numbers are not names
        if not name and pid in derived: f['near_name'] = [derived[pid][0], sidx['osm'], 'computed', derived[pid][1]]
        if gear.get(pid): f['gear'] = [','.join(sorted(gear[pid])), sidx['osm_geraete'], 'source']
        if cat == 'spielplatz' and wcs:
            d = min(dist(lat, lon, a, b) for a, b in wcs if abs(a - lat) < 0.004 and abs(b - lon) < 0.007) if any(abs(a - lat) < 0.004 and abs(b - lon) < 0.007 for a, b in wcs) else None
            if d is not None and d <= WC_NEAR_M: f['wc_near'] = [str(round(d)), sidx['osm'], 'computed']
        if cat in STOP_CATS and 'hvv_gtfs' in sidx:
            gi, gj = int(lat / 0.004), int(lon / 0.007)
            near = min(((dist(lat, lon, a, b), n) for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b, n in stops.get((gi + i, gj + j), ())), default=None)
            if near and near[0] <= STOP_NEAR_M: f['stop_near'] = [f'{round(near[0])}|{near[1]}', sidx['hvv_gtfs'], 'computed']
        tip = editorial_match(name, district)
        if tip: f['tipp'] = [tip, -1, 'redaktion']
        elif (r := auto_reason(cat, f)): f['tipp'] = [r, -1, 'auto']
        # after the tip rules: register counts cover a whole green area, not one playground
        if devices.get(pid) and devices[pid] > int(f.get('device_count', [0])[0] or 0) and 'hh_spielgeraete' in sidx:
            f['device_count'] = [str(devices[pid]), sidx['hh_spielgeraete'], 'computed']
        tg = place_tags(cat, name, osm_raw[pid], {k: v[0] for k, v in f.items()}, gear.get(pid))
        places.append([pid, name or '', cat, round(lat, 6), round(lon, 6), district, f, sorted(srcs[pid]), tg])
    out = {'version': 2, 'generated': now(), 'sources': sources, 'places': places}
    path = ROOT / 'data' / 'places.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # small file for the legal page, so it never has to load all places
    (ROOT / 'data' / 'sources.json').write_text(json.dumps({'generated': out['generated'], 'sources': [s[1:] for s in sources]}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    from collections import Counter
    print(f'{len(places)} places, {path.stat().st_size / 1e6:.1f} MB -> {path}')
    print('categories:', dict(Counter(p[2] for p in places).most_common()))
    print('tipps:', Counter(p[6]['tipp'][2] for p in places if 'tipp' in p[6]))
    print('tags:', dict(Counter(t for p in places for t in p[8]).most_common()))
    export_offers(con, places, sidx, dup_of)


OFFER_COLS = ['id', 'title', 'kind', 'topic', 'age_min_m', 'age_max_m', 'for_parents', 'weekday', 'time_from', 'time_to',
              'start_date', 'end_date', 'sessions', 'schedule', 'price', 'free', 'registration', 'venue', 'address',
              'lat', 'lon', 'place_id', 'url', 'provider', 'source_id', 'audience', 'district', 'dogs']

# Dogs at events, set by hand (the importers replace the offers table every night, this table stays):
# 'auch' = explicitly also with a dog (walks, dog meadows), 'ja' = dogs allowed, 'leine' = on a lead only, 'nein' = no dogs.
# Events without an entry take the rule of their place in the app.
DOGS_SCHEMA = """CREATE TABLE IF NOT EXISTS offer_dogs (
  offer_id TEXT PRIMARY KEY, dogs TEXT NOT NULL CHECK (dogs IN ('auch', 'ja', 'leine', 'nein')), note TEXT, set_at TEXT
)"""

# Who takes part: 'kinder' (children, also together with a parent) or 'erwachsene' (adults only, not always parents).
ADULT_TOPICS = {'geburtsvorbereitung', 'rueckbildung', 'beratung', 'erste_hilfe', 'eltern_thema'}
ADULT_TITLE = re.compile(r'schwanger|werdende|trennungseltern|alleinerziehend|sprachcaf|deutschkurs|sprachkurs|zumba|pilates|'
                         r'fitness|elternabend|vortrag|infoabend|elternkurs|für (mütter|väter)|väterkreis|müttercaf|entspann|'
                         r'selbstfürsorge|stretch|relax|stillvorbereitung|säuglingspflege|nähkurs|nähcaf|bewerbung|yoga(?! für kinder)', re.I)


def audience(o):
    if o['for_parents'] or o['topic'] in ADULT_TOPICS: return 'erwachsene'
    if o['age_min_m'] is not None or o['age_max_m'] is not None: return 'kinder'
    t = o['title'] or ''
    if re.search(r'mit (kind|kindern|baby|babys|nachwuchs)|eltern-kind|familie', t, re.I): return 'kinder'
    return 'erwachsene' if ADULT_TITLE.search(t) else 'kinder'


def export_offers(con, places, sidx, dup_of=None):
    """Write data/offers.json: courses, groups and events, each linked to the nearest matching Djuu place."""
    from offers import ensure, topic_of
    from offers_util import age_of
    from merge import similar
    ensure(con)
    today = now()[:10]
    cols = OFFER_COLS[:-3]  # 'audience', 'district' and 'dogs' are added here
    con.execute(DOGS_SCHEMA)
    dogs = dict(con.execute('SELECT offer_id, dogs FROM offer_dogs').fetchall())
    stadtteil = stadtteil_finder()
    pos = {p[0]: (p[3], p[4]) for p in places}
    rows = con.execute(f"SELECT {','.join(cols)} FROM offers WHERE COALESCE(end_date, start_date, '9999') >= ?", (today,)).fetchall()
    grid = defaultdict(list)
    for p in places:
        grid[(int(p[3] / 0.002), int(p[4] / 0.0034))].append(p)
    out = []
    hide = flagged_offers(con)
    # a venue whose exact name exists once in Hamburg is that place, wherever the provider puts its pin
    key = lambda s: re.sub(r'[^a-z0-9äöüß]+', ' ', (s or '').lower()).strip()
    by_name = defaultdict(list)
    for p in places:
        if p[1]: by_name[key(p[1])].append(p[0])
    for r in rows:
        o = dict(zip(cols, r))
        if o['id'] in hide: continue
        o['place_id'] = (dup_of or {}).get(o['place_id'], o['place_id'])
        if o['lat'] and not o['place_id']:
            best, bd = None, 150
            gi, gj = int(o['lat'] / 0.002), int(o['lon'] / 0.0034)
            for i in (-1, 0, 1):
                for j in (-1, 0, 1):
                    for p in grid.get((gi + i, gj + j), ()):
                        d = dist(o['lat'], o['lon'], p[3], p[4])
                        if d < bd and (d < 40 or similar(o['venue'], p[1])):
                            best, bd = p, d
            if best: o['place_id'] = best[0]
        if not o['place_id'] and len(by_name.get(key(o['venue']), ())) == 1:
            o['place_id'] = by_name[key(o['venue'])][0]
        if o['age_min_m'] is None and o['age_max_m'] is None and not o['for_parents']:
            o['age_min_m'], o['age_max_m'] = age_of(o['title'])
        if o['topic'] in (None, 'sonstiges'): o['topic'] = topic_of(o['title'])
        o['audience'] = audience(o)
        # Stadtteil by coordinates (point in polygon): the linked place's position, else the offer's own
        la, lo = pos.get(o['place_id'], (o['lat'], o['lon']))
        o['district'] = stadtteil(la, lo) if la and lo else None
        o['source_id'] = sidx.get(o['source_id'], -1)
        o['dogs'] = dogs.get(o['id'])
        out.append([o[c] for c in OFFER_COLS])
    path = ROOT / 'data' / 'offers.json'
    path.write_text(json.dumps({'version': 1, 'generated': now(), 'cols': OFFER_COLS, 'offers': out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    linked = sum(1 for o in out if o[OFFER_COLS.index('place_id')])
    print(f'{len(out)} offers ({linked} linked to places) -> {path}')
    from collections import Counter
    print('district:', sum(1 for o in out if o[OFFER_COLS.index('district')]), 'of', len(out), 'offers have a Stadtteil')
    print('audience:', Counter(o[OFFER_COLS.index('audience')] for o in out), 'topics:', dict(Counter(o[OFFER_COLS.index('topic')] for o in out).most_common()))


def stadtteil_finder():
    """Official Stadtteil of a point, from data/stadtteile_poly.json (db/build_geo.py); plain Python, no geo libraries."""
    path = ROOT / 'data' / 'stadtteile_poly.json'
    if not path.exists(): return lambda la, lo: None
    polys = []
    for name, _, rings in json.loads(path.read_text(encoding='utf-8')):
        for ring in rings:
            xs, ys = [c[0] for c in ring], [c[1] for c in ring]
            polys.append((name, ring, min(xs), max(xs), min(ys), max(ys)))
    def inside(lo, la, ring):
        hit = False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > la) != (y2 > la) and lo < (x2 - x1) * (la - y1) / (y2 - y1) + x1: hit = not hit
        return hit
    def find(la, lo):
        for name, ring, x0, x1, y0, y1 in polys:
            if x0 <= lo <= x1 and y0 <= la <= y1 and inside(lo, la, ring): return name
        return None
    return find


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    return 6371000 * math.hypot((lo2 - lo1) * k * math.cos((la1 + la2) * k / 2), (la2 - la1) * k)


if __name__ == '__main__':
    run()
