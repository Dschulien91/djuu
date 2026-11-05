"""Import children's events of Kulturhaus Eidelstedt from its public programme page.

robots.txt only blocks wp-admin. The imprint limits copying outside copyright law, so only facts are stored: title,
date, time, age, price. Sold-out dates are dropped. Date has no year on the page: past months roll into next year.
"""
import re
import sys
from datetime import date

from offers_util import MONTHS_SHORT, age_of, clean, finish, get, osm_coords, parse_price, termin

SOURCE_ID = 'kulturhaus_eidelstedt'
BASE = 'https://kulturhaus-eidelstedt.de'
PAGE = BASE + '/programm/'
PROVIDER = 'Kulturhaus Eidelstedt'


def main():
    lat, lon = osm_coords('Kulturhaus Eidelstedt')
    today = date.today()
    offers = []
    for block in re.split(r'class="[^"]*events_date flex_column', get(PAGE).text)[1:]:
        d = re.search(r'events_day">(\d{1,2})<.*?events_month">(\w+)\.?<', block, re.S)
        kat = clean((re.search(r'(?s)events_kat[^>]*>(.*?)</div>', block) or [0, ''])[1])
        tm = re.search(r'(?s)events_time[^>]*>\s*(\d\d:\d\d)', block)
        h4 = re.search(r'(?s)<h4>(.*?)</h4>', block)
        if not (d and h4):
            continue
        title = clean(h4.group(1))
        if not re.search(r'kinder|famil', kat + ' ' + title, re.I) or re.search(r'ausverkauft', title, re.I):
            continue
        month = MONTHS_SHORT.get(d.group(2).lower()[:3])
        if not month:
            continue
        day = date(today.year, month, int(d.group(1)))
        if day < today.replace(day=1):
            day = day.replace(year=today.year + 1)
        price, free = parse_price((re.search(r'(\d+,\d\d\s*€)', clean(block)) or [0, ''])[1])
        offers.append(termin(f'{title[:50]}:{day}', title, day, PAGE, PROVIDER, venue=PROVIDER, lat=lat, lon=lon, time_from=tm.group(1) if tm else None,
                             price=price, free=free, age=age_of(f'{kat} {title}'), description=kat))
    return finish(SOURCE_ID, 'Kulturhaus Eidelstedt: Kinderprogramm', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
