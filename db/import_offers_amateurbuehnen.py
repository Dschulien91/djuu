"""Import the children's plays (mostly Weihnachtsmärchen) of six Hamburg amateur and small stages from their own programme pages.

One source, one provider per offer. Each stage has its own small parser:
- Börner Speeldeel (Gemeinschaft FSS): gemeinschaft-fss.de/speeldeel/, play heading after 'Weihnachtsmärchen <year>' and the
  table 'Termine' (date, early and late performance; rows marked '**' are closed performances). Plays in the LaLi.
- Henneberg Bühne Poppenbüttel: WordPress posts in the category 'Märchen' (/wp-json/wp/v2/posts?categories=<id>), dates
  as 'Samstag, 05. Dezember 2026 14:00 Uhr und 17:00 Uhr', price 'Eintrittspreis ...'.
- Kellertheater Hamburg: the Spielplan page (Modern Events Calendar) with one schema.org Event per performance; kept are
  performances labelled 'Kindertheater'; the age comes from the play page ('Altersfreigabe ab 6 Jahre'). Events marked
  EventCancelled (the theatre also uses it for sold-out shows) are left out.
- Amateur-Theater Altona: /termine/, the play in quotes after 'Weihnachtsmärchen' and the table 'Datum | Uhrzeit | Theatersaal
  | Adresse'.
- Theater 47 (Volksspielbühne Jenfeld): the play pages linked under /spielplan/ that have a children's price; a venue table
  and a date table with one column group per venue. Weekday performances before 13:30 are school/Kita shows and left out.
- Theater99 (SC Vier- und Marschlande): /aktuelle-produktion/ with its YesTicket list (one row per performance with place
  and prices); rows with only a group price (schools, Kitas) or 'Nur für Erwachsene' are left out.
Sold-out and cancelled performances are left out. Facts only: play, date, time, place, age, price, link to the stage page.

robots.txt: gemeinschaft-fss.de '*' only /pdf/ and /images/ (the file also lists AI crawlers by name; we read as '*');
hennebergbuehne.de, kellertheater.de (shop paths only), theater99.de (/wp-admin/): the pages used are allowed;
amateur-theater-altona.de and theater47.de (Jimdo): '*' must not read /app/ and /j/, Crawl-delay 5 (honoured by get()).
"""
import json
import re
import sys
from datetime import date, datetime
from urllib.parse import quote

import requests

from offers_util import MONTHS, age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'hh_amateurbuehnen'
PLACES = {  # venue -> address, OSM names, fallback coordinates
    'LaLi – Langenhorner Lichtspielhaus': ('Tangstedter Landstraße 182, 22415 Hamburg', ('LaLi', 'Langenhorner Lichtspielhaus'), (53.658379, 10.020698)),
    'Festsaal im Hospital zum Heiligen Geist': ('Hinsbleek 11, 22391 Hamburg', ('Hospital zum Heiligen Geist',), (53.650788, 10.077056)),
    'Kellertheater Hamburg': ('Johannes-Brahms-Platz 1, 20355 Hamburg', ('Kellertheater Hamburg',), (53.554823, 9.979256)),
    'Esther Bejarano Schule (Theatersaal)': ('Regerstraße 21, 22761 Hamburg', ('Esther-Bejarano-Schule', 'Esther Bejarano Schule'), (53.567905, 9.909761)),
    'Bürgerhaus Bornheide': ('Bornheide 76, 22549 Hamburg', ('Bürgerhaus Bornheide',), (53.588902, 9.85476)),
    'Jenfeld-Haus': ('Charlottenburger Straße 1, 22045 Hamburg', ('Jenfeld-Haus',), (53.575502, 10.134333)),
    'KörberHaus Bergedorf': ('Holzhude 1, 21029 Hamburg', ('KörberHaus',), (53.487255, 10.208521)),
    'Schule Curslack-Neuengamme': ('Gramkowweg 5, 21039 Hamburg', ('Schule Curslack-Neuengamme',), (53.448427, 10.219676)),
}
WEEKDAY_SCHOOL = '13:30'  # weekday performances that start earlier are school/Kita shows


def where(venue, address=None):
    """Venue, address and coordinates: known places first, then OSM by name."""
    for name, (addr, osm, (flat, flon)) in PLACES.items():
        if name.split(' (')[0].split(' – ')[0].lower() in venue.lower():
            lat, lon = osm_coords(*osm)
            return name, addr, lat or flat, lon or flon
    lat, lon = osm_coords(venue)
    return venue, address, lat, lon


def hm(h, m):
    return f'{int(h):02d}:{m}'


def school_show(day, tm):
    return day.weekday() < 5 and tm and tm < WEEKDAY_SCHOOL


