"""Import all family-relevant places in Hamburg from OpenStreetMap (Geofabrik extract, read locally).

QUERY documents the same selection as an Overpass query for ad-hoc checks.

License: ODbL 1.0 – attribution "© OpenStreetMap-Mitwirkende" required, derived database must stay open.
"""
import json
import re
import sqlite3
import time
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
  // Further family data, see extra_category() for the exact narrowing (access, names, adult-only sports)
  nwr["amenity"~"^(dentist|doctors|music_school|dancing_school|language_school|prep_school|dojo|public_bookcase|fountain|ferry_terminal|boat_rental|mobile_library|stables|youth_centre)$"](area.hh);
  nwr["healthcare"~"^(dentist|doctor|physiotherapist|speech_therapist|occupational_therapist|psychotherapist|counselling)$"](area.hh);
  nwr["leisure"~"^(pitch|sports_centre|horse_riding|garden|nature_reserve|dance|track|bowling_alley|escape_game|paddling_pool|firepit|disc_golf_course|fitness_station)$"](area.hh);
  nwr["boundary"="national_park"](area.hh);
  nwr["boundary"="protected_area"]["protect_class"="4"](area.hh);
  nwr["club"~"^(sport|scout|sailing|rowing|life_saving|chess)$"](area.hh);
  nwr["office"="association"](area.hh);
  nwr["shop"="farm"](area.hh);
  nwr["attraction"~"^(animal|maze|slide|carousel|kiddie_ride)$"](area.hh);
  nwr["piste:type"="sled"](area.hh);
  nwr["ferry"="yes"](area.hh);
  nwr["tourism"="camp_site"](area.hh);
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


# --- Further family data (extra_category) -------------------------------------------------------------------------
NEW_CATEGORIES = ('physio', 'therapie', 'zahnarzt', 'frauenarzt', 'hno', 'augenarzt', 'kinderpsychologie', 'bolzplatz', 'tischtennis',
                  'sportstaette', 'sportverein', 'reiten', 'tierhof', 'musikschule', 'nachhilfe', 'pfadfinder', 'jugend', 'garten',
                  'naturschutz', 'buecherschrank', 'brunnen', 'rodeln', 'faehre', 'bootsverleih', 'camping')
NO_ACCESS = {'private', 'no', 'permit', 'members', 'employees', 'residents', 'students', 'restricted', 'military', 'delivery',
             'agricultural', 'forestry', 'emergency'}
BALL = {'soccer', 'basketball', 'multi', 'football', 'streetball', 'futsal', 'beachsoccer'}
RACKET = {'tennis', 'badminton', 'squash', 'padel'}
# Open courts where a family can simply turn up; a nameless entry still tells them "there is a court here".
OPEN_COURT = {'beachvolleyball', 'volleyball', 'handball', 'boules', 'chess', 'parkour', 'badminton'}
SKATE = {'skateboard', 'roller_skating', 'bmx', 'scooter'}
ADULT_SPORTS = {'fitness', 'yoga', 'pilates', 'shooting', 'billiards', 'darts', 'axe_throwing', 'model_aerodrome', 'horse_racing',
                'dog_racing', '9pin', '10pin', 'bowling', 'scuba_diving', 'crossfit', 'motor', 'fishing', 'paintball', 'poker', 'sauna'}
ADULT_NAME = re.compile(r'fit\b|fitness|\bgym\b|\bspa\b|sauna|yoga|pilates|kieser|mrs\.? sporty|miss sporty|kaifu lodge|aspria|'
                        r'schütz|schuetz|billard|billiard|bundeswehr|führungsakademie|boxing|zur ritze|rennbahn|alsterr+unning|'
                        r'motorboot|paintball|erotik', re.I)
ADULT_DANCE = re.compile(r'tango|milonga|salsa|\bpole\b|swing time|casa cuba|la yumba|el abrazo|imperial club|after work|tanzpalast|'
                         r'airobics|movimientos', re.I)
