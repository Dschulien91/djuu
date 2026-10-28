"""Import flea markets (Kinderflohmärkte) and family / children's events from the organisers' OWN calendars.

No aggregators: every event comes from the calendar of the venue that runs it, and keeps its provenance
in `provider` (organiser) and `url` (event page on the organiser's site). One combined source id.

Endpoints (probed on every run, one request per site, robots.txt incl. wildcards honoured):
  * 'The Events Calendar' REST API  /wp-json/tribe/events/v1/events   (e.g. HausDrei, Zinnschmelze)
  * 'Events Manager' iCal feed      /events.ics                        (e.g. Goldbekhaus, KulturWerk Rahlstedt)
  * Goldbekhaus market pages (/maerkte/...) list all flea market dates, incl. 'Bobbycar & Kidsklamotte'.
Candidates come from the member list of STADTKULTUR HAMBURG (Stadtteilkulturzentren, Bürgerhäuser).
Not used: stadtteilflohmarkt.de (WordPress.com site of Dinkelsbühl, not Hamburg; RSS has no items).

Events are kept when title or categories match family keywords (kinder, familie, flohmarkt, basar,
eltern, baby, krabbel, laterne, ...). Dated events become kind 'termin'; the same title on the same
weekday and time at least three times in the window is folded into one weekly 'gruppe'.
"""
import re
import sqlite3
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from html import unescape

import requests

from common import DB_PATH, connect, register_source, save_raw
from offers import age_range, parse_price, replace_offers
from robots_glob import allowed_glob, polite_fetch

SOURCE_ID = 'events_veranstalter'
WINDOW_DAYS = 56
KEYWORDS = re.compile(r'kinder(?!ärzt|arzt)|\bkind\b|kids|famili|flohmarkt|flohmärkt|basar|eltern|baby|krabbel|laterne|märchen|maerchen|'
                      r'kidsklamotte|puppentheater|figurentheater', re.I)
WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
MONTHS = {m: i + 1 for i, m in enumerate(['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august',
                                          'september', 'oktober', 'november', 'dezember'])}

