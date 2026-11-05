"""Import children's film screenings of zeise kinos from the public daily programme pages.

robots.txt allows the programme. The disclaimer only limits copying outside copyright law, so only facts are stored:
film title, date, time and link. A screening counts when the cinema itself labels the film 'Kinderfilm'.
"""
import re
import sys
from datetime import date, timedelta
from urllib.parse import urljoin

import requests

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'zeise_kinderkino'
BASE = 'https://www.zeise.de'
PROVIDER = 'zeise kinos'
ADDRESS = 'Friedensallee 7-9, 22765 Hamburg'
DAYS_AHEAD = 21


def main():
    lat, lon = osm_coords('zeise kinos')
    offers, today = [], date.today()
    for i in range(DAYS_AHEAD):
        day = today + timedelta(days=i)
        try:
            html = get(f'{BASE}/tagesprogramm/{day}').text
        except requests.HTTPError:
            continue
        for block in re.split(r'class="tagesprogramm detailed clearfix"', html)[1:]:
            genre = clean((re.search(r'(?s)field--name-genre[^>]*>(.*?)</div>', block) or [0, ''])[1])
            if 'kinderfilm' not in genre.lower():
                continue
            a = re.search(r'(?s)<h2[^>]*><a href="(/film/\d+)"[^>]*>(.*?)</a>', block)
            times = re.findall(r'href="/show/(\d+)/booking">.*?field--name-start[^>]*>(\d\d:\d\d)<', block, re.S)
            if not a:
                continue
            for show, tm in times:
                offers.append(termin(f'{show}', clean(a.group(2)), day, urljoin(BASE, a.group(1)), PROVIDER, venue=PROVIDER, address=ADDRESS,
                                     lat=lat, lon=lon, time_from=tm, topic='theater'))
    return finish(SOURCE_ID, 'zeise kinos: Kinderfilme', BASE + '/kinderprogramm', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
