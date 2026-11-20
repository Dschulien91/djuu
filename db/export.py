"""Export the merged database into data/places.json for the app (v0.2 format).

Format (compact arrays to keep the file small):
{
  "version": 2, "generated": "...",
  "sources": [[id, name, license, attribution, url], ...],
  "places": [[id, name, category, lat, lon, district, {key: [value, sourceIndex, method, confidence, evidence?]}, [sourceIndex], [tag]], ...]
}
Tags (db/tags.py) drive the sub-category chips and the indoor/outdoor switch of the app (v0.7).

Computed facts (method 'computed', source index -1, rules in infer_facts()):
  fee = 'no'            playgrounds, parks, Bolzplätze, Spielstraßen, Bücherschränke, dog runs, public water ... are free by nature
  open_always = 'yes'   the same outdoor places have no opening hours: freely accessible (the app treats them as open now / on Sundays)
  krippe / elementar / integration / hort = 'yes'   from the Kita register's care types (K, E, Eing, H)
  age_groups            '0-3,3-6,...' for Kitas from the same care types, when no age is known (feeds the app's age filters)
  baby_swimming = 'yes' (the course names move to baby_swimming_courses)
  dog_offleash          'alle' (§8 zone: every dog) / 'gepruefte' (§9 zone: only dogs with a test) / 'leine', from dog_rule
  drinking_water = 'refill' on a business whose own Refill station pin was folded into it (fold_refill())
Lift places carry the hvv station in their name ('Aufzug Hauptbahnhof (Gleis 13/14)'), see lift_names().
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
        'sport', 'min_age', 'max_age', 'toilets_children', 'fee_text', 'area_ha', 'unisex', 'table_tennis_count', 'picnic_count', 'soccer', 'basketball',
        'kids_pool', 'water_slide', 'wave_pool', 'baby_swimming',
        'cabin_length_cm', 'cabin_width_cm', 'door_width_cm', 'kinder_notinsel', 'notinsel_url']  # live values: export_live.py
WC_NEAR_M = 300
# Places outside Hamburg's border form the region 'Umland': day-trip highlights up to 100 km from the Rathaus,
# everyday family places (playground, café, pharmacy ...) up to 25 km for families living near the border.
UMLAND = 'Umland'
RATHAUS = (53.5503, 9.9927)
UMLAND_FAR = {'ausflug', 'museum', 'tierhof', 'indoor', 'baden', 'freizeit', 'abenteuer', 'kultur', 'garten', 'naturschutz', 'reiten', 'camping'}
UMLAND_NEAR = {'spielplatz', 'park', 'picknick', 'grillplatz', 'cafe', 'eis', 'familienfreundlich', 'restaurant', 'imbiss', 'bolzplatz',
               'hundeauslauf', 'kinderarzt', 'apotheke', 'wc', 'windeln', 'spielhaus', 'treffpunkt'}


def umland(cat, lat, lon, osm, name):
    """'Umland' for a family place outside Hamburg within reach, else None (left out). Nameless places only for playgrounds and parks."""
    if not name and cat not in ('spielplatz', 'park'):
        return None
    km = dist(lat, lon, *RATHAUS) / 1000
    if cat in UMLAND_FAR and km <= 100:
        # lookouts and single attractions inside a wildlife park are part of the park, not places of their own
        return None if osm.get('tourism') in ('viewpoint', 'attraction') else UMLAND
    return UMLAND if cat in UMLAND_NEAR and km <= 25 else None

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


# Outdoor places that cost nothing and have no gate or opening hours (a playground in a park, a Bücherschrank ...)
FREE_CATS = {'spielplatz', 'park', 'bolzplatz', 'spielstrasse', 'buecherschrank', 'picknick', 'grillplatz', 'hundeauslauf',
             'trinkwasser', 'tischtennis', 'rodeln', 'brunnen', 'naturschutz'}
OPEN_CATS = FREE_CATS - {'trinkwasser'}  # Refill stations are shops with opening hours; public fountains are added below


def infer_facts(cat, f):
    """Facts that follow from the category or from another fact (see the module doc). Never overwrites a known fact."""
    computed = lambda v: [v, -1, 'computed']
    if 'fee' not in f:
        if (f.get('fee_text') or [''])[0].strip().lower() in ('kostenfrei', 'kostenlos', 'frei', 'eintritt frei'):
            f['fee'] = ['no'] + f['fee_text'][1:3]
        elif cat in FREE_CATS and (f.get('indoor') or [''])[0] != 'yes':
            f['fee'] = computed('no')
    public_water = cat == 'trinkwasser' and (f.get('drinking_water') or [''])[0] != 'refill'
    if 'opening_hours' not in f and (cat in OPEN_CATS or public_water) and (f.get('fee') or [''])[0] != 'yes':
        f['open_always'] = computed('yes')
    if cat == 'kita' and f.get('care_types'):
        ct = f['care_types'][0] or ''
        rest = ct.replace('Eing', '')
        kinds = {'krippe': 'K' in rest, 'elementar': 'E' in rest, 'hort': 'H' in rest, 'integration': 'Eing' in ct}
        for k, on in kinds.items():
            if on: f[k] = computed('yes')
        if 'age_groups' not in f and 'min_age' not in f:
            spans = [s for k, s in (('krippe', '0-3'), ('elementar', '3-6'), ('hort', '6-14')) if kinds[k]]
            if spans: f['age_groups'] = computed(','.join(spans))
    if f.get('baby_swimming') and f['baby_swimming'][0] not in ('yes', 'no'):
        f['baby_swimming_courses'] = list(f['baby_swimming'])
        f['baby_swimming'] = ['yes'] + f['baby_swimming'][1:3]
    if f.get('dog_rule') and 'dog_offleash' not in f:
        r = (f['dog_rule'][0] or '').lower()
        v = 'gepruefte' if re.search(r'§\s*9|geprüft|gepruef', r) else 'alle' if re.search(r'§\s*8|alle hunde', r) else 'leine' if 'leine' in r else None
        if v: f['dog_offleash'] = [v] + f['dog_rule'][1:3]
    return f


STATION_ALIAS = {'Hamburg Hbf': 'Hauptbahnhof', 'Hamburg Dammtor': 'Dammtor', 'Hamburg-Altona': 'Altona', 'Hamburg-Harburg': 'Harburg'}


def lift_detail(raw):
    """Short part of an hvv elevator description that tells the lifts of one station apart: track, platform line or entrance."""
    desc = raw.get('description') or ''
    m = re.search(r'Gleise?\s*(\d+(?:\s*(?:/|und|,)\s*\d+)*)', desc)
    if m: return 'Gleis ' + re.sub(r'\s*(?:und|,)\s*', '/', m.group(1)).replace(' ', '')
    m = re.search(r'Bahnsteig\s+([USA]\d+(?:/[USA]\d+)*)', desc)
    if m: return 'Bahnsteig ' + m.group(1)
    m = re.match(r'\s*(Zugang [^<|(]+?)\s*(<->|\(|$)', desc)
    if m and len(m.group(1)) <= 40: return m.group(1)
    return None


def lift_names(con, dup_of):
    """place id -> 'Aufzug <station> (<detail>)' for the elevators in hvv's status feed (db/import_aufzug_status.py).
    One lift at a station: 'Aufzug Rothenburgsort'. Several: track, platform or entrance, else hvv's letter ('Aufzug Wartenau B')."""
    out = {}
    for pid, raw in con.execute("SELECT place_id, raw FROM source_records WHERE source_id = 'hvv_aufzug' AND place_id IS NOT NULL AND raw IS NOT NULL"):
        r = json.loads(raw)
        st = re.sub(r'\s+', ' ', r.get('station') or '').strip()
        if not st: continue
        st = STATION_ALIAS.get(st, st)
        st = re.sub(r'\s*\(.*?\)', '', st).strip()  # 'Dammtor (Messe/CCH)' -> 'Dammtor'
        out[dup_of.get(pid, pid)] = (f'Aufzug {st}', lift_detail(r), r.get('label'))
    per_station, per_detail = defaultdict(int), defaultdict(int)
    for base, d, _ in out.values():
        per_station[base] += 1; per_detail[(base, d)] += 1
    names = {}
    for pid, (base, d, lab) in out.items():
        if per_station[base] == 1: names[pid] = base
        elif d and per_detail[(base, d)] == 1: names[pid] = f'{base} ({d})'
        elif d and lab: names[pid] = f'{base} {lab} ({d})'
        else: names[pid] = f'{base} {lab}' if lab else base
    return names