SCHOOL_HALL = re.compile(r'\bschule\b|gymnasium|^(kleine |große |neue |alte )?(sporthalle|turnhalle|schulsporthalle|mehrzweckhalle)( \d+| w\d.*)?$|^vereinshaus$', re.I)
CHILD_DOCTOR = re.compile(r'kinder[- ]?(und jugend)?[- ]?(arzt|ärzt|medizin|mediziner|heilkunde|chirurg|kardiolog|orthop|radiolog)|'
                          r'kinder- und jugend(arzt|ärzt|medizin)|pädiatr|paediatr', re.I)
CHILD_PSY = re.compile(r'(kind|jugend).*(psych|seel|sucht)|schreibaby|eltern-kleinkind', re.I)
FAMILY_ADVICE = re.compile(r'famil|mütter|mutter|eltern|schwanger|kinder|jugend|baby', re.I)
KID_SHOP = re.compile(r'kinder|kids|\bbaby|babys', re.I)
KID_SHOP_TYPES = {'clothes', 'shoes', 'boutique', 'games', 'interior_decoration', 'medical_supply', 'beauty', 'fabric', 'sports', 'bicycle'}
CLUB_NAME = re.compile(r'turn(verein|erschaft|erbund|verband|gesellschaft)|sportverein|sport-verein|sportclub|sport-club|schwimm|\b[A-Z]?[TS]V\b|\bTSG\b|\bSC\b|\bFC\b|dlrg', re.I)
FARM_NAME = re.compile(r'streichel|kinderbauernhof|bauernhof|bauernof|erlebnishof|tiergehege|wildgehege|tierhaus|hof ?laden|gut wulfsdorf|gut karlshöhe', re.I)
RIDING_NAME = re.compile(r'reitstall|reiterhof|ponyhof|ponys\b|reitverein|reiterverein|reitanlage|reithalle|fahrverein', re.I)
ART_SCHOOL = re.compile(r'musikschule|ballett|balett|tanzschule|malschule|kunstschule', re.I)
# Radius (m) within which two objects with the same name in the same category are one place (node + building + relation).
DEDUP_M = {'naturschutz': 5000, 'faehre': 400}
DEDUP_DEFAULT_M = 200


def tokens(v):
    return {x.strip().lower() for x in re.split('[;,]', v or '') if x.strip()}


