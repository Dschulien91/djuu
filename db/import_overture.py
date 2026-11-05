"""Import family-relevant places in Hamburg from the Overture Maps 'places' theme.

Run: python import_overture.py            download (if needed) and import
     python import_overture.py --dry-run  classify, filter and estimate merging; writes nothing to the database

Schema: since release 2026-09 `taxonomy` and `basic_category` replace `categories`. Overture has no opening hours.
Licence is decided per record from its own `sources` entry and kept in separate Djuu sources:
    overture      CDLA-Permissive-2.0 (Meta, Microsoft, BrightQuery, Uberall, ...)
    overture_fsq  Apache-2.0 (Foursquare; notices in data/licenses/overture/)
    overture_atp  CC0-1.0 (AllThePlaces)
Priority is below every other source: Overture only fills gaps and never overrides OSM or official data.
Merging uses the conservative rules in strict_match.py, not merge.py's default.
"""
import argparse
import json
import re
import sqlite3
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import duckdb
import requests

from common import DB_PATH, MIN_DELAY, RAW_DIR, USER_AGENT, allowed, connect, register_source, replace_records
from merge import Grid, compatible, dist, load_districts
from strict_match import ENRICH_ONLY, attach_contacts, chain_token_sets, contact_index, domain_key, find_match, phone_key

RELEASE = '2026-10-21.0'
BBOX = (9.72, 10.33, 53.39, 53.75)  # lon min, lon max, lat min, lat max
S3_GLOB = f's3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*.parquet'
RAW_FILE = RAW_DIR / f'overture_places_hamburg_{RELEASE}.parquet'
SITE_CACHE = RAW_DIR / f'overture_site_check_{RELEASE}.json'
SITE_TIMEOUT = 15
HEADERS = {'User-Agent': USER_AGENT}
HOST_LOCKS = defaultdict(threading.Lock)
HOST_LAST = defaultdict(float)
LICENSE_SOURCE = {'CDLA-Permissive-2.0': 'overture', 'Apache-2.0': 'overture_fsq', 'CC0-1.0': 'overture_atp'}

