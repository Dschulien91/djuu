"""Import family dates of the Museum der Natur Hamburg (Leibniz-Institut LIB: Zoologie, Mineralogie, Geologie-Paläontologie).

Source: https://hamburg.leibniz-lib.de/de/veranstaltungen.html (museumdernatur.hamburg redirects here; the short
domain answered 503). The list cards carry target-group tags; kept are cards tagged 'Für Familien' or 'Für Kinder'.
Each event page is read once for place, age group and price (key/value list); no texts are stored.
robots.txt: only /typo3/, '?id=' URLs and /fileadmin/user_upload/ are disallowed.
"""
import re
import sys
from datetime import datetime

from offers_util import MONTHS, age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'museumdernatur'
BASE = 'https://hamburg.leibniz-lib.de'
PAGE = BASE + '/de/veranstaltungen.html'
PROVIDER = 'Museum der Natur Hamburg'
VENUES = {  # place word on the card -> venue, address, OSM name
    'Zoologie': ('Museum der Natur Hamburg – Zoologie', 'Bundesstraße 52, 20146 Hamburg', 'Zoologisches Museum'),
    'Mineralogie': ('Museum der Natur Hamburg – Mineralogie', 'Grindelallee 48, 20146 Hamburg', 'Mineralogisches Museum'),
    'Geologie': ('Museum der Natur Hamburg – Geologie-Paläontologie', 'Bundesstraße 55, 20146 Hamburg', 'Geologisch-Paläontologisches Museum'),
}


def keyvals(html):
    out = {}
    for k, v in re.findall(r'(?s)e-list__item-keyword">.*?<p>(.*?)</p>.*?e-list__item-text">(.*?)</li>', html):
        out[clean(k)] = clean(re.sub(r'(?i)<br\s*/?>', ', ', re.sub(r'(?s)<a .*?</a>', '', v)))
    return out


def main():
    html = get(PAGE).text
    offers = []
    for m in re.finditer(r'(?s)data-categories="([^"]*)"\s*data-publication-date="([^"]*)".*?date-location">(.*?)</p>.*?href="([^"]+)"[^>]*>(.*?)</a>', html):
        cats, when, place, href, title = m.group(1), m.group(2), clean(m.group(3)), m.group(4), clean(m.group(5))
        if not re.search(r'FuerFamilien|FuerKinder|Kinderprogramm', cats):
            continue
        start = datetime.strptime(when, '%Y-%m-%d %H:%M:%S')
        url = BASE + href if href.startswith('/') else href
        kv = keyvals(get(url).text)
        key = next((k for k in VENUES if k in place), None)
        venue, address, osm = VENUES.get(key, (None, None, None))
        lat, lon = osm_coords(osm) if osm else (None, None)
        ort = kv.get('Ort', '')
        if not key and re.search(r'\b\d{5}\b', ort):  # external venue with full address
            parts = [x.strip() for x in ort.split(',') if x.strip()]
            venue, address = parts[0], ', '.join(parts[1:3])
            lat, lon = osm_coords(venue)
        if re.search(r'\d\s*,?-?\s*(EUR|€)', kv.get('Preis', '')):  # paid entry; later 'Kinder ... kostenfrei' must not win
            price, free = kv['Preis'][:40].rstrip(' ,'), 0
        else:
            price, free = price_of(kv['Preis']) if kv.get('Preis') else (('kostenlos', 1) if 'Kostenlos' in cats else (None, None))
        span = re.match(r'(\d{1,2})\.\s*bis\s*(\d{1,2})\.\s*(\w+)\s+(\d{4})', kv.get('Termin', ''))
        end = start.date().replace(day=int(span.group(2))) if span and MONTHS.get(span.group(3).lower()) == start.month else None
        age = age_of(kv.get('Zielgruppe', '') + ' ' + title)
        offers.append(termin(f'{href.rsplit("/", 1)[-1].replace(".html", "")}:{start.date()}', title, start.date(), url, PROVIDER,
                             venue=venue or PROVIDER, address=address, lat=lat, lon=lon,
                             time_from=start.strftime('%H:%M') if start.hour else None, price=price, free=free, age=age,
                             end=end, description=kv.get('Art') or None))
    return finish(SOURCE_ID, 'Museum der Natur Hamburg: Kinder & Familien', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
