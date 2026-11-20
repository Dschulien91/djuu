"""Import the puppet theatre performances of Theater-Fabrik (touring theatre tents in Hamburg: Bergedorf, Eimsbüttel, Barmbek ...).

Source: the theatre's own schedule page theater-fabrik.com/spielplan/, whose list 'Aktuelles Programm' gives every coming
performance as play link, date ('20 Nov 2026'), time and tent location ('Hamburg-Bergedorf, Theaterzelt Frascatiplatz,
Neuer Weg 64'). The age comes from each play page ('ab 2 Jahren'). The site's Events Calendar REST API is empty, so the
HTML list is read. Facts only: play, date, time, tent, age, link to the play page.

robots.txt: '*' may read everything (Yoast default).
"""
import re
import sys
from datetime import date

import requests

from offers_util import MONTHS_SHORT, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'theater_fabrik'
BASE = 'https://theater-fabrik.com'
PAGE = BASE + '/spielplan/'
PROVIDER = 'Theater-Fabrik (Figurentheater)'
ITEM = re.compile(r'(?s)class="event-item.*?<div class="title"><a href="([^"]+)">(.*?)</a>.*?class="date">(.*?)<br\s*/?>(.*?)</div>.*?class="location">(.*?)</div>')
TENTS = {  # known tent places: name part -> venue, address, coordinates (fallback when OSM has no match)
    'Frascatiplatz': ('Theaterzelt Frascatiplatz (Bergedorf)', 'Neuer Weg 64, 21029 Hamburg', (53.483973, 10.211477)),
    'Julius-Vosseler': ('Theaterzelt Eimsbüttel', 'Julius-Vosseler-Straße 98, 22527 Hamburg', (53.591125, 9.94852)),
    'Hamburger Meile': ('Theaterzelt an der Hamburger Meile (Barmbek)', 'Hamburger Straße 123, 22083 Hamburg', (None, None)),
}


def place(loc):
    for key, (venue, address, coords) in TENTS.items():
        if key in loc:
            return venue, address, coords
    parts = [p.strip() for p in loc.split(',')]
    district = parts[0].replace('Hamburg-', '') if parts else ''
    street = parts[-1] if len(parts) > 1 else ''
    return f'Theaterzelt {district}'.strip(), (f'{street}, Hamburg' if street else None), (None, None)


def main():
    html = get(PAGE).text
    offers, ages = [], {}
    for href, title, day_s, time_s, loc in ITEM.findall(html):
        title, loc = re.sub(r'^NEU:\s*', '', clean(title)), clean(loc)
        d = re.match(r'(\d{1,2})\s+([A-Za-zäÄ]{3})\w*\s+(\d{4})', clean(day_s))
        tm = re.search(r'(\d{1,2}):(\d\d)', time_s)
        if not d or d.group(2).lower()[:3] not in MONTHS_SHORT:
            continue
        day = date(int(d.group(3)), MONTHS_SHORT[d.group(2).lower()[:3]], int(d.group(1)))
        if href not in ages:
            try:
                page = get(href).text
                ages[href] = age_of(clean(page[page.find('<main') if '<main' in page else 0:])[:8000])
            except (requests.RequestException, PermissionError, RuntimeError) as e:
                print(f'  no play page {href}: {e}')
                ages[href] = (None, None)
        venue, address, (flat, flon) = place(loc)
        lat, lon = osm_coords(venue) if flat is None else (None, None)
        t = f'{int(tm.group(1)):02d}:{tm.group(2)}' if tm else None
        offers.append(termin(f'{href.rstrip("/").rsplit("/", 1)[1]}:{day}T{t}', title, day, href, PROVIDER, venue=venue, address=address,
                             lat=lat or flat, lon=lon or flon, time_from=t, age=ages[href], registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Theater-Fabrik: Figurentheater im Theaterzelt', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