def extra_category(t):
    """Category for further family data, or None. Decides access, adult-only filtering and which objects may stay unnamed."""
    g = t.get
    n = g('name') or ''
    if (g('access') or '').lower() in NO_ACCESS: return None
    a, lei, hc, shop = g('amenity'), g('leisure'), g('healthcare'), g('shop')
    spec = (g('healthcare:speciality') or '').lower()
    sport = tokens(g('sport'))

    # Places where a name does not matter: the pin itself is the information.
    if lei == 'pitch':
        if g('indoor') == 'yes' or re.search(r'(sport|turn)halle', n, re.I): return None  # a school or club hall, not a court to walk onto
        if 'climbing' in sport or sport & SKATE: return 'freizeit'
        if sport & RACKET and sport & BALL: return 'sportstaette' if n else None  # indoor courts of a commercial hall
        if sport & BALL: return 'bolzplatz'
        if 'table_tennis' in sport: return 'tischtennis'
        if sport & OPEN_COURT: return 'sportstaette'
        if 'equestrian' in sport: return 'reiten' if n else None
        if sport & ADULT_SPORTS or 'laser_tag' in sport: return None
        return 'sportstaette' if n and sport else None  # club-only courts (tennis, hockey, athletics) only when named
    if a == 'fountain': return 'brunnen'
    if a == 'public_bookcase': return 'buecherschrank'
    if g('piste:type') == 'sled' or (re.search(r'rodel|schlitten', n, re.I) and not g('highway') and not g('public_transport')): return 'rodeln'
    if lei == 'paddling_pool': return 'baden'
    if not n: return None

    # Ferries: only piers a family can board (no works piers, no cruise terminals, no Cuxhaven/Helgoland far ends).
    if a == 'ferry_terminal' or g('ferry') == 'yes':
        if g('public_transport') == 'stop_area' or re.search(r'airbus|betriebsangehör|cruise center|cuxhaven|brunsbüttel|helgol', n, re.I): return None
        return 'faehre'
    if g('highway') or g('public_transport'): return None

    # Health
    if a == 'dentist' or hc == 'dentist': return 'zahnarzt'
    if hc in ('speech_therapist', 'occupational_therapist'): return 'therapie'
    if hc == 'physiotherapist' or (g('office') == 'therapist' and re.search(r'physio', n, re.I)):
        return 'therapie' if re.search(r'ergo|logop', n, re.I) else 'physio'
    if g('office') == 'therapist' and re.search(r'ergo|logop', n, re.I): return 'therapie'
    if hc == 'counselling' and FAMILY_ADVICE.search(n): return 'beratung'
    if a in ('doctors', 'clinic') or hc in ('doctor', 'centre', 'clinic', 'psychotherapist') or g('office') == 'therapist':
        if re.search(r'paediatric|pediatric', spec) or (CHILD_DOCTOR.search(n) and 'forschung' not in n.lower()): return 'kinderarzt'
        if 'child_psychiatry' in spec or CHILD_PSY.search(n): return 'kinderpsychologie'
        if re.search(r'gyn[a]?ecolog|obstetric', spec) or re.search(r'frauen(arzt|ärzt|aerzt)|gynäkolog', n, re.I): return 'frauenarzt'
        if re.search(r'otolaryngolog|orolaryngolog', spec) or re.search(r'\bHNO\b', n): return 'hno'
        if 'ophthalmology' in spec or re.search(r'augen(arzt|ärzt|heil)', n, re.I): return 'augenarzt'
        return None

    # Help for families and young people
    if a == 'social_facility':
        served, kind = tokens(g('social_facility:for')), tokens(g('social_facility'))
        homes = kind and kind <= {'group_home', 'assisted_living', 'nursing_home'}
        if served & {'family', 'parent', 'mother', 'baby', 'pupil'} and not homes: return 'beratung'
        if served & {'juvenile', 'youth', 'girl', 'boy'} and not homes and not re.search(r'wohn', n, re.I): return 'jugend'
        return None
    if a == 'youth_centre': return 'jugend'
    if g('club') == 'scout' or re.search(r'pfadfinder|\bDPSG\b|\bVCP\b', n): return 'pfadfinder'

    # Riding and animals (before sports: many riding stables are also tagged as sports grounds)
    if lei == 'horse_riding' or a == 'stables' or 'equestrian' in sport or RIDING_NAME.search(n):
        if 'horse_racing' in sport or re.search(r'rennbahn|polo|^reitplatz \d', n, re.I): return None
        return 'reiten'
    if shop == 'farm' or g('attraction') == 'animal' or g('tourism') == 'trail_riding_station' or g('landuse') == 'animal_keeping': return 'tierhof'
    if FARM_NAME.search(n) and not (shop or g('office') or hc or g('tourism') or a): return 'tierhof'

    # Sport
    if lei == 'sports_centre' or a == 'dojo':
        if sport & {'ice_skating', 'miniature_golf', 'laser', 'laser_tag'} or re.search(r'lasertag|bewegungsinsel', n, re.I): return 'freizeit'
        if sport & SKATE or re.search(r'skate', n, re.I): return 'freizeit'
        if (sport and sport <= ADULT_SPORTS) or ADULT_NAME.search(n) or SCHOOL_HALL.search(n): return None
        return 'sportstaette'
    if lei == 'fitness_station': return 'freizeit' if re.search(r'bewegungsinsel', n, re.I) else None
    if lei == 'disc_golf_course': return 'sportstaette'
    if lei == 'track': return 'freizeit' if re.search(r'bmx|pump', n, re.I) else None
    if lei in ('bowling_alley', 'escape_game'): return 'freizeit'
    if g('club') in ('sport', 'sailing', 'rowing', 'life_saving', 'chess') or (g('office') == 'association' and (sport or CLUB_NAME.search(n))):
        if (sport and sport <= ADULT_SPORTS) or ADULT_NAME.search(n) or SCHOOL_HALL.search(n): return None
        return 'sportverein'

    # Courses
    edu = g('education')
    if lei == 'dance' or a == 'dancing_school' or edu == 'dancing_school':
        return None if ADULT_DANCE.search(n) or a == 'nightclub' else 'musikschule'
    if a in ('music_school', 'language_school') or edu in ('music_school', 'language_school'): return 'musikschule'
    if a == 'school' and ART_SCHOOL.search(n): return 'musikschule'
    if g('craft') == 'atelier' and ART_SCHOOL.search(n): return 'musikschule'
    if a == 'prep_school' or edu == 'prep_school': return 'nachhilfe'

    # Outdoors and outings
    if lei == 'garden' or a == 'Themengarten':
        if g('garden:type') in ('residential', 'private') or n.isdigit() or re.search(r'^station |hochbeet', n, re.I): return None
        return 'garten'
    if lei == 'nature_reserve' or g('boundary') == 'national_park' or (g('boundary') == 'protected_area' and g('protect_class') == '4'): return 'naturschutz'
    if a == 'boat_rental': return None if re.search(r'marina|yacht', n, re.I) else 'bootsverleih'
    if g('tourism') == 'camp_site': return None if re.search(r'fkk', n, re.I) else 'camping'
    if lei == 'firepit': return 'grillplatz'
    if g('attraction') in ('maze', 'slide', 'carousel', 'kiddie_ride'): return 'ausflug'
    if a == 'mobile_library': return 'buecherei'

    # Children's shops by name (shops tagged clothes=children were already imported)
    if shop in KID_SHOP_TYPES and KID_SHOP.search(n): return 'laden'
    if shop == 'games': return 'laden'
    return None


