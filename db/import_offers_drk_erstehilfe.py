"""Import the public 'Erste Hilfe am Kind' and 'Erste Hilfe am Säugling' course dates of the DRK in Hamburg.

Source: the DRK course booking site run by DRK-Kreisverband Hamburg-Nordost e.V. (https://www.erste-hilfe-hamburg.org),
the target of the 'Zu den Terminen und der Onlinebuchung' buttons on drk-hamburg-nordost.de. Each course page has a
paginated table (date, time, price, free places, training site); the 'Schulungsorte' page gives street and postcode
of every training site. Only public dates are listed there (closed company courses are booked separately).
robots.txt: '*' disallows only /~upload/, /vz/, /action/, a few .htm pages and the privacy page; all pages read are allowed.
Terms: impressum has the usual copyright note for its own texts and images (we store facts and link only) -> Julian asks.
"""
import json
import re
import sys
import unicodedata
from datetime import date

from common import DB_PATH
from offers_util import clean, finish, get, termin

SOURCE_ID = 'drk_erstehilfe'
BASE = 'https://www.erste-hilfe-hamburg.org'
PROVIDER = 'DRK Hamburg (Kreisverband Hamburg-Nordost)'
COURSES = [  # (page, title, age range in months)
    ('/docs/301546/eh-am-kind.aspx', 'Erste Hilfe am Kind', (0, 144)),
    ('/docs/301550/erste-hilfe-am-saeugling.aspx', 'Erste Hilfe am Baby (Crashkurs)', (0, 12)),
]
SITES = '/docs/362707/schulungsorte.aspx'


def sites():
    """Training-site name -> 'Street No, PLZ Hamburg' from the Schulungsorte table."""
    out = {}
    html = get(BASE + SITES).text
    for row in re.findall(r'(?s)<tr class="DataTable(?:Second)?Row.*?</tr>', html):
        cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)]
        if len(cells) >= 4 and re.match(r'\d{5}$', cells[2]):
            out[cells[0]] = f'{cells[1]}, {cells[2]} {cells[3].split("-")[0]}'
    return out


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


def rows(path):
    """All table rows of one course page, following its pagination."""
    out, pages, done = [], [BASE + path], set()
    while pages:
        url = pages.pop(0)
        if url in done:
            continue
        done.add(url)
        html = get(url).text
        for row in re.findall(r'(?s)<tr class="DataTable(?:Second)?Row.*?</tr>', html):
            link = re.search(r'href="(/docs/[^"]+\?date=\d+)"', row)
            cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)]
            if link and len(cells) >= 4:
                out.append((BASE + link.group(1), cells))
        for p in re.findall(r'href="(https://www\.erste-hilfe-hamburg\.org' + re.escape(path) + r'\?page=\d+)"', html):
            if p not in done and len(done) < 10:
                pages.append(p)
    return out


def main():
    addr = sites()
    offers, seen = [], set()
    for path, title, age in COURSES:
        for url, cells in rows(path):
            m = re.match(r'\w\w, (\d\d)\.(\d\d)\.(\d\d)\s*/\s*(\d\d:\d\d)-(\d\d:\d\d)', cells[0])
            if not m:
                continue
            day = date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
            free_places = cells[2]
            if re.search(r'ausgebucht|keine Plätze|0 Plätze', free_places, re.I):
                continue
            site = cells[3]
            address = addr.get(site)
            if not address:  # 'Harburg, Schlossmühlendamm 30-32' style names
                parts = site.split(', ')
                address = (parts[1] + ', Hamburg') if len(parts) > 1 else None
            lat, lon = coords(address)
            price = cells[1].replace('\xa0', ' ') or None
            key = (title, day, address, m.group(4))
            if key in seen:
                continue
            seen.add(key)
            offers.append(termin(url.rsplit('=', 1)[1], title, day, url, PROVIDER, venue=f'DRK {site.split(",")[0]}', address=address,
                                 lat=lat, lon=lon, time_from=m.group(4), time_to=m.group(5), price=price, free=0 if price else None,
                                 age=age, registration='nötig', topic='erste_hilfe'))
    return finish(SOURCE_ID, 'DRK Hamburg: Erste Hilfe am Kind und am Baby', BASE + COURSES[0][0], PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
