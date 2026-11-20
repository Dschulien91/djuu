"""Tags per place for the app's sub-categories (v0.7 navigation: Service / Erleben).

A tag is a short id the app shows as a chip inside a sub-category, e.g. 'vegan' in Gastro or 'natur' in Entdecken.
Tags come from the Djuu category, the raw OSM tags of all linked OSM records and the merged facts.
'drinnen' / 'draussen' feed the indoor/outdoor switch; a place can carry both (café with terrace).
Also decides which places are dropped completely (adult venues, gambling, nameless viewpoints).
"""
import re

ADULT = re.compile(r'erotik|erotic|\bsex(?!ual)|sexy|stripclub|striptease|strip ?bar|table ?dance|bordell|laufhaus|swinger|peep|'
                   r'fetisch|beate uhse|nachtclub|night ?club|spielhalle|spielothek|\bcasino(?! oberalster)|wettbüro|sportwetten|gay-kino', re.I)
SHISHA = re.compile(r'shisha|hookah', re.I)
KIDS_OK = re.compile(r'jump|trampolin|kinder|kids|family|familie', re.I)
ADULT_OSM = {('amenity', 'stripclub'), ('amenity', 'brothel'), ('amenity', 'nightclub'), ('amenity', 'casino'),
             ('amenity', 'gambling'), ('shop', 'erotic'), ('leisure', 'adult_gaming_centre'), ('leisure', 'amusement_arcade')}
# Hof places that are only shops (vegetables, fruit, asparagus ...), not farms where children meet animals.
FARM_SHOP = re.compile(r'hofladen|gemüse|gemuese|obst|spargel|erdbeer|kirsch|kürbis|gärtnerei|gaertnerei|gärtnerhof|foodcoop|minimarkt|'
                       r'markt\b|feldkiosk|kiste|\bbio\b|priobio|spezerei|ackerperle|bestes vom|inselobstbau|seehof', re.I)
FARM_ANIMALS = re.compile(r'^gut |tier|bauernhof|bauernof|ziege|pony|gehege|kinderhof|streichel|schaf|esel|alpaka', re.I)
# Real Kindercafés by name (the play-corner data stays the 'Spielecke' filter of the app)
KINDERCAFE = re.compile(r'(kinder|familien|spiel|eltern|baby)[- ]?e?[- ]?(caf|kaff)|kinderkaffee|spielecafé|spielecafe', re.I)
# Indoor sports by name (club or hall); everything else at a sports ground is outside
INDOOR_SPORT = re.compile(r'halle|hall\b|turn(er|verein|zentrum|schule)?\b|judo|ju-?jutsu|karate|taekwondo|kung ?fu|budo|kampfsport|box|fecht|'
                          r'tanz|dance|ballett|gymnasti|kletter|boulder|schwimm|squash|badminton|bowling|kegel|fitness|yoga|sportzentrum|'
                          r'leistungszentrum|kickbox|aikido|capoeira|trampolin|sportschule|tischtennis', re.I)
OUTDOOR_INDOOR_CAT = re.compile(r'kletterwald|hochseil|seilgarten|trabrenn|rennbahn|outdoor|waldseilpark', re.I)
BIG_KIDS = re.compile(r'\bvr\b|virtual|laser ?tag|tower tag|escape|paintball|bowling|kart|arcade|gamestation|flashh', re.I)


def drop(cat, name, raw):
    """True if the place must not appear in a family app at all."""
    if name and ADULT.search(name): return True
    if name and SHISHA.search(name) and cat != 'windeln': return True  # kiosks that also sell shisha stay (diapers at night)
    if any(raw.get(k) == v for k, v in ADULT_OSM) and not (raw.get('leisure') == 'amusement_arcade' and KIDS_OK.search(name or '')): return True
    if cat == 'ausflug' and not name: return True  # nameless viewpoints / attractions carry no value
    return False


def _yes(v): return (v or '').lower() in ('yes', 'only', 'designated')