def type_fact(cat, t):
    """Existing 'type' fact for freizeit/buecherei, which db/tags.py already understands (skaten, klettern)."""
    sport, n = tokens(t.get('sport')), t.get('name') or ''
    if cat == 'freizeit':
        if 'bmx' in sport or re.search(r'bmx|pump', n, re.I): return 'BMX-Bahn'
        if sport & SKATE or re.search(r'skate', n, re.I): return 'Skateanlage'
        if 'climbing' in sport: return 'Kletteranlage'
        if re.search(r'bewegungsinsel', n, re.I): return 'Bewegungsinsel'
    if cat == 'buecherei' and t.get('amenity') == 'mobile_library': return 'Bücherbus'
    return None


def extra_facts(cat, t):
    """New fact keys. Only returned when the object carries them, so existing categories stay small."""
    g = t.get
    n = g('name') or ''
    spec = g('healthcare:speciality')
    f = {'sport': g('sport'), 'capacity': g('capacity'), 'covered': yn(g('covered')), 'hoops': g('hoops'),
         'speciality': spec if cat in NEW_CATEGORIES else None, 'dance_style': g('dance:style'), 'rental': g('rental'),
         'route_ref': g('route_ref') if cat == 'faehre' else None, 'fountain_type': g('fountain'),
         'sled_difficulty': g('piste:difficulty'), 'garden_type': g('garden:type'),
         'protection_title': g('protection_title') if cat == 'naturschutz' else None, 'type': type_fact(cat, t)}
    if cat in ('zahnarzt', 'physio', 'therapie') and re.search(r'kinder|kids|paediatric|pädiatr|zahnfee|zauberzähne', f"{n} {spec or ''}", re.I):
        f['for_children'] = 'yes'
    if cat == 'zahnarzt' and 'orthodontics' in (spec or ''): f['orthodontics'] = 'yes'
    if cat == 'therapie':
        hc = g('healthcare')
        f['therapy_type'] = ('speech' if hc == 'speech_therapist' or re.search(r'logop|sprach|sprech', n, re.I) else 'occupational')
    if cat == 'musikschule':
        a, edu = g('amenity'), g('education')
        f['school_type'] = ('dance' if g('leisure') == 'dance' or 'dancing_school' in (a, edu) or re.search(r'tanz|ballett|balett', n, re.I)
                            else 'language' if 'language_school' in (a, edu)
                            else 'art' if re.search(r'mal|kunst', n, re.I) and a != 'music_school' else 'music')
    if cat == 'tierhof': f['farm_type'] = 'hofladen' if g('shop') == 'farm' else 'tiere'
    return {k: v for k, v in f.items() if v}


