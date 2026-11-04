"""Import children's and family courses of Hamburger Volkshochschule from schema.org Course data on course pages.

Listing pages ('Kinder & Jugendliche', 'Familien') give the course links; each course page has a JSON-LD
Course block. Instructor names, contact data and descriptions in that block are deliberately not stored.
Query strings other than ?p= / ?s=, search and export paths are disallowed by robots.txt and not used.
"""
import json
import re
import sys
from datetime import date, datetime
from urllib.parse import urljoin

from common import connect, register_source
from offers import age_range, replace_offers
from robots_glob import polite_fetch

SOURCE_ID = 'vhs_hamburg'
BASE = 'https://www.vhs-hamburg.de'
LISTINGS = ['/junge-vhs-481', '/kurse-fuer/kurse-fuer-familien-981', '/kurse-fuer-kinder-und-jugendliche-544']
WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
FOR_KIDS = re.compile(r'\bkinder|jugendliche|groß und klein|\bfamilie|eltern-kind', re.I)


def course_json(html):
    for block in re.findall(r'(?s)<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html):
        try:
            d = json.loads(block)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get('@type') == 'Course':
            return d
    return None


def to_offer(d, url, today):
    # the 'Junge VHS' listing also holds courses aimed at adults, so require an explicit child or family mention
    if not FOR_KIDS.search(f'{d.get("name", "")} {d.get("description", "")}'):
        return None
    inst = d.get('hasCourseInstance') or {}
    if isinstance(inst, list):
        inst = inst[0] if inst else {}
    if not inst.get('startDate'):
        return None
    start = datetime.fromisoformat(inst['startDate'])
    if start.date() < today:
        return None
    subs = inst.get('subEvents') or []
    end = datetime.fromisoformat(inst['endDate']) if inst.get('endDate') else None
    first_end = datetime.fromisoformat(subs[0]['endDate']) if subs and subs[0].get('endDate') else None
    place = (subs[0].get('location') if subs else None) or {}
    addr = place.get('address') or {}
    address = None
    if addr.get('streetAddress'):
        address = addr['streetAddress'] + (f', {addr["postalCode"]} Hamburg' if addr.get('postalCode') else ', Hamburg')
    online = inst.get('courseMode') == 'online'
    tf, tt = start.strftime('%H:%M'), first_end.strftime('%H:%M') if first_end else None
    # subEvents can be incomplete, the names state the real total ('Termin 1 von 8 - ...')
    total = re.search(r'von (\d+)', subs[0].get('name', '')) if subs else None
    n = int(total.group(1)) if total else (len(subs) or None)
    days = {datetime.fromisoformat(s['startDate']).weekday() for s in subs if s.get('startDate')}
    wd = days.pop() if len(days) == 1 else None
    day = WEEKDAYS[wd] if wd is not None else WEEKDAYS[start.weekday()]
    sched = f'{day} {tf}{"–" + tt if tt else ""}' + (f', {n}× ab {start:%d.%m.}' if n and n > 1 else '')
    offer = d.get('offers') or {}
    price = offer.get('price')
    paid = isinstance(price, (int, float)) and price > 0
    avail = offer.get('availability') or ''
    avail = ' '.join(avail) if isinstance(avail, list) else str(avail)
    amin, amax = age_range(re.sub(r'(\d+)\s*bis\s*(\d+)', r'\1-\2', d.get('name', '')))
    return {
        'source_ref': url.rstrip('/').rsplit('/', 1)[-1], 'title': d['name'][:120], 'kind': 'kurs',
        'age_min_m': amin, 'age_max_m': amax, 'weekday': wd, 'time_from': tf, 'time_to': tt,
        'start_date': start.date().isoformat(), 'end_date': end.date().isoformat() if end else None, 'sessions': n, 'schedule': sched,
        'price': f'{price:g} €'.replace('.', ',') if paid else ('kostenlos' if price == 0 else None),
        'free': 0 if paid else (1 if price == 0 else None),
        'registration': 'Warteliste' if 'SoldOut' in avail else 'nötig',
        'venue': 'Online' if online else place.get('name'), 'address': None if online else address,
        'url': url, 'provider': 'Hamburger Volkshochschule',
    }


def main():
    today = date.today()
    links = set()
    for path in LISTINGS:
        html = polite_fetch(BASE + path, retries=2).text
        links |= set(re.findall(r'href="(/kurs/[^"/]+/\d+)"', html))
    offers, skipped = [], 0
    for link in sorted(links):
        url = urljoin(BASE, link)
        d = course_json(polite_fetch(url, retries=2).text)
        o = to_offer(d, url, today) if d else None
        if o:
            offers.append(o)
        else:
            skipped += 1
    if not offers:
        sys.exit('no courses parsed; keeping existing data')
    con = connect()
    register_source(con, SOURCE_ID, 'Hamburger Volkshochschule: Kurse für Kinder und Familien', BASE + '/junge-vhs-481',
                    'Fakten mit Link, keine Lizenz angegeben', 'Hamburger Volkshochschule', priority=60)
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers from {len(links)} course pages ({skipped} past, not aimed at children or without data)')
    for o in offers:
        print(' ', o['start_date'], o['schedule'], o['title'][:48], '|', o['age_min_m'], o['age_max_m'], o['price'], '|', o['venue'], o['address'], o['registration'])


if __name__ == '__main__':
    sys.exit(main())
