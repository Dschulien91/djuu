"""Tags per place for the app's sub-categories (v0.7 navigation: Service / Erleben).

A tag is a short id the app shows as a chip inside a sub-category, e.g. 'vegan' in Gastro or 'natur' in Entdecken.
Tags come from the Djuu category, the raw OSM tags of all linked OSM records and the merged facts.
'drinnen' / 'draussen' feed the indoor/outdoor switch; a place can carry both (café with terrace).
Also decides which places are dropped completely (adult venues, gambling, nameless viewpoints).
"""
import re

ADULT = re.compile(r'erotik|erotic|\bsex(?!ual)|sexy|stripclub|striptease|strip ?bar|table ?dance|bordell|laufhaus|swinger|peep|'
                   r'fetisch|beate uhse|nachtclub|night ?club|spielhalle|spielothek|\bcasino|wettbüro|sportwetten|gay-kino', re.I)
SHISHA = re.compile(r'shisha|hookah', re.I)
KIDS_OK = re.compile(r'jump|trampolin|kinder|kids|family|familie', re.I)
ADULT_OSM = {('amenity', 'stripclub'), ('amenity', 'brothel'), ('amenity', 'nightclub'), ('amenity', 'casino'),
             ('amenity', 'gambling'), ('shop', 'erotic'), ('leisure', 'adult_gaming_centre'), ('leisure', 'amusement_arcade')}
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
        if gear and re.search(r'water|splash|pump|archimedes', ','.join(gear)) or re.search(r'wasserspiel', n): t.add('wasserspiel')
    if cat == 'abenteuer': t.add('abenteuer')
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
        if re.search(r'(kinder|familien|spiel|eltern)[- ]?(caf|kaff)', n) or _yes(facts.get('kids_area')): t.add('kindercafe')
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
    if cat == 'hundeauslauf': t.add('hundeauslauf')
    if cat == 'baden': t.add('baden')
    if cat in ('museum', 'kultur', 'buecherei'): t.add('kultur')
    if cat == 'museum': t.add('museum')
    if cat == 'kultur' and re.search(r'theatre|cinema', g('amenity') or '') or re.search(r'theater|kino|bühne|puppen', n) and cat == 'kultur': t.add('theater')
    if cat == 'buecherei': t.add('buecherei')
    if g('tourism') in ('zoo', 'aquarium') or g('landuse') == 'farmyard' or re.search(r'tierpark|wildpark|zoo|hagenbeck|bauernhof|kinderbauernhof|aquarium|streichelzoo', n): t.add('tiere')
    if g('tourism') == 'viewpoint' or re.search(r'aussicht|turm\b', n): t.add('aussicht')
    if cat == 'ausflug' and not t & {'tiere', 'aussicht'}: t.add('ausflugsziel')
    # --- Service: Notfall & Gesundheit, Sanitär, Läden, Familie & Beratung, Mobilität
    if cat in ('kinderarzt', 'apotheke', 'klinik', 'hebamme', 'geburtshaus', 'babyklappe', 'wc', 'trinkwasser', 'kita',
               'beratung', 'aufzug', 'bahnhof'): t.add(cat)
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


OUT_CATS = {'spielplatz', 'abenteuer', 'park', 'picknick', 'grillplatz', 'hundeauslauf', 'trinkwasser', 'ausflug'}
IN_CATS = {'indoor', 'spielhaus', 'museum', 'kultur', 'buecherei', 'cafe', 'restaurant', 'kurs', 'treffpunkt'}


def io_tags(cat, n, raw, facts):
    g = raw.get
    if cat == 'spielplatz' and _yes(facts.get('indoor')): return {'drinnen'}
    if cat == 'ausflug' and g('tourism') in ('aquarium', 'planetarium') or g('amenity') == 'planetarium': return {'drinnen'}
    if cat in OUT_CATS: return {'draussen'}
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
