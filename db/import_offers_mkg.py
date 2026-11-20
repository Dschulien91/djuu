"""Import family dates of the Museum für Kunst und Gewerbe Hamburg (MKG) from its public event calendar.

Source: https://www.mkg-hamburg.de/veranstaltungen with the site's own facet 'Kinder & Familie'
(filter[event_filter][0]); pages of 12 via &start=. Each event page is read once for age and price
(teaser text is not stored, it may name workshop leaders).
robots.txt: only Drupal system paths and /search are disallowed.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'mkg'
BASE = 'https://www.mkg-hamburg.de'
LIST = BASE + '/veranstaltungen?filter%5Bevent_filter%5D%5B0%5D=Kinder%20%26%20Familie'
PROVIDER = 'Museum für Kunst und Gewerbe Hamburg'
ADDRESS = 'Steintorplatz, 20099 Hamburg'
WHEN = re.compile(r'(\d{1,2})\.(\d{1,2})\.(\d\d),\s*(\d{1,2})\.(\d\d)(?:\s*[–-]\s*(\d{1,2})\.(\d\d))?\s*Uhr')


def field(html, name):
    return clean((re.search(rf'(?s)field--name-field-{name}.*?field__item[^"]*">(.*?)</div>', html) or [0, ''])[1])


def main():
    lat, lon = osm_coords('Museum für Kunst und Gewerbe Hamburg')
    offers, seen = [], set()
    for start in range(0, 120, 12):
        html = get(LIST + (f'&start={start}' if start else '')).text
        arts = re.findall(r'(?s)<article class="event-teaser">(.*?)</article>', html)
        new = 0
        for art in arts:
            href = re.search(r'href="([^"]+)"', art).group(1)
            if href in seen:
                continue
            seen.add(href)
            new += 1
            title = field(art, 'title') or clean((re.search(r'(?s)event-teaser__title[^>]*>(.*?)</h3>', art) or [0, ''])[1])
            typ = field(art, 'eventy-type')
            url = BASE + href
            page = get(url).text
            m = WHEN.search(field(page, 'datetime-range')) or WHEN.search(field(art, 'datetime-range'))
            if not (title and m) or re.search(r'ausgebucht|abgesagt', title, re.I):
                continue
            day = date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
            text = field(page, 'teaser-text')
            price, free = (None, None)
            if re.search(r'(im|mit) museumseintritt|eintritt inklusive', text, re.I):
                price, free = 'im Museumseintritt', 0
            elif re.search(r'\d+\s*(€|euro)|kostenlos|eintritt frei', text, re.I):
                price, free = price_of(re.search(r'[^.,]*(\d+\s*(€|euro)|kostenlos|eintritt frei)[^.,]*', text, re.I).group(0))
            reg = 'nötig' if re.search(r'anmeldung (erforderlich|nötig|unter)|ticket', text, re.I) else None
            offers.append(termin(href.rsplit('/', 1)[-1] + f':{day}', title, day, url, PROVIDER, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                                 time_from=f'{int(m.group(4)):02d}:{m.group(5)}', time_to=f'{int(m.group(6)):02d}:{m.group(7)}' if m.group(6) else None,
                                 price=price, free=free, age=age_of(text), registration=reg, description=typ or None))
        if not new or not re.search(rf'start={start + 12}\b', html.replace('&amp;', '&')):
            break
    return finish(SOURCE_ID, 'MKG: Kinder & Familie', BASE + '/veranstaltungen', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