def fold_refill(places):
    """A Refill station (sticker on a shop, café, pharmacy) within 150 m of a place with the same name becomes a fact of
    that place instead of a pin of its own. Returns the places that stay and {folded id: id of the business}."""
    from merge import norm
    grid = defaultdict(list)
    for p in places:
        if p[1] and p[2] != 'trinkwasser': grid[(int(p[3] / 0.002), int(p[4] / 0.0034))].append(p)
    drop, n = {}, 0
    for p in places:
        f = p[6]
        if p[2] != 'trinkwasser' or not p[1] or (f.get('drinking_water') or [''])[0] != 'refill': continue
        a = norm(p[1])
        if len(a) < 4: continue
        gi, gj = int(p[3] / 0.002), int(p[4] / 0.0034)
        best = None
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for q in grid.get((gi + i, gj + j), ()):
                    b = norm(q[1])
                    d = dist(p[3], p[4], q[3], q[4])
                    if d <= 150 and len(b) >= 4 and (a == b or a in b or b in a) and (not best or d < best[0]): best = (d, q)
        if best:
            q = best[1]
            q[6].setdefault('drinking_water', f['drinking_water'])
            if 'trinkwasser' not in q[8]: q[8] = sorted(set(q[8]) | {'trinkwasser'})
            q[7] = sorted(set(q[7]) | set(p[7]))
            drop[p[0]] = q[0]; n += 1
    print(f'{n} Refill stations folded into the business of the same name (within 150 m)')
    return [p for p in places if p[0] not in drop], drop


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
    rows = con.execute('SELECT id, name, category, lat, lon, district FROM places').fetchall()
    rows = [(i, n, c, la, lo, d or umland(new_cat.get(i, c), la, lo, osm_raw[i], n)) for i, n, c, la, lo, d in rows]
    rows = [r for r in rows if r[5]]
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
    # the hvv feed has one record per station; OSM railway stations next to one of the same name are duplicates (often per
    # platform). Only the same name counts: a bus stop 'Rathausmarkt' next to the U-Bahn station Jungfernstieg is no duplicate
    # (before 21 Nov 2026 any stop within 350 m removed the station, so Jungfernstieg, Schlump, Barmbek ... were missing).
    def skey(n):
        n = re.sub(r'\(.*?\)|^(s|u|a|bf\.?)\s+|\b(hamburg|bahnhof|bf\.?)\b', ' ', (n or '').lower()).replace('hbf', 'hauptbahnhof')
        return re.sub(r'[^a-z0-9äöüß]+', ' ', n).strip()
    def near_stop(la, lo, m, name):
        gi, gj = int(la / 0.004), int(lo / 0.007)
        k = skey(name)
        # same station name only ('Bergedorf' vs. the bus stop 'Rathaus Bergedorf' is no duplicate)
        return any(dist(la, lo, a, b) <= m and (not k or k == skey(n))
                   for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b, n in stops.get((gi + i, gj + j), ()))
    n_bf = sum(1 for r in rows if r[2] == 'bahnhof')
    rows = [r for r in rows if not (r[2] == 'bahnhof' and near_stop(r[3], r[4], 350, r[1]))]
    print(f"railway stations: {sum(1 for r in rows if r[2] == 'bahnhof')} of {n_bf} kept (others are the hvv stop of the same name)")
    for r in rows:
        if r[2] in ('bahnhof', 'faehre') and r[1]: stops[(int(r[3] / 0.004), int(r[4] / 0.007))].append((r[3], r[4], r[1]))
    wcs = [(r[3], r[4]) for r in rows if r[2] == 'wc' or facts[r[0]].get('toilets', [None])[0] == 'yes']

    derived = {r[0]: r[1:] for r in con.execute('SELECT place_id, near, basis FROM derived_names')} if con.execute("SELECT 1 FROM sqlite_master WHERE name='derived_names'").fetchone() else {}
    lifts = lift_names(con, dup_of)
    places = []
    for pid, name, cat, lat, lon, district in rows:
        f = facts.get(pid, {})
        if is_bad_name(name): name = None  # stop ids and building numbers are not names
        if pid in lifts: name = lifts[pid]  # 'Aufzug Hauptbahnhof (Gleis 13/14)': the hvv station says more than an OSM label
        if not name and pid in derived: f['near_name'] = [derived[pid][0], sidx['osm'], 'computed', derived[pid][1]]
        if gear.get(pid): f['gear'] = [','.join(sorted(gear[pid])), sidx['osm_geraete'], 'source']
        if cat == 'spielplatz' and wcs:
            d = min(dist(lat, lon, a, b) for a, b in wcs if abs(a - lat) < 0.004 and abs(b - lon) < 0.007) if any(abs(a - lat) < 0.004 and abs(b - lon) < 0.007 for a, b in wcs) else None
            if d is not None and d <= WC_NEAR_M: f['wc_near'] = [str(round(d)), sidx['osm'], 'computed']
        if cat in STOP_CATS and 'hvv_gtfs' in sidx:
            gi, gj = int(lat / 0.004), int(lon / 0.007)
            near = min(((dist(lat, lon, a, b), n) for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b, n in stops.get((gi + i, gj + j), ())), default=None)
            if near and near[0] <= STOP_NEAR_M: f['stop_near'] = [f'{round(near[0])}|{near[1]}', sidx['hvv_gtfs'], 'computed']
        tip = editorial_match(name, district, cat)
        if tip: f['tipp'] = [tip, -1, 'redaktion']
        elif (r := auto_reason(cat, f, name)): f['tipp'] = [r, -1, 'auto']
        # after the tip rules: register counts cover a whole green area, not one playground
        if devices.get(pid) and devices[pid] > int(f.get('device_count', [0])[0] or 0) and 'hh_spielgeraete' in sidx:
            f['device_count'] = [str(devices[pid]), sidx['hh_spielgeraete'], 'computed']
        infer_facts(cat, f)
        tg = place_tags(cat, name, osm_raw[pid], {k: v[0] for k, v in f.items()}, gear.get(pid))
        places.append([pid, name or '', cat, round(lat, 6), round(lon, 6), district, f, sorted(srcs[pid]), tg])
    places, folded = fold_refill(places)
    for k, v in folded.items(): dup_of[k] = v  # offers linked to a folded Refill pin follow it to the business
    out = {'version': 2, 'generated': now(), 'sources': sources, 'places': places}
    path = ROOT / 'data' / 'places.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # small file for the legal page, so it never has to load all places
    (ROOT / 'data' / 'sources.json').write_text(json.dumps({'generated': out['generated'], 'sources': [s[1:] for s in sources]}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    from collections import Counter
    print(f'{len(places)} places, {path.stat().st_size / 1e6:.1f} MB -> {path}')
    print('categories:', dict(Counter(p[2] for p in places).most_common()))
    print('tipps:', Counter(p[6]['tipp'][2] for p in places if 'tipp' in p[6]))
    print('computed facts:', dict(Counter(k for p in places for k, v in p[6].items() if v[2] == 'computed' and k in
                                          ('fee', 'open_always', 'krippe', 'elementar', 'integration', 'hort', 'age_groups'))),
          'baby_swimming:', sum(1 for p in places if p[6].get('baby_swimming', [''])[0] == 'yes'),
          'dog_offleash:', dict(Counter(p[6]['dog_offleash'][0] for p in places if 'dog_offleash' in p[6])),
          'lift names:', sum(1 for p in places if p[0] in lifts))
    print('tags:', dict(Counter(t for p in places for t in p[8]).most_common()))
    export_offers(con, places, sidx, dup_of)


# Columns of data/offers.json. The app reads them by name (loadOffers maps data.cols), new columns are appended at the end.
#   id, title ... provider   as in the offers table (db/offers.py); title without status words such as 'AUSGEBUCHT'
#   registration      normalised: 'nötig' | 'offen' | 'Warteliste' | 'Tickets' | None (unknown). Spelling kept as the app knows it.
#                     Offers marked 'geschlossen' (group closed, no new members) are not exported.
#   free              1 / 0 / None; filled from the price text where the importer left it open
#   age_min_m/max_m   from the title where the importer had none; Krabbel- and baby groups get a conservative default
#   source_id         index into places.json 'sources'
#   audience          'kinder' | 'erwachsene';  district: official Stadtteil (coordinates, else postcode), 'Umland' or None
#   dogs              set by hand (offer_dogs table), else None
#   registration_text the provider's own wording when it says more than the normalised value ('nötig (über den Stadtbereich)')
#   status            None | 'ausgebucht' (booked out, still shown so people can join the waiting list)
#   online            1 for online courses / streams (venue or title says online), else None
#   series            stable key for the same offer across dates and nights: 'se_' + hash(provider, normalised title, venue)
#   tip               1 for Djuu-Redaktion highlights (source 'redaktion'), else None
#   first_seen        'YYYY-MM-DD' the offer id was first exported (state: data/raw/offer_first_seen.json); None = known before
#                     tracking started (21 Nov 2026)
DB_OFFER_COLS = ['id', 'title', 'kind', 'topic', 'age_min_m', 'age_max_m', 'for_parents', 'weekday', 'time_from', 'time_to',
                 'start_date', 'end_date', 'sessions', 'schedule', 'price', 'free', 'registration', 'venue', 'address',
                 'lat', 'lon', 'place_id', 'url', 'provider', 'source_id']
OFFER_COLS = DB_OFFER_COLS + ['audience', 'district', 'dogs', 'registration_text', 'status', 'online', 'series', 'tip', 'first_seen']
FIRST_SEEN = ROOT / 'data' / 'raw' / 'offer_first_seen.json'

# Registration as published -> normalised value; None = drop the offer (group closed)
REG_RULES = [
    (r'geschlossen|keine weiteren (anfragen|anmeldungen)|ausgebucht.*keine warteliste', None),
    (r'warteliste|zurzeit voll|ausgebucht', 'Warteliste'),
    (r'ticket|eintrittskarte|karten', 'Tickets'),
    (r'nicht nötig|ohne anmeldung|offen|einfach vorbeikommen|empfohlen', 'offen'),
    (r'nötig|anmeld|reservierung|probetraining|probestunde|schnupper|mitglied|absprache', 'nötig'),
]
TITLE_CANCELLED = re.compile(r'f[äa]llt\s+aus|entf[äa]llt|abgesagt|storniert|findet nicht statt', re.I)
TITLE_BOOKED = re.compile(r'\s*[-–|:!]*\s*\bausgebucht\b\s*[-–|:!]*\s*', re.I)
# '(geschlossene Gruppe / Warteliste - hat freie Plätze)' and the like: registration info inside the title
TITLE_REG = re.compile(r'\s*\((?=[^)]*(geschlossen|warteliste|freie plätze|anfrage))[^)]*\)?\s*$', re.I)
ONLINE = re.compile(r'(?<![-\w])online(?![-\w]*(anmeld|ticket|buch|reserv))|\bzoom\b|livestream|webinar', re.I)
MONTH_WORDS = r'januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|jun|jul|aug|sep|sept|okt|nov|dez'


def norm_registration(reg, title):
    """(normalised registration, provider text or None, drop?) from the registration field and registration words in the title."""
    raw = (reg or '').strip()
    m = TITLE_REG.search(title or '')
    probe = (raw + ' ' + (m.group(0) if m else '')).lower().strip()
    if not probe: return None, None, False
    if re.search(r'hat freie plätze|freie plätze', probe) and not re.search(r'keine (weiteren|freien)', probe):
        val = 'Warteliste' if 'warteliste' in probe and not raw else None
        val = val or next((v for rx, v in REG_RULES[1:] if re.search(rx, raw.lower())), None) or 'nötig'
        return val, (raw if raw and raw != val else None), False
    for rx, v in REG_RULES:
        if re.search(rx, probe):
            if v is None: return None, raw or None, True
            return v, (raw if raw and raw != v else None), False
    return None, raw or None, False


def clean_title(title):
    """Title without status words and trailing registration notes; returns (title, status, cancelled?)."""
    t = title or ''
    if TITLE_CANCELLED.search(t): return t, None, True
    status = None
    if TITLE_BOOKED.search(t):
        status = 'ausgebucht'
        t = TITLE_BOOKED.sub(' ', t)
    t = TITLE_REG.sub('', t)
    t = re.sub(r'\s{2,}', ' ', t).strip(' -–|:!')
    return t or title, status, False


def free_from_price(price):
    """1 / 0 / None from a price text the importer left open ('auf Spendenbasis', '18 € / 12 € ermäßigt', 'Museumseintritt' ...)."""
    t = (price or '').lower()
    if not t or re.search(r'\d{1,2}[:.]\d{2}\s*(–|-|uhr)', t): return None  # a time slipped into the price field
    if re.search(r'\d+(,\d+)?\s*€|€\s*\d|eur\b|\beintritt\b(?! frei)|museumseintritt|fahrkarte|mitglied|beitrag', t): return 0
    if re.search(r'kostenlos|kostenfrei|eintritt frei|\bfrei\b|spende|keine\.?$|gratis|umsonst', t): return 1
    return None


DEFAULT_AGE = [  # conservative: only titles that clearly name the age group, never a guess from the provider alone
    (re.compile(r'krabbel', re.I), (0, 36)),
    (re.compile(r'babymassage|pekip|säugling|neugeboren|\bbabys?\b|baby-?(treff|gruppe|café|cafe|kurs|zeit)', re.I), (0, 12)),
]


def default_age(title):
    t = title or ''
    if re.search(r'babysitter|schwanger|werdende|geburtsvorbereit', t, re.I): return None, None
    for rx, span in DEFAULT_AGE:
        if rx.search(t): return span
    return None, None


def series_key(provider, title, venue):
    """Same offer across nights and dates: provider + title without dates, times, semester and group letters + venue."""
    import hashlib
    t = (title or '').lower()
    t = re.sub(r'\d{1,2}\.\d{1,2}\.(\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}[:.]\d{2}(\s*uhr)?|\bstart:?.*$', ' ', t)
    t = re.sub(rf'\((?=[^)]*({MONTH_WORDS}|\bws\b|\bss\b|semester|termin))[^)]*\)', ' ', t)
    t = re.sub(r'\b(ws|ss|gr\.?\s*[a-z0-9]|gruppe\s*[a-z0-9])\b', ' ', t)
    t = re.sub(r'[^a-z0-9äöüß]+', ' ', t).strip()
    v = re.sub(r'[^a-z0-9äöüß]+', ' ', (venue or '').lower()).strip()
    return 'se_' + hashlib.sha1(f'{(provider or "").lower().strip()}|{t}|{v}'.encode()).hexdigest()[:10]


def postcode_district(address, stadtteil):
    """Stadtteil from a Hamburg postcode in the address (centre of the postcode area, data/geo.json)."""
    m = re.search(r'\b(2[0-2]\d{3})\b', address or '')
    if not m: return None
    if not hasattr(postcode_district, 'plz'):
        try: postcode_district.plz = {p[0]: p for p in json.loads((ROOT / 'data' / 'geo.json').read_text(encoding='utf-8'))['plz']}
        except Exception: postcode_district.plz = {}
    p = postcode_district.plz.get(m.group(1))
    return (stadtteil(p[1], p[2]) or p[3]) if p else None

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


def drop_cross_source_duplicates(con, out, sidx, pos=None):
    """The same dated event from two sources (venue and organiser, importer and Redaktion) is shown once.

    Same day and start time, similar title, and the same place or venues close together (or similar venue names when
    coordinates are missing). The source with the higher priority wins, then the entry with more facts.
    """
    from difflib import SequenceMatcher
    from merge import similar
    c = {k: i for i, k in enumerate(OFFER_COLS)}
    prio = dict(con.execute('SELECT id, priority FROM sources'))
    prio_by_idx = {i: prio.get(s, 0) for s, i in sidx.items()}

    def norm(t):
        t = re.sub(r'\(.*?\)|kindertheater|theater für kinder|familienvorstellung|für kinder|ab \d+ jahren?', ' ', (t or '').lower())
        return re.sub(r'[^a-z0-9äöüß]+', ' ', t).strip()

    def same_title(a, b):
        a, b = norm(a), norm(b)
        if not a or not b: return False
        if min(len(a), len(b)) >= 8 and (a in b or b in a): return True
        ta, tb = set(a.split()), set(b.split())
        short = min(ta, tb, key=len)
        if len(short) >= 2 and short <= (ta | tb) and ta & tb == short: return True  # 'Laternenumzug Schnelsen' in '... Feuerwehr Schnelsen'
        return SequenceMatcher(None, a, b).ratio() >= 0.75

    def where(x):
        if x[c['lat']]: return x[c['lat']], x[c['lon']]
        return (pos or {}).get(x[c['place_id']])

    def near(x, y):
        if x[c['place_id']] and x[c['place_id']] == y[c['place_id']]: return True
        a, b = where(x), where(y)
        if a and b and a[0] and b[0]: return dist(a[0], a[1], b[0], b[1]) < 400
        if similar(x[c['venue']], y[c['venue']]): return True
        words = lambda v: {w for w in re.findall(r'[a-zäöüß]{6,}', (v or '').lower()) if w not in ('hamburg', 'straße', 'strasse')}
        return bool(words(x[c['venue']]) & words(y[c['venue']]))

    def rank(o):
        filled = sum(1 for k in ('age_min_m', 'price', 'time_to', 'lat', 'registration') if o[c[k]] is not None)
        return (prio_by_idx.get(o[c['source_id']], 0), filled)

    slots = defaultdict(list)
    for o in out:
        if o[c['kind']] == 'termin' and o[c['start_date']]:
            slots[(o[c['start_date']], o[c['time_from']] or '')].append(o)
    drop = set()
    for items in slots.values():
        if len(items) < 2: continue
        items.sort(key=rank, reverse=True)
        for i, keep in enumerate(items):
            if id(keep) in drop: continue
            for other in items[i + 1:]:
                if id(other) in drop or other[c['source_id']] == keep[c['source_id']]: continue
                if same_title(keep[c['title']], other[c['title']]) and near(keep, other):
                    drop.add(id(other))
    if drop:
        print(f'{len(drop)} offers dropped as duplicates of the same event from another source')
    return [o for o in out if id(o) not in drop]


def export_offers(con, places, sidx, dup_of=None):
    """Write data/offers.json: courses, groups and events, each linked to the nearest matching Djuu place."""
    from offers import ensure, topic_of
    from offers_util import age_of
    from merge import similar
    ensure(con)
    today = now()[:10]
    cols = DB_OFFER_COLS  # the rest of OFFER_COLS is added here
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
    try: seen = json.loads(FIRST_SEEN.read_text(encoding='utf-8'))
    except Exception: seen = None
    first_run = seen is None
    seen = seen or {}
    dropped = defaultdict(int)
    stats = defaultdict(int)
    for r in rows:
        o = dict(zip(cols, r))
        if o['id'] in hide: continue
        if (o['age_min_m'] or 0) >= 13 * 12 and not o['for_parents']: continue  # teen groups: outside our target group (0 to about 12)
        o['title'], o['status'], cancelled = clean_title(o['title'])
        if cancelled: dropped['abgesagt'] += 1; continue  # 'Fällt aus', 'Entfällt', 'abgesagt': the date does not take place
        reg, o['registration_text'], closed = norm_registration(o['registration'], r[cols.index('title')])
        if closed: dropped['geschlossen'] += 1; continue  # group closed, no new members
        if reg == 'Warteliste' and o['status'] == 'ausgebucht': o['status'] = None  # the waiting list says it already
        if o['registration'] != reg: stats['registration normalised'] += 1
        o['registration'] = reg
        if o['free'] is None and o['price'] and (fr := free_from_price(o['price'])) is not None:
            o['free'] = fr; stats['free from price'] += 1
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
            if o['age_min_m'] is None and o['age_max_m'] is None:
                o['age_min_m'], o['age_max_m'] = default_age(o['title'])
                if o['age_min_m'] is not None: stats['default age'] += 1
        if o['topic'] in (None, 'sonstiges'): o['topic'] = topic_of(o['title'])
        o['audience'] = audience(o)
        o['online'] = 1 if ONLINE.search(o['title'] or '') or ONLINE.search(o['venue'] or '') else None
        # Stadtteil by coordinates (point in polygon): the linked place's position, else the offer's own, else the postcode
        la, lo = pos.get(o['place_id'], (o['lat'], o['lon']))
        o['district'] = (stadtteil(la, lo) or (UMLAND if dist(la, lo, *RATHAUS) <= 100000 else None)) if la and lo else None
        if not o['district'] and not (la and lo) and not o['online']:
            o['district'] = postcode_district(o['address'], stadtteil)
            if o['district']: stats['district from postcode'] += 1
        o['series'] = series_key(o['provider'], o['title'], o['venue'])
        o['tip'] = 1 if o['source_id'] == 'redaktion' else None
        if o['id'] not in seen: seen[o['id']] = '' if first_run else today  # '' = known before tracking started
        o['first_seen'] = seen[o['id']] or None
        o['source_id'] = sidx.get(o['source_id'], -1)
        o['dogs'] = dogs.get(o['id'])
        out.append([o[c] for c in OFFER_COLS])
    # first-seen state: keep ids for two years, so a course that comes back next term is not 'new'
    cutoff = f'{int(today[:4]) - 2}{today[4:]}'
    seen = {k: v for k, v in seen.items() if not v or v >= cutoff}
    FIRST_SEEN.parent.mkdir(parents=True, exist_ok=True)
    FIRST_SEEN.write_text(json.dumps(seen, separators=(',', ':')), encoding='utf-8')
    print('offers dropped:', dict(dropped), '| changed:', dict(stats))
    out = drop_cross_source_duplicates(con, out, sidx, pos)
    path = ROOT / 'data' / 'offers.json'
    path.write_text(json.dumps({'version': 1, 'generated': now(), 'cols': OFFER_COLS, 'offers': out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    linked = sum(1 for o in out if o[OFFER_COLS.index('place_id')])
    print(f'{len(out)} offers ({linked} linked to places) -> {path}')
    from collections import Counter
    print('district:', sum(1 for o in out if o[OFFER_COLS.index('district')]), 'of', len(out), 'offers have a Stadtteil')
    print('audience:', Counter(o[OFFER_COLS.index('audience')] for o in out), 'topics:', dict(Counter(o[OFFER_COLS.index('topic')] for o in out).most_common()))
    ix = lambda k: OFFER_COLS.index(k)
    print(f"sonstiges: {sum(1 for o in out if o[ix('topic')] == 'sonstiges') / max(1, len(out)):.1%}",
          '| registration:', dict(Counter(o[ix('registration')] for o in out)), '| status:', dict(Counter(o[ix('status')] for o in out if o[ix('status')])),
          '| online:', sum(1 for o in out if o[ix('online')]), '| tip:', sum(1 for o in out if o[ix('tip')]),
          '| series:', len({o[ix('series')] for o in out}), '| new today:', sum(1 for o in out if o[ix('first_seen')] == today),
          '| free known:', sum(1 for o in out if o[ix('free')] is not None), '| age known:', sum(1 for o in out if o[ix('age_min_m')] is not None or o[ix('age_max_m')] is not None))


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