def place_tags(cat, name, raw, facts, gear):
    """Tag ids for one place. raw = merged raw OSM tags, facts = {key: value}, gear = set of playground devices."""
    n = (name or '').lower()
    g = raw.get
    cuisine = (g('cuisine') or facts.get('cuisine') or '').lower()
    t = set()
    # --- Spielen & Toben
    if cat == 'spielplatz':
        t.add('spielplatz')
        if gear and re.search(r'water|splash|pump|archimedes', ','.join(gear)) or re.search(r'wasserspiel', n) or _yes(facts.get('water_play')): t.add('wasserspiel')
        # 'grosser_spielplatz': 8 or more play devices (OSM devices or the Bezirk register, export.py)
        if int(facts.get('device_count') or 0) >= 8: t.add('grosser_spielplatz')
    if cat == 'abenteuer': t.add('abenteuer')
    if cat in ('spielstrasse', 'bolzplatz', 'wochenmarkt', 'schule', 'tischtennis', 'sportstaette', 'sportverein', 'reiten', 'rodeln', 'brunnen', 'buecherschrank', 'faehre', 'bootsverleih', 'camping',
               'physio', 'therapie', 'zahnarzt', 'frauenarzt', 'hno', 'augenarzt', 'kinderpsychologie', 'jugend', 'pfadfinder', 'nachhilfe', 'musikschule', 'tanzschule', 'sprachschule', 'kreativschule'): t.add(cat)
    if cat in ('garten', 'naturschutz', 'tierhof', 'bootsverleih', 'camping'): t.add('natur')
    if cat == 'tierhof' and FARM_ANIMALS.search(n) and not FARM_SHOP.search(n): t.add('tiere')  # farm shops are no animal outing
    if cat == 'spielhaus': t.add('spielhaus')
    if cat == 'indoor':
        if re.search(r'climb|boulder', g('sport') or '') or re.search(r'boulder|kletter|apes|bloc', n): t.add('klettern')
        elif re.search(r'trampolin', g('sport') or '') or g('leisure') == 'trampoline_park' or re.search(r'jump|trampolin|sprung', n): t.add('trampolin')
        else: t.add('indoorspielplatz')
    if cat == 'freizeit':
        typ = (facts.get('type') or '').lower()
        if g('leisure') == 'miniature_golf' or 'golf' in n: t.add('minigolf')
        elif g('leisure') == 'ice_rink' or re.search(r'eis(arena|bahn|lauf)', n): t.add('eislaufen')
        elif 'skate' in typ or 'skate' in n: t.add('skaten')
        elif 'kletter' in typ: t.add('klettern')
        else: t.add('bewegung')
    if cat in ('indoor', 'freizeit') and BIG_KIDS.search(n): t.add('groessere')
    # --- Gastro
    if cat in ('cafe', 'restaurant', 'imbiss', 'eis'):
        t.add(cat)
        # only real Kindercafés: by name or by a Djuu-Tipp that says so; a play corner alone is the app's 'Spielecke' filter
        if KINDERCAFE.search(n) or re.search(r'kindercaf|spielecaf|familiencaf', facts.get('tipp') or '', re.I): t.add('kindercafe')
        if _yes(g('diet:vegan')) or 'vegan' in n or 'vegan' in cuisine: t.add('vegan')
        if 'vegan' in t or _yes(g('diet:vegetarian')) or 'vegetari' in n: t.add('vegetarisch')
        if re.search(r'breakfast|brunch', cuisine) or re.search(r'frühstück|brunch', n): t.add('fruehstueck')
        if (g('outdoor_seating') or '').lower() not in ('', 'no'): t.add('terrasse')
        if re.search(r'pizza|italian|pasta', cuisine): t.add('italienisch')
        if re.search(r'asian|sushi|vietnam|thai|japan|chinese|korean|ramen|indian', cuisine): t.add('asiatisch')
        if re.search(r'burger|american', cuisine): t.add('burger')
        if re.search(r'cake|coffee_shop', cuisine) or re.search(r'konditor|bäckerei', n): t.add('kuchen')
    # --- Entdecken
    if cat in ('park', 'picknick', 'grillplatz', 'hundeauslauf') or g('natural') == 'beach': t.add('natur')
    if cat in ('picknick', 'grillplatz'): t.add('picknick')
    if cat == 'hundeauslauf':
        t.add('hundeauslauf')
        if facts.get('dog_offleash') == 'alle': t.add('freilauf_alle')  # §8 zone: every dog may run free (no test needed)
    if cat == 'baden': t.add('baden')
    if cat in ('museum', 'kultur', 'buecherei'): t.add('kultur')
    if cat == 'museum': t.add('museum')
    if cat == 'kultur' and re.search(r'theatre|cinema', g('amenity') or '') or re.search(r'theater|kino|bühne|puppen', n) and cat == 'kultur': t.add('theater')
    if cat == 'buecherei': t.add('buecherei')
    if (g('tourism') in ('zoo', 'aquarium') or g('landuse') == 'farmyard' and not FARM_SHOP.search(n)) or (cat in ('ausflug', 'tierhof', 'park', 'museum', 'freizeit') and re.search(r'tierpark|wildpark|zoo|zoologisch|hagenbeck(?!str)|bauernhof|kinderbauernhof|aquarium|streichelzoo', n)): t.add('tiere')
    if g('tourism') == 'viewpoint' or re.search(r'aussicht|turm\b', n): t.add('aussicht')
    if cat == 'ausflug' and not t & {'tiere', 'aussicht'}: t.add('ausflugsziel')
    # --- Service: Notfall & Gesundheit, Sanitär, Läden, Familie & Beratung, Mobilität
    if cat in ('kinderarzt', 'apotheke', 'klinik', 'hebamme', 'geburtshaus', 'babyklappe', 'wc', 'trinkwasser', 'kita',
               'beratung', 'aufzug', 'bahnhof', 'haltestelle'): t.add(cat)
    if cat == 'haltestelle' and re.search(r'(?<!\w)(U\d|S\d|A\d|R[BE]\d)', facts.get('transit') or ''): t.add('bahnhof')
    if cat == 'wc' or (cat in ('wickel', 'familienfreundlich') and _yes(facts.get('toilets'))): t.add('wc')
    if _yes(facts.get('changing_table')): t.add('wickeln')
    if facts.get('baby_feeding') and facts.get('baby_feeding') != 'no': t.add('stillen')
    if cat == 'treffpunkt': t.add('familienzentrum')
    if cat == 'kurs': t.add('elternschule')
    shop = g('shop') or ''
    if cat in ('windeln', 'laden'):
        t.add({'chemist': 'drogerie', 'supermarket': 'supermarkt', 'convenience': 'spaeti', 'kiosk': 'spaeti', 'baby_goods': 'baby',
               'clothes': 'kinderkleidung', 'toys': 'spielzeug', 'books': 'buecher', 'second_hand': 'secondhand',
               'charity': 'secondhand'}.get(shop, 'tankstelle' if g('amenity') == 'fuel' else 'laden'))
    # --- indoor / outdoor switch
    t |= io_tags(cat, n, raw, facts)
    return sorted(t)