# taxonomy.primary -> Djuu category. Anything not listed (or matched by food_category / NAME_GATED) is ignored.
PRIMARY = {
    'cafe': 'cafe', 'coffee_shop': 'cafe', 'tea_room': 'cafe', 'pancake_house': 'cafe', 'dog_cafe': 'cafe', 'dessert_shop': 'cafe',
    'ice_cream_shop': 'eis', 'gelato_shop': 'eis', 'frozen_yogurt_shop': 'eis',
    'fast_food_restaurant': 'imbiss', 'doner_kebab_restaurant': 'imbiss', 'falafel_restaurant': 'imbiss', 'food_truck_stand': 'imbiss',
    'sandwich_shop': 'imbiss', 'burger_restaurant': 'imbiss', 'chicken_restaurant': 'imbiss', 'hot_dog_restaurant': 'imbiss',
    'fish_and_chips_restaurant': 'imbiss', 'salad_bar': 'imbiss', 'bubble_tea_shop': 'imbiss', 'smoothie_juice_bar': 'imbiss',
    'restaurant': 'restaurant', 'bistro': 'restaurant', 'diner': 'restaurant', 'steakhouse': 'restaurant',
    'playground': 'spielplatz', 'indoor_playcenter': 'indoor', 'rock_climbing_gym': 'indoor',
    'museum': 'museum', 'planetarium': 'ausflug', 'zoo': 'ausflug', 'aquarium': 'ausflug', 'petting_zoo': 'tierhof',
    'theatre_venue': 'kultur', 'movie_theater': 'kultur', 'library': 'buecherei', 'park': 'park',
    'swimming_pool': 'baden', 'water_park': 'baden', 'public_bath_house': 'baden', 'beach': 'baden',
    'miniature_golf_course': 'freizeit', 'bowling_alley': 'freizeit', 'ice_skating_rink': 'freizeit', 'roller_skating_rink': 'freizeit',
    'skating_rink': 'freizeit', 'skate_park': 'freizeit', 'laser_tag': 'freizeit',
    'botanical_garden': 'garten', 'community_garden': 'garten', 'nature_reserve': 'naturschutz', 'soccer_field': 'bolzplatz',
    'pediatric_clinic': 'kinderarzt', 'pediatric_cardiology': 'kinderarzt', 'pediatric_gastroenterology': 'kinderarzt',
    'pediatric_oncology': 'kinderarzt', 'childrens_hospital': 'klinik', 'hospital': 'klinik', 'general_hospital': 'klinik',
    'child_psychiatry': 'therapie', 'occupational_therapy': 'therapie', 'speech_therapy': 'therapie', 'physical_therapy': 'physio',
    'dental_clinic': 'zahnarzt', 'general_dentistry': 'zahnarzt', 'orthodontics': 'zahnarzt', 'pediatric_dentistry': 'zahnarzt',
    'obstetrics_and_gynecology': 'frauenarzt', 'reproductive_perinatal_and_womens_care': 'frauenarzt', 'midwifery': 'hebamme',
    'pharmacy': 'apotheke', 'drugstore': 'windeln',
    'toy_store': 'laden', 'childrens_clothing_store': 'laden', 'baby_gear_and_nursery_store': 'laden', 'maternity_wear': 'laden',
    'elementary_school': 'schule', 'middle_school': 'schule', 'high_school': 'schule', 'public_school': 'schule', 'private_school': 'schule', 'school': 'schule',
    'child_care_and_day_care': 'kita', 'day_care_preschool': 'kita', 'preschool': 'kita',
    'community_center': 'treffpunkt', 'after_school_program': 'treffpunkt',
    'music_school': 'musikschule', 'dance_studio': 'tanzschule', 'language_school': 'sprachschule', 'art_school': 'kreativschule',
    'equestrian_facility': 'reiten', 'horse_riding': 'reiten', 'horseback_riding_service': 'reiten',
    'gymnastics_center': 'sportstaette', 'gymnastics_club': 'sportstaette', 'martial_arts_club': 'sportstaette', 'karate_club': 'sportstaette',
    'taekwondo_club': 'sportstaette', 'soccer_club': 'sportstaette', 'football_club': 'sportstaette', 'hockey_club': 'sportstaette',
    'volleyball_club': 'sportstaette', 'table_tennis_club': 'sportstaette', 'swimming_instructor': 'sportstaette',
}
NOT_FOOD = {'bar_and_grill_restaurant'}

# Broad, badly filled taxonomy classes count only if the name says what the place is: (primary set, name regex, category).
NAME_GATED = [
    ({'doctors_office', 'health_care', 'outpatient_care_facility', 'family_practice'}, r'kinderarzt|kinderärzt|kinder- und jugend(medizin|arzt|ärzt)|kinderheilkunde|pädiatr', 'kinderarzt'),
    ({'doctors_office', 'health_care', 'outpatient_care_facility'}, r'frauenarzt|frauenärzt|gynäkolog', 'frauenarzt'),
    ({'doctors_office', 'health_care', 'maternity_center', 'childbirth_education', 'complementary_and_alternative_medicine', 'nursing'}, r'hebamm|geburtshaus', 'hebamme'),
    ({'psychotherapy', 'psychology', 'counseling', 'osteopathic_medicine', 'naturopathic_medicine'}, r'kinder|jugend', 'therapie'),
    ({'family_counseling', 'marriage_or_relationship_counseling', 'counseling'}, r'famili|eltern|erziehung', 'beratung'),
    ({'family_service_center', 'social_or_community_service', 'social_and_human_service', 'social_welfare_center', 'youth_organization', 'civic_organization'},
     r'famili|eltern|mütter|kinder|jugend|haus der|pfadfind|\bekiz\b|\bkifaz\b', 'treffpunkt'),
    ({'kids_recreation_and_party'}, r'spiel|kinder|kids|indoor|toben|trampolin|kletter|rabatz', 'indoor'),
    ({'sport_league', 'sport_or_recreation_club', 'amateur_sport_team'}, r'\b(tsv|sv|sc|fc|vfl|tus|tsg|hsv|sg|fsv|tv|etv|htb)\b|sportverein|sportclub|turn|fußball|fussball|kinder|jugend', 'sportstaette'),
]
BLOCK_PRIMARY = {'adult_entertainment_venue', 'adult_store', 'strip_club', 'erotic_massage_venue', 'sex_therapy', 'casino', 'betting_center',
                 'lottery_vendor', 'hookah_bar', 'dance_club', 'bar', 'pub', 'lounge', 'gaming_venue'}