# slug, organiser name, site, OSM name (for coordinates), default address (only where published by the organiser)
CANDIDATES = [
    ('hausdrei', 'HausDrei Altona', 'https://haus-drei.de', 'Haus Drei', 'Hospitalstraße 107, 22767 Hamburg'),
    ('goldbekhaus', 'Goldbekhaus', 'https://www.goldbekhaus.de', 'Goldbekhaus', 'Moorfuhrtweg 9, 22301 Hamburg'),
    ('zinnschmelze', 'Zinnschmelze', 'https://zinnschmelze.de', 'Zinnschmelze', 'Maurienstraße 19, 22305 Hamburg'),
    ('jenfeldhaus', 'Jenfeld-Haus', 'https://www.jenfeld-haus.de', 'Jenfeld-Haus', None),
    ('kulturladen_stgeorg', 'Kulturladen St. Georg', 'https://kulturladen.com', 'Kulturladen St. Georg', 'Alexanderstraße 16, 20099 Hamburg'),
    ('fz_schnelsen', 'Freizeitzentrum Schnelsen', 'https://www.fz-schnelsen.de', 'Freizeitzentrum Schnelsen', None),
    ('hh_hamm', 'Hamm (hh-hamm.de)', 'https://hh-hamm.de', None, None),
    ('kulturwerk_rahlstedt', 'KulturWerk Rahlstedt', 'https://www.kulturwerk-rahlstedt.de', 'Kulturwerk', 'Boizenburger Weg 7, 22143 Hamburg'),
    ('kulturhof_dulsberg', 'Kulturhof Dulsberg', 'https://kulturhof-dulsberg.de', 'Kulturhof Dulsberg', None),
    ('motte', 'Motte Altona', 'https://www.diemotte.de', 'Motte', None),
    ('kulturhaus_eidelstedt', 'Kulturhaus Eidelstedt', 'https://kulturhaus-eidelstedt.de', None, None),
    ('sasel_haus', 'Sasel-Haus', 'https://sasel-haus.de', None, None),
    ('brakula', 'BraKuLa Bramfeld', 'https://www.brakula.de', None, None),
    ('lola', 'LOLA Kulturzentrum Lohbrügge', 'https://www.lola-hh.de', None, None),
    ('kulturhaus_suederelbe', 'Kulturhaus Süderelbe', 'https://www.kulturhaus-suederelbe.de', None, None),
    ('kulturpalast_harburg', 'Kulturpalast Harburg', 'https://www.kulturpalast-harburg.com', None, None),
    ('buergerhaus_bornheide', 'Bürgerhaus Bornheide', 'https://buergerhaus-bornheide.de', None, None),
    ('buewi', 'Bürgerhaus Wilhelmsburg', 'https://buewi.de', None, None),
    ('ella', 'ella Kulturhaus Langenhorn', 'https://www.ella-kulturhaus.de', None, None),
    ('hornerfreiheit', 'Horner Freiheit', 'https://www.hornerfreiheit.de', None, None),
    ('kulturhaus_serrahn', 'Kulturhaus Serrahn', 'https://www.kulturhaus-serrahn.de', None, None),
    ('buergerhaus_allermoehe', 'Bürgerhaus Allermöhe', 'https://www.buergerhaus-allermoehe.de', None, None),
    ('buergerhaus_lokstedt', 'Bürgerhaus Lokstedt', 'https://www.buergerhaus-lokstedt.de', None, None),
    ('stadtteilhaus_lurup', 'Stadtteilhaus Lurup', 'https://www.stadtteilhaus-lurup.de', None, None),
    ('kulturklinker', 'Kulturklinker Barmbek', 'https://kulturklinker-barmbek.de', None, None),
    ('kulturmix_langenhorn', 'Kulturmix Langenhorn', 'https://www.kulturmix-in-langenhorn.de', None, None),
    ('koppel66', 'Koppel 66', 'https://koppel66.de', None, None),
    ('kulturwerkstatt_harburg', 'KulturWerkstatt Harburg', 'https://www.kulturwerkstatt-harburg.de', None, None),
    ('dreiundsiebzig', 'Dreiundsiebzig', 'https://www.dreiundsiebzig.de', None, None),
    ('kulturschloss_wandsbek', 'Kulturschloss Wandsbek', 'https://www.kulturschloss-wandsbek.de', None, None),
    ('buntekuh', 'Bunte Kuh', 'https://www.buntekuh-hamburg.de', None, None),
]
GOLDBEK_MARKETS = ['/maerkte/bobbycar-kidsklamotte/', '/maerkte/indoorflohmarkt/', '/maerkte/flohmarkt-auf-dem-hof/']


def clean(s):
    return re.sub(r'\s+', ' ', unescape(unescape(re.sub(r'(?s)<[^>]+>', ' ', s or '')))).strip()


def osm_coords(name):
    if not name:
        return None, None
    try:
        con = sqlite3.connect(DB_PATH)
        row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND name=? AND lat IS NOT NULL LIMIT 1",
                          (name,)).fetchone()
        con.close()
        return row if row else (None, None)
    except sqlite3.Error:
        return None, None


def age_of(title, desc):
    a = age_range(re.sub(r'(\d+)\s*bis\s*(\d+)', r'\1-\2', title))
    if a != (None, None) or not desc:
        return a
    m = re.search(r'(kinder\w*|ab|von|für)\s[^.!?]{0,30}?\d+\s*(bis|[-–])?\s*\d*\s*(jahr|monat)\w*', desc, re.I)
    return age_range(re.sub(r'(\d+)\s*bis\s*(\d+)', r'\1-\2', m.group(0))) if m else (None, None)


def price_of(cost):
    cost = clean(cost)
    if not cost:
        return None, None
    if re.search(r'\d\s*[–-]\s*€?\s*\d', cost):  # keep ranges as published, e.g. '€4 – €6'
        return cost[:40], 0
    return parse_price(cost)


