"""Import regular children's groups at Bürgerhaus Wilhelmsburg from its public list of regular dates.

robots.txt only blocks the event entry form, imprint has no reuse restriction. Keeps activity, weekday and time.
Course leaders and contact details on the page are personal data and are removed, never stored.
"""
import re
import sys

from offers_util import FAMILY, WEEKDAYS, age_of, clean, finish, get, group, osm_coords

SOURCE_ID = 'buergerhaus_wilhelmsburg'
BASE = 'https://buewi.de'
PAGE = BASE + '/regelmaessige-termine/'
PROVIDER = 'Bürgerhaus Wilhelmsburg'
ADDRESS = 'Mengestraße 20, 21107 Hamburg'
DAYS = {'montags': 0, 'dienstags': 1, 'mittwochs': 2, 'donnerstags': 3, 'freitags': 4, 'samstags': 5, 'sonntags': 6}
WHEN = re.compile(r'(' + '|'.join(DAYS) + r')(?: von)?,?\s*(\d{1,2})[:.](\d\d)\s*[-–]\s*(\d{1,2})[:.](\d\d)', re.I)


def main():
    lat, lon = osm_coords('Bürgerhaus Wilhelmsburg', 'Bürgerhaus')
    offers = []
    for head, body in re.findall(r'(?s)w-tabs-section-title">(.*?)</div>.*?w-text-value">(.*?)</span>', get(PAGE).text):
        title = re.sub(r'\s+mit\s+.*$', '', clean(head))
        m = WHEN.search(clean(body))
        if not (m and FAMILY.search(title)):
            continue
        wd = DAYS[m.group(1).lower()]
        tf, tt = f'{int(m.group(2)):02d}:{m.group(3)}', f'{int(m.group(4)):02d}:{m.group(5)}'
        offers.append(group(f'{wd}:{tf}:{title[:40]}', title, PAGE, PROVIDER, weekday=wd, time_from=tf, time_to=tt, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                            schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich', age=age_of(title)))
    return finish(SOURCE_ID, 'Bürgerhaus Wilhelmsburg: regelmäßige Kindergruppen', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
