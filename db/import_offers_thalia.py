"""Import the children's and family plays of the Thalia Theater Hamburg from its own play pages.

Source: https://www.thalia-theater.de/sitemap-events.xml lists the current productions (/de/stuecke/<slug>/<id>); each play
page is server-rendered with its age recommendation ('Empfehlung ab 10 Jahren') and its date list. A play is kept when
the recommended age is under 12. Weekday performances before 13:30 are school shows and left out, as are rows
marked sold out. Facts only: title, date, time, venue, age, price as published, link to the play page.

robots.txt: '*' must not read /de/api/ and any URL with '?'; the sitemap and play pages are allowed (no query used).
Terms: imprint says 'Sämtliche Inhalte und Fotos unterliegen dem Urheberrecht und dürfen nicht ohne vorherige Genehmigung
kopiert und anderweitig genutzt werden' -> only facts are kept; Julian asks.
"""
import re
import sys
from datetime import date

from offers_util import clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'thalia_theater'
BASE = 'https://www.thalia-theater.de'
PROVIDER = 'Thalia Theater'
VENUES = {  # venue name on the site -> address, OSM names, fallback coordinates
    'Thalia Theater': ('Alstertor 1, 20095 Hamburg', ('Thalia Theater',), (53.552142, 9.998654)),
    'Thalia Gaußstraße': ('Gaußstraße 190, 22765 Hamburg', ('Thalia in der Gaußstraße', 'Thalia Gaußstraße'), (None, None)),
}
GROUP = re.compile(r'event-group__date.*?<strong[^>]*>\w+</strong>\s*<span[^>]*>(\d{1,2})\.(\d{1,2})\.(\d{2})</span>(.*?)(?=event-group__date|\Z)', re.S)
ITEM = re.compile(r'event-item__time[^>]*>.*?<span[^>]*>\s*(\d{1,2})\.(\d\d)[^<]*</span>\s*<span[^>]*>\s*([^<]*?)\s*</span>'
                  r'(.*?)(?=event-item__time|\Z)', re.S)


def main():
    coords = {}
    for name, (_, osm, fallback) in VENUES.items():
        lat, lon = osm_coords(*osm)
        coords[name] = (lat, lon) if lat is not None else fallback
    urls = sorted(set(re.findall(r'<loc>(https://www\.thalia-theater\.de/de/stuecke/[^<]+)</loc>', get(BASE + '/sitemap-events.xml').text)))
    offers = []
    for url in urls:
        html = get(url).text
        age = re.search(r'Empfehlung ab (\d{1,2}) Jahre', clean(html[:html.find('id="production-events"')]))
        if not age or int(age.group(1)) >= 12:  # 12+ is youth theatre
            continue
        years = int(age.group(1))
        title = clean((re.search(r'(?s)<title>(.*?)</title>', html) or [0, ''])[1]).replace('Thalia Theater - ', '') or url.rsplit('/', 2)[-2]
        events = html[html.find('id="production-events"'):]
        for dd, mm, yy, block in GROUP.findall(events):
            day = date(2000 + int(yy), int(mm), int(dd))
            for hh, mi, venue, rest in ITEM.findall(block):
                tm = f'{int(hh):02d}:{mi}'
                status = (re.search(r'title="([^"]*)"', rest) or [0, ''])[1]
                if re.search(r'ausverkauft|abgesagt|entfällt', status, re.I):
                    continue
                if day.weekday() < 5 and tm < '13:30':  # school shows
                    continue
                price = re.search(r'event-item__price-info[^>]*>.*?<span[^>]*>\s*([^<]+?)\s*</span>', rest, re.S)
                price, free = price_of(price.group(1).split('/')[0]) if price else (None, None)
                venue = clean(venue)
                addr, _, _ = VENUES.get(venue, (None, None, None))
                lat, lon = coords.get(venue, (None, None))
                offers.append(termin(f'{url.rsplit("/", 1)[-1]}:{day}:{tm}', title, day, url, PROVIDER, venue=venue or PROVIDER, address=addr,
                                     lat=lat, lon=lon, time_from=tm, age=(years * 12, None), price=price, free=free,
                                     registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Thalia Theater: Kinder- und Familienstücke', BASE + '/de/stuecke', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