# ---------------------------------------------------------------- endpoint readers

def read_tribe(org, today, until):
    slug, name, base, *_ = org
    out, page = [], 1
    while page <= 10:
        url = f'{base}/wp-json/tribe/events/v1/events?per_page=50&start_date={today}&end_date={until}&page={page}'
        if not allowed_glob(url):
            raise PermissionError('robots.txt')
        d = polite_fetch(url, retries=2, timeout=40).json()
        for e in d.get('events', []):
            v = e.get('venue') or {}
            if isinstance(v, list):
                v = v[0] if v else {}
            start = datetime.fromisoformat(e['start_date'])
            end = datetime.fromisoformat(e['end_date']) if e.get('end_date') else None
            allday = bool(e.get('all_day'))
            cats = [clean(c.get('name')) for c in (e.get('categories') or [])] + [clean(t.get('name')) for t in (e.get('tags') or [])]
            addr = ', '.join(x for x in [clean(v.get('address')), ' '.join(x for x in [clean(v.get('zip')), clean(v.get('city'))] if x)] if x)
            out.append({
                'ref': f'{slug}:{e["id"]}', 'title': clean(e.get('title')), 'cats': cats,
                'desc': clean(e.get('excerpt') or e.get('description'))[:600],
                'start': start, 'end': end, 'allday': allday, 'url': e.get('url'),
                'venue': clean(v.get('venue')) or None, 'address': addr or None,
                'lat': float(v['geo_lat']) if v.get('geo_lat') else None, 'lon': float(v['geo_lng']) if v.get('geo_lng') else None,
                'cost': e.get('cost'),
            })
        if page >= int(d.get('total_pages') or 1):
            break
        page += 1
    return out


def ics_events(text):
    text = re.sub(r'\r?\n[ \t]', '', text)  # unfold
    for block in re.findall(r'(?s)BEGIN:VEVENT(.*?)END:VEVENT', text):
        props = {}
        for line in block.strip().splitlines():
            if ':' not in line:
                continue
            k, v = line.split(':', 1)
            props.setdefault(k.split(';')[0].upper(), (k, v.replace('\\,', ',').replace('\\;', ';').replace('\\n', ' ').strip()))
        yield props


def ics_dt(prop):
    if not prop:
        return None, True
    k, v = prop
    m = re.match(r'(\d{8})(T(\d{6}))?', v)
    if not m:
        return None, True
    if not m.group(3):
        return datetime.strptime(m.group(1), '%Y%m%d'), True
    return datetime.strptime(m.group(1) + m.group(3), '%Y%m%d%H%M%S'), m.group(3) == '000000'


def read_ics(org, today, until):
    slug, name, base, *_ = org
    url = f'{base}/events.ics'
    text = polite_fetch(url, retries=2, timeout=40).text
    if 'BEGIN:VCALENDAR' not in text[:300]:
        raise ValueError('no iCal feed')
    out = []
    for p in ics_events(text):
        start, allday = ics_dt(p.get('DTSTART'))
        end, _ = ics_dt(p.get('DTEND'))
        if not start:
            continue
        loc = (p.get('LOCATION') or ('', ''))[1]
        parts = [x.strip() for x in loc.split(',') if x.strip() and x.strip() not in ('Deutschland', 'Hamburg')]
        zipc = next((x for x in parts if re.fullmatch(r'\d{5}', x)), None)
        street = next((x for x in parts[1:] if re.search(r'\d', x) and x != zipc), None)
        out.append({
            'ref': f'{slug}:{(p.get("UID") or ("", ""))[1] or start.isoformat()}:{start.date()}',
            'title': clean((p.get('SUMMARY') or ('', ''))[1]), 'cats': [clean(c) for c in (p.get('CATEGORIES') or ('', ''))[1].split(',')],
            'desc': clean((p.get('DESCRIPTION') or ('', ''))[1])[:600],
            'start': start, 'end': end, 'allday': allday, 'url': (p.get('URL') or ('', ''))[1] or base,
            'venue': parts[0] if parts else None,
            'address': f'{street}, {zipc} Hamburg' if street and zipc else None,
            'lat': None, 'lon': None, 'cost': None,
        })
    return out


