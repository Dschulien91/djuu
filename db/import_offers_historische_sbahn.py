"""Import the family trips of the Verein Historische S-Bahn Hamburg (museum train with Father Christmas, Easter trips ...).

Source: https://historische-s-bahn.hamburg/fahrtenprogramm-<year>/ (trip list with dates and the link to each trip's post)
and the trip posts (one <h2>/<h3> section per date: line, route, first departure, 'Ausgebucht'). Only trips whose name
or section names children or families are kept (Weihnachtsmann, Oster-, Nikolaus-, Familien-); evening and adult
trips (Silvesterfahrt, Grünkohlfahrt) are not. Sold-out (ausgebucht) dates are dropped. Venue = first departure station.
robots.txt: only WooCommerce/admin paths are disallowed.
"""
import re
import sqlite3
import sys
from datetime import date

from common import DB_PATH
from offers_util import MONTHS, clean, finish, get, termin

SOURCE_ID = 'historische_sbahn'
BASE = 'https://historische-s-bahn.hamburg'
PROVIDER = 'Verein Historische S-Bahn Hamburg e.V.'
KIDS = re.compile(r'weihnachtsm|nikolaus|oster|famil|kinder', re.I)
DAY_RX = r'(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Sonnabend|Samstag|Sonntag),\s*(\d{1,2})\.\s*(\w+)\s*(\d{4})?'


def station_coords(name):
    """S-Bahn station from the OSM records (hvv type S)."""
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        row = con.execute("""SELECT lat, lon FROM source_records WHERE source_id='osm' AND name IN (?, ?) AND lat IS NOT NULL
                             AND raw LIKE '%"hvv:psv_type": "S"%' LIMIT 1""", (name, f'Hamburg-{name}')).fetchone()
        return row or (None, None)
    finally:
        con.close()


def trips(year):
    """(name, [dates], info url) from the yearly trip programme; only trips still to come (above 'bereits absolviert')."""
    url = f'{BASE}/fahrtenprogramm-{year}/'
    html = get(url).text
    body = html.split('bereits absolviert')[0]
    body = body[body.find('Fahrtenprogramm f'):]
    out = []
    for block in body.split('<table')[1:]:  # one table per trip: name cell, dates cell; then the text with the info link
        cells = re.findall(r'(?s)<td[^>]*>(.*?)</td>', block.split('</table>')[0])
        if len(cells) < 2:
            continue
        name = clean(cells[0])
        dates = [(int(d), MONTHS.get(m.lower())) for d, m, _ in re.findall(DAY_RX, clean(re.sub(r'<br\s*/?>', ' ', cells[1])))]
        link = re.search(r'href="(https://historische-s-bahn\.hamburg/\d{4}/\d\d/[^"]+)"', block)
        if name and dates:
            out.append((name, [date(year, m, d) for d, m in dates if m], link.group(1) if link else url))
    return out, url


def sections(post_url):
    """{date: (heading, text)} of a trip post."""
    html = get(post_url).text
    out = {}
    parts = re.split(r'<h[23][^>]*>(.*?)</h[23]>', html)
    for head, body in zip(parts[1::2], parts[2::2]):
        head = clean(head)
        m = re.match(DAY_RX, head)
        if m and MONTHS.get(m.group(2).lower()):
            out[date(int(m.group(3) or date.today().year), MONTHS[m.group(2).lower()], int(m.group(1)))] = (head, clean(body))
    return out


def main():
    offers = []
    year = date.today().year
    programme = []
    for y in (year, year + 1):
        try:
            got, page = trips(y)
            programme += got
        except Exception as e:
            print(f'  no programme for {y}: {type(e).__name__}')
    page = f'{BASE}/fahrtenprogramm-{year}/'
    for name, days, link in programme:
        secs = sections(link) if link.rstrip('/') != page.rstrip('/') else {}
        for day in days:
            head, text = secs.get(day, ('', ''))
            if not (KIDS.search(name) or KIDS.search(head)):
                continue
            if re.search(r'ausgebucht|ausverkauft|abgesagt|fällt aus', head + ' ' + text[:300], re.I):
                continue
            line = (re.search(r'auf der (S\d+(?:\s*und\s*S\d+)?)', text) or [0, ''])[1].replace(' und ', '/')
            route = re.search(r'zwischen ([A-ZÄÖÜ][\w-]+) und ([A-ZÄÖÜ][\w-]+)', text)
            dep = re.search(r'([A-ZÄÖÜ][\w.\- ]*?) \((?:Gl\. [\d/]+ )?ab\)\s*((?:\d{1,2}:\d\d\s*)+)', text)
            if not dep:
                m = re.search(r'ab ([A-ZÄÖÜ][\w-]+)[: ]+((?:\d{1,2}:\d\d\s*(?:Uhr)?\s*)+)', text)
                dep = m
            station, deps = (dep.group(1).strip(), re.findall(r'\d{1,2}:\d\d', dep.group(2))) if dep else (None, [])
            extra = ', '.join(x for x in [line, f'{route.group(1)}–{route.group(2)}' if route else ''] if x)
            sub = re.search(r'\|\s*(.+)$', head)
            title = name + (f' ({sub.group(1).strip()})' if sub else f' (Museumszug, {extra})' if extra else '')
            lat, lon = station_coords(station) if station else (None, None)
            reserve = re.search(r'reservierung', text[:600], re.I)
            offers.append(termin(f'{link.rstrip("/").rsplit("/", 1)[-1]}:{day}', title, day, link, PROVIDER,
                                 venue=f'S-Bahnhof {station}' + (f' (Abfahrt {", ".join(deps[:6])} Uhr)' if deps else '') if station else PROVIDER,
                                 lat=lat, lon=lon, time_from=deps[0] if deps else None,
                                 price='hvv-Fahrkarte' if re.search(r'hvv', text, re.I) else None,
                                 registration='nötig' if reserve else 'offen', topic='feste', description=None))
    return finish(SOURCE_ID, 'Historische S-Bahn Hamburg: Familienfahrten', page, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
