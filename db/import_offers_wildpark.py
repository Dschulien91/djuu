"""Import the children's programme and events of Wildpark Schwarze Berge (Rosengarten, at the Hamburg city limit).

robots.txt explicitly allows crawlers including AI crawlers on the event pages; the imprint has no reuse
restriction. Reads the site's public iCal feed, keeps title, date, time and link only.
"""
import re
import sys

from offers_util import FAMILY, finish, from_event, osm_coords, read_ics

SOURCE_ID = 'wildpark_schwarze_berge'
BASE = 'https://www.wildpark-schwarze-berge.de'
PROVIDER = 'Wildpark Schwarze Berge'
ADDRESS = 'Am Wildpark 1, 21224 Rosengarten'
EXTRA = re.compile(r'kinderprogramm|nachtwander|führung|fütter|erlebnis|tag der|fest|schnitz', re.I)


def main():
    lat, lon = osm_coords('Wildpark Schwarze Berge')
    offers = []
    for e in read_ics(BASE + '/events/?ical=1'):
        if FAMILY.search(e['title'] + ' ' + e['text'] + ' ' + ' '.join(e['cats'])) or EXTRA.search(e['title'] + ' ' + ' '.join(e['cats'])):
            offers.append(from_event(e, PROVIDER, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon))
    return finish(SOURCE_ID, 'Wildpark Schwarze Berge: Veranstaltungen', BASE + '/events/', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
