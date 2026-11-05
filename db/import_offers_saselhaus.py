"""Import children's events of the Sasel-Haus from its public event list.

robots.txt only blocks wp-admin, imprint has no reuse restriction. Keeps events the house itself files under
'Kinderveranstaltungen', with title, date, time and a link to its children's events page.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'sasel_haus'
BASE = 'https://sasel-haus.de'
PAGE = BASE + '/veranstaltungen/'
LINK = BASE + '/sasel-haus/kinder-veranstaltungen/'
PROVIDER = 'Sasel-Haus'
ROW = re.compile(r'(\d\d)\.(\d\d)\.(\d{4}), (\d\d:\d\d) (.+?) a:\d+:\{i:0;s:\d+:"([^"]+)";')


def main():
    lat, lon = osm_coords('Sasel-Haus')
    text = clean(get(PAGE).text).replace('&quot;', '"')
    offers = []
    for dd, mm, yy, tm, title, cat in ROW.findall(text):
        if title.startswith('Uhr') or ('kinder' not in cat.lower() and not re.search(r'kinder|famil|baby', title, re.I)):
            continue
        day = date(int(yy), int(mm), int(dd))
        offers.append(termin(f'{title[:50]}:{day}:{tm}', title, day, LINK, PROVIDER, venue=PROVIDER, lat=lat, lon=lon, time_from=tm, age=age_of(title)))
    return finish(SOURCE_ID, 'Sasel-Haus: Kinderveranstaltungen', LINK, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
