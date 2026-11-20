"""Import the children's cinema screenings of three Hamburg neighbourhood cinemas that share one website system:
Koralle Kino (Volksdorf), Elbe Filmtheater (Osdorf) and Blankeneser Kino.

Source: each cinema's own series page 'Kinderkino' (/reihen/kinderkino/, plus Koralle's 'Mein erstes Kinoerlebnis'),
which lists every film of the series with its upcoming screenings. Kept: all screenings there except weekday
screenings before 13:30 (school cinema). The link goes to the cinema's film page; the /show/ booking pages are disallowed
by robots.txt and are neither fetched nor linked. Facts only: film title, date, time, cinema, link.

robots.txt (all three): '*' must not read /admin/, /api/, /search/, /show/; the series and film pages are allowed.
Terms: the imprints only limit copying 'außerhalb der Grenzen des Urheberrechtes' (standard clause, like zeise kinos); facts only.
"""
import re
import sys
from datetime import date

import requests

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'kinderkino_stadtteilkinos'
CINEMAS = [  # base, name, address, series paths, OSM names
    ('https://www.korallekino.de', 'Koralle Kino', 'Kattjahren 1, 22359 Hamburg', ['/reihen/kinderkino/', '/reihen/mein-1-kino-erlebnis/'],
     ('Koralle', 'Koralle Kino', 'Koralle-Kino')),
    ('https://www.elbe-kino.de', 'Elbe Filmtheater', 'Osdorfer Landstraße 198, 22549 Hamburg', ['/reihen/kinderkino/'],
     ('Elbe Filmtheater', 'Elbe-Kino', 'Elbe Kino')),
    ('https://www.blankeneserkino.de', 'Blankeneser Kino', 'Blankeneser Bahnhofstraße 4, 22587 Hamburg', ['/reihen/kinderkino/'],
     ('Blankeneser Kino', 'Blankeneser Kinos')),
]
TEASER = re.compile(r'<div class="ftbj-movie-teaser[ "].*?href="(/filme/[^"]+)"[^>]*><span class="ftbj-flagged-headline-text">(.*?)</span>(.*?)(?=<div class="ftbj-movie-teaser[ "]|</main>)', re.S)
SHOW = re.compile(r'ftbj-movie-teaser-shows-day"[^>]*>\s*\w+\s+(\d{1,2})\.(\d{1,2})\.\s*</span>\s*<a href="/show/(\d+)/"[^>]*>.*?ftbj-show-time">(\d{1,2}):(\d\d)<', re.S)


def main():
    today = date.today()
    offers = []
    for base, name, address, paths, osm in CINEMAS:
        lat, lon = osm_coords(*osm)
        for path in paths:
            try:
                html = get(base + path).text
            except (requests.RequestException, PermissionError, RuntimeError) as e:
                print(f'  skip {base + path}: {e}')
                continue
            for href, title, rest in TEASER.findall(html):
                for dd, mm, show, hh, mi in SHOW.findall(rest):
                    year = today.year if (int(mm), int(dd)) >= (today.month, today.day) else today.year + 1
                    day, tm = date(year, int(mm), int(dd)), f'{int(hh):02d}:{mi}'
                    if day.weekday() < 5 and tm < '13:30':  # school cinema
                        continue
                    offers.append(termin(f'{base.split("//")[1]}:{show}', clean(title), day, base + href, name, venue=name, address=address,
                                         lat=lat, lon=lon, time_from=tm, registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Koralle, Elbe Filmtheater, Blankeneser Kino: Kinderkino', CINEMAS[0][0] + '/reihen/kinderkino/',
                  'Koralle Kino / Elbe Filmtheater / Blankeneser Kino', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
