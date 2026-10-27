"""Import all family-relevant places in Hamburg from OpenStreetMap (Geofabrik extract, read locally).

QUERY documents the same selection as an Overpass query for ad-hoc checks.

License: ODbL 1.0 – attribution "© OpenStreetMap-Mitwirkende" required, derived database must stay open.
"""
import json
import re
from datetime import datetime, timezone

from common import RAW_DIR, connect, register_source, replace_records

ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

QUERY = r"""
[out:json][timeout:600][maxsize:1073741824];
area["name"="Hamburg"]["admin_level"="4"]->.hh;
(
  nwr["leisure"~"^(playground|indoor_play|water_park|dog_park|miniature_golf|trampoline_park|ice_rink|bathing_place|park|swimming_area|beach_resort|adventure_park|amusement_arcade)$"](area.hh);
  nwr["leisure"="sports_centre"]["sport"~"swimming|climbing|trampoline|bouldering"](area.hh);
  nwr["leisure"="swimming_pool"]["access"!~"private|customers|no"]["location"!="indoor"](area.hh);
  nwr["amenity"~"^(cafe|restaurant|fast_food|ice_cream|toilets|library|toy_library|pharmacy|public_bath|fuel|kindergarten|childcare|cinema|theatre|arts_centre|community_centre|drinking_water|baby_hatch|bbq|planetarium|social_facility|family_centre|clinic)$"](area.hh);
  nwr["shop"~"^(chemist|baby_goods|convenience|kiosk|supermarket|toys|books|second_hand|charity)$"](area.hh);
  nwr["shop"="clothes"]["clothes"~"children|babies"](area.hh);
  nwr["highway"="elevator"](area.hh);
  nwr["tourism"~"^(zoo|aquarium|museum|theme_park|attraction|picnic_site|gallery|viewpoint)$"](area.hh);
  nwr["healthcare"~"^(midwife|birthing_centre|hospital)$"](area.hh);
  nwr["healthcare:speciality"~"paediatrics"](area.hh);
  nwr["changing_table"](area.hh);
  nwr["kids_area"="yes"](area.hh);
  nwr["highchair"](area.hh);
  nwr["baby_feeding"](area.hh);
  nwr["toilets:children"](area.hh);
  nwr["indoor_play"="yes"](area.hh);
  nwr["drink:babyccino"](area.hh);
  nwr["railway"="station"](area.hh);
  nwr["natural"="beach"](area.hh);
  nwr["landuse"="farmyard"]["name"~"Kinder|Jugend",i](area.hh);
);
out center tags;
"""

