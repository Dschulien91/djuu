"""Import weekly children's courses of Kulturhaus Süderelbe from its public course list.

robots.txt only blocks shop and admin paths, imprint has no reuse restriction. Keeps courses in the house's own category
'Kinder': title, weekday, time, link. Course leaders' names follow 'mit' in the listing and are removed, never stored.
"""
import re
import sys

from offers_util import WEEKDAYS, age_of, clean, finish, get, group, osm_coords

SOURCE_ID = 'kulturhaus_suederelbe'
BASE = 'https://kulturhaus-suederelbe.de'
PAGE = BASE + '/angebote/'
PROVIDER = 'Kulturhaus Süderelbe'
DAYS = {'Montag': 0, 'Dienstag': 1, 'Mittwoch': 2, 'Donnerstag': 3, 'Freitag': 4, 'Samstag': 5, 'Sonntag': 6}
ROW = re.compile(r'(?:KHS-(\S+) )?(' + '|'.join(DAYS) + r') \| (\d{1,2})[:.](\d\d)(?: – (\d{1,2})[:.](\d\d))? ?Uhr Kinder (.+?) mit ')


def main():
    lat, lon = osm_coords('Kulturhaus Süderelbe e.V.', 'Kulturhaus Süderelbe')
    html = get(PAGE).text
    links = {clean(t): h for h, t in re.findall(r'href="(https://kulturhaus-suederelbe\.de/angebote/[^"]+)">([^<]+)</a></h3>', html)}
    offers = []
    for code, day, h1, m1, h2, m2, title in ROW.findall(clean(html)):
        wd = DAYS[day]
        tf = f'{int(h1):02d}:{m1}'
        tt = f'{int(h2):02d}:{m2}' if h2 else None
        offers.append(group(code or f'{wd}:{tf}:{title[:30]}', title, links.get(title, PAGE), PROVIDER, kind='kurs', weekday=wd, time_from=tf, time_to=tt, venue=PROVIDER,
                            lat=lat, lon=lon, schedule=f'{WEEKDAYS[wd]} {tf}{"–" + tt if tt else ""}, wöchentlich', registration='nötig', age=age_of(title)))
    return finish(SOURCE_ID, 'Kulturhaus Süderelbe: Kinderkurse', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
