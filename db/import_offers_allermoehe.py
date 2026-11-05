"""Import weekly children's groups and family dates of Bürgerhaus Allermöhe from its public weekly plan.

robots.txt has no rules for the page, imprint has no reuse restriction. The page lists regular offers in one table per
weekday. Only activity, weekday and time are stored; organiser contact names are never stored.
"""
import re
import sys

from offers_util import FAMILY, WEEKDAYS, age_of, clean, finish, get, group, osm_coords

SOURCE_ID = 'buergerhaus_allermoehe'
BASE = 'https://www.buergerhaus-allermoehe.de'
PAGE = BASE + '/veranstaltungen/'
PROVIDER = 'Bürgerhaus Allermöhe'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}


def main():
    lat, lon = osm_coords('Bürgerhaus Allermöhe')
    html = get(PAGE).text
    offers = []
    for m in re.finditer(r'(?s)<table[^>]*tablepress[^>]*>(.*?)</table>', html):
        before = clean(html[max(0, m.start() - 600):m.start()]).lower()
        wd = max(DAYS, key=lambda k: before.rfind(k)) if any(k in before for k in DAYS) else None
        if wd is None:
            continue
        for row in re.findall(r'(?s)<tr class="row-\d+">(.*?)</tr>', m.group(1)):
            cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)]
            if len(cells) < 2 or not FAMILY.search(cells[1]):
                continue
            t = re.match(r'(\d{1,2})[:.](\d\d)\s*[-–]\s*(\d{1,2})[:.](\d\d)', cells[0])
            tf = f'{int(t.group(1)):02d}:{t.group(2)}' if t else None
            tt = f'{int(t.group(3)):02d}:{t.group(4)}' if t else None
            offers.append(group(f'{wd}:{tf}:{cells[1][:40]}', cells[1], PAGE, PROVIDER, weekday=DAYS[wd], time_from=tf, time_to=tt, lat=lat, lon=lon,
                                schedule=f'{WEEKDAYS[DAYS[wd]]} {tf}–{tt}, wöchentlich' if t else f'{WEEKDAYS[DAYS[wd]]}, wöchentlich', age=age_of(cells[1])))
    return finish(SOURCE_ID, 'Bürgerhaus Allermöhe: Kindergruppen', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
