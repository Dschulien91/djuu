"""Import children's events of Kultur Palast Hamburg (Billstedt, Harburg) from its public programme page.

robots.txt has no restricting rules. The imprint bars copying for commercial purposes, so only facts are stored and
this source must be reviewed if Djuu ever becomes commercial.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import FAMILY, MONTHS_SHORT, age_of, clean, finish, get, osm_coords, parse_price, termin

SOURCE_ID = 'kulturpalast_hamburg'
BASE = 'https://www.kph-hamburg.de'
PAGE = BASE + '/veranstaltungen'
PROVIDER = 'Kultur Palast Hamburg'


def main():
    harburg = osm_coords('Kultur Palast Harburg')
    billstedt = osm_coords('Kulturpalast im Wasserwerk e.V')
    offers = []
    for block in re.split(r'<div class="event-date">', get(PAGE).text)[1:]:
        d = re.search(r'class="day">\s*(\d+)\s*<.*?class="month">\s*(\w+)\.?\s*<.*?class="year">\s*(\d{4})\s*<.*?class="hours">\s*(\d\d:\d\d)', block, re.S)
        a = re.search(r'(?s)<h3><a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', block)
        if not (d and a):
            continue
        title = clean(a.group(2))
        info = clean((re.search(r'(?s)</h3><p>(.*?)</p>', block) or [0, ''])[1])
        if not FAMILY.search(f'{title} {info}') or re.search(r'kochworkshop', title, re.I):
            continue
        month = MONTHS_SHORT.get(d.group(2).lower()[:3])
        if not month:
            continue
        day = date(int(d.group(3)), month, int(d.group(1)))
        loc = clean((re.search(r'(?s)location-text">(.*?)</span>', block) or [0, ''])[1])
        coords = harburg if 'harburg' in loc.lower() else billstedt if 'billstedt' in loc.lower() else (None, None)
        pm = re.search(r'ab\s*\d+,\d\d\s*€', clean(block))
        price = pm.group(0) if pm else None
        free = 0 if pm else parse_price(info)[1] if 'kostenlos' in info.lower() else None
        offers.append(termin(f'{a.group(1).rstrip("/").split("/")[-2]}:{day}:{d.group(4)}', title, day, urljoin(BASE, a.group(1)), PROVIDER, venue=loc or PROVIDER,
                             lat=coords[0], lon=coords[1], time_from=d.group(4), price=price, free=free, age=age_of(f'{title} {info}'), description=info[:150]))
    return finish(SOURCE_ID, 'Kultur Palast Hamburg: Kinderveranstaltungen', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
