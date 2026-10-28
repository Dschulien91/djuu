"""Import children's events of Bücherhallen Hamburg (public libraries) as offers.

Route: the public event list filtered to the target group 'kinder' (20 items per page, sorted by date).
robots.txt of buecherhallen.de only restricts named bots and Googlebot/bingbot (/suche?, /custom, ...);
there is no rule for other agents, so the filtered list URL is allowed. We page until the first event lies
beyond the import window, then read one detail page per distinct event (branch + slug) for age and price.
Branch coordinates come from the data attributes on /standorte.html.

Only facts are stored: short title, date, time, age, price, branch, address, link.
"""
import re
import sys
from datetime import date, timedelta
from html import unescape

from common import connect, register_source, save_raw
from offers import age_range, parse_price, replace_offers
from robots_glob import polite_fetch

SOURCE_ID = 'buecherhallen_termine'
BASE = 'https://www.buecherhallen.de/'
LIST_URL = BASE + 'termine.html?zielgruppe%5B%5D=kinder'
WINDOW_DAYS = 56
MAX_PAGES = 100
MAX_DETAILS = 400


def clean(s):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<[^>]+>', ' ', s or ''))).strip()


def dmy(s):
    d, m, y = s.split('.')
    return date(int(y), int(m), int(d))


def branches():
    """title -> dict(lat, lon, address) from the map data on the locations page."""
    html = polite_fetch(BASE + 'standorte.html').text
    out = {}
    for tag in re.findall(r'<[^>]+data-latitude=[^>]+>', html):
        a = dict(re.findall(r'data-([a-z]+)="([^"]*)"', tag))
        title = clean(a.get('title'))
        if not title:
            continue
        out[title] = {'lat': float(a['latitude']) if a.get('latitude') else None,
                      'lon': float(a['longitude']) if a.get('longitude') else None,
                      'address': clean(a.get('address')).replace('\xa0', ' ')}
    return out


def branch_info(venue, table):
    name = re.sub(r'^Bücherhalle\s+', '', venue).strip()
    return table.get(name) or table.get(venue) or {}


def parse_list(html):
    items = []
    for li in re.findall(r'(?s)<li class="event-list-item[^"]*">(.*?)</li>', html):
        href = re.search(r'href="([^"]+)"', li)
        dt = re.search(r'event-list-date-date">([^<]+)<', li)
        if not href or not dt:
            continue
        datestr = clean(dt.group(1))
        rng = re.match(r'(\d{2})\.(\d{2})\.(\d{4})?[–-](\d{2})\.(\d{2})\.(\d{4})', datestr.replace(' ', ''))
        if rng:
            d1, m1, y1, d2, m2, y2 = rng.groups()
            end = date(int(y2), int(m2), int(d2))
            start = date(int(y1 or y2), int(m1), int(d1))
            if start > end:  # range across new year without first year
                start = date(end.year - 1, int(m1), int(d1))
        elif re.match(r'\d{2}\.\d{2}\.\d{4}$', datestr):
            start = end = dmy(datestr)
        else:
            continue
        tm = re.search(r'<time datetime="([^"]+)"', li)
        times = re.findall(r'\d{1,2}:\d{2}', tm.group(1)) if tm else []
        loc = re.search(r'event-list-location">([^<]+)<', li)
        title = re.search(r'(?s)event-list-title">(.*?)</p>', li)
        path = unescape(href.group(1))
        occ = re.search(r'/datum/(\d{8})\.html', path)
        items.append({
            'path': path, 'start': start, 'end': end,
            'occurrence': date(int(occ.group(1)[:4]), int(occ.group(1)[4:6]), int(occ.group(1)[6:])) if occ else start,
            'time_from': times[0].zfill(5) if times else None,
            'time_to': times[1].zfill(5) if len(times) > 1 else None,
            'venue': clean(loc.group(1)) if loc else None,
            'title': clean(title.group(1)) if title else None,
        })
    return items


