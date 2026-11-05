"""Import family events of Gut Karlshöhe (Hamburger Klimaschutzstiftung) from its public event table.

robots.txt only blocks wp-admin, imprint has no reuse restriction. Only facts are stored: title, date, price, link.
Only events naming children or families are kept; adult cooking courses etc. are not family offers.
"""
import re
import sys
from datetime import datetime, timezone

from offers_util import FAMILY, age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'gut_karlshoehe'
BASE = 'https://www.gut-karlshoehe.de'
PAGE = BASE + '/aktuelles/veranstaltung/'
PROVIDER = 'Gut Karlshöhe'
ADDRESS = 'Karlshöhe 60d, 22175 Hamburg'
EXTRA = re.compile(r'laterne|erntefest|hoffest|kürbis|apfel|mitmach|forscher|tiere|schaf', re.I)


def main():
    lat, lon = osm_coords('Gut Karlshöhe', 'Umweltzentrum Gut Karlshöhe', 'Karlshöhe')
    offers = []
    for row in re.findall(r'(?s)<tr>(.*?)</tr>', get(PAGE).text):
        cells = re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)
        a = re.search(r'href="([^"]+)"[^>]*>(.*?)</a>', cells[0], re.S) if cells else None
        if not a or len(cells) < 3 or not re.fullmatch(r'\s*\d{9,11}\s*', cells[1]):
            continue
        title = clean(a.group(2))
        if not (FAMILY.search(title) or EXTRA.search(title)) or re.search(r'waldfondue|lehrkr|kochkurs', title, re.I):
            continue
        day = datetime.fromtimestamp(int(cells[1]), timezone.utc).date()
        price, free = price_of(cells[2])
        offers.append(termin(f'{a.group(1).rstrip("/").rsplit("/", 1)[-1]}:{day}', title, day, a.group(1), PROVIDER, venue=PROVIDER, address=ADDRESS,
                             lat=lat, lon=lon, price=price, free=free, age=age_of(title)))
    return finish(SOURCE_ID, 'Gut Karlshöhe: Veranstaltungen für Familien', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