BLOCK_NAME = re.compile(r'erotik|erotic|\bsex|bordell|\bfkk\b|\bstrip|table\s?dance|swinger|laufhaus|domina|spielhalle|spielothek|'
                        r'casino|wettb(ü|ue)ro|shisha|hookah|nachtclub|cannabis|head\s?shop|\bvape', re.I)
PERSON_ONLY = re.compile(r'^(frau|herr)\s', re.I)     # private persons at home addresses
ONLINE_ONLY = re.compile(r'\.(de|com|eu|net|shop)\b|kaufen|online|versand|gro(ß|ss)handel', re.I)
PRODUCT_NOISE = re.compile(r'zubehör|manufaktur|produkte|gmbh|\bag\b', re.I)  # shop categories: importers and wholesalers
LEGAL_FORM = re.compile(r'gmbh|\bmbh\b|\bag\b|\bsas\b|\be\.\s?k\.?|\bkg\b|\bug\b', re.I)  # a company register entry, not a venue
LEGAL_FORM_CATS = {'restaurant', 'cafe', 'imbiss', 'eis', 'museum', 'kultur', 'zahnarzt', 'physio'}
DRUGSTORE_CHAIN = re.compile(r'^(budni|budnikowsky|rossmann|dm\b|dm-|müller\b)', re.I)  # Meta files these under pharmacy
# The taxonomy mixes in suppliers, labs and offices; these categories must also say so in their name.
NAME_REQUIRED = {
    'apotheke': r'apothek|pharmacy',
    'zahnarzt': r'zahn|dent|kiefer|oral|\bdr\b',
    'physio': r'physio|krankengymn|therap|rehab|osteopath|bewegung|\bpraxis\b',
    'hebamme': r'hebamm|geburt|storch|still|wochenbett',
    'indoor': r'spiel|kinder|kids|indoor|toben|trampolin|kletter|boulder|climb|småland|rabatz',
}
NAME_FORBIDDEN = {
    'zahnarzt': r'labor|technik|service|bedarf|handel',
    'kinderarzt': r'therap',
    'cafe': r'tchibo|teegschwendner|\boffice\b|kinderladen|\bkita\b',
    'restaurant': r'kinderladen|\bkita\b|eat happy|lieferservice|catering|frühstücksdienst',  # Eat Happy: counters inside supermarkets
    'schule': r'hochschule|universit|akademie|fahrschule',
    'museum': r'archiv\b',
}
GASTRO = {'restaurant', 'cafe', 'imbiss', 'eis'}

# Minimum Overture confidence per provider, calibrated on how often a record in a band matches a place we already know
# (pharmacies, cafes, restaurants, snack bars, ice cream, drugstores). Scores are not comparable across providers:
# Foursquare is a flat 0.77, so its update time is used instead; 2/3 of BrightQuery is a flat 0.50 and its 0.947 block
# matches like noise (25%) while everything above matches at 65%.
# Restaurants close fastest and are the most common new records, so Meta needs its top band there.
MIN_CONFIDENCE_GASTRO = {'meta': 0.95}
MIN_CONFIDENCE = {'meta': 0.90, 'BrightQuery': 0.95, 'Microsoft': 0.95, 'Foursquare': 0.0, 'AllThePlaces': 0.80,
                  'Uberall': 0.90, 'PinMeTo': 0.90, 'Krick': 0.90, 'DAC': 0.90, 'OpenTravel': 0.90}
