"""Import the family theatre dates of Komödie Winterhuder Fährhaus from its public 'Familientheater' schedule.

robots.txt only blocks the CMS backend, imprint has no reuse restriction. Only facts are stored: title, date, time, link.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

import requests

from offers_util import MONTHS, clean, finish, get, osm_coords, termin

SOURCE_ID = 'komoedie_winterhude'
BASE = 'https://komoedie-hamburg.de'
PAGE = BASE + '/spielplan-familientheater'
PROVIDER = 'Komödie Winterhuder Fährhaus'
ADDRESS = 'Hudtwalckerstraße 13, 22299 Hamburg'
ROW = re.compile(r'(\d{1,2}) \w+ (' + '|'.join(m.title() for m in MONTHS) + r') (\d{4}) Familientheater (\d\d:\d\d) (.+?) Tickets')


def main():
    lat, lon = osm_coords('Komödie Winterhuder Fährhaus', 'Winterhuder Fährhaus')
    offers, page = [], 1
    while page <= 12:
        try:
            html = get(PAGE + (f'?page={page}' if page > 1 else '')).text
        except (requests.HTTPError, PermissionError):
            break
        rows = ROW.findall(clean(html))
        if not rows:
            break
        links = dict((clean(t), h) for h, t in re.findall(r'href="(/familientheater/([\w-]+))"', html) and [])
        href = re.search(r'href="(/familientheater/[\w-]+)"', html)
        for dd, mon, yy, tm, title in rows:
            day = date(int(yy), MONTHS[mon.lower()], int(dd))
            offers.append(termin(f'{title[:50]}:{day}:{tm}', title, day, urljoin(BASE, href.group(1)) if href else PAGE, PROVIDER, venue=PROVIDER,
                                 address=ADDRESS, lat=lat, lon=lon, time_from=tm, topic='theater', registration='nötig'))
        if f'page={page + 1}' not in html:
            break
        page += 1
    return finish(SOURCE_ID, 'Komödie Winterhuder Fährhaus: Familientheater', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