def read_goldbek_markets(org):
    slug, name, base, *_ = org
    out = []
    for path in GOLDBEK_MARKETS:
        html = polite_fetch(base + path, retries=2).text
        t = clean(html)
        fee = re.search(r'Tageskasse zu (\d+),-\s*Euro', t)
        for blk in re.findall(r'(?s)<div class="mylist">(.*?)<hr', html):
            # markup is not always well-formed (missing <h6> opener), so split around the <h4> date
            parts = re.split(r'(?s)<h4>(.*?)</h4>', blk, maxsplit=1)
            if len(parts) < 3:
                continue
            title, datestr, after = clean(parts[0]), clean(parts[1]), parts[2]
            href = re.search(r'href="([^"]+)"', after)
            m = re.match(r'(\d{1,2})\.\s*(\w+)\s+(\d{4})', datestr)
            if not title or not m or m.group(2).lower() not in MONTHS:
                continue
            d = date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
            tm = re.search(r'(?s)<h6>(.*?)</h6>', after)
            times = re.findall(r'\d{1,2}:\d{2}', clean(tm.group(1)) if tm else '')
            start = datetime.combine(d, datetime.strptime(times[0], '%H:%M').time()) if times else datetime.combine(d, datetime.min.time())
            end = datetime.combine(d, datetime.strptime(times[1], '%H:%M').time()) if len(times) > 1 else None
            out.append({
                'ref': f'{slug}:{href.group(1).rstrip("/").rsplit("/", 1)[-1] if href else title}:{d}',
                'title': title, 'cats': ['Flohmarkt'], 'desc': '',
                'start': start, 'end': end, 'allday': not times, 'url': href.group(1) if href else base + path,
                'venue': 'Goldbekhaus', 'address': None, 'lat': None, 'lon': None,
                'cost': f'{fee.group(1)} €' if fee else None,
            })
    return out


def collect(org, today, until):
    """Return (organiser, events, status) for one organiser; never raises."""
    slug, name, base, *_ = org
    events, status = [], []
    try:
        events += read_tribe(org, today, until)
        status.append(f'tribe ok ({len(events)})')
    except PermissionError:
        status.append('tribe: robots.txt disallows')
    except (requests.HTTPError, ValueError, RuntimeError, requests.RequestException) as e:
        status.append(f'tribe: {str(e)[:30] or type(e).__name__}')
        try:
            got = read_ics(org, today, until)
            events += got
            status.append(f'ics ok ({len(got)})')
        except PermissionError:
            status.append('ics: robots.txt disallows')
        except Exception as e2:
            status.append(f'ics: {str(e2)[:30] or type(e2).__name__}')
    if slug == 'goldbekhaus':
        try:
            got = read_goldbek_markets(org)
            events += got
            status.append(f'market pages ok ({len(got)})')
        except Exception as e:
            status.append(f'market pages: {e}')
    return org, events, '; '.join(status)


# ---------------------------------------------------------------- build offers

