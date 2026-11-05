"""Small helpers shared by the provider importers (import_offers_<provider>.py).

Everything stays facts only: what, when, where, age, price, link. Page texts may be read to find a date or an
age, but are never stored. `finish()` drops past dates, keeps existing data if a parser finds nothing, and
retries on a locked database so a long fetch never holds the write lock.
"""
import re
import sqlite3
import sys
import time
from datetime import date, datetime
from html import unescape

from common import DB_PATH, connect, register_source
from offers import age_range, parse_price, replace_offers
from robots_glob import polite_fetch

LICENSE = 'Fakten mit Link, keine Lizenz angegeben'
FAMILY = re.compile(r'kinder(?!ärzt|arzt|los)|\bkind\b|kids|famili|eltern|enkel|baby|krabbel|märchen|maerchen|ferien|'
                    r'puppentheater|figurentheater|jung und alt|\bab \d{1,2}( jahren| j\.)|laterne|nikolaus|weihnachtsm', re.I)
MONTHS = {m: i + 1 for i, m in enumerate(['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august',
                                          'september', 'oktober', 'november', 'dezember'])}
MONTHS_SHORT = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'])}
WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']


def clean(s):
    s = re.sub(r'(?s)<(script|style).*?</\1>|<[^>]+>', ' ', s or '')
    return re.sub(r'\s+', ' ', unescape(unescape(s)).replace('\xad', '').replace('\xa0', ' ')).strip()


def osm_coords(*names):
    """Coordinates of a named place from the OSM records, first name that matches."""
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        for name in names:
            row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND name=? AND lat IS NOT NULL LIMIT 1", (name,)).fetchone()
            if row:
                return row
        for name in names:  # second pass: name contained in a longer OSM name
            row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND name LIKE ? AND lat IS NOT NULL ORDER BY length(name) LIMIT 1",
                              (f'%{name}%',)).fetchone()
            if row:
                return row
        return None, None
    finally:
        con.close()


def age_of(text):
    """Child age range in months from text such as '8 bis 12 Jahre', 'ab 6 Jahren', '3–6 J.'; only explicit phrases."""
    t = (text or '').lower()
    mixed = re.search(r'(\d+)\s*monate?\s*[-–]\s*(\d+)\s*jahr', t)  # '10 Monate-2 Jahre'
    if mixed:
        return int(mixed.group(1)), int(mixed.group(2)) * 12 + 12
    t = re.sub(r'(\d+)\s*(bis|und)\s*(\d+)\s*(jahr|j\.|monat)', r'\1-\3 \4', t)
    t = re.sub(r'(\d+)\s*(jahre?n?\s*)?(bis|[-–])\s*(\d+)\s*(jahr|j\.)', r'\1-\4 \5', t)
    m = re.search(r'\d+\s*[-–]\s*\d+\s*(jahr|j\.|monat)|\bab\s*\d+\s*(jahr|j\.|monat)|\bbis\s*\d+\s*monat', t)
    if not m:
        return None, None
    return age_range(m.group(0))


def price_of(text):
    """Price as published: ranges stay ranges, 'kostenlos' and '6,00 EUR' are normalised."""
    t = clean(text)
    if not t:
        return None, None
    t = re.sub(r'(\d)\.(\d\d)\s*EUR', r'\1,\2 €', t).replace('EUR', '€').replace('Euro', '€')
    if re.search(r'\d\s*(€\s*)?[–-]\s*€?\s*\d', t):
        return t[:40], 0
    return parse_price(t)


def get(url, **kw):
    """Fetch with robots.txt (wildcards, Crawl-delay) honoured."""
    kw.setdefault('retries', 2)
    kw.setdefault('timeout', 40)
    return polite_fetch(url, **kw)


