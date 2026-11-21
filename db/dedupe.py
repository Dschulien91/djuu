"""Duplicate pins: find places that show the same real place twice and flag them reversibly (db/flags.py, status 'duplikat').

Run after merge.py (place ids are stable, so the result survives later merges):  python dedupe.py [--dry]
Output
  place_flags   batch 'dup-2026-11-21' (replaced on every run); the duplicate hands its facts, sources and offers to the
                place that stays (export.py)
  data/cleaning/dubletten.csv   every pair of this batch; export.py reads this file too, so the server's nightly export
                applies it without a database upload
Hand decisions: data/cleaning/dubletten_entscheidungen.csv (id;behalten;entscheidung;notiz) with 'dublette' (merge, the
second id stays), 'kopie' (the first id is a wrong copy of the second: hidden, hands over nothing) or 'getrennt' (never
merge these two, whatever a rule says). Undo one pair: add a 'getrennt' line, run again.

Rules (all need a compatible category; a wrong merge is worse than a duplicate, so every rule is narrow, and two places with
different names never end up in one group through a third one, see resolve()):
  ekiz        an Eltern-Kind-Zentrum record of the city register (hh_ekiz, named after its host Kita) next to the
              EKiZ pin (40 m) or next to its host Kita of the same name (80 m)
  same_name   identical name, at most 15 m apart
  bolzplatz   two pitches of one Ballspielfeld (same name, 50 m)
  park        sections of one park (same name, 200 m, chained: a long Grünzug becomes one pin)
  area_name   playgrounds / dog runs named after their green area by the register (Emil-Wendt-Park, Parkanlage
              Grindelberg): pins of the same name up to 150 m apart are one place for a family (equipment is combined)
  unnamed     nameless pins of the same kind on top of each other (toilet blocks, table tennis tables, pitches, playground
              parts ...) or on top of a named pin of the same kind; distances per category in UNNAMED_M
  inside      an OSM playground point inside an OSM playground area (one playground mapped twice)
  shop_in_fuel  a 'REWE To Go' shop inside its Aral station (40 m)
  overture    a pin that only Overture knows, with the same name as an OSM place up to 150 m away and no other house
              number; only names that exist at most twice in Hamburg
  kopie       the same Overture pin 150-600 m away (or with another house number) when phone or website domain are the
              same as the OSM place's: an old address of the same business. It is hidden and hands over nothing (export.py)
  kita_copy   a Kita that only OSM/Overture know, next to a Kita of the city's Kita register with a shared name word
              (name_link) or the same phone number within 60 m: the same Kita
  kita_kopie  such a Kita under another name within 30 m (no other house number) or at the same address within 60 m: an old
              name or a wrong pin. Hidden, it hands over nothing (export.py)
  muetterberatung  a 'Mütterberatung – <host>' pin of the city register within 40 m of its host: the EKiZ pin or the Kita
              hosting that EKiZ, or a family house whose name shares a word with <host>. Hands over nothing but its offers
  unnamed_near  nameless playgrounds with the same derived name (street or park, db/derive_names.py) within 50 m
  hand        data/cleaning/dubletten_entscheidungen.csv
Different house numbers (both known) stop every rule except ekiz, muetterberatung, kita_copy within 30 m, inside,
shop_in_fuel and hand. A group never spans more than CAP metres for the rules that join it (no chains without a cap).
"""
import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict

from common import RAW_DIR, ROOT, connect
from flags import ensure, flag_place
from strict_match import fold, tokens

BATCH = 'dup-2026-11-21'
CSV_OUT = ROOT / 'data' / 'cleaning' / 'dubletten.csv'
DECISIONS = ROOT / 'data' / 'cleaning' / 'dubletten_entscheidungen.csv'

