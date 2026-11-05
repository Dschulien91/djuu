"""Import the weekly children's programme of Honigfabrik Wilhelmsburg (KinderKultur) from its public week overview.

robots.txt allows the page and sets a crawl delay, which polite_fetch honours. The imprint limits copying outside copyright
law, so only facts are stored: activity, weekday, time, age. Group names are the house's own labels.
"""
import re
import sys

from offers_util import WEEKDAYS, age_of, clean, finish, get, group, osm_coords

SOURCE_ID = 'honigfabrik_kinderkultur'
BASE = 'https://jim.honigfabrik.de'
PAGE = BASE + '/kinderkultur/'
PROVIDER = 'Honigfabrik Wilhelmsburg'
ADDRESS = 'Industriestraße 125-131, 21107 Hamburg'
DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
ROW = re.compile(r'([A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 |+&.*-]{3,}?)\s*\*?\s*(\d{1,2}):(\d\d)-(\d{1,2}):(\d\d) Uhr(?:\s*[^|A-Z]*\|?\s*(ab \d+ Jahren?))?')


def main():
    lat, lon = osm_coords('Honigfabrik', 'Honigfabrik Wilhelmsburg')
    text = clean(get(PAGE).text)
    m = re.search(r'Wochenübersicht(.*?)Neues aus der KinderKultur', text)
    if not m:
        sys.exit(f'{SOURCE_ID}: week overview not found; keeping existing data')
    parts = re.split(r'\b(' + '|'.join(DAYS) + r')\b', m.group(1))
    offers = []
    for day, chunk in zip(parts[1::2], parts[2::2]):
        wd = DAYS.index(day)
        for title, h1, m1, h2, m2, age in ROW.findall(chunk):
            title = re.sub(r'\s*(OFFENER BEREICH|\d\.OG)\s*', ' ', title).strip(' |*')
            if not title or title == 'QUEER':
                continue
            tf, tt = f'{int(h1):02d}:{m1}', f'{int(h2):02d}:{m2}'
            offers.append(group(f'{wd}:{tf}:{title[:30]}', title.title(), PAGE, PROVIDER, weekday=wd, time_from=tf, time_to=tt, venue=PROVIDER, address=ADDRESS,
                                lat=lat, lon=lon, schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich', free=1, price='kostenlos', age=age_of(age) if age else (None, None)))
    return finish(SOURCE_ID, 'Honigfabrik Wilhelmsburg: KinderKultur', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
