"""Import the early-music courses (Musikalische Frühförderung, Eltern-Kind-Kurs) of the Musikschule Rahlstedt.

Source: https://www.musikschule-rahlstedt.de/index.php/unterrichtsangebot/musikalische-fruehfoerderung (Joomla page,
one line per course: 'Montags von 15:20 bis 15:50 Eltern-Kind-Kurs für 2-3-Jährige - Leitung: ...'). Leaders' names
are cut off. Address from the site's contact page (Kielkoppelstraße 9c), coordinates from the local OSM records.
robots.txt: no rules for these paths.
"""
import re
import sys

from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords

SOURCE_ID = 'musikschule_rahlstedt'
PAGE = 'https://www.musikschule-rahlstedt.de/index.php/unterrichtsangebot/musikalische-fruehfoerderung'
PROVIDER = 'Musikschule Rahlstedt'
ADDRESS = 'Kielkoppelstraße 9c, 22149 Hamburg'
DAYS = {'montags': 0, 'dienstags': 1, 'mittwochs': 2, 'donnerstags': 3, 'freitags': 4, 'samstags': 5}
LINE = re.compile(r'(Montags|Dienstags|Mittwochs|Donnerstags|Freitags|Samstags) von (\d{1,2}[:.]\d\d) bis (\d{1,2}[:.]\d\d)\s*(?:Uhr)?\s*(.*?)'
                  r'(?:\s*-\s*Leitung:.*)?$')


def main():
    html = get(PAGE).text
    lat, lon = osm_coords('Musikschule Rahlstedt')
    offers = []
    for part in re.split(r'<br\s*/?>|</p>|</li>', html):
        m = LINE.search(clean(part))
        if not m:
            continue
        wd = DAYS[m.group(1).lower()]
        tf, tt = (x.replace('.', ':').zfill(5) for x in m.group(2, 3))
        what = m.group(4).strip(' -')
        age = re.search(r'(\d+)\s*-\s*(\d+)-?Jährige', what)
        age = (int(age.group(1)) * 12, int(age.group(2)) * 12 + 12) if age else (None, None)
        parents = 'Eltern-Kind' in what
        title = 'Eltern-Kind-Kurs Musik' if parents else 'Musikalische Frühförderung'
        if age[0] is not None:
            title += f' ({age[0] // 12}–{age[1] // 12 - 1} J.)'
        if 'ohne Eltern' in what:
            title += ', ohne Eltern'
        offers.append(group(f'{wd}:{tf}', title, PAGE, PROVIDER, weekday=wd, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                            time_from=tf, time_to=tt, age=age, registration='nötig', topic='musik',
                            schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich (Unterrichtsperioden der Musikschule)'))
    return finish(SOURCE_ID, 'Musikschule Rahlstedt: Musikalische Frühförderung', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
