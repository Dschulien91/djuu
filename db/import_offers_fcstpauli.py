"""Import the children's courses and holiday camps of the FC St. Pauli Rabauken (Fußballschule) in Hamburg.

Source: the Rabauken booking portal https://fussballschule.fcstpauli.com/de/portal/events (linked from
https://www.fcstpauli.com/rabauken/fussballschule): a public, paged list (20 per page) of every course and camp with
title, place, host club, type, first and last date with times, price and booking state. The portal also lists the
camps that FC St. Pauli runs at partner clubs all over Germany; only events with a Hamburg postcode are kept.
Kept: the weekly blocks (Mini-Rabauken, Mini-Ballschule, 'Ballschule für die Kleinsten' from 1.5 years,
'Ballschule für die Großen', Hip-Hop courses) as kind 'kurs' with weekday and time, and the holiday camps (Feldspieler-,
Torwart-, Power-, Mädchen-, Hallen-, Hip-Hop-Camp) as kind 'kurs' over their days. Blocks whose booking window is
closed and which already started are left out, as are fully booked ones. Ages come from the title ('Jahrgang 2020',
'1,5 bis 3 Jahre') or, for camps, from the event page ('Altersklasse: 6 bis 13 Jahre'); the event page (JSON-LD
Event) also gives the street address. Event pages already read are cached in data/raw/fcstpauli_events.json (address
and age only), so a run reads the list and only the pages of new events.
The membership-only pages of fcstpauli.com (Rabauken-Mitgliedschaft, youth teams) are not imported. No names are stored.

robots.txt: www.fcstpauli.com blocks named AI crawlers only; the portal host blocks only sign-in/coupon paths. The
provider agreed to be read (fcstpauli.com is in PERMITTED_HOSTS); the per-host pause is kept (~15-70 requests).
"""
import json
import re
import sys
from datetime import date, datetime, timedelta
from html import unescape

from common import DB_PATH
from import_offers_fbs import coords
from offers_util import WEEKDAYS, age_of, clean, finish, get, group

SOURCE_ID = 'fcstpauli_rabauken'
BASE = 'https://fussballschule.fcstpauli.com'
LIST = BASE + '/de/portal/events?event_name=&page={page}&postcode=&radius=10&view_type=list'
PAGE = 'https://www.fcstpauli.com/rabauken/fussballschule'
PROVIDER = 'FC St. Pauli Rabauken (Fußballschule)'
CACHE = DB_PATH.parent / 'raw' / 'fcstpauli_events.json'
MAX_PAGES = 30
WHEN = re.compile(r'\w\w, (\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}:\d\d) bis \w\w, (\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}:\d\d)')


