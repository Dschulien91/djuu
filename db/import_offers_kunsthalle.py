"""Import family and children's dates of the Hamburger Kunsthalle from its public calendar.

robots.txt allows the calendar pages. The imprint only limits copying outside copyright law, so no page is kept:
only title, date, time, age and link. Fully booked dates are dropped.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import FAMILY, age_of, clean, finish, fold_weekly, get, osm_coords, termin

SOURCE_ID = 'hamburger_kunsthalle'
BASE = 'https://www.hamburger-kunsthalle.de'
PROVIDER = 'Hamburger Kunsthalle'
ADDRESS = 'Glockengießerwall 5, 20095 Hamburg'
EXTRA = re.compile(r'kinderkunst|kinder kunst|familienzeit|vater\*mutter', re.I)
MAX_PAGES = 25


def main():
    lat, lon = osm_coords('Hamburger Kunsthalle', 'Kunsthalle')
    offers = []
    for page in range(MAX_PAGES):
        html = get(f'{BASE}/de/kalender' + (f'?page={page}' if page else '')).text
        rows = re.findall(r'(?s)hkhTermin hkhTerminZeile">(.*?)hkhTerminBild', html)
        if not rows:
            break
        for r in rows:
            d = re.search(r'datetime="(\d{4})-(\d\d)-(\d\d)', r)
            a = re.search(r'href="(/de/termin/[^"]+)"[^>]*>(.*?)</a>', r, re.S)
            if not (d and a):
                continue
            title = clean(a.group(2))
            sub = clean((re.search(r'(?s)subTitle vier">(.*)', r) or [None, ''])[1])
            if not (FAMILY.search(title + ' ' + sub) or EXTRA.search(title)) or re.search(r'ausgebucht', title, re.I):
                continue
            day = date(int(d.group(1)), int(d.group(2)), int(d.group(3)))
            tm = re.search(r'datumTime">\s*(\d\d:\d\d)', r)
            offers.append(termin(f'{re.sub(r"-[0-9]+$", "", a.group(1).rsplit("/", 1)[-1])}:{day}', title.title() if title.isupper() else title, day, urljoin(BASE, a.group(1)),
                                 PROVIDER, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon, time_from=tm.group(1) if tm else None,
                                 age=age_of(title + ' ' + sub), registration='nötig' if 'kurs' in title.lower() else None, description=sub[:150]))
        if not re.search(r'href="\?page=\d+"[^>]*rel="next"', html):
            break
    return finish(SOURCE_ID, 'Hamburger Kunsthalle: Familien, Kinder, Jugendliche', BASE + '/de/familien-kinder-jugendliche', PROVIDER, fold_weekly(offers))


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