def read_tribe(base, until=None, pages=10):
    """Events of 'The Events Calendar' REST API as plain dicts."""
    out, page = [], 1
    today = date.today().isoformat()
    while page <= pages:
        url = f'{base}/wp-json/tribe/events/v1/events?per_page=50&start_date={today}&page={page}'
        if until:
            url += f'&end_date={until}'
        d = get(url).json()
        for e in d.get('events', []):
            v = e.get('venue') or {}
            if isinstance(v, list):
                v = v[0] if v else {}
            addr = ', '.join(x for x in [clean(v.get('address')), ' '.join(x for x in [clean(v.get('zip')), clean(v.get('city'))] if x)] if x)
            out.append({
                'id': e['id'], 'title': clean(e.get('title')), 'start': datetime.fromisoformat(e['start_date']),
                'end': datetime.fromisoformat(e['end_date']) if e.get('end_date') else None, 'allday': bool(e.get('all_day')),
                'url': e.get('url'), 'text': clean(e.get('excerpt') or e.get('description'))[:800], 'cost': e.get('cost'),
                'cats': [clean(c.get('name')) for c in (e.get('categories') or [])],
                'venue': clean(v.get('venue')) or None, 'address': addr or None,
                'lat': float(v['geo_lat']) if v.get('geo_lat') else None, 'lon': float(v['geo_lng']) if v.get('geo_lng') else None,
            })
        if page >= int(d.get('total_pages') or 1):
            break
        page += 1
    return out


def read_ics(url):
    """Events of an iCal feed as plain dicts (same keys as read_tribe; id is the UID)."""
    text = re.sub(r'\r?\n[ \t]', '', get(url).text)
    if 'BEGIN:VCALENDAR' not in text[:500]:
        raise ValueError('no iCal feed')
    out = []
    for block in re.findall(r'(?s)BEGIN:VEVENT(.*?)END:VEVENT', text):
        p = {}
        for line in block.strip().splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                p.setdefault(k.split(';')[0].upper(), v.replace('\\,', ',').replace('\\;', ';').replace('\\n', ' ').strip())

        def dt(key):
            m = re.match(r'(\d{8})(?:T(\d{6}))?', p.get(key, ''))
            if not m:
                return None, True
            return datetime.strptime(m.group(1) + (m.group(2) or '000000'), '%Y%m%d%H%M%S'), not m.group(2)
        start, allday = dt('DTSTART')
        end, _ = dt('DTEND')
        if not start:
            continue
        if p.get('DTSTART', '').endswith('Z'):  # feeds in UTC: convert to Hamburg time
            from zoneinfo import ZoneInfo
            hh, utc = ZoneInfo('Europe/Berlin'), ZoneInfo('UTC')
            start = start.replace(tzinfo=utc).astimezone(hh).replace(tzinfo=None)
            end = end.replace(tzinfo=utc).astimezone(hh).replace(tzinfo=None) if end else None
        out.append({'id': p.get('UID') or start.isoformat(), 'title': clean(p.get('SUMMARY')), 'start': start, 'end': end, 'allday': allday,
                    'url': p.get('URL'), 'text': clean(p.get('DESCRIPTION'))[:800], 'cost': None, 'cats': [clean(c) for c in p.get('CATEGORIES', '').split(',')],
                    'venue': None, 'address': None, 'location': clean(p.get('LOCATION')), 'lat': None, 'lon': None})
    return out


def from_event(e, provider, venue=None, address=None, lat=None, lon=None, age=None, registration=None):
    """Build a termin from a read_tribe / read_ics event."""
    price, free = price_of(e.get('cost'))
    day = e['start'].date()
    end_day = e['end'].date() if e.get('end') else None
    return termin(f'{e["id"]}:{day}', e['title'], day, e['url'], provider, venue=e.get('venue') or venue, address=e.get('address') or address,
                  lat=e.get('lat') or lat, lon=e.get('lon') or lon, time_from=None if e['allday'] else e['start'].strftime('%H:%M'),
                  time_to=e['end'].strftime('%H:%M') if end_day == day and not e['allday'] else None,
                  price=price, free=free, age=age if age is not None else age_of(e['title'] + ' ' + e.get('text', '')),
                  end=end_day, registration=registration, description=e.get('text', '')[:200])