SYN = [{'cafe', 'restaurant', 'imbiss', 'eis', 'familienfreundlich'}, {'museum', 'ausflug', 'kultur'}, {'wc', 'wickel'},
       {'windeln', 'laden'}, {'sportstaette', 'sportverein', 'freizeit'}, {'treffpunkt', 'kultur', 'beratung', 'spielhaus', 'kurs', 'jugend'},
       {'musikschule', 'tanzschule', 'kreativschule', 'sprachschule', 'kultur'}, {'kinderarzt', 'klinik'}, {'hebamme', 'geburtshaus'},
       {'physio', 'therapie'}, {'spielplatz', 'indoor', 'spielhaus', 'abenteuer'}, {'ausflug', 'tierhof', 'reiten'},
       {'park', 'garten', 'naturschutz'}, {'kita', 'kurs'}]
NEVER = {'aufzug', 'haltestelle', 'bahnhof', 'faehre'}  # every lift has its own status; stops are one per direction/platform
# nameless pins of one kind closer than this (m) are one place; second value: a nameless pin next to a named one
UNNAMED_M = {'wc': (10, 10), 'trinkwasser': (10, 10), 'tischtennis': (15, 15), 'picknick': (15, 15), 'grillplatz': (15, 15),
             'spielplatz': (20, 20), 'bolzplatz': (20, 25), 'sportstaette': (15, 15), 'freizeit': (15, 15), 'kita': (5, 25),
             'park': (20, 25), 'hundeauslauf': (20, 25), 'windeln': (3, 10), 'brunnen': (10, 10)}
REGISTERS = ('hh_', 'baederland')
OVERTURE = {'overture', 'overture_fsq', 'overture_atp'}
# registers that name a playground or dog run after its green area: two pins with that name are parts of one area
AREA_NAMES = {'hh_gruenplan', 'hh_hundeauslauf_p8', 'hh_hundeauslauf_p9'}
LEGAL = re.compile(r'\b(e\s?v|gmbh|ggmbh|mbh|gbr|ug|kg|ohg|ag|hamburg)\b')
# largest distance (m) between any two pins of one group joined by a rule; hand decisions have no cap
CAP = {'same_name': 30, 'bolzplatz': 60, 'park': 400, 'area_name': 150, 'unnamed': 30, 'unnamed_near': 60, 'inside': 250,
       'shop_in_fuel': 50, 'overture': 150, 'kopie': 650, 'kita_copy': 80, 'kita_kopie': 80, 'ekiz': 120, 'muetterberatung': 60}
OSMLIKE = {'osm', 'website', 'wikidata', 'mangrove', 'overture', 'overture_fsq', 'overture_atp'}


def compat(a, b):
    return a == b or any(a in g and b in g for g in SYN)


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    return 6371000 * math.hypot((lo2 - lo1) * k * math.cos((la1 + la2) * k / 2), (la2 - la1) * k)


def generic_fits(a, b):
    """'Lolas' / 'Lolas Bistro' yes, 'Blankeneser Café' / 'Blankeneser Imbiss' no: the generic words of one name are part of the other."""
    ga, gb = set(fold(a).split()) - tokens(a), set(fold(b).split()) - tokens(b)
    return ga <= gb or gb <= ga


def key(name):
    return re.sub(r'\s+', ' ', LEGAL.sub(' ', fold(name))).strip()


# words that say nothing about which Kita it is
KITA_GENERIC = {'ev', 'evangelische', 'evangelisches', 'evangelischer', 'kath', 'katholische', 'katholischer', 'luth',
                'kindertagesstaetten', 'kindertagesheim', 'kindertageseinrichtung', 'kinderhaus', 'kinderkrippe', 'kiga', 'kitas',
                'kirchengemeinde', 'gemeinde', 'elementar', 'elementarbereich', 'integrations', 'bilingualer', 'bilinguale', 'kinder', 'eltern'}


def name_link(a, b):
    """Two names share a telling word ('Kindertagesstätte der Luthergemeinde' / 'Kita der Ev. Luther-Kirchengemeinde')."""
    ta, tb = tokens(a) - KITA_GENERIC, tokens(b) - KITA_GENERIC
    return any(t == u or (min(len(t), len(u)) >= 5 and (t.startswith(u) or u.startswith(t))) for t in ta for u in tb)