def offer(provider, ref, title, day, tm, url, venue, address=None, age=(None, None), price=None, free=None):
    venue, address, lat, lon = where(venue, address)
    return termin(f'{provider[:12]}:{ref}', title, day, url, provider, venue=venue, address=address, lat=lat, lon=lon, time_from=tm,
                  price=price, free=free, age=age, registration='Tickets', topic='theater')


def year_of(dd, mm, today):
    return today.year + 1 if (date(today.year, mm, dd) - today).days < -60 else today.year


# --- Börner Speeldeel -------------------------------------------------------------------------------------------------
def speeldeel(today):
    url = 'https://www.gemeinschaft-fss.de/speeldeel/'
    provider = 'Börner Speeldeel'
    html = get(url).text
    heads = [clean(h) for h in re.findall(r'(?s)<h[1-4][^>]*>(.*?)</h[1-4]>', html)]
    i = next((k for k, h in enumerate(heads) if re.search(r'märchen\s*\d{4}', h, re.I)), None)
    if i is None or i + 1 >= len(heads):
        return []
    kind = re.sub(r'\s*\d{4}$', '', heads[i])  # 'Weihnachtsmärchen'
    title = f'{heads[i + 1]} – {kind} der Börner Speeldeel'
    table = re.search(r'(?s)<table id="termine">(.*?)</table>', html)
    out = []
    for row in re.findall(r'(?s)<tr>(.*?)</tr>', table.group(1) if table else ''):
        cells = re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)
        d = re.search(r'(\d{1,2})\.(\d{1,2})\.(?:<[^>]+>)*\s*(\d{2})\s*(?:<[^>]+>)*\s*(\d{2})', cells[0]) if cells else None
        if not d:
            continue
        day = date(int(d.group(3) + d.group(4)), int(d.group(2)), int(d.group(1)))
        for c in cells[1:]:
            t = re.search(r'(\d{1,2}):(\d\d)', c)
            if not t or c.count('&ast;') + c.count('*') >= 2 or re.search(r'ausverkauft|geschlossen', c, re.I):
                continue
            out.append(offer(provider, f'{day}T{hm(*t.groups())}', title, day, hm(*t.groups()), url, 'LaLi – Langenhorner Lichtspielhaus'))
    return out


# --- Henneberg Bühne ---------------------------------------------------------------------------------------------------
HB_DATE = re.compile(r'(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s*(\d{1,2})\.\s*(' + '|'.join(MONTHS) +
                     r')\s+(\d{4}),?\s*((?:\d{1,2}[:.]\d\d\s*(?:Uhr)?\s*(?:und|,|\+|/)?\s*)+)', re.I)


def henneberg(today):
    base = 'https://theater.hennebergbuehne.de'
    provider = 'Henneberg Bühne Poppenbüttel e.V.'
    cats = get(base + '/wp-json/wp/v2/categories?slug=maerchen&_fields=id').json()
    if not cats:
        return []
    posts = get(base + f'/wp-json/wp/v2/posts?categories={cats[0]["id"]}&per_page=10&_fields=id,link,title,content').json()
    out = []
    for p in posts:
        text = clean(p['content']['rendered'])
        price, free = price_of((re.search(r'Eintrittspreis\s*([^()]{1,30})', text) or [0, ''])[1])
        if price and (m := re.search(r'Kinder bis (\d+) Jahre\s*([\d,]+\s*€)', text)):
            price = f'{price}, Kinder bis {m.group(1)} J. {m.group(2)}'
        title = clean(p['title']['rendered'])
        if re.search(r'weihnachtsmärchen', text, re.I) and 'märchen' not in title.lower():
            title += ' – Weihnachtsmärchen'
        for dd, mon, yy, times in HB_DATE.findall(text):
            day = date(int(yy), MONTHS[mon.lower()], int(dd))
            for h, m in re.findall(r'(\d{1,2})[:.](\d\d)', times):
                if not school_show(day, hm(h, m)):
                    out.append(offer(provider, f'{p["id"]}:{day}T{hm(h, m)}', title, day, hm(h, m), p['link'],
                                     'Festsaal im Hospital zum Heiligen Geist', age=age_of(text), price=price, free=free))
    return out