FAMILY_TAGS = ('changing_table', 'highchair', 'kids_area', 'baby_feeding', 'toilets:children', 'indoor_play', 'drink:babyccino')


def wanted(t):
    """Category for a tag set, applying the same narrowing filters as the Overpass query."""
    g = t.get
    if g('leisure') == 'swimming_pool' and (g('access') in ('private', 'customers', 'no') or g('location') == 'indoor'): return None
    narrowed = (g('leisure') == 'sports_centre' and not any(x in (g('sport') or '') for x in ('swimming', 'climbing', 'trampoline', 'bouldering'))
                or g('shop') == 'clothes' and not any(x in (g('clothes') or '') for x in ('children', 'babies'))
                or g('landuse') == 'farmyard' and not re.search('kinder|jugend', g('name') or '', re.I)
                or g('amenity') == 'social_facility' and 'child' not in (g('social_facility:for') or '') and 'famil' not in (g('social_facility:for') or '')
                or g('amenity') == 'clinic' and 'paediatrics' not in (g('healthcare:speciality') or ''))
    if narrowed: return extra_category(t)
    cat = categorize(t)
    if cat in (None, 'wickel'): cat = extra_category(t) or cat  # a dentist with a changing table stays a dentist
    if cat is None and any(k in t for k in FAMILY_TAGS): cat = 'familienfreundlich'
    return cat


def centroid(points):
    pts = [(p.lat, p.lon) for p in points if p.location.valid()] if points and hasattr(points[0], 'location') else points
    if not pts: return None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def zone_kind(t):
    """Grounds that say something about the objects inside them."""
    g = t.get
    if g('leisure') in ('sports_centre', 'stadium') or g('landuse') == 'recreation_ground': return 'sportanlage'
    if g('amenity') in ('school', 'college', 'university') or g('landuse') == 'education': return 'schule'
    if g('tourism') == 'zoo': return 'zoo'
    return None


def apply_zones(recs, zones):
    """Mark pitches on club or school grounds (not freely usable) and drop single enclosures inside a zoo (the zoo is the place)."""
    from shapely.geometry import Point, Polygon
    from shapely.strtree import STRtree
    polys, kinds = [], []
    for kind, pts in zones:
        if len(pts) < 4: continue
        poly = Polygon([(lo, la) for la, lo in pts])
        if not poly.is_valid: poly = poly.buffer(0)
        if not poly.is_empty: polys.append(poly); kinds.append(kind)
    tree = STRtree(polys)
    out = []
    for r in recs:
        leisure, attraction = r['raw'].get('leisure'), r['raw'].get('attraction')
        if leisure == 'pitch' or attraction == 'animal':
            pt = Point(r['lon'], r['lat'])
            inside = {kinds[i] for i in tree.query(pt) if polys[i].contains(pt)}
            if r['category'] == 'tierhof' and 'zoo' in inside: continue
            if leisure == 'pitch':
                setting = 'sportanlage' if 'sportanlage' in inside else 'schule' if 'schule' in inside else None
                if setting: r['facts']['pitch_setting'] = setting
        out.append(r)
    return out