def hn_parts(h):
    m = re.match(r'(\d+)\s*([a-z]?)(?:\s*[-–/]\s*(\d+)\s*([a-z]?))?', (h or '').lower().strip())
    if not m: return None
    a = int(m.group(1))
    return a, int(m.group(3)) if m.group(3) else a, m.group(2)


def street(p):
    return fold(p['f'].get('street') or '').replace('strasse', 'str').replace(' str', 'str').replace(' ', '')


def hn_conflict(p, q):
    """Both pins have a house number and they do not fit: another street, numbers that do not overlap ('40' / '29';
    '22' fits '22-24'), or another letter ('4a' / '4b')."""
    a, b = hn_parts(p['f'].get('housenumber')), hn_parts(q['f'].get('housenumber'))
    if not a or not b: return False
    if street(p) and street(q) and street(p) != street(q): return True
    if a[1] < b[0] or b[1] < a[0]: return True
    return bool(a[0] == a[1] == b[0] == b[1] and a[2] and b[2] and a[2] != b[2])


def same_contact(p, q):
    """Same phone number or same website domain."""
    ph = lambda x: re.sub(r'^(49|0)', '', re.sub(r'\D', '', x or ''))  # '+49 40 390 20 80' / '390 20 80' (register: no area code)
    def dom(x):
        m = re.match(r'(?:https?://)?([^/?#\s]+)', (x or '').lower().strip())
        return re.sub(r'^www\.', '', m.group(1)) if m else ''
    a, b = ph(p['f'].get('phone')), ph(q['f'].get('phone'))
    if min(len(a), len(b)) >= 6 and (a.endswith(b) or b.endswith(a)): return True
    return bool(dom(p['f'].get('website'))) and dom(p['f'].get('website')) == dom(q['f'].get('website'))


def load(con):
    ensure(con)
    flags = {r[0]: r[1:] for r in con.execute('SELECT place_id, status, duplicate_of, batch FROM place_flags')}
    places = {}
    for pid, name, cat, la, lo, d in con.execute('SELECT id, name, category, lat, lon, district FROM places'):
        st = flags.get(pid)
        if st and st[0] != 'kategorie' and st[2] != BATCH: continue  # already out of the app (an older decision)
        if st and st[0] == 'kategorie' and st[1]: cat = st[1]
        places[pid] = {'id': pid, 'name': (name or '').strip(), 'cat': cat, 'lat': la, 'lon': lo, 'district': d, 'src': set(), 'osm': [], 'f': {}}
    for pid, src, ref in con.execute('SELECT place_id, source_id, source_ref FROM source_records WHERE place_id IS NOT NULL'):
        if pid in places:
            places[pid]['src'].add(src)
            if src == 'osm': places[pid]['osm'].append(ref)
    for pid, k, v in con.execute("SELECT place_id, key, value FROM place_facts WHERE key IN ('street','housenumber','phone','website','shop_type','address')"):
        if pid in places: places[pid]['f'][k] = v
    for p in places.values():  # 'Telemannstraße 40, 20255 Hamburg': street and number from the address when no separate facts
        f = p['f']
        m = re.match(r'\s*([^,\d]+?)\s+(\d+\s*[a-zA-Z]?(?:\s*[-–/]\s*\d+\s*[a-zA-Z]?)?)\b', f.get('address') or '')
        if m and not f.get('street') and not f.get('housenumber'): f['street'], f['housenumber'] = m.group(1), m.group(2)
    osm_tag = {}
    for pid, raw in con.execute("SELECT place_id, raw FROM source_records WHERE source_id='osm' AND place_id IS NOT NULL AND raw IS NOT NULL"):
        if pid in places and pid not in osm_tag:
            t = json.loads(raw)
            osm_tag[pid] = next((f'{k}={t[k]}' for k in ('shop', 'amenity', 'leisure', 'tourism') if t.get(k)), None)
    for pid, p in places.items(): p['tag'] = osm_tag.get(pid)
    if con.execute("SELECT 1 FROM sqlite_master WHERE name='derived_names'").fetchone():
        for pid, near_name in con.execute('SELECT place_id, near FROM derived_names'):
            if pid in places: places[pid]['near'] = near_name
    return places