# OSM tag -> Djuu category. First match wins, order matters.
def categorize(t):
    g = t.get
    if 'paediatrics' in (g('healthcare:speciality') or ''): return 'kinderarzt'
    if g('healthcare') == 'birthing_centre': return 'geburtshaus'
    if g('healthcare') == 'midwife': return 'hebamme'
    if g('amenity') == 'baby_hatch': return 'babyklappe'
    lei = g('leisure')
    if lei == 'playground':
        if g('access') in ('private', 'no', 'customers'): return 'spielplatz_privat'
        return 'indoor' if g('indoor') == 'yes' else 'spielplatz'
    if lei in ('indoor_play', 'trampoline_park', 'adventure_park'): return 'indoor'
    if lei in ('water_park', 'swimming_area', 'bathing_place', 'beach_resort', 'swimming_pool') or g('amenity') == 'public_bath' or g('natural') == 'beach': return 'baden'
    if lei == 'sports_centre': return 'baden' if 'swimming' in (g('sport') or '') else 'indoor'
    if lei == 'dog_park': return 'hundeauslauf'
    if lei in ('miniature_golf', 'ice_rink', 'amusement_arcade'): return 'freizeit'
    if lei == 'park': return 'park'
    a = g('amenity')
    m = {'cafe': 'cafe', 'restaurant': 'restaurant', 'fast_food': 'imbiss', 'ice_cream': 'eis', 'toilets': 'wc',
         'library': 'buecherei', 'toy_library': 'buecherei', 'pharmacy': 'apotheke', 'fuel': 'windeln',
         'kindergarten': 'kita', 'childcare': 'kita', 'cinema': 'kultur', 'theatre': 'kultur', 'arts_centre': 'kultur',
         'planetarium': 'ausflug', 'community_centre': 'treffpunkt', 'family_centre': 'treffpunkt',
         'drinking_water': 'trinkwasser', 'bbq': 'grillplatz'}
    if a in m: return m[a]
    if a == 'social_facility' and 'child' in (g('social_facility:for') or '') + (g('social_facility:for') or ''): return 'treffpunkt'
    if g('shop') in ('chemist', 'baby_goods', 'convenience', 'kiosk', 'supermarket'): return 'windeln'
    if g('shop') in ('toys', 'books', 'second_hand', 'charity', 'clothes'): return 'laden'
    if g('highway') == 'elevator': return 'aufzug'
    if g('railway') == 'station': return 'bahnhof'
    tour = g('tourism')
    if tour in ('zoo', 'aquarium', 'theme_park'): return 'ausflug'
    if tour in ('museum', 'gallery'): return 'museum'
    if tour in ('attraction', 'viewpoint'): return 'ausflug'
    if tour == 'picnic_site': return 'picknick'
    if g('landuse') == 'farmyard': return 'ausflug'
    if g('healthcare') == 'hospital': return 'klinik'
    if g('changing_table') == 'yes': return 'wickel'
    return None


def yn(v):
    if v is None: return None
    v = v.lower()
    if v in ('yes', 'designated', 'true'): return 'yes'
    if v in ('no', 'false'): return 'no'
    if v == 'limited': return 'limited'
    return v


def facts_from(t):
    g = t.get
    f = {
        'name': g('name'),
        'changing_table': yn(g('changing_table')),
        'changing_table_location': g('changing_table:location'),
        'changing_table_fee': yn(g('changing_table:fee')),
        'highchair': yn(g('highchair')),
        'kids_area': yn(g('kids_area')),
        'kids_area_indoor': yn(g('kids_area:indoor')),
        'dog': g('dog'),
        'wheelchair': yn(g('wheelchair')),
        'toilets': 'yes' if g('amenity') == 'toilets' else yn(g('toilets')),
        'toilets_wheelchair': yn(g('toilets:wheelchair')),
        'baby_feeding': g('baby_feeding'),
        'opening_hours': g('opening_hours'),
        'website': g('website') or g('contact:website') or g('url'),
        'phone': g('phone') or g('contact:phone'),
        'email': g('email') or g('contact:email'),
        'street': g('addr:street'),
        'housenumber': g('addr:housenumber'),
        'postcode': g('addr:postcode'),
        'fee': yn(g('fee')),
        'access': g('access'),
        'indoor': yn(g('indoor')),
        'outdoor_seating': yn(g('outdoor_seating')),
        'cuisine': g('cuisine'),
        'min_age': g('min_age'),
        'max_age': g('max_age'),
        'operator': g('operator'),
        'surface': g('surface'),
        'lit': yn(g('lit')),
        'shade': g('shade'),
        'barrier': g('barrier'),
        'wikidata': g('wikidata'),
        'brand': g('brand'),
        'check_date': g('check_date') or g('survey:date'),
        'drinking_water': yn(g('drinking_water')),
        'playground_theme': g('playground:theme'),
        'playground_equipment': g('playground'),
        'level': g('level'),
        'description': g('description'),
        'stroller': yn(g('stroller')),
        'toilets_children': yn(g('toilets:children')),
        'indoor_play': yn(g('indoor_play')),
        'babyccino': yn(g('drink:babyccino')),
        'image': g('image') or g('wikimedia_commons'),
    }
    # Playground equipment tagged directly on the playground ("playground:swing=yes" etc.)
    eq = sorted(k.split(':', 1)[1] for k, v in t.items() if k.startswith('playground:') and k != 'playground:theme' and v not in ('no', '0'))
    if eq: f['playground_features'] = ';'.join(eq)
    return f


