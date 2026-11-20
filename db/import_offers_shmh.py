"""Import family dates of the Stiftung Historische Museen Hamburg (SHMH) from its public programme calendar.

Source: https://www.shmh.de/programm/ (one page with all teasers; each teaser carries audience classes).
Kept: teasers tagged 'audience-kinder-familien' (Altonaer Museum, Museum der Arbeit, Museum für Hamburgische
Geschichte, Jenisch Haus, Deutsches Hafenmuseum, Kultur Kontor Hamburg). Each event page is read once for age,
price, registration and meeting point; no texts are stored.
robots.txt: only /wp/wp-admin/ disallowed. Terms: no reuse clause found in the imprint.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'shmh'
BASE = 'https://www.shmh.de'
PAGE = BASE + '/programm/'
PROVIDER = 'Stiftung Historische Museen Hamburg'
VENUES = {  # meta-title on the teaser -> address, OSM names
    'Altonaer Museum': ('Museumstraße 23, 22765 Hamburg', ['Altonaer Museum']),
    'Museum der Arbeit': ('Wiesendamm 3, 22305 Hamburg', ['Museum der Arbeit']),
    'Museum für Hamburgische Geschichte': ('Holstenwall 24, 20355 Hamburg', ['Museum für Hamburgische Geschichte']),
    'Jenisch Haus': ('Baron-Voght-Straße 50, 22609 Hamburg', ['Jenisch Haus Stiftung Historisches Museum Hamburg', 'Jenisch Haus']),
    'Deutsches Hafenmuseum': ('Australiastraße, Schuppen 50A, 20457 Hamburg', ['Deutsches Hafenmuseum']),
    'Kultur Kontor Hamburg': ('Klosterwall 2-8, 20095 Hamburg', ['Kultur Kontor Hamburg', 'Kultur Kontor']),
    'Speicherstadtmuseum': ('Am Sandtorkai 36, 20457 Hamburg', ['Speicherstadtmuseum']),
}


def details(url, cache):
    """Age, price and registration from an event page (cached per series, i.e. URL without the date part)."""
    key = url.rstrip('/').rsplit('/', 1)[0]
    if key not in cache:
        try:
            h = get(url).text
        except Exception as e:  # one broken page must not stop the import
            print('  skip details', url, e)
            h = ''
        intro = clean((re.search(r'(?s)class="event-intro-text">(.*?)</div>', h) or [0, ''])[1])
        price = clean((re.search(r'(?s)class="event-price">(.*?)</li>', h) or [0, ''])[1]).replace('Kosten:', '').strip()
        reg = None
        if re.search(r'(ohne|keine) anmeldung|anmeldung (ist )?nicht nötig|anmeldung nicht erforderlich', intro, re.I):
            reg = 'offen'
        elif re.search(r'anmeldung|ticket', intro, re.I):
            reg = 'nötig'
        cache[key] = (age_of(intro), price, reg)
    return cache[key]


def main():
    html = get(PAGE).text
    coords, cache, offers = {}, {}, []
    for block in re.split(r'<div class="post-teaser event ', html)[1:]:
        cls = block[:block.find('"')]
        if 'audience-kinder-familien' not in cls:
            continue
        a = re.search(r'(?s)<a\s+href="([^"]+)"[^>]*>(.*?)</a>', block)
        d = re.search(r'event-sub-sub-title">\s*(\d\d)\.(\d\d)\.(\d{4})\s*(\d\d:\d\d)?(?:\s*-\s*(\d\d:\d\d))?', block)
        if not (a and d):
            continue
        inner = a.group(2)
        meta = clean((re.search(r'(?s)<span class="meta-title">(.*?)</span>', inner) or [0, ''])[1])
        sub = clean((re.search(r'(?s)<span\s+class="sub-title">(.*?)</span>', inner) or [0, ''])[1])
        title = clean(re.sub(r'(?s)<span.*?</span>', ' ', inner))
        if sub and len(sub) <= 60 and sub.lower() not in title.lower():
            title = f'{title}: {sub}'
        if re.search(r'ausgebucht|abgesagt|schulklasse', title, re.I):
            continue
        day = date(int(d.group(3)), int(d.group(2)), int(d.group(1)))
        if day < date.today():
            continue
        url = a.group(1)
        cat = clean((re.search(r'(?s)event-category">(.*?)<', block) or [0, ''])[1])
        age, price_txt, reg = details(url, cache)
        price, free = price_of(price_txt) if price_txt else (None, None)
        address, names = VENUES.get(meta, (None, [meta]))
        if meta not in coords:
            coords[meta] = osm_coords(*names)
        lat, lon = coords[meta]
        ref = re.sub(r'^https?://[^/]+/veranstaltungen/', '', url).strip('/')
        offers.append(termin(ref, title, day, url, PROVIDER, venue=meta or PROVIDER, address=address, lat=lat, lon=lon,
                             time_from=d.group(4), time_to=d.group(5), price=price, free=free, age=age, registration=reg,
                             description=cat or None))
    return finish(SOURCE_ID, 'SHMH: Programm für Kinder & Familien', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