def score(p):
    """The place that stays: register data first, then more sources, a name, more facts."""
    return (any(s.startswith(REGISTERS) for s in p['src']), len(p['src'] - {'website'}), bool(p['name']), len(p['f']), p['id'])


def polygons(places, wanted):
    """OSM areas (way/relation) of the given refs as shapely shapes, read from the local extract."""
    import osmium
    from shapely import wkb
    fab, out = osmium.geom.WKBFactory(), {}
    pbf = RAW_DIR / 'hamburg-latest.osm.pbf'
    if not pbf.exists(): return out
    for o in osmium.FileProcessor(str(pbf)).with_areas():
        if o.is_area():
            k = ('way/' if o.from_way() else 'relation/') + str(o.orig_id())
            if k in wanted:
                try: out[k] = wkb.loads(fab.create_multipolygon(o), hex=True)
                except Exception: pass
    return out


def find_pairs(places):
    """[(dup_id, other_id, rule, forced)]: forced = the other place must stay, else the better one (score()) stays."""
    P = list(places.values())
    grid = defaultdict(list)
    for p in P: grid[(int(p['lat'] / 0.004), int(p['lon'] / 0.0066))].append(p)

    def near(p, m):
        gi, gj = int(p['lat'] / 0.004), int(p['lon'] / 0.0066)
        r = 1 if m <= 250 else 2
        for i in range(-r, r + 1):
            for j in range(-r, r + 1):
                for q in grid.get((gi + i, gj + j), ()):
                    if q is not p and (d := dist(p['lat'], p['lon'], q['lat'], q['lon'])) <= m: yield q, d

    out, ekiz_host = [], set()
    tok_count = Counter(tokens(p['name']) for p in P if p['name'])
    for p in P:
        # ekiz: the register names the host Kita; the record belongs to the EKiZ pin next to it, else to that Kita
        if p['src'] == {'hh_ekiz'}:
            cands = sorted(near(p, 80), key=lambda x: x[1])
            mine = tokens(p['name'])
            # the EKiZ pin: named so, from OSM, any family category (the database keeps OSM's category, export.py refines it)
            ekiz = next((q for q, d in sorted(cands, key=lambda x: (x[0]['cat'] == 'kita', x[1])) if d <= 40 and 'osm' in q['src']
                         and q['cat'] in ('kurs', 'treffpunkt', 'beratung', 'spielhaus', 'kita') and re.search(r'eltern-kind-zentrum|\bekiz\b', q['name'], re.I) and not re.search(r'mütterberatung', q['name'], re.I)), None)
            kita = next((q for q, d in cands if q['cat'] == 'kita' and mine and (tokens(q['name']) & mine or name_link(p['name'], q['name']))), None)
            if ekiz or kita: out.append((p['id'], (ekiz or kita)['id'], 'ekiz', True)); ekiz_host.add((ekiz or kita)['id'])
        if p['cat'] == 'windeln' and re.fullmatch(r'rewe to go', p['name'], re.I):
            q = next((q for q, d in sorted(near(p, 40), key=lambda x: x[1]) if q['cat'] == 'windeln' and re.fullmatch(r'aral', q['name'], re.I)), None)
            if q: out.append((p['id'], q['id'], 'shop_in_fuel', True))
        # kita_copy: a Kita only OSM/Overture know, next to a Kita of the register (the register lists every Kita in Hamburg)
        if p['cat'] == 'kita' and p['src'] and p['src'] <= OSMLIKE and p['src'] & ({'osm'} | OVERTURE):
            regs = sorted(((q, d) for q, d in near(p, 60) if q['cat'] == 'kita' and 'hh_kitas' in q['src']), key=lambda x: x[1])
            q = next((q for q, d in regs if name_link(p['name'], q['name']) or same_contact(p, q)), None)
            if q: out.append((p['id'], q['id'], 'kita_copy', True))  # the same Kita (a name word or the phone): it hands over its facts
            else:  # another name at the register Kita's door: an old name or a wrong pin; hidden, it hands over nothing
                q = next((q for q, d in regs if d <= 30 and not hn_conflict(p, q)), None) \
                    or next((q for q, d in regs if street(p) and street(p) == street(q) and p['f'].get('housenumber') and not hn_conflict(p, q)), None)
                if q: out.append((p['id'], q['id'], 'kita_kopie', True))
        if p['cat'] in NEVER or p['src'] == {'hh_ekiz'}: continue  # EKiZ register records only follow the ekiz rule
        kp = key(p['name'])
        for q, d in near(p, 600):
            if q['cat'] in NEVER or q['src'] == {'hh_ekiz'} or not compat(p['cat'], q['cat']): continue
            kq = key(q['name'])
            if kp and kq:
                if p['src'] & OVERTURE and p['src'] <= OVERTURE | {'website'} and 'osm' in q['src'] and tok_count[tokens(p['name'])] <= 2 \
                        and (kp == kq or tokens(p['name']) == tokens(q['name']) != frozenset() and generic_fits(p['name'], q['name'])):
                    if d <= 150 and not hn_conflict(p, q): out.append((p['id'], q['id'], 'overture', True))
                    elif same_contact(p, q): out.append((p['id'], q['id'], 'kopie', True))  # an old address of the same business
                elif kp != kq or q['id'] < p['id']: continue  # symmetric rules below: each pair once
                elif hn_conflict(p, q): continue  # 'Spielplatz Telemannstraße' 40 and 29 are two playgrounds
                elif d <= 15: out.append((p['id'], q['id'], 'same_name', False))
                elif p['cat'] == q['cat'] == 'bolzplatz' and d <= 50: out.append((p['id'], q['id'], 'bolzplatz', False))
                elif {p['cat'], q['cat']} <= {'park', 'garten', 'naturschutz'} and d <= 200: out.append((p['id'], q['id'], 'park', False))
                elif p['cat'] == q['cat'] in ('spielplatz', 'hundeauslauf') and d <= 150 and p['src'] & AREA_NAMES and q['src'] & AREA_NAMES:
                    out.append((p['id'], q['id'], 'area_name', False))
            elif not kp and not kq and p['cat'] == q['cat'] == 'spielplatz' and d <= 50 and q['id'] > p['id'] and p.get('near') \
                    and p.get('near') == q.get('near') and (p['tag'] == q['tag'] or not p['tag'] or not q['tag']):
                out.append((p['id'], q['id'], 'unnamed_near', False))  # 'Spielplatz Gropiusring' twice on the same street
            elif p['cat'] == q['cat'] and p['cat'] in UNNAMED_M and d <= 25:
                both, one = UNNAMED_M[p['cat']]
                if not kp and not kq:
                    if q['id'] > p['id'] and d <= both and (p['tag'] == q['tag'] or not p['tag'] or not q['tag']):
                        out.append((p['id'], q['id'], 'unnamed', False))
                elif not kp and d <= one and (p['cat'] != 'windeln' or (p['tag'] and p['tag'] == q['tag'])):
                    out.append((p['id'], q['id'], 'unnamed', True))  # the named pin stays
    # Mütterberatung pins of the register next to the house that hosts them ('Mütterberatung – EKIZ Hamm' in Kita Osterbrook)
    for p in P:
        m = re.match(r'mütterberatung\b\s*[–-]?\s*(?:.*?c/o\s*)?(.*)$', p['name'], re.I)
        if not m or 'hh_muetterberatung' not in p['src'] or p['src'] - {'hh_muetterberatung', 'osm', 'website'}: continue
        host = m.group(1)
        cands = sorted(((q, d) for q, d in near(p, 40) if q['cat'] in ('kurs', 'treffpunkt', 'beratung', 'spielhaus', 'kita', 'jugend', 'kultur')
                        and not re.search(r'mütterberatung', q['name'], re.I)), key=lambda x: x[1])
        q = None
        if re.search(r'eltern-kind-zentrum|\bekiz\b', host, re.I):
            q = next((q for q, d in cands if re.search(r'eltern-kind-zentrum|\bekiz\b', q['name'], re.I)), None) \
                or next((q for q, d in cands if q['id'] in ekiz_host), None) \
                or next((q for q, d in cands if q['src'] == {'hh_ekiz'}), None)  # an EKiZ record that stands alone
        kifaz = lambda n: re.sub(r'kinder-?\s*und\s+familienzentrum', 'kifaz', n, flags=re.I)  # the usual short name
        ht = tokens(kifaz(host)) - {'ekiz', 'eltern', 'kind', 'zentrum', 'muetterberatung'}
        q = q or next((q for q, d in cands if ht - {'kifaz'} and tokens(kifaz(q['name'])) & (ht - {'kifaz'})), None) \
            or next((q for q, d in cands if 'kifaz' in ht and 'kifaz' in tokens(kifaz(q['name'])) and d <= 15), None)  # 'KiFaz Neuallermöhe'
        if q: out.append((p['id'], q['id'], 'muetterberatung', True))
    # playground points inside playground areas
    pts = [p for p in P if p['cat'] == 'spielplatz' and p['osm'] and all(r.startswith('node/') for r in p['osm'])]
    areas = {p['id']: p for p in P if p['cat'] == 'spielplatz' and any(not r.startswith('node/') for r in p['osm'])}
    wanted = {r for a in areas.values() for r in a['osm'] if not r.startswith('node/')}
    shapes = polygons(places, wanted) if pts and wanted else {}
    if shapes:
        from shapely.geometry import Point
        for p in pts:
            for q, d in sorted(near(p, 250), key=lambda x: x[1]):
                if q['id'] in areas and any(r in shapes and shapes[r].buffer(0.00004).contains(Point(p['lon'], p['lat'])) for r in q['osm']):
                    out.append((p['id'], q['id'], 'inside', True)); break
    return out