OUT_CATS = {'tischtennis', 'reiten', 'rodeln', 'garten', 'naturschutz', 'tierhof', 'brunnen', 'buecherschrank', 'faehre', 'bootsverleih', 'camping', 'spielstrasse', 'bolzplatz', 'spielplatz', 'abenteuer', 'park', 'picknick', 'grillplatz', 'hundeauslauf', 'trinkwasser', 'ausflug'}
IN_CATS = {'indoor', 'spielhaus', 'museum', 'kultur', 'buecherei', 'cafe', 'restaurant', 'kurs', 'treffpunkt'}


def io_tags(cat, n, raw, facts):
    g = raw.get
    if cat == 'spielplatz' and _yes(facts.get('indoor')): return {'drinnen'}
    if cat == 'ausflug' and g('tourism') in ('aquarium', 'planetarium') or g('amenity') == 'planetarium': return {'drinnen'}
    if cat in OUT_CATS: return {'draussen'}
    if cat in ('sportstaette', 'sportverein'):
        # sports halls and indoor clubs vs. fields, tennis courts, water sports; so 'Drinnen' no longer lists football pitches
        if g('leisure') in ('sports_hall', 'fitness_centre') or g('building') in ('sports_hall', 'sports_centre') or INDOOR_SPORT.search(n):
            return {'drinnen'}
        return {'draussen'}
    if cat == 'indoor' and OUTDOOR_INDOOR_CAT.search(n): return {'draussen'}
    if cat == 'baden':
        if re.search(r'freibad|strandbad|badestelle|naturbad|sommerbad|see\b|strand|elbe', n) or g('leisure') in (
                'swimming_area', 'bathing_place', 'beach_resort', 'water_park') or g('natural') == 'beach':
            return {'draussen'}
        return {'drinnen'}
    if cat == 'freizeit':
        return {'drinnen'} if re.search(r'schwarzlicht|indoor|halle|arena|vr|tag|game', n) else {'draussen'}
    if cat in IN_CATS:
        out = {'drinnen'}
        if cat in ('cafe', 'restaurant') and (g('outdoor_seating') or '').lower() not in ('', 'no'): out.add('draussen')
        return out
    if cat == 'eis': return {'draussen'}
    return set()