FSQ_MIN_UPDATE = '2026-01-01'
# Our data on these is thin and they matter most: below the threshold, a record still counts if name and live site agree.
SCARCE_RX = {'hebamme': r'hebamm|geburtshaus', 'kinderarzt': r'kinder'}

SOURCES = {
    'overture': ('Overture Maps Places', 'CDLA Permissive 2.0',
                 'Overture Maps Foundation, overturemaps.org. Daten: CDLA Permissive 2.0 (Meta, Microsoft, BrightQuery, Uberall, PinMeTo, Krick, DAC, OpenTravel). '
                 f'Release {RELEASE}, für Djuu gefiltert und auf eigene Kategorien abgebildet.'),
    'overture_fsq': ('Overture Maps Places (Foursquare)', 'Apache-2.0',
                     'Data from Foursquare. Copyright 2024 Foursquare Labs, Inc. All rights reserved. Foursquare OS Places, Apache License 2.0, via Overture Maps Foundation, overturemaps.org. '
                     'Geändert: von Overture ins Overture-Schema umgewandelt (2026-03-18); von Djuu gefiltert, Kategorien, Telefonnummern und Webadressen vereinheitlicht. '
                     'Lizenz und NOTICE: data/licenses/overture/.'),
    'overture_atp': ('Overture Maps Places (AllThePlaces)', 'CC0 1.0',
                     f'AllThePlaces (CC0 1.0) via Overture Maps Foundation, overturemaps.org. Release {RELEASE}.'),
}


def food_category(primary, hierarchy):
    if primary in NOT_FOOD or not primary or not hierarchy or hierarchy[0] != 'food_and_drink':
        return None
    return 'restaurant' if primary.endswith('_restaurant') else None


def classify(primary, hierarchy, name):
    """Djuu category for a record, or None if it is not family-relevant."""
    if primary in BLOCK_PRIMARY:
        return None
    if primary == 'pharmacy' and DRUGSTORE_CHAIN.search(name or ''):
        return 'windeln'
    if primary in PRIMARY:
        return PRIMARY[primary]
    if primary and primary.endswith('_museum'):
        return 'museum'
    found = food_category(primary, hierarchy)
    if found:
        return found
    for primaries, rx, cat in NAME_GATED:
        if primary in primaries and re.search(rx, name or '', re.I):
            return cat
    return None


def ensure_raw():
    if RAW_FILE.exists():
        return
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    con.execute(f"""COPY (SELECT * FROM read_parquet('{S3_GLOB}')
                    WHERE bbox.xmin BETWEEN {BBOX[0]} AND {BBOX[1]} AND bbox.ymin BETWEEN {BBOX[2]} AND {BBOX[3]})
                    TO '{RAW_FILE.as_posix()}' (FORMAT parquet, COMPRESSION zstd)""")


def load_rows():
    con = duckdb.connect()
    cur = con.execute(f"""SELECT id, names."primary", taxonomy."primary", taxonomy.hierarchy, taxonomy.alternates, basic_category,
                                 confidence, operating_status, websites, phones, addresses, sources,
                                 (bbox.xmin + bbox.xmax) / 2, (bbox.ymin + bbox.ymax) / 2
                          FROM read_parquet('{RAW_FILE.as_posix()}')""")
    keys = ('id', 'name', 'primary', 'hierarchy', 'alternates', 'basic', 'confidence', 'status', 'websites', 'phones', 'addresses', 'sources', 'lon', 'lat')
    return [dict(zip(keys, r)) for r in cur.fetchall()]


def hamburg_contains():
    """Point-in-Hamburg test from the OSM Bezirke: places outside have no district and export.py drops them anyway."""
    from shapely.geometry import Point
    from shapely.ops import unary_union
    from shapely.prepared import prep
    _, items = load_districts()['9']
    shape = prep(unary_union([g for g, _ in items]))
    return lambda la, lo: shape.contains(Point(lo, la))


