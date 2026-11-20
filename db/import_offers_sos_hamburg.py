"""Import the baby courses of the SOS-Kinderdorf Hamburg Familien-Frühsorge (SOS-Familienzentrum Dulsberg).

Source: https://www.sos-kinderdorf.de/kinderdorf-hamburg/angebote/familienfruehsorge - the page lists every course
run of the year ('Kleine Matrosen (Krabbelgruppe) immer dienstags! 1. Kurs: 06.01.2026 – 17.02.2026 ...'), and the
current flyer 'Last Check vor der Geburt' (linked there) gives weekday and time of that open group for pregnant women.
Course times are not on the page (the 2021 Frühsorge flyer is outdated), so courses carry weekday and dates only. robots.txt: '*' allows everything except /asset-detail/ and one Worpswede path.
Staff names and phone numbers on the page are never stored.
Terms: not checked beyond the page; SOS-Kinderdorf e.V. imprint has the usual copyright note -> Julian asks.
"""
import io
import json
import re
import sys
import unicodedata
from datetime import date

import pdfplumber

from common import DB_PATH
from offers_util import WEEKDAYS, clean, finish, get, group

SOURCE_ID = 'sos_kinderdorf_hamburg'
BASE = 'https://www.sos-kinderdorf.de'
PAGE = BASE + '/kinderdorf-hamburg/angebote/familienfruehsorge'
PROVIDER = 'SOS-Kinderdorf Hamburg'
VENUE = 'SOS-Familienzentrum Dulsberg'
ADDRESS = 'Straßburger Straße 19, 22049 Hamburg'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4}
COURSES = {  # page name -> (title, topic, age in months)
    'Kleine Matrosen': ('Krabbelgruppe „Kleine Matrosen“', 'krabbelgruppe', (7, 18)),
    'Kleinen Krabben': ('Babymassage „Kleine Krabben“', 'babymassage', (1, 7)),
}
D = r'(\d\d)\.(\d\d)\.(\d{4})'


ADDR_INDEX = DB_PATH.parent / 'raw' / 'addresses.json'  # offline OSM address index (built by tools/redaktion_build.py)
_idx = {}


def norm_street(s):
    s = unicodedata.normalize('NFKC', s or '').lower().replace('ß', 'ss')
    s = re.sub(r'(str\.|strasse)(?=\W|$)', 'strasse', s)
    return re.sub(r'[^a-z0-9äöü]', '', s)


def coords(address):
    """'Musterstraße 12a, 22000 Hamburg' -> (lat, lon) of the house number from the local OSM address index."""
    if not _idx:
        try:
            _idx.update(json.loads(ADDR_INDEX.read_text(encoding='utf8')))
        except (OSError, ValueError):
            _idx['-'] = None
    m = re.match(r'\s*([^,\d]+?)\s+(\d+(?:\s?[a-zA-Z](?![a-zA-Z]))?)', address or '')
    if not m:
        return None, None
    hit = _idx.get(f'{norm_street(m.group(1))}|{m.group(2).lower().replace(" ", "")}')
    return tuple(hit) if hit else (None, None)


def pdf_text(href):
    try:
        with pdfplumber.open(io.BytesIO(get(BASE + href.replace('&amp;', '&')).content)) as doc:
            return '\n'.join(p.extract_text() or '' for p in doc.pages)
    except Exception as e:  # flyers are optional
        print(f'  flyer {href}: {e}')
        return ''


def main():
    latlon = coords(ADDRESS)
    html = get(PAGE).text
    text = clean(html)
    flyers = dict((clean(n), h) for h, n in re.findall(r'href="(/service/download/[^"]+)"[^>]*>(.*?)</a>', html, re.S))
    offers = []
    for name, (title, topic, age) in COURSES.items():
        m = re.search(re.escape(name) + r'[^!]*?immer (\w+?)s!(.*?)(?=Kleine|Downloads|$)', text)
        if not m or m.group(1).lower() not in DAYS:
            print(f'  {name}: not found on the page')
            continue
        wd = DAYS[m.group(1).lower()]
        for run in (re.finditer(r'(\d)\. Kurs:\s*' + D + r'\s*[–-]\s*' + D, m.group(2))):
            start = date(int(run.group(4)), int(run.group(3)), int(run.group(2)))
            end = date(int(run.group(7)), int(run.group(6)), int(run.group(5)))
            sched = f'{WEEKDAYS[wd]}, {start:%d.%m.}–{end:%d.%m.%Y}'
            offers.append(group(f'{name}:{start}', title, PAGE, PROVIDER, kind='kurs', weekday=wd, schedule=sched, venue=VENUE,
                                address=ADDRESS, lat=latlon[0], lon=latlon[1], price='10 €', free=0, age=age, start=start, end=end,
                                registration='nötig', topic=topic))
    last = next((h for n, h in flyers.items() if 'Last Check' in n), None)
    lt = pdf_text(last) if last else ''
    m = re.search(r'(\w+)s von (\d{1,2})[.:](\d\d) Uhr bis (\d{1,2})[.:](\d\d) Uhr', lt)
    if m and m.group(1).lower() in DAYS:
        wd = DAYS[m.group(1).lower()]
        tf, tt = f'{int(m.group(2)):02d}:{m.group(3)}', f'{int(m.group(4)):02d}:{m.group(5)}'
        offers.append(group('last-check', 'Last Check vor der Geburt – offener Treff für Schwangere', PAGE, PROVIDER, weekday=wd,
                            schedule=f'{WEEKDAYS[wd]} {tf}–{tt}', venue=VENUE, address=ADDRESS, lat=latlon[0], lon=latlon[1],
                            time_from=tf, time_to=tt, registration='nötig', topic='geburtsvorbereitung'))
    return finish(SOURCE_ID, 'SOS-Kinderdorf Hamburg: Familien-Frühsorge', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