def dedupe(recs, extra):
    """One record per real place among the new data: the same name in one category close together is node + building + relation.
    Ferry piers: one per pier, with the OSM helper words removed from the name."""
    from merge import dist
    kept, out = {}, []
    for r in sorted(recs, key=lambda r: -sum(1 for v in r['facts'].values() if v)):
        if r['ref'] not in extra or not r['name']:
            out.append(r); continue
        if r['category'] == 'faehre':
            r['name'] = re.sub(r'\s*\((Schiffsanleger|Fähre)\)$|\s+Brücke \d+$', '', r['name'])
            r['facts']['name'] = r['name']
        key = (r['category'], r['name'].lower())
        radius = DEDUP_M.get(r['category'], DEDUP_DEFAULT_M)
        if any(dist(r['lat'], r['lon'], la, lo) <= radius for la, lo in kept.get(key, ())): continue
        kept.setdefault(key, []).append((r['lat'], r['lon']))
        out.append(r)
    return out


def collect(pbf=RAW_DIR / 'hamburg-latest.osm.pbf'):
    """Read the Geofabrik Hamburg extract (download: tools/download-osm.sh). Returns (records, devices) without touching the database."""
    import osmium
    observed = datetime.fromtimestamp(pbf.stat().st_mtime, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    recs, devices, zones, extra = [], [], [], set()
    def add(kind, oid, t, latlon):
        cat = wanted(t)
        if not cat or not latlon: return
        ref = f'{kind}/{oid}'
        if cat in NEW_CATEGORIES or extra_category(t) == cat: extra.add(ref)
        recs.append({'ref': ref, 'category': cat, 'name': t.get('name'), 'lat': latlon[0], 'lon': latlon[1],
                     'url': f'https://www.openstreetmap.org/{ref}', 'raw': t, 'facts': {**facts_from(t), **extra_facts(cat, t)}, 'observed_at': observed})
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
            if (kind := zone_kind(t)) and len(pts) >= 4 and pts[0] == pts[-1]: zones.append((kind, pts))
        elif o.is_area() and not o.from_way():
            rings = [[(n.lat, n.lon) for n in ring if n.location.valid()] for ring in o.outer_rings()]
            add('relation', o.orig_id(), t, centroid([p for ring in rings for p in ring]))
            if kind := zone_kind(t): zones += [(kind, ring) for ring in rings]
    return dedupe(apply_zones(recs, zones), extra), devices


def with_retry(work, attempts=40, wait=15):
    """Other importers share the database: on a lock roll back, wait and start the short transaction again."""
    for attempt in range(attempts):
        con = None
        try:
            con = connect()
            return work(con)
        except sqlite3.OperationalError as e:
            if 'locked' not in str(e) and 'busy' not in str(e): raise
            print(f'  database locked, retry in {wait}s ({attempt + 1}/{attempts})')
            if con is not None: con.rollback()
            time.sleep(wait)
        finally:
            if con is not None: con.close()
    raise RuntimeError('database stayed locked')


def run(pbf=RAW_DIR / 'hamburg-latest.osm.pbf'):
    # The extract is read first, with no database connection open, so the write lock is only held for the final replace.
    recs, devices = collect(pbf)
    def register(con):
        register_source(con, 'osm', 'OpenStreetMap', 'https://www.openstreetmap.org', 'ODbL 1.0',
                        '© OpenStreetMap-Mitwirkende', priority=60)
        register_source(con, 'osm_geraete', 'OpenStreetMap Spielgeräte', 'https://www.openstreetmap.org', 'ODbL 1.0',
                        '© OpenStreetMap-Mitwirkende', priority=60)
    with_retry(register)
    print('OSM:', with_retry(lambda con: replace_records(con, 'osm', recs)), 'records')
    print('OSM Geräte:', with_retry(lambda con: replace_records(con, 'osm_geraete', devices)))


if __name__ == '__main__':
    run()
