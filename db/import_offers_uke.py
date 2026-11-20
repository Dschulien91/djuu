"""Import the information evening for expectant parents of the UKE obstetrics clinic (Universitäres Perinatalzentrum).

Source: https://www.uke.de/kliniken-institute/kliniken/geburtshilfe-und-pr%C3%A4natalmedizin/infoabend/index.html
The page publishes a rule ('am 1. und 3. Mittwoch des Monats um 18:00 Uhr in unserem Mitarbeitendenrestaurant
(Gebäude N19, 4. OG)'); it is kept as one recurring group and the rule is re-read on every run, so a changed rule
changes the entry and a removed rule keeps the old data (finish() never empties a source).
The UKE runs no birth-preparation courses itself; its course page only refers to external partners (not imported).

robots.txt: '*' group disallows only /assets/, /errorpages/, /_manager/.
Terms: no reuse clause found in the imprint.
"""
import re
import sys

from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords

SOURCE_ID = 'uke_geburtshilfe'
PAGE = 'https://www.uke.de/kliniken-institute/kliniken/geburtshilfe-und-pr%C3%A4natalmedizin/infoabend/index.html'
PROVIDER = 'Universitätsklinikum Hamburg-Eppendorf (UKE), Geburtshilfe'
ADDRESS = 'Martinistraße 52, 20246 Hamburg'
WEEKDAY_WORDS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']


def main():
    text = clean(get(PAGE).text)
    m = re.search(r'am\s+(\d)\.\s*(?:und\s+(\d)\.\s*)?(' + '|'.join(WEEKDAY_WORDS) + r')\s+des\s+monats\s+um\s+(\d{1,2})[:.](\d\d)\s*uhr'
                  r'(?:\s+in\s+unserem\s+([^()]{3,40}?)\s*\(([^)]{3,40})\))?', text, re.I)
    offers = []
    if m:
        wd = WEEKDAY_WORDS.index(m.group(3).lower())
        nth = ' und '.join(f'{g}.' for g in (m.group(1), m.group(2)) if g)
        tf = f'{int(m.group(4)):02d}:{m.group(5)}'
        room = ', '.join(clean(g) for g in (m.group(6), m.group(7)) if g)
        lat, lon = osm_coords('Universitätsklinikum Hamburg-Eppendorf')
        offers.append(group('infoabend', 'Informationsabend für werdende Eltern (Kreißsaal & Perinatalzentrum)', PAGE, PROVIDER,
                            weekday=wd, schedule=f'jeden {nth} {WEEKDAYS[wd]} im Monat, {tf}', venue='UKE' + (f', {room}' if room else ''),
                            address=ADDRESS, lat=lat, lon=lon, time_from=tf, topic='geburtsvorbereitung'))
    return finish(SOURCE_ID, 'UKE Geburtshilfe: Infoabend für werdende Eltern', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