def fold_weekly(offers, kind='kurs', min_count=3):
    """Fold dated offers with the same title, weekday and time, about a week apart, into one recurring offer."""
    series = {}
    for o in offers:
        series.setdefault((o['title'].lower(), o['weekday'], o.get('time_from')), []).append(o)
    out = []
    for (_, wd, tf), items in series.items():
        items.sort(key=lambda x: x['start_date'])
        days = [date.fromisoformat(x['start_date']) for x in items]
        weekly = len(items) >= min_count and all((b - a).days <= 21 for a, b in zip(days, days[1:]))
        if not weekly:
            out += items
            continue
        o = dict(items[0])
        tt = o.get('time_to')
        o.update(source_ref=o['source_ref'].rsplit(':', 1)[0] + f':series:{wd}:{tf}', kind=kind, end_date=days[-1].isoformat(), sessions=len(items),
                 schedule=f'{WEEKDAYS[wd]} {tf or ""}{"–" + tt if tt else ""}, ab {days[0].strftime("%d.%m.")}, {len(items)} Termine'.replace('  ', ' '))
        out.append(o)
    return out


def termin(ref, title, day, url, provider, venue=None, address=None, lat=None, lon=None, time_from=None, time_to=None,
           price=None, free=None, age=(None, None), end=None, registration=None, topic=None, description=None):
    """One dated event."""
    o = {'source_ref': str(ref), 'title': clean(title)[:120], 'kind': 'termin', 'weekday': day.weekday(), 'start_date': day.isoformat(),
         'end_date': end.isoformat() if end and end > day else None, 'time_from': time_from, 'time_to': time_to,
         'price': price, 'free': free, 'age_min_m': age[0], 'age_max_m': age[1], 'registration': registration,
         'venue': venue or provider, 'address': address, 'lat': lat, 'lon': lon, 'url': url, 'provider': provider, 'description': description}
    if topic:
        o['topic'] = topic
    return o


def group(ref, title, url, provider, kind='gruppe', weekday=None, schedule=None, venue=None, address=None, lat=None, lon=None,
          time_from=None, time_to=None, price=None, free=None, age=(None, None), start=None, end=None, sessions=None,
          registration=None, topic=None, description=None):
    """A recurring group ('gruppe') or a course with sessions ('kurs')."""
    o = {'source_ref': str(ref), 'title': clean(title)[:120], 'kind': kind, 'weekday': weekday, 'schedule': schedule,
         'start_date': start.isoformat() if start else None, 'end_date': end.isoformat() if end else None, 'sessions': sessions,
         'time_from': time_from, 'time_to': time_to, 'price': price, 'free': free, 'age_min_m': age[0], 'age_max_m': age[1],
         'registration': registration, 'venue': venue or provider, 'address': address, 'lat': lat, 'lon': lon, 'url': url,
         'provider': provider, 'description': description}
    if topic:
        o['topic'] = topic
    return o


def finish(source_id, name, page, provider, offers, priority=60):
    """Store offers for one source: only future ones, no duplicates, nothing changes if the parser found nothing."""
    today = date.today().isoformat()
    uniq = {}
    for o in offers:
        last = o.get('end_date') or o.get('start_date')
        if last and last < today:
            continue
        if re.search(r'abgesagt|entfällt|fällt aus|ausverkauft', o['title'], re.I):
            continue
        if (o.get('age_min_m') or 0) >= 14 * 12:  # adult or older-teen offer that only matched on an age phrase
            continue
        uniq.setdefault(o['source_ref'], o)
    offers = list(uniq.values())
    if not offers:
        sys.exit(f'{source_id}: no current offers parsed; keeping existing data')
    for attempt in range(6):
        con = connect()
        try:
            register_source(con, source_id, name, page, LICENSE, provider, priority=priority)
            n = replace_offers(con, source_id, offers)
            break
        except sqlite3.OperationalError as e:
            if 'locked' not in str(e) or attempt == 5:
                raise
            con.rollback()
            print(f'  database locked, retry {attempt + 1}')
            time.sleep(15 * (attempt + 1))
        finally:
            con.close()
    dated = sorted(o['start_date'] for o in offers if o.get('start_date'))
    print(f'{source_id}: {n} offers, {sum(1 for o in offers if o.get("lat"))} with coordinates, '
          f'{sum(1 for o in offers if o.get("age_min_m") is not None)} with age, {sum(1 for o in offers if o.get("price"))} with price'
          + (f'; {dated[0]} to {dated[-1]}' if dated else ''))
    for o in sorted(offers, key=lambda x: x.get('start_date') or '')[:8]:
        print(' ', o.get('start_date'), o['kind'], o.get('time_from'), o['title'][:55], '|', o.get('age_min_m'), o.get('age_max_m'), o.get('price'))
    return n