def to_offers(org, events, today, until):
    slug, name, base, osm_name, default_addr = org
    lat0, lon0 = osm_coords(osm_name)
    keep, seen = [], set()
    for e in events:
        if e['ref'] in seen or not e['title']:
            continue
        seen.add(e['ref'])
        if not (today <= e['start'].date() <= until) and not (e['end'] and e['start'].date() < today <= e['end'].date()):
            continue
        if not KEYWORDS.search(e['title'] + ' ' + ' '.join(e['cats'])):
            continue
        if re.search(r'abgesagt|entfällt|fällt aus', e['title'], re.I):
            continue
        keep.append(e)
    # dedupe events found by two readers (same url + date)
    uniq = {}
    for e in keep:
        uniq.setdefault((e['url'], e['start'].date()), e)
    keep = list(uniq.values())

    offers = []
    series = defaultdict(list)
    for e in keep:
        tf = None if e['allday'] else e['start'].strftime('%H:%M')
        series[(e['title'].lower(), e['start'].weekday(), tf)].append(e)
    for (_, wd, tf), evs in series.items():
        evs.sort(key=lambda x: x['start'])
        e = evs[0]
        on_site = e['venue'] is None or (osm_name or name).lower().split()[0] in (e['venue'] or '').lower() \
            or name.lower().split()[0] in (e['venue'] or '').lower()
        lat, lon = (e['lat'], e['lon']) if e['lat'] else ((lat0, lon0) if on_site else (None, None))
        address = e['address'] or (default_addr if on_site else None)
        amin, amax = age_of(e['title'], e['desc'])
        price, free = price_of(e['cost'])
        tt = None if e['allday'] or not e['end'] or e['end'].date() != e['start'].date() else e['end'].strftime('%H:%M')
        base_offer = {
            'title': e['title'][:120], 'age_min_m': amin, 'age_max_m': amax,
            'time_from': tf, 'time_to': tt, 'price': price, 'free': free,
            'venue': e['venue'] or name, 'address': address, 'lat': lat, 'lon': lon, 'provider': name,
        }
        if len(evs) >= 3:  # weekly group
            sched = f'{WEEKDAYS[wd]} {tf or ""}{"–" + tt if tt else ""}, wöchentlich'.replace('  ', ' ')
            offers.append(dict(base_offer, source_ref=f'{slug}:series:{e["title"].lower()[:60]}:{wd}:{tf}', kind='gruppe',
                               weekday=wd, start_date=evs[0]['start'].date().isoformat(), end_date=evs[-1]['start'].date().isoformat(),
                               sessions=len(evs), schedule=sched, url=e['url']))
        else:
            for x in evs:
                multi = x['end'] and x['end'].date() > x['start'].date()
                offers.append(dict(base_offer, source_ref=x['ref'], kind='termin', weekday=x['start'].weekday(),
                                   start_date=x['start'].date().isoformat(),
                                   end_date=x['end'].date().isoformat() if multi else None, url=x['url']))
    return offers


def main():
    today = date.today()
    until = today + timedelta(days=WINDOW_DAYS)
    con = connect()
    register_source(con, SOURCE_ID, 'Veranstalter-Kalender: Flohmärkte & Familienveranstaltungen (Stadtteilkultur)',
                    'https://www.stadtkultur-hh.de/dachverband/mitglieder/',
                    'Fakten mit Link, keine Lizenz angegeben', 'jeweiliger Veranstalter (siehe provider)', priority=60)
    results = []
    with ThreadPoolExecutor(8) as ex:  # different hosts in parallel, one request at a time per host
        for org, events, status in ex.map(lambda o: collect(o, today, until), CANDIDATES):
            results.append((org, events, status))
    offers, report = [], []
    for org, events, status in results:
        got = to_offers(org, events, today, until)
        offers += got
        report.append((org[1], status, len(got)))
    save_raw('events_veranstalter_status.txt', '\n'.join(f'{n}\t{s}\t{c}' for n, s, c in report))
    n = replace_offers(con, SOURCE_ID, offers)
    for name, status, cnt in report:
        print(f'  {name:32} {cnt:4} offers | {status}')
    print(f'{SOURCE_ID}: {n} offers ({sum(1 for o in offers if o["lat"])} with coordinates, '
          f'{sum(1 for o in offers if o["kind"] == "gruppe")} weekly groups)')
    for o in sorted(offers, key=lambda o: o['start_date'])[:15]:
        print(' ', o['start_date'], o['kind'], o['time_from'], o['title'][:50], '|', o['provider'], '|', o['age_min_m'], o['age_max_m'], o['price'])


if __name__ == '__main__':
    sys.exit(main())