def resolve(places, pairs, decisions):
    """Clusters of places that are one real place; one stays per cluster. 'getrennt' pairs never end up in one cluster."""
    apart = {frozenset((a, b)) for a, b, dec, _ in decisions if dec == 'getrennt'}
    # hand decisions: 'dublette' (merge, the second id stays) or 'kopie' (hide the first id, it hands over nothing: an
    # Overture copy kilometres off the real place)
    edges = [(a, b, 'hand' if dec == 'dublette' else 'kopie', True, True) for a, b, dec, _ in decisions
             if dec in ('dublette', 'kopie') and a in places and b in places]
    # closest pairs first: with the caps below, a group grows from its tightest pair (a nameless pin joins the named
    # playground 20 m away before a second nameless pin 45 m away is tried)
    gap = lambda e: dist(places[e[0]]['lat'], places[e[0]]['lon'], places[e[1]]['lat'], places[e[1]]['lon'])
    edges += [e + (False,) for e in sorted(pairs, key=gap)]
    members = {pid: {pid} for pid in places}
    parent, rule_of, forced = {}, {}, {}

    def root(x):
        while x in parent: x = parent[x]
        return x
    names = lambda r: {key(places[m]['name']) for m in members[r]} - {''}
    span = lambda ra, rb: max(dist(places[x]['lat'], places[x]['lon'], places[y]['lat'], places[y]['lon']) for x in members[ra] for y in members[rb])
    for a, b, rule, must, byhand in edges:
        ra, rb = root(a), root(b)
        if ra == rb: continue
        if any(frozenset((x, y)) in apart for x in members[ra] for y in members[rb]): continue
        if not byhand and span(ra, rb) > CAP.get(rule, 100): continue  # no chains without a distance cap
        if not byhand:
            # never chain two differently named places into one: a symmetric rule joins equal names (or nameless pins),
            # a rule with a keeper moves one place (and nameless pins already joined to it) to that keeper, once
            if not must and len(names(ra) | names(rb)) > 1: continue
            if must and (a in forced or len(names(ra) - {key(places[a]['name'])}) > 0): continue
        parent[ra] = rb
        members[rb] |= members.pop(ra)
        rule_of.setdefault(a, rule)
        if not must: rule_of.setdefault(b, rule)  # a keeper's rule is not its own (a Kita keeping a Mütterberatung pin)
        if must: forced.setdefault(a, b)
    out = []
    for ms in members.values():
        if len(ms) < 2: continue
        keeps = [k for d, k in forced.items() if d in ms and k in ms and k not in forced]
        keep = keeps[0] if keeps else max((places[m] for m in ms), key=score)['id']
        for m in ms:
            if m != keep: out.append((m, keep, rule_of.get(m, 'cluster')))
    return out


