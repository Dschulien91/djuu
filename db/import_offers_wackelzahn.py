"""Import the public performances of Kindertheater Wackelzahn at the Hoftheater Ottensen (Norddeutsches Tourneetheater).

Source: the theatre's site norddeutsches-tourneetheater.de embeds its full schedule as a published Google Sheet
(docs.google.com/spreadsheets/d/e/<id>/pubhtml); the importer reads the same sheet as CSV (pub?output=csv). Rows are
'day.month, time, play, status'. The site's own section 'Aktuelle Stücke' gives the age per play ('ab 3 Jahre') and the
ticket price. Left out: rows marked 'KITA UND SCHULVORSTELLUNGEN' (group shows by arrangement) and sold-out shows.
Facts only: play, date, time, age, price, link to the theatre page.

robots.txt: the theatre site has none (404); docs.google.com allows the published-sheet path for '*' (Crawl-delay 1).
"""
import csv
import io
import re
import sys
from datetime import date
from html import unescape

from offers_util import age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'kindertheater_wackelzahn'
PAGE = 'https://norddeutsches-tourneetheater.de/'
PROVIDER = 'Hoftheater Ottensen / Kindertheater Wackelzahn'
VENUE = 'Hoftheater Ottensen (Kindertheater Wackelzahn)'
ADDRESS = 'Abbestraße 33, 22765 Hamburg'


def main():
    today = date.today()
    html = get(PAGE).content.decode('utf-8', 'replace')  # served without charset
    sheet = re.search(r'src="(https://docs\.google\.com/spreadsheets/d/e/[^"/]+)/pubhtml\?([^"]*)"', html)
    if not sheet:
        sys.exit(f'{SOURCE_ID}: schedule sheet not found on the page; keeping existing data')
    gid = re.search(r'gid=(\d+)', unescape(sheet.group(2)))
    rows = list(csv.reader(io.StringIO(get(f'{sheet.group(1)}/pub?gid={gid.group(1) if gid else 0}&single=true&output=csv').text)))
    # ages per play from 'Aktuelle Stücke': '<title> ... ab 3 Jahre | 45 Minuten'
    stuecke = clean(html[html.find('id="stuecke"'):html.find('id="karten"')] if 'id="stuecke"' in html else '')
    price, free = price_of((re.search(r'Ticketpreis:\s*([\d,]+\s*€)', clean(html)) or [0, ''])[1])
    lat, lon = osm_coords('Hoftheater Ottensen / Kindertheater Wackelzahn', 'Hoftheater Ottensen')
    offers, prev, year = [], None, today.year
    for row in rows:
        if len(row) < 3:
            continue
        d = re.match(r'\s*(\d{1,2})\.(\d{1,2})', row[0])
        tm = re.match(r'\s*(\d{1,2})[.:](\d\d)', row[1])
        title, status = clean(row[2]), clean(row[3] if len(row) > 3 else '')
        if not (d and tm and title):
            continue
        dd, mm = int(d.group(1)), int(d.group(2))
        if prev is None and (date(year, mm, dd) - today).days < -60:
            year += 1
        elif prev is not None and (mm, dd) < prev:  # sheet runs in date order: month falls back -> next year
            year += 1
        prev = (mm, dd)
        if re.search(r'kita|schul', title, re.I) or re.search(r'ausverkauft', status, re.I):
            continue
        day = date(year, mm, dd)
        i = stuecke.find(title)
        age = age_of(stuecke[i:i + 2500]) if i >= 0 else (None, None)
        offers.append(termin(f'{day}T{int(tm.group(1)):02d}{tm.group(2)}', title, day, PAGE, PROVIDER, venue=VENUE, address=ADDRESS,
                             lat=lat or 53.555029, lon=lon or 9.930329, time_from=f'{int(tm.group(1)):02d}:{tm.group(2)}',
                             price=price, free=free, age=age, registration='Tickets', topic='theater',
                             description=status if re.search(r'rest|wenig|noch \d', status, re.I) else None))
    return finish(SOURCE_ID, 'Kindertheater Wackelzahn (Hoftheater Ottensen): Spielplan', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
