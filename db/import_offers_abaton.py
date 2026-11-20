"""Import the 'Kinderkino' screenings of the Abaton Kino (Rotherbaum) from its own weekly programme.

Source: https://www.abaton.de/page.pl?index=kids (the cinema's week programme; each screening carries the cinema's own
label, e.g. 'Kinderkino', 'Schulkinowochen'). Kept: screenings labelled 'Kinderkino' only, so school cinema weeks are
left out, and weekday screenings before 13:30 are dropped as well. Link: the cinema's own film page (page.pl?page=<id>).
Facts only: film title, date, time, screen, link.

robots.txt: '*' must not read /cgi-bin/, /css/, /images/, /js/, /test/, /forms/, /nappes/; page.pl is allowed.
Terms: imprint has no reuse clause found -> nothing to ask.
"""
import re
import sys
from datetime import date

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'abaton_kinderkino'
BASE = 'https://www.abaton.de/'
PAGE = BASE + 'page.pl?index=kids'
PROVIDER = 'Abaton Kino'
ADDRESS = 'Allende-Platz 3, 20146 Hamburg'
ROW = re.compile(r'<div class="tageins">\s*<a href="(page\.pl\?page=\d+)".*?class="prg_titl">(.*?)<br>(.*?)</a>.*?'
                 r'name="VTitel" value="\'?(.*?)\'?">\s*<input type="hidden" name="VZeit" value="(\d{1,2}):(\d\d)">\s*'
                 r'<input type="hidden" name="VTag" value="(\d\d)\.(\d\d)\.(\d{4})">.*?name="ShowID" value="\'?(\d+)', re.S)


def main():
    lat, lon = osm_coords('Abaton', 'Abaton Kino', 'Abaton-Kino')
    r = get(PAGE)
    r.encoding = r.encoding or 'iso-8859-1'
    offers = []
    for href, _, labels, title, hh, mi, dd, mm, yy, show in ROW.findall(r.text):
        label = clean((re.search(r'(?s)class="clm_kino">(.*?)</span>', labels) or [0, ''])[1])
        if 'kinderkino' not in label.lower():
            continue
        day, tm = date(int(yy), int(mm), int(dd)), f'{int(hh):02d}:{mi}'
        if day.weekday() < 5 and tm < '13:30':  # school cinema
            continue
        screen = clean((re.search(r'(?s)class="prg_kino">(.*?)</span>', labels) or [0, ''])[1])
        offers.append(termin(f'{show}', clean(title), day, BASE + href, PROVIDER,
                             venue=f'{PROVIDER}, {screen.split(" – ")[0]}' if screen else PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                             time_from=tm, registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Abaton Kino: Kinderkino', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