def parse_detail(html):
    info = re.search(r'(?s)<p class="event-full-info">(.*?)</p>', html)
    info = clean(info.group(1)) if info else ''
    loc = re.search(r'(?s)<div class="event-full-location">.*?<p>(.*?)</p>', html)
    address = None
    if loc:
        lines = [clean(x) for x in re.split(r'<br\s*/?>', loc.group(1))]
        lines = [x for x in lines if x]
        if len(lines) >= 3:
            address = ', '.join(lines[1:3])
    body = re.search(r'(?s)<div class="ce_text block">(.*?)</div>', html)
    body = clean(body.group(1)).lower() if body else ''
    if re.search(r'ohne anmeldung|keine anmeldung', body):
        reg = 'offen'
    elif re.search(r'anmeldung (ist )?(erforderlich|notwendig|nötig)|bitte (vorher )?anmelden|mit anmeldung|um anmeldung wird gebeten', body):
        reg = 'nötig'
    else:
        reg = None
    return info, address, reg


def age_text(info):
    """Normalise 'Ab 5 Jahren', '4 bis 8 Jahre', 'für 3- bis 6-Jährige' for offers.age_range()."""
    t = re.sub(r'(\d+)\s*-?\s*bis\s*(\d+)', r'\1-\2', info)
    t = re.sub(r'(\d+)-?\s*jährige', r'\1 jahre', t, flags=re.I)
    return t


def main():
    today = date.today()
    until = today + timedelta(days=WINDOW_DAYS)
    con = connect()
    register_source(con, SOURCE_ID, 'Bücherhallen Hamburg – Termine für Kinder', LIST_URL,
                    'Fakten mit Link, keine Lizenz angegeben', 'Bücherhallen Hamburg', priority=60)

    table = branches()
    print(f'branches with coordinates: {sum(1 for b in table.values() if b["lat"])}/{len(table)}')

    items, raw_pages = [], []
    for page in range(1, MAX_PAGES + 1):
        url = LIST_URL + (f'&page_e10={page}' if page > 1 else '')
        html = polite_fetch(url).text
        raw_pages.append(html)
        got = parse_list(html)
        if not got:
            break
        items.extend(got)
        total = re.search(r'Seite \d+ von (\d+)', html)
        if min(i['occurrence'] for i in got) > until or (total and page >= int(total.group(1))):
            break
    save_raw('buecherhallen_termine_list.html', '\n<!-- page -->\n'.join(raw_pages))
    print(f'list pages: {len(raw_pages)}, items: {len(items)}')

    items = [i for i in items if i['end'] >= today and i['start'] <= until]

    # one detail request per distinct event (same slug at the same branch shares age and price)
    details, n_req = {}, 0
    for i in items:
        key = i['path'].split('/datum/')[0]
        if key in details or n_req >= MAX_DETAILS:
            continue
        try:
            details[key] = parse_detail(polite_fetch(BASE + i['path']).text)
        except Exception as e:  # keep the list facts if one detail page fails
            print(f'  detail failed {i["path"]}: {e}')
            details[key] = ('', None, None)
        n_req += 1
    print(f'detail requests: {n_req}')

    offers, seen = [], set()
    for i in items:
        key = i['path'].split('/datum/')[0]
        single = i['start'] == i['end']
        ref = f'{key}/{i["start"].isoformat()}'  # stable for multi-day items whose list URL carries today's date
        if ref in seen:
            continue
        seen.add(ref)
        info, address, reg = details.get(key, ('', None, None))
        amin, amax = age_range(age_text(info))
        price, free = parse_price(info) if re.search(r'eintritt|€|kostenlos|frei', info, re.I) else (None, None)
        b = branch_info(i['venue'] or '', table)
        offers.append({
            'source_ref': ref,
            'title': (i['title'] or '')[:120],
            'kind': 'termin',
            'age_min_m': amin, 'age_max_m': amax,
            'weekday': i['start'].weekday() if single else None,
            'time_from': i['time_from'], 'time_to': i['time_to'],
            'start_date': i['start'].isoformat(),
            'end_date': None if single else i['end'].isoformat(),
            'price': price, 'free': free, 'registration': reg,
            'venue': i['venue'],
            'address': address or (b.get('address') + ', Hamburg' if b.get('address') else None),
            'lat': b.get('lat'), 'lon': b.get('lon'),
            'url': BASE + i['path'],
            'provider': 'Bücherhallen Hamburg',
        })
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers ({sum(1 for o in offers if o["lat"])} with coordinates)')
    for o in offers[:8]:
        print(' ', o['start_date'], o['time_from'], o['title'][:50], '|', o['venue'], '|', o['age_min_m'], o['age_max_m'], o['price'])


if __name__ == '__main__':
    sys.exit(main())