# --- Kellertheater -----------------------------------------------------------------------------------------------------
def kellertheater(today):
    url = 'https://kellertheater.de/spielplan/'
    provider = 'Kellertheater Hamburg e.V.'
    html = get(url).text
    labels = {}  # event page -> labels shown in the list
    for href, rest in re.findall(r'(?s)<h3 class="mec-event-title"><a[^>]*href="([^"?]+)[^"]*"[^>]*>.*?</a>(.*?)</h3>', html):
        labels.setdefault(href, set()).update(clean(x) for x in re.findall(r'class="mec-label-normal"[^>]*>(.*?)</span>', rest))
    ages, out = {}, []
    for block in re.findall(r'(?s)<script type="application/ld\+json">(.*?)</script>', html):
        if '"Event"' not in block:
            continue
        try:
            e = json.loads(block)
        except ValueError:
            continue
        page = (e.get('offers') or {}).get('url') or e.get('url') or ''
        if not any('kinder' in x.lower() for x in labels.get(page, ())):
            continue
        if not e.get('eventStatus', '').endswith('EventScheduled'):
            continue
        start = datetime.fromisoformat(e['startDate'][:19])
        title = clean(e.get('name'))
        if title not in ages:
            try:
                p = get(page)
                body = clean(p.text[p.text.find('Stückbeschreibung'):][:6000]) if 'Stückbeschreibung' in p.text else ''
                ages[title] = (age_of((re.search(r'Altersfreigabe\s*(ab \d+ Jahre?n?)', body) or [0, ''])[1]), p.url)
            except (requests.RequestException, PermissionError, RuntimeError):
                ages[title] = ((None, None), page)
        age, link = ages[title]
        tm = start.strftime('%H:%M')
        if school_show(start.date(), tm):
            continue
        out.append(offer(provider, f'{start:%Y-%m-%dT%H%M}:{page.rstrip("/").rsplit("/", 1)[1][:40]}', title, start.date(), tm, link,
                         'Kellertheater Hamburg', age=age))
    return out


# --- Amateur-Theater Altona --------------------------------------------------------------------------------------------
def ata(today):
    url = 'https://www.amateur-theater-altona.de/termine/'
    provider = 'Amateur-Theater Altona e.V.'
    html = get(url).text
    text = clean(html)
    title = (re.search(r'[„"]([^"“”]{3,80})["“”]\s*Ein Märchen', text) or [0, ''])[1]
    if not title:
        return []
    age = age_of((re.search(r'für Kinder ab \d+ Jahren', text) or [''])[0])
    pr = re.search(r'Eintritt\s*Erwachsene\s*([\d,]+)\s*EUR\s*Kinder bis einschl\.\s*(\d+) Jahre\s*([\d,]+)\s*EUR', text)
    price = f'Erwachsene {pr.group(1)} €, Kinder bis {pr.group(2)} J. {pr.group(3)} €' if pr else None
    out = []
    for row in re.findall(r'(?s)<tr[^>]*>(.*?)</tr>', html):
        cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)]
        if len(cells) < 3:
            continue
        d = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', cells[0])
        t = re.search(r'(\d{1,2})[:.](\d\d)', cells[1])
        if not (d and t) or re.search(r'ausverkauft|entfällt|abgesagt', ' '.join(cells), re.I):
            continue
        day = date(int(d.group(3)), int(d.group(2)), int(d.group(1)))
        venue = cells[2] + (' (Theatersaal)' if 'schule' in cells[2].lower() else '')
        address = f'{cells[3]}, Hamburg' if len(cells) > 3 and cells[3] else None
        out.append(offer(provider, f'{day}T{hm(*t.groups())}', f'{title}', day, hm(*t.groups()), url, venue, address, age=age, price=price))
    return out


