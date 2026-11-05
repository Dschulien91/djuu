"""Import family performances of the Ohnsorg-Theater from its public schedule.

robots.txt allows the schedule. The imprint limits copying outside copyright law, so only facts are stored. Performances
listed as 'Schulvorstellung' are for school classes only and are dropped; adult plays are excluded by the theatre's own
children and youth titles.
"""
import re
import sys
from datetime import date

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'ohnsorg_theater'
BASE = 'https://www.ohnsorg.de'
PAGE = BASE + '/spielplan/'
PROVIDER = 'Ohnsorg-Theater'
ADDRESS = 'Heidi-Kabel-Platz 1, 20099 Hamburg'
ROW = re.compile(r'(\d\d)\.(\d\d)\.(\d{4}) (\d\d:\d\d) Uhr (.+?) (Ohnsorg Studio|Großes Haus)(.{0,40})')
KIDS = re.compile(r'kinder|familie|lütte|weihnachtsmärchen|märchen|ab \d+ jahr', re.I)


def main():
    html = get(PAGE).text
    text = clean(html)
    # titles the theatre files under 'Kinder & Jugend'
    kids_titles = set()
    for m in re.finditer(r'(?s)data-[a-z-]*(?:kategorie|category|filter)[a-z-]*="[^"]*kinder[^"]*"(.{0,1500})', html, re.I):
        t = re.search(r'(?s)<h\d[^>]*>(.*?)</h\d>', m.group(1))
        if t:
            kids_titles.add(clean(t.group(1)))
    lat, lon = osm_coords('Ohnsorg-Theater', 'Ohnsorg Theater')
    offers = []
    for dd, mm, yy, tm, title, hall, after in ROW.findall(text):
        if 'schulvorstellung' in after.lower():
            continue
        if title not in kids_titles and not KIDS.search(title):
            continue
        day = date(int(yy), int(mm), int(dd))
        offers.append(termin(f'{title[:50]}:{day}:{tm}', title, day, PAGE, PROVIDER, venue=f'{PROVIDER}, {hall}', address=ADDRESS, lat=lat, lon=lon,
                             time_from=tm, topic='theater', registration='nötig'))
    return finish(SOURCE_ID, 'Ohnsorg-Theater: Kinder und Familie', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