def primary_source(row):
    return next((s for s in row['sources'] or [] if s['property'] == ''), None)


def record_license(row):
    """(licence, dataset) of a record. A Foursquare source anywhere makes the record Apache-2.0."""
    main = primary_source(row)
    if not main:
        return None, None
    if 'Apache-2.0' in {s['license'] for s in row['sources'] if s['dataset'] != 'Overture'}:
        return 'Apache-2.0', main['dataset']
    return main['license'], main['dataset']


def clean_phone(s):
    k = phone_key(s)
    return f'+49{k}' if k and 8 <= len(k) <= 13 else None


def clean_website(urls):
    return next((u for u in urls or [] if domain_key(u)), None)


def address_of(row):
    a = (row['addresses'] or [None])[0]
    if not a or not a.get('freeform') or not re.search(r'\d', a['freeform']) or len(a['freeform']) > 80:
        return None
    return ', '.join(x for x in (a['freeform'], ' '.join(y for y in (a.get('postcode'), a.get('locality')) if y)) if x)


def is_scarce(row, name, cat):
    return cat in SCARCE_RX and re.search(SCARCE_RX[cat], name, re.I) and clean_website(row['websites'])


def rejection(row, name, cat, lic, dataset, inside):
    """Why a family-relevant record is not imported, or None."""
    if lic not in LICENSE_SOURCE: return 'unknown licence'
    if not name: return 'no name'
    if not inside(row['lat'], row['lon']): return 'outside Hamburg'
    if row['status'] in ('permanently_closed', 'temporarily_closed'): return 'closed'
    if row['confidence'] == 0: return 'closed'
    if set(row['alternates'] or []) & BLOCK_PRIMARY or BLOCK_NAME.search(name): return 'adult or gambling'
    if PERSON_ONLY.search(name): return 'private person'
    if cat in ('laden', 'windeln') and ONLINE_ONLY.search(name): return 'online shop'
    if cat == 'laden' and PRODUCT_NOISE.search(name): return 'online shop'
    if cat in LEGAL_FORM_CATS and LEGAL_FORM.search(name): return 'wrong type by name'
    if cat in NAME_REQUIRED and not re.search(NAME_REQUIRED[cat], name, re.I): return 'wrong type by name'
    if cat in NAME_FORBIDDEN and re.search(NAME_FORBIDDEN[cat], name, re.I): return 'wrong type by name'
    if dataset == 'Foursquare':
        if (primary_source(row)['update_time'] or '') < FSQ_MIN_UPDATE: return 'below threshold'
    else:
        table = MIN_CONFIDENCE_GASTRO if cat in GASTRO and dataset in MIN_CONFIDENCE_GASTRO else MIN_CONFIDENCE
        if (row['confidence'] or 0) < table.get(dataset, 0.9): return 'below threshold'
    if not clean_website(row['websites']) and not clean_phone((row['phones'] or [None])[0]): return 'no contact data'
    return None


def to_record(row, name, cat, lic, dataset):
    main = primary_source(row)
    conf = round(row['confidence'] or 0, 3)
    fact = lambda v: (v, 'source', conf) if v else None
    updated = main.get('update_time')
    return {'ref': row['id'], 'category': cat, 'name': name, 'lat': row['lat'], 'lon': row['lon'], 'source': LICENSE_SOURCE[lic],
            'url': f'https://explore.overturemaps.org/#16/{row["lat"]:.5f}/{row["lon"]:.5f}',
            'observed_at': updated[:19] + 'Z' if updated else None,
            'raw': {'release': RELEASE, 'primary': row['primary'], 'basic_category': row['basic'], 'confidence': conf,
                    'operating_status': row['status'], 'dataset': dataset, 'license': lic, 'record_id': main.get('record_id')},
            'facts': {'name': fact(name), 'website': fact(clean_website(row['websites'])),
                      'phone': fact(clean_phone((row['phones'] or [None])[0])), 'address': fact(address_of(row))}}