def run(dry=False):
    con = connect()
    places = load(con)
    decisions = []
    if DECISIONS.exists():
        with open(DECISIONS, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f, delimiter=';'):
                decisions.append((row['id'].strip(), row['behalten'].strip(), row['entscheidung'].strip(), row.get('notiz') or ''))
    pairs = find_pairs(places)
    final = resolve(places, pairs, decisions)
    print('pairs by rule:', dict(Counter(r for _, _, r, _ in pairs)), '| flagged:', len(final), dict(Counter(r for *_, r in final)))
    if dry: return final, places
    con.execute('DELETE FROM place_flags WHERE batch=?', (BATCH,))
    note = {'ekiz': 'EKiZ-Eintrag des Registers am selben Ort', 'same_name': 'Gleicher Name, gleicher Ort', 'bolzplatz': 'Teil desselben Ballspielfelds',
            'park': 'Teil derselben Grünanlage', 'area_name': 'Teil desselben Spielplatzes/Auslaufs (Name der Grünanlage)', 'unnamed': 'Namenloser Pin auf demselben Ort', 'inside': 'Spielplatzpunkt in derselben Spielplatzfläche',
            'shop_in_fuel': 'Shop in derselben Tankstelle', 'overture': 'Kopie aus Overture, gleicher Name', 'hand': 'Von Hand geprüft',
            'kopie': 'Veraltete Overture-Adresse desselben Betriebs', 'kita_copy': 'OSM-Kopie einer Kita des Kita-Registers',
            'kita_kopie': 'Anderer Name an der Adresse einer Register-Kita (alter Name oder falscher Pin)',
            'muetterberatung': 'Mütterberatung im selben Haus', 'unnamed_near': 'Namenloser Spielplatz, gleicher Name, gleiche Straße'}
    n_db = 0
    for dup, keep, rule in final:
        n_db += flag_place(con, dup, 'duplikat', note.get(rule, 'Dublette'), 'review' if rule == 'hand' else 'rule', BATCH, duplicate_of=keep)
    con.commit()
    with open(CSV_OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['id', 'behalten', 'regel', 'name', 'name_behalten', 'kategorie', 'kategorie_behalten', 'abstand_m', 'stadtteil'])
        for dup, keep, rule in sorted(final, key=lambda x: (x[2], places[x[0]]['cat'], places[x[0]]['name'])):
            p, q = places[dup], places[keep]
            w.writerow([dup, keep, rule, p['name'], q['name'], p['cat'], q['cat'], round(dist(p['lat'], p['lon'], q['lat'], q['lon'])), p['district'] or ''])
    print(f'{n_db} flags written to the database ({len(final) - n_db} places already had another flag), list: {CSV_OUT}')
    return final, places


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    run('--dry' in sys.argv)