# --- Theater 47 --------------------------------------------------------------------------------------------------------
def theater47(today):
    base = 'https://www.theater47.de'
    provider = 'Theater 47 (Volksspielbühne Jenfeld von 1947 e.V.)'
    home = get(base + '/spielplan/').text
    out = []
    for path in sorted(set(re.findall(r'href="(/spielplan/[^"/]+/)"', home))):
        url = base + quote(path)
        html = get(url).text
        text = clean(html[html.find('<body'):])
        if not re.search(r'\bKinder\s*\d', text):  # children's price -> a play for children
            continue
        title = clean((re.search(r'(?s)<title>(.*?)</title>', html) or [0, ''])[1]).split(' - ')[0].strip()
        tables = re.findall(r'(?s)<table[^>]*>(.*?)</table>', html)
        venues, out_before = [], len(out)
        for tb in tables:
            if '<h3' in tb and not venues:  # the venue table: one cell per venue, name in <h3>, street and town in <p>
                for cell in re.findall(r'(?s)<td[^>]*>(.*?)</td>', tb):
                    heads = [clean(h) for h in re.findall(r'(?s)<h3[^>]*>(.*?)</h3>', cell)]
                    if heads:
                        ps = [clean(p) for p in re.findall(r'(?s)<p[^>]*>(.*?)</p>', cell) if clean(p)]
                        addr = ', '.join(ps[:2]) if len(ps) >= 2 and re.match(r'\d{5}', ps[1]) else None
                        venues.append((' '.join(heads), addr))
                continue
            for row in re.findall(r'(?s)<tr[^>]*>(.*?)</tr>', tb):
                cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)]
                groups, cur = [], []
                for c in cells + ['']:
                    if c:
                        cur.append(c)
                    elif cur:
                        groups.append(cur)
                        cur = []
                for k, g in enumerate(groups):
                    d = next((re.search(r'(\d{1,2})\.(\d{1,2})\.', c) for c in g if re.fullmatch(r'\d{1,2}\.\d{1,2}\.(\d{4})?', c)), None)
                    tcell = next((c for c in g if 'Uhr' in c), '')
                    if not d or re.search(r'ausverkauft|entfällt', ' '.join(g), re.I):
                        continue
                    pcell = next((c for c in g if '€' in c), '')
                    price, free = (pcell[:40], 0) if pcell else (None, None)
                    dd, mm = int(d.group(1)), int(d.group(2))
                    day = date(year_of(dd, mm, today), mm, dd)
                    venue, addr = venues[k] if k < len(venues) else (venues[0] if venues else ('Theater 47', None))
                    for h, m in re.findall(r'(\d{1,2})[.:](\d\d)', tcell):
                        if school_show(day, hm(h, m)):
                            continue
                        out.append(offer(provider, f'{path.strip("/").rsplit("/", 1)[1][:20]}:{day}T{hm(h, m)}', title, day, hm(h, m), url,
                                         venue, addr, age=age_of(text), price=price, free=free))
        if len(out) == out_before:
            print(f'  theater47: no dates parsed on {path}')
    return out


# --- Theater99 ---------------------------------------------------------------------------------------------------------
def theater99(today):
    url = 'https://theater99.de/aktuelle-produktion/'
    provider = 'Theater99 (SC Vier- und Marschlande)'
    html = get(url).text
    head = clean(html[html.find('Aktuelle Produktion'):html.find("ytp-events")])
    age = age_of(head)
    out = []
    for row in re.split(r"<div class='ytp-event-row'", html)[1:]:
        name = clean((re.search(r"(?s)ytp-event-name'>(.*?)<span", row) or [0, ''])[1])
        d = re.search(r"ytp-event-date'>\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\d{1,2}):(\d\d)", row)
        if not (name and d) or re.search(r'nur für erwachsene|ausverkauft|abgesagt', clean(row), re.I):
            continue
        t = clean(row)
        tickets = (re.search(r'Tickets (.*?) Ort ', t) or [0, ''])[1]
        if not tickets or re.fullmatch(r'\s*Gruppenpreis.*', tickets):  # group price only: school / Kita performance
            continue
        prices = sorted({p for p in re.findall(r'(\d+),00 EUR', tickets)}, key=int)
        price = (f'{prices[0]} €' if len(prices) == 1 else f'{prices[0]}–{prices[-1]} €') if prices else None
        place = (re.search(r' Ort (.*?) (?:Zurück|$)', t) or [0, ''])[1]
        venue = clean((re.search(r"ytp-event-location'>(.*?)<", row) or [0, ''])[1])
        addr = re.search(r'(\S.*?\d+[a-z]?)\s+(\d{5})\b', place[len(venue):].strip()) if place.startswith(venue) else None
        address = f'{addr.group(1)}, {addr.group(2)}{" Hamburg" if " Hamburg " in place else ""}' if addr else None
        day, tm = date(int(d.group(3)), int(d.group(2)), int(d.group(1))), hm(d.group(4), d.group(5))
        if school_show(day, tm):
            continue
        out.append(offer(provider, f'{day}T{tm}:{venue[:20]}', name, day, tm, url, venue, address, age=age, price=price, free=0 if price else None))
    return out


STAGES = [speeldeel, henneberg, kellertheater, ata, theater47, theater99]


def main():
    today, offers = date.today(), []
    for stage in STAGES:
        try:
            got = stage(today)
        except (requests.RequestException, PermissionError, RuntimeError, ValueError) as e:
            print(f'  {stage.__name__}: {type(e).__name__} {e}')
            continue
        print(f'  {stage.__name__}: {len(got)} performances')
        offers += got
    return finish(SOURCE_ID, 'Hamburger Amateur- und Kleinbühnen: Kinderstücke', 'https://www.gemeinschaft-fss.de/speeldeel/',
                  'Börner Speeldeel / Henneberg Bühne / Kellertheater / Amateur-Theater Altona / Theater 47 / Theater99', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