def select(rows, inside):
    """Apply all quality rules. Returns (records, stats)."""
    stats = defaultdict(Counter)
    out = []
    for row in rows:
        name = (row['name'] or '').strip()
        cat = classify(row['primary'], row['hierarchy'], name)
        if not cat:
            stats['ignored']['not family-relevant'] += 1
            continue
        stats['read'][cat] += 1
        lic, dataset = record_license(row)
        reason = rejection(row, name, cat, lic, dataset, inside)
        rescued = reason == 'below threshold' and is_scarce(row, name, cat)
        if reason and not rescued:
            stats['dropped'][reason] += 1
            continue
        record = to_record(row, name, cat, lic, dataset)
        record['rescued'] = bool(rescued)
        out.append(record)
    return out, stats


def check_site(url):
    """One polite request. 'dead': no such host, refused or 404/410; 'unknown': timeout or TLS error; else 'ok'."""
    host = urlparse(url).netloc
    with HOST_LOCKS[host]:  # never two requests at once to one host
        try:
            if not allowed(url):  # same policy as common.fetch: a site that excludes us is not asked
                return 'unknown'
        except Exception:
            return 'unknown'
        wait = HOST_LAST[host] + MIN_DELAY - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            r = requests.head(url, headers=HEADERS, timeout=SITE_TIMEOUT, allow_redirects=True)
            if r.status_code in (403, 405, 501):  # many servers refuse HEAD
                r = requests.get(url, headers=HEADERS, timeout=SITE_TIMEOUT, allow_redirects=True, stream=True)
                r.close()
            return 'dead' if r.status_code in (404, 410) else 'ok'
        except (requests.exceptions.Timeout, requests.exceptions.SSLError):
            return 'unknown'
        except requests.RequestException:
            return 'dead'
        finally:
            HOST_LAST[host] = time.time()


def verify_sites(records, stats):
    """Drop records whose website is gone: a dead site is the best closure signal this data offers.

    A rescued record needs a site that answered. Results are cached, so reruns ask no one twice.
    """
    known = json.loads(SITE_CACHE.read_text(encoding='utf-8')) if SITE_CACHE.exists() else {}
    urls = {r['facts']['website'][0] for r in records if r['facts']['website']} - set(known)
    print(f'checking {len(urls)} websites')
    with ThreadPoolExecutor(16) as pool:
        for i, (url, state) in enumerate(zip(urls, pool.map(check_site, urls))):
            known[url] = state
            if i % 500 == 499:
                SITE_CACHE.write_text(json.dumps(known), encoding='utf-8')
    SITE_CACHE.write_text(json.dumps(known), encoding='utf-8')
    kept = []
    for r in records:
        state = known.get(r['facts']['website'][0]) if r['facts']['website'] else None
        stats['sites'][state or 'no website'] += 1
        if state == 'dead' or (r['rescued'] and state != 'ok'):
            stats['dropped']['dead website'] += 1
            continue
        if r['rescued']:
            stats['scarce_rescued'][r['category']] += 1
        stats['kept'][r['category']] += 1
        kept.append(r)
    return kept


def retry_locked(fn, attempts=12):
    """The database is shared with concurrent importers."""
    for i in range(attempts):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            if 'locked' not in str(e) or i == attempts - 1:
                raise
            print(f'  database locked, retry {i + 1}')
            time.sleep(5 + i * 5)


def write(records):
    by_source = defaultdict(list)
    for r in records:
        by_source[r['source']].append(r)
    for source_id, (name, licence, attribution) in SOURCES.items():
        def job():
            con = connect()
            try:
                register_source(con, source_id, name, 'https://docs.overturemaps.org/attribution/', licence, attribution, priority=35)
                return replace_records(con, source_id, by_source[source_id])
            finally:
                con.close()
        print(f'{source_id}:', retry_locked(job))


