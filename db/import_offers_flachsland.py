"""Import the children's and family performances of Flachsland – Hamburger Puppentheater (Barmbek) from its own schedule.

Source: https://hamburgerpuppentheater.de/home/programm/spielplan/ (server-rendered, the whole season on one page).
Kept: rows of the theatre's type 'Kinderprogramm' (age tags such as '4-10 Jahre'); adult evenings are left out, and so
are weekday performances before 13:30 (booked by Kitas and schools) and rows marked 'ausverkauft' or 'Entfällt'.
Facts only: title, guest company, date, time, age, link.

robots.txt: '*' may read everything except the privacy page. Terms: imprint has no reuse clause found.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import MONTHS_SHORT, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'hamburger_puppentheater'
BASE = 'https://hamburgerpuppentheater.de/'
PAGE = BASE + 'home/programm/spielplan/'
PROVIDER = 'Flachsland – Hamburger Puppentheater'
VENUE = 'Hamburger Puppentheater im Haus Flachsland'
ADDRESS = 'Bramfelder Straße 9, 22305 Hamburg'


def main():
    lat, lon = osm_coords('Hamburger Puppentheater')
    today = date.today()
    offers = []
    for block in re.split(r'<div class="grid grid--1 Termin--Typ ', get(PAGE).text)[1:]:
        if not block.startswith('Termin--Typ--Kinderprogramm'):
            continue
        dm = re.search(r'class="kurz">\s*(\d{1,2})\.\s*([a-zä]{3})', block)
        times = re.findall(r'(\d{1,2}):(\d\d)', (re.search(r'(?s)class="Termin--Zeit">(.*?)</p>', block) or [0, ''])[1])
        title = re.search(r'(?s)class="Termin--Titel"><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block)
        if not (dm and times and title) or dm.group(2) not in MONTHS_SHORT:
            continue
        extra = clean((re.search(r'(?s)class="Termin--Extrainfo">(.*?)</p>', block) or [0, ''])[1])
        if re.search(r'ausverkauft|entfällt|abgesagt', extra, re.I):
            continue
        company = clean((re.search(r'(?s)class="Termin--Buehne">(.*?)</p>', block) or [0, ''])[1])
        tags = [clean(t) for t in re.findall(r'(?s)<button[^>]*>(.*?)</button>', block)]
        month, dd = MONTHS_SHORT[dm.group(2)], int(dm.group(1))
        year = today.year if month >= today.month else today.year + 1  # one season, listed from today on
        day = date(year, month, dd)
        name = clean(title.group(2)) + (f' ({company})' if company else '')
        url = urljoin(BASE, title.group(1))
        piece = (re.search(r'stueck=(\d+)', url) or [0, clean(title.group(2))])[1]
        for hh, mi in times:
            tm = f'{int(hh):02d}:{mi}'
            if day.weekday() < 5 and tm < '13:30':  # Kita and school performances
                continue
            offers.append(termin(f'{piece}:{day}:{tm}', name, day, url, PROVIDER, venue=VENUE, address=ADDRESS,
                                 lat=lat, lon=lon, time_from=tm, age=age_of(' '.join(tags)), registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Flachsland – Hamburger Puppentheater: Kinderprogramm', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