FAMILY_TAGS = ('changing_table', 'highchair', 'kids_area', 'baby_feeding', 'toilets:children', 'indoor_play', 'drink:babyccino')


def wanted(t):
    """Category for a tag set, applying the same narrowing filters as the Overpass query."""
    g = t.get
    if g('leisure') == 'swimming_pool' and (g('access') in ('private', 'customers', 'no') or g('location') == 'indoor'): return None
    if g('leisure') == 'sports_centre' and not any(x in (g('sport') or '') for x in ('swimming', 'climbing', 'trampoline', 'bouldering')): return None
    if g('shop') == 'clothes' and not any(x in (g('clothes') or '') for x in ('children', 'babies')): return None
    if g('landuse') == 'farmyard' and not re.search('kinder|jugend', g('name') or '', re.I): return None
    if g('amenity') == 'social_facility' and 'child' not in (g('social_facility:for') or '') and 'famil' not in (g('social_facility:for') or ''): return None
    if g('amenity') == 'clinic' and 'paediatrics' not in (g('healthcare:speciality') or ''): return None
    cat = categorize(t)
    if cat is None and any(k in t for k in FAMILY_TAGS): cat = 'familienfreundlich'
    return cat


def centroid(points):
    pts = [(p.lat, p.lon) for p in points if p.location.valid()] if points and hasattr(points[0], 'location') else points
    if not pts: return None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def run(pbf=RAW_DIR / 'hamburg-latest.osm.pbf'):
    """Read the Geofabrik Hamburg extract (download: tools/download-osm.sh)."""
    import osmium
    con = connect()
    register_source(con, 'osm', 'OpenStreetMap', 'https://www.openstreetmap.org', 'ODbL 1.0',
                    '© OpenStreetMap-Mitwirkende', priority=60)
    register_source(con, 'osm_geraete', 'OpenStreetMap Spielgeräte', 'https://www.openstreetmap.org', 'ODbL 1.0',
                    '© OpenStreetMap-Mitwirkende', priority=60)
    observed = datetime.fromtimestamp(pbf.stat().st_mtime, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    recs, devices = [], []
    def add(kind, oid, t, latlon):
        cat = wanted(t)
        if not cat or not latlon: return
        ref = f'{kind}/{oid}'
        recs.append({'ref': ref, 'category': cat, 'name': t.get('name'), 'lat': latlon[0], 'lon': latlon[1],
                     'url': f'https://www.openstreetmap.org/{ref}', 'raw': t, 'facts': facts_from(t), 'observed_at': observed})
    for o in osmium.FileProcessor(str(pbf)).with_locations().with_areas():
        if not o.tags: continue
        t = {tag.k: tag.v for tag in o.tags}
        if o.is_node():
            if 'playground' in t and t.get('leisure') != 'playground':
                devices.append({'ref': f'node/{o.id}', 'category': 'geraet', 'lat': o.location.lat, 'lon': o.location.lon,
                                'raw': t, 'facts': {'playground_equipment': t['playground']}, 'observed_at': observed})
            add('node', o.id, t, (o.location.lat, o.location.lon) if o.location.valid() else None)
        elif o.is_way():
            pts = [(n.lat, n.lon) for n in o.nodes if n.location.valid()]
            add('way', o.id, t, centroid(pts))
        elif o.is_area() and not o.from_way():
            pts = [(n.lat, n.lon) for ring in o.outer_rings() for n in ring if n.location.valid()]
            add('relation', o.orig_id(), t, centroid(pts))
    print('OSM:', replace_records(con, 'osm', recs), 'records')
    print('OSM Geräte:', replace_records(con, 'osm_geraete', devices))


if __name__ == '__main__':
    run()