def estimate(records):
    """Dry run of the strict merge against the current database: nothing is written."""
    con = sqlite3.connect(f'file:{DB_PATH.as_posix()}?mode=ro', uri=True, timeout=60)
    extra = [(r['source'], r['ref'], k, r['facts'][k][0]) for r in records for k in ('phone', 'website') if r['facts'][k]]
    contacts = contact_index(con, extra)
    grid, places = Grid(), {}
    for pid, name, cat, la, lo in con.execute('SELECT id, name, category, lat, lon FROM places'):
        places[pid] = p = {'id': pid, 'name': name, 'category': cat, 'lat': la, 'lon': lo}
        grid.add(la, lo, p)
    for src, ref, pid in con.execute('SELECT source_id, source_ref, place_id FROM source_records WHERE place_id IS NOT NULL'):
        if pid in places and src not in SOURCES:
            attach_contacts(places[pid], contacts.get((src, ref)))
    for src, ref, name, cat, la, lo in con.execute("SELECT source_id, source_ref, name, category, lat, lon FROM source_records WHERE source_id='osm' AND place_id IS NULL"):
        p = {'id': f'{src}:{ref}', 'name': name, 'category': cat, 'lat': la, 'lon': lo}
        attach_contacts(p, contacts.get((src, ref)))
        grid.add(la, lo, p)
    con.close()
    chains = chain_token_sets(r['name'] for r in records)
    res = defaultdict(Counter)
    matched, new = [], []
    for r in records:
        facts, cat = r['facts'], r['category']
        mine = contacts.get((r['source'], r['ref'])) or {'phones': set(), 'domains': set()}
        phones, domains = mine['phones'], mine['domains']
        q, why = find_match(r['name'], phones, domains, r['lat'], r['lon'], grid.near(r['lat'], r['lon']),
                            lambda c: compatible(cat, c), dist, chains)
        if q is not None:
            res['matched'][cat] += 1
            res['why'][why] += 1
            matched.append((r, q, why))
            if facts['website'] and not q.get('domains'): res['adds_website'][cat] += 1
            if facts['phone'] and not q.get('phones'): res['adds_phone'][cat] += 1
            attach_contacts(q, mine)
        elif why or cat in ENRICH_ONLY:
            res['unlinked'][cat] += 1
            res['unlinked_why'][why or 'enrich only'] += 1
        else:
            res['new'][cat] += 1
            new.append(r)
            p = {'id': r['ref'], 'name': r['name'], 'category': cat, 'lat': r['lat'], 'lon': r['lon'], 'phones': phones, 'domains': domains}
            grid.add(r['lat'], r['lon'], p)
    return res, matched, new


def report(records, stats):
    n = len(records) or 1
    print('read per category:', dict(stats['read'].most_common()))
    print('dropped:', dict(stats['dropped'].most_common()))
    print('websites:', dict(stats['sites'].most_common()))
    print('rescued scarce:', dict(stats['scarce_rescued']))
    print('kept per category:', dict(stats['kept'].most_common()))
    print('kept per source:', dict(Counter(r['source'] for r in records)), 'per dataset:', dict(Counter(r['raw']['dataset'] for r in records).most_common()))
    for key in ('website', 'phone', 'address'):
        print(f'  with {key}: {sum(1 for r in records if r["facts"][key]) / n:.0%}')
    print('  with opening hours: 0% (the Overture schema has no such field)')


def run():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    ensure_raw()
    rows = load_rows()
    print(f'release {RELEASE}: {len(rows)} records in the bounding box')
    records, stats = select(rows, hamburg_contains())
    records = verify_sites(records, stats)
    report(records, stats)
    if not args.dry_run:
        write(records)
    res, _, _ = estimate(records)
    for k in ('matched', 'new', 'unlinked', 'why', 'unlinked_why', 'adds_website', 'adds_phone'):
        print(f'{k}: {sum(res[k].values())}', dict(res[k].most_common()))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    run()