def list_events():
    """Rows of all list pages: url, title, info lines, price, booking alert."""
    rows, page_no, last = [], 1, 1
    while page_no <= min(last, MAX_PAGES):
        html = get(LIST.format(page=page_no)).text
        for tr in re.findall(r'(?s)<tr>(.*?)</tr>', html):
            m = re.search(r'(?s)<strong>\s*<a href="(/de/portal/events/(\d+)[^"?]*)[^"]*">(.*?)</a></strong>(.*?)</td>(.*)', tr)
            if not m:
                continue
            info = [re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', '', x))).strip() for x in m.group(4).split('<br>')]
            price = re.search(r'regular-price">\s*([^<]+?)\s*<', m.group(5))
            alert = re.search(r'class="alert">\s*<i[^>]*></i>\s*([^<]+?)\s*<', m.group(5))
            rows.append({'url': BASE + m.group(1), 'id': m.group(2), 'title': clean(m.group(3)), 'info': [x for x in info if x],
                         'price': clean(price.group(1)) if price else None, 'alert': clean(alert.group(1)) if alert else None})
        last = max([int(x) for x in re.findall(r'[?&;]page=(\d+)', html)] or [page_no])
        page_no += 1
    return rows


def detail(url):
    """Street address, place name and the age phrase of one event page (JSON-LD Event)."""
    html = get(url).text
    for block in re.findall(r'(?s)<script type="application/ld\+json">(.*?)</script>', html):
        try:
            d = json.loads(block)
        except ValueError:
            continue
        if d.get('@type') != 'Event':
            continue
        loc = d.get('location') or {}
        a = loc.get('address') or {}
        address = ', '.join(x for x in [clean(a.get('streetAddress')), ' '.join(x for x in [clean(a.get('postalCode')), clean(a.get('addressLocality'))] if x)] if x)
        m = re.search(r'Altersklasse:?\s*([^\n•]{3,40})', d.get('description') or '')
        return {'address': address or None, 'place': clean(loc.get('name')) or None, 'age': list(age_of(m.group(1))) if m else [None, None]}
    return {}


def birth_years(title, start):
    """'Jahrgang 2020 bis 2022', 'Jahrgang 2023/24', 'Jahrgänge 2018/19' -> child age range in months at the start."""
    m = re.search(r'Jahrg\w*\s*(\d{4})(?:\s*(?:/|-|bis)\s*(\d{2,4}))?', title)
    if not m:
        return None, None
    first = int(m.group(1))
    last = int(m.group(2)) if m.group(2) else first
    if last < 100:
        last += first // 100 * 100
    oldest = (start.year - first) * 12 + start.month  # born in January of the first year
    youngest = max(0, (start.year - last - 1) * 12 + start.month)  # born in December of the last year
    return youngest, oldest


def address_of(line):
    """'Wohlwillstraße 46, 20359 Hamburg (HALLE)' -> 'Wohlwillstraße 46, 20359 Hamburg'."""
    line = (line or '').split(' - ')[-1]  # 'in Kooperation mit der Hamburger Ballschule e.V. - Carl-Cohn-Straße 2, ...'
    m = re.search(r'([A-ZÄÖÜ][\wäöüß.\- ]+?\s\d+[a-z]?),\s*(\d{5,6})\s+Hamburg', line)
    if not m:
        return None
    street = re.sub(r'Str\.|Strasse', 'Straße', m.group(1)).replace('Budapester 58', 'Budapester Straße 58')
    return f'{street}, {m.group(2)[:5] if m.group(2) != "202359" else "20359"} Hamburg'


def load_cache():
    try:
        return json.loads(CACHE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def main():
    today = date.today()
    until = today + timedelta(days=365)
    cache, fresh = load_cache(), {}
    offers, skipped = [], {}
    for r in list_events():
        info = r['info']
        zip_city = next((x for x in info if re.match(r'\d{5} Hamburg$', x)), None)
        when = next((WHEN.search(x) for x in info if WHEN.search(x)), None)
        if not zip_city or not when or not ('20000' <= zip_city[:5] <= '22999'):
            continue
        start = datetime(int(when.group(3)), int(when.group(2)), int(when.group(1)))
        end = datetime(int(when.group(7)), int(when.group(6)), int(when.group(5)))
        tf, tt = when.group(4).zfill(5), when.group(8).zfill(5)
        alert = (r['alert'] or '').lower()
        if end.date() < today or start.date() > until:
            continue
        if 'ausgebucht' in alert or 'abgesagt' in alert or ('geschlossen' in alert and start.date() < today):
            skipped[alert] = skipped.get(alert, 0) + 1
            continue
        d = cache.get(r['id'])
        if d is None:
            try:
                d = detail(r['url'])
            except Exception as e:  # the list facts are enough without the page
                print(f'  {r["id"]}: {type(e).__name__}: {e}')
                d = {}
        fresh[r['id']] = d
        host, kind_label = (info[-4], info[-3]) if len(info) >= 4 else ('FC St. Pauli', '')
        # the list names the hall of each block; the event page has the club's or the partner club's address
        address = address_of(info[0]) or d.get('address') or zip_city
        parts = address.split(', ')
        lat, lon = next((c for c in (coords(', '.join(parts[i:])) for i in range(len(parts))) if c[0]), (None, None))
        venue = d.get('place') if host != 'FC St. Pauli' else None
        partner = re.search(r'Kooperation mit (?:der|dem) (.+?) - ', info[0])
        venue = venue or (partner.group(1) if partner else f'FC St. Pauli Rabauken, {parts[0]}')
        title = re.sub(r'\s*-\s*ab (Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4}$', '', r['title'])
        camp = (end - start).days <= 7
        if camp:
            m2 = re.match(r'(.*?)\s+(\w*camp)$', title, re.I)
            if m2:  # 'Am Millerntor-Stadion 1 (März) Torwartcamp' -> 'Torwartcamp: Am Millerntor-Stadion 1 (März)'
                title = f'{m2.group(2)}: {m2.group(1)}'
            elif kind_label and 'camp' not in title.lower():
                title = f'{kind_label}: {title}'
            schedule = f'{WEEKDAYS[start.weekday()]}–{WEEKDAYS[end.weekday()]} {start:%d.%m.}–{end:%d.%m.}, {tf}–{tt}'
            sessions = (end - start).days + 1
        else:
            schedule = f'{WEEKDAYS[start.weekday()]} {tf}–{tt}, wöchentlich {start:%d.%m.}–{end:%d.%m.} (außer in den Ferien)'
            sessions = None
        age = birth_years(title, start)
        if age == (None, None):
            age = age_of(title.replace('1,5 bis', '1-'))  # 'Ballschule für die Kleinsten (1,5 bis 3 Jahre)'
            if re.search(r'1,5 bis 3 Jahre', title):
                age = (18, 48)
        if age == (None, None) and d.get('age'):
            age = tuple(d['age'])
        m = re.match(r'(\d+),(\d\d) EUR', r['price'] or '')
        price, free = (f'{m.group(1)},{m.group(2)} €', 0) if m else (None, None)
        offers.append(group(r['id'], title, r['url'], PROVIDER, kind='kurs', weekday=start.weekday(), schedule=schedule,
                            venue=venue, address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, price=price, free=free,
                            age=age, start=start.date(), end=end.date() if end.date() > start.date() else None, sessions=sessions,
                            registration='geschlossen' if 'geschlossen' in alert else 'nötig',
                            topic=None if re.search(r'hip-hop', title, re.I) else 'sport'))
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(fresh, ensure_ascii=False), encoding='utf-8')
    if skipped:
        print(f'  skipped: {skipped}')
    return finish(SOURCE_ID, 'FC St. Pauli Rabauken: Kurse und Camps für Kinder', PAGE, 'FC St. Pauli von 1910 e.V.', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
