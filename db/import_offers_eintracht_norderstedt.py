"""Import the holiday football camps (Ferien-Fußballschule) of FC Eintracht Norderstedt for children 5 to 14.

Source: https://www.eintrachtnorderstedt.de/ferien-fussballschule (the club's own site; the old domain
eintracht-norderstedt.de only redirects to its web host now). The page names the camp weeks ('Montag, 12.07.2027 -
Freitag, 16.07.2027'), the daily times ('von 10:00 Uhr – 15:30 Uhr'), the age range and the weekly price; each week
becomes one multi-day 'termin'. The page names no camp location; the club's own grounds (address from its stadium
page) are used. Team pages ('Jugend') publish no training times, so no weekly groups are added.
robots.txt: 'Allow: /' for all crawlers. The club shop (shop.eintrachtnorderstedt.de) answers 429 and is not read.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, termin

SOURCE_ID = 'eintracht_norderstedt'
PAGE = 'https://www.eintrachtnorderstedt.de/ferien-fussballschule'
PROVIDER = 'FC Eintracht Norderstedt'
VENUE, ADDRESS = 'Edmund-Plambeck-Stadion (FC Eintracht Norderstedt)', 'Ochsenzoller Str. 58, 22848 Norderstedt'


def main():
    text = clean(get(PAGE).text)
    times = re.search(r'von\s*(\d{1,2}):(\d\d)\s*Uhr\s*[–-]\s*(\d{1,2}):(\d\d)', text)
    tf, tt = (f'{int(times.group(1)):02d}:{times.group(2)}', f'{int(times.group(3)):02d}:{times.group(4)}') if times else (None, None)
    m = re.search(r'von (\d+) bis (\d+) Jahren', text)
    age = (int(m.group(1)) * 12, int(m.group(2)) * 12 + 12) if m else age_of(text)
    m = re.search(r'Normalpreis\s*(\d+(?:,\d\d)?)\s*€\s*pro Woche', text)
    price = f'{m.group(1)} € pro Woche' if m else None
    offers = []
    for d1, m1, y1, d2, m2, y2 in re.findall(r'\w+, (\d\d)\.(\d\d)\.(\d{4})\s*-\s*\w+, (\d\d)\.(\d\d)\.(\d{4})', text):
        start, end = date(int(y1), int(m1), int(d1)), date(int(y2), int(m2), int(d2))
        offers.append(termin(f'camp:{start}', 'Ferien-Fußballschule (Feriencamp)', start, PAGE, PROVIDER, venue=VENUE, address=ADDRESS,
                             time_from=tf, time_to=tt, end=end, price=price, age=age, registration='nötig', topic='sport',
                             description='Fußball-Feriencamp mit Mittagessen; Frühbetreuung ab 9 Uhr buchbar'))
    return finish(SOURCE_ID, 'FC Eintracht Norderstedt: Ferien-Fußballschule', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
