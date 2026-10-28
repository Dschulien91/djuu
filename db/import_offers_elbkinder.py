"""Offers from Elbkinder Eltern-Kind-Zentren (weekly family programme) and Bäderland baby swimming courses.

(1) Elbkinder: every EKiZ page listed in the places sitemap carries JSON-LD (name, address, geo) and a block
    "Wöchentliches Angebot für Familien" ordered by weekday. One offer per weekday slot, kind 'gruppe'.
(2) Bäderland: the baby course overview links to course detail pages; each detail page lists the pools that
    offer the course. One offer per (course, pool), kind 'kurs'. Dates live in the Bäderland shop
    (crawl-delay 10), which we do not crawl; the schedule only points there.

Only facts are stored (title, weekday/time, age, price hint, venue, address, link). No descriptions, no names.
Run: cd db && python import_offers_elbkinder.py
"""
import html
import json
import re
import sys
from urllib.parse import unquote_plus, urljoin

from common import connect, fetch, register_source
from offers import age_range, parse_price, replace_offers, topic_of

# ---------------------------------------------------------------- shared helpers

WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']


def html_lines(fragment):
    """Turn an HTML fragment into trimmed text lines, splitting only at block-level tags."""
    t = re.sub(r'(?is)<(script|style|svg|template)[^>]*>.*?</\1>', '', fragment)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'(?i)<br\s*/?>|</?(p|div|li|ul|ol|h\d|section|tr|td)(\s[^>]*)?>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', '', t)).replace('\xa0', ' ')
    return [re.sub(r'\s+', ' ', l).strip(' >') for l in t.split('\n') if l.strip(' >\xa0')]


def slug(text):
    t = text.lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        t = t.replace(a, b)
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def hm(text):
    """'9' / '9.30' / '9:30' -> '09:00' / '09:30'."""
    h, _, m = text.replace(':', '.').partition('.')
    return f'{int(h):02d}:{int(m or 0):02d}'


# ---------------------------------------------------------------- (1) Elbkinder EKiZ

EK_SITEMAP = 'https://elbkinder-kitas.de/sitemaps/places-1.xml'
EK_LIST = 'https://www.elbkinder-kitas.de/de/fuer-familien/eltern-kind-zentren'

TIME_RX = re.compile(r'^(?:(ab)\s*)?(\d{1,2}(?:[.:]\d{2})?)(?:\s*[–-]\s*(\d{1,2}(?:[.:]\d{2})?))?\s*Uhr'
                     r'(?:\s*und\s*\d{1,2}(?:[.:]\d{2})?\s*[–-]\s*(\d{1,2}(?:[.:]\d{2})?)\s*Uhr)?$', re.I)
PART_OF_DAY = {'vormittags': 'vormittags', 'nachmittags': 'nachmittags'}
FREQ_RX = re.compile(r'(jeden\s+\d\.(?:\s*und\s*\d\.)?\s+\w+\s+im\s+monat|\d-mal\s+(?:im\s+monat|monatlich|im\s+jahr)'
                     r'|einmal\s+im\s+monat|1\s*x\s+im\s+monat|alle\s+\d+\s+(?:wochen|monate|tage)|alle\s+14\s+tage'
                     r'|14-tägig|monatlich|wöchentlich|(?:nach|mit\s+vorheriger)\s+(?:absprache|terminvereinbarung|terminvergabe)'
                     r'|blockweise[^)]*|auf\s+wunsch)', re.I)
# Pages whose JSON-LD has no address/geo. The Osdorf page says the EKiZ is in the Bürgerhaus Bornheide;
# address and coordinates of that building from OpenStreetMap.
EK_FALLBACK = {'eltern-kind-zentrum-osdorf': ('Bornheide 76, 22549 Hamburg', 53.58890, 9.85476)}
SKIP_TITLE = re.compile(r'^(gemeinsames\s+)?mittagessen\b', re.I)


def ek_short_title(line):
    """Short title: drop explanations after a dash/colon, frequency phrases and quotes."""
    t = line.replace('„', '').replace('“', '').replace('"', '').strip()
    m = re.match(r'^(.{0,60}?(?:im monat|monatlich))\s*:\s*(.+)$', t, re.I)
    if m:  # 'Jeden 1. und 3. Mittwoch im Monat: Mütterberatung'
        t = m.group(2)
    t = re.split(r'(?<!\d)\s+[–-]\s+|(?<=\d)\s+[–-]\s+(?!\d)|:\s+', t, maxsplit=1)[0]
    t = re.sub(r'\(\s*[^)]*\)', lambda p: '' if FREQ_RX.search(p.group(0)) else p.group(0), t)
    t = FREQ_RX.sub('', t)
    t = re.sub(r'\s*\(\s*\)|\s+(mit|von|vom|bei|durch|inkl\.)\s+(?=[A-ZÄÖÜ])(?!Kinder|Baby|Hebamme|Familien|Eltern|Turnen|Beratung|Frühstück).*$', '', t)
    t = re.sub(r'\s{2,}', ' ', t).strip(' ,.;')
    if len(t) > 50:  # long enumerations: keep the first item
        cut = t.find(', ', 15)
        t = t[:cut] if cut > 0 else t
        if t.count('(') > t.count(')'):
            t = t[:t.rfind('(')].rstrip(' ,')
    if len(t) > 60:
        t = t[:60].rsplit(' ', 1)[0] + ' …'
    return t[:1].upper() + t[1:]


def ek_topic(title, line):
    tl = title.lower()
    if 'gedichte für wichte' in tl or 'vorles' in tl:
        return 'lesen'
    if re.search(r'babymassage|baby-wellness', tl):
        return 'babymassage'
    if re.search(r'rückbildung|geburtsvorbereit', tl):
        return topic_of(tl)
    if re.search(r'^(offenes |gemeinsames |gemütliches |kostenloses )?frühstück', tl):
        return 'eltern_cafe'
    if re.search(r'babygruppe|babyclub|baby-oase|spielkreis|spielgruppe|offener treff|offenes angebot|freispiel|freies spielen', tl):
        return 'krabbelgruppe'
    if re.search(r'beratung|sprechstunde|ambulanz|frühe hilfen|wellcome|lotsin|stadtteileltern|hebamme', tl):
        return 'beratung'
    if re.search(r'turnen|bewegung|kreisspiel', tl):
        return 'pekip'
    if re.search(r'babysignal|musik|sing', tl):
        return 'musik'
    t = topic_of(title)
    return t if t != 'sonstiges' else topic_of(line)


def ek_weekly_lines(page):
    """Lines of the weekly programme block (from its h2 to the next heading)."""
    m = re.search(r'<h2[^>]*>(?:\s*<[^>]+>)*\s*W(?:ö|&ouml;)chentliches Angebot[^<]*(?:<[^>]+>\s*)*?</h2>', page)
    if not m:
        return None
    end = re.compile(r'<h[234][\s>]').search(page, m.end())
    return html_lines(page[m.end(): end.start() if end else m.end() + 20000])


def ek_jsonld(page):
    for blob in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            d = json.loads(blob)
        except ValueError:
            continue
        types = d.get('@type') if isinstance(d.get('@type'), list) else [d.get('@type')]
        if 'ChildCare' in types:
            return d
    return {}


def ek_parse(url, page):
    """Return (offers, note) for one EKiZ page."""
    ld = ek_jsonld(page)
    lines = ek_weekly_lines(page)
    if lines is None:
        return [], 'no weekly block'
    name = ld.get('name') or html.unescape(re.search(r'<title>([^<–]+)', page).group(1)).strip()
    a = ld.get('address') or {}
    address = ', '.join(x for x in [a.get('streetAddress'), ' '.join(x for x in [a.get('postalCode'), a.get('addressLocality')] if x)] if x) or None
    geo = ld.get('geo') or {}
    page_slug = url.rstrip('/').split('/')[-1]
    if not geo and page_slug in EK_FALLBACK:
        address, lat, lon = EK_FALLBACK[page_slug]
        geo = {'latitude': lat, 'longitude': lon}
    block_text = ' '.join(lines).lower()
    all_free = bool(re.search(r'(alle|unsere)\s+(pädagogischen\s+und\s+beratenden\s+)?(angebote|kurse)[^.]{0,60}(kostenfrei|kostenlos)', block_text))
    offers, seen = [], {}
    day, pending = None, None  # pending = (time_from, time_to, label)
    for line in lines:
        low = line.lower().rstrip(':')
        if low in (w.lower() for w in WEEKDAYS):
            day, pending = [w.lower() for w in WEEKDAYS].index(low), None
            continue
        if low.startswith('an jedem öffnungstag'):
            day, pending = None, None  # repeated under each weekday anyway
            continue
        tm = TIME_RX.match(line)
        if tm:
            frm = hm(tm.group(2))
            to = hm(tm.group(4) or tm.group(3)) if (tm.group(4) or tm.group(3)) else None
            pending = (frm, to, ('ab ' if tm.group(1) and not to else '') + frm + (f'–{to}' if to else ''))
            continue
        if low in PART_OF_DAY:
            pending = (None, None, PART_OF_DAY[low])
            continue
        fm = FREQ_RX.fullmatch(line.strip(' :'))
        if fm and day is not None:  # qualifier line such as 'Jeden 1. und 3. Mittwoch im Monat' for the next item
            pending = (pending[0], pending[1], (pending[2] + ', ' if pending and pending[2] else '') + fm.group(0)) if pending else (None, None, fm.group(0))
            continue
        if day is None:
            continue
        if not pending and re.search(r'[.!]$', line) and len(line.split()) >= 4:
            continue  # explanatory sentence, not an offer
        if SKIP_TITLE.match(line):
            pending = None
            continue
        title = ek_short_title(line)
        if len(title) < 3:
            continue
        frm, to, label = pending or (None, None, None)
        pending = None
        freq = FREQ_RX.search(line)
        sched = WD_SHORT[day] + (f' {label}' if label else '') + (f', {freq.group(1)}' if freq else '')
        amin, amax = age_range(FREQ_RX.sub('', line))
        if re.search(r'kostenlos|kostenfrei', line, re.I):
            price, free = parse_price('kostenlos')
        elif all_free:
            price, free = 'kostenlos', 1
        else:
            price, free = None, None
        if re.search(r'anmeldung notwendig|nach terminverein|nach terminvergabe|nach absprache|mit vorheriger absprache', line, re.I):
            reg = 'nötig'
        elif re.search(r'ohne anmeldung', line + ' ' + block_text, re.I):
            reg = 'offen'
        else:
            reg = None
        ref = f'{page_slug}:{day}:{frm or "-"}:{slug(title)[:40]}'
        seen[ref] = seen.get(ref, 0) + 1
        if seen[ref] > 1:
            ref += f':{seen[ref]}'
        offers.append({
            'source_ref': ref, 'title': title, 'kind': 'gruppe', 'topic': ek_topic(title, line),
            'age_min_m': amin, 'age_max_m': amax, 'weekday': day, 'time_from': frm, 'time_to': to,
            'schedule': sched, 'price': price, 'free': free, 'registration': reg,
            'venue': name, 'address': address, 'lat': geo.get('latitude'), 'lon': geo.get('longitude'),
            'url': ld.get('url') or url, 'provider': 'Elbkinder',
        })
    return offers, ('no weekday slots' if not offers else None)


def import_elbkinder(con):
    register_source(con, 'elbkinder_ekiz', 'Elbkinder Eltern-Kind-Zentren', EK_LIST,
                    'Fakten mit Link, keine Lizenz angegeben', 'Elbkinder Kitas Hamburg', 65)
    sm = fetch(EK_SITEMAP).text
    urls = [u for u in re.findall(r'<loc>([^<]+)</loc>', sm) if '/fuer-familien/eltern-kind-zentren/' in u]
    print(f'elbkinder: {len(urls)} EKiZ pages')
    offers, skipped = [], []
    for u in urls:
        try:
            page = fetch(u, check_robots=True).text
        except Exception as e:  # keep going, report at the end
            skipped.append((u, f'{type(e).__name__}: {e}'))
            continue
        got, note = ek_parse(u, page)
        print(f'  {u.rsplit("/", 1)[-1]}: {len(got)}' + (f' ({note})' if note else ''))
        if note:
            skipped.append((u, note))
        offers += got
    n = replace_offers(con, 'elbkinder_ekiz', offers)
    print(f'elbkinder_ekiz: {n} offers')
    return n, skipped


# ---------------------------------------------------------------- (2) Bäderland baby courses

BL = 'https://www.baederland.de'
BL_OVERVIEW = BL + '/kurse/babykurse/'

# Pool coordinates (OpenStreetMap, via the Djuu places table); key = slug of the Bäderland pool page.
POOL_COORDS = {
    'alsterschwimmhalle': (53.56044, 10.02128), 'bartholomaeustherme': (53.57694, 10.02723),
    'billebad': (53.49252, 10.21299), 'bondenwald': (53.62433, 9.93689),
    'familienbad-ohlsdorf': (53.62138, 10.03000), 'familienbad-rahlstedt': (53.59887, 10.15132),
    'festland': (53.55420, 9.95144), 'holthusenbad': (53.58984, 9.99059), 'kaifubad': (53.57121, 9.96319),
    'naturbad-stadtparksee': (53.59223, 10.02807), 'parkbad': (53.65043, 10.16615),
    'schwimmbad-billstedt': (53.54064, 10.11768), 'schwimmbad-blankenese': (53.56653, 9.82191),
    'schwimmbad-bramfeld': (53.61099, 10.06791), 'schwimmbad-elbgaustrasse': (53.60245, 9.88822),
    'schwimmbad-finkenwerder': (53.53927, 9.87163), 'schwimmbad-st-pauli': (53.55388, 9.96602),
    'schwimmbad-suederelbe': (53.46940, 9.85159), 'schwimmbad-wandsbek': (53.57555, 10.07256),
    'schwimmhalle-inselpark': (53.49505, 10.00178), 'sommerfreibad-billstedt': (53.54043, 10.11746),
    'sommerfreibad-bondenwald': (53.62434, 9.93736), 'sommerfreibad-finkenwerder': (53.53927, 9.87163),
    'sommerfreibad-kaifubad': (53.57187, 9.96271), 'sommerfreibad-marienhoehe': (53.57484, 9.79485),
    'sommerfreibad-neugraben': (53.47716, 9.86447), 'sommerfreibad-osdorfer-born': (53.58482, 9.84110),
}

COURSE_TOPIC = {'aqua kita': 'schwimmen', 'aqua baby': 'schwimmen'}


def bl_pool_address(pool_slug, cache):
    """Address from the pool page's map link, e.g. maps/place/Reetwerder+25,21029+Hamburg."""
    if pool_slug in cache:
        return cache[pool_slug]
    addr = None
    try:
        page = fetch(f'{BL}/baeder/alle-baeder/{pool_slug}/', check_robots=True).text
        m = re.search(r'google\.[a-z.]+/maps/place/([^"\'&?]+)', page)
        if m:
            addr = re.sub(r'\s*,\s*', ', ', unquote_plus(html.unescape(m.group(1)))).strip(', ')
    except Exception as e:
        print(f'  pool page {pool_slug}: {type(e).__name__}')
    cache[pool_slug] = addr
    return addr


def import_baederland(con):
    register_source(con, 'baederland_kurse', 'Bäderland Hamburg Babykurse', BL_OVERVIEW,
                    'Fakten mit Link', 'Bäderland Hamburg', 60)
    overview = fetch(BL_OVERVIEW, check_robots=True).text
    details = list(dict.fromkeys(urljoin(BL, h) for h in re.findall(r'href="((?:https://www\.baederland\.de)?/kurse/alle-kurse/kurs-detail/[^"#?]+)"', overview)))
    print(f'baederland: {len(details)} course pages')
    pool_slugs = {}
    alle = fetch(BL + '/baeder/alle-baeder/', check_robots=True).text
    for s in re.findall(r'href="/baeder/alle-baeder/([^"/#?]+)/"', alle):
        pool_slugs[s] = s
    offers, skipped, addr_cache = [], [], {}
    for durl in details:
        try:
            page = fetch(durl, check_robots=True).text
        except Exception as e:
            skipped.append((durl, f'{type(e).__name__}: {e}'))
            continue
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
        title = ' '.join(html_lines(h1.group(1))) if h1 else durl.rstrip('/').rsplit('/', 1)[-1]
        title = re.sub(r'\s+', ' ', title).strip()
        dur = re.search(r'Dauer:\s*</span>\s*<span>([^<]+)', page)
        locs = re.findall(r'<li class="course-content--location">(.*?)</li>', page, re.S)
        if not locs:
            skipped.append((durl, 'no pool list'))
            continue
        amin, amax = age_range(title)
        tl = title.lower()
        topic = next((v for k, v in COURSE_TOPIC.items() if k in tl), None) or topic_of(title)
        course_slug = durl.rstrip('/').rsplit('/', 1)[-1]
        for li in locs:
            pool = html.unescape(re.sub(r'<[^>]+>', '', re.search(r'<span>(.*?)</span>', li, re.S).group(1))).strip()
            bookable = 'keine buchbaren' not in li
            ps = slug(pool)
            if ps not in pool_slugs:
                print(f'  unknown pool page for {pool!r}')
            lat, lon = POOL_COORDS.get(ps, (None, None))
            offers.append({
                'source_ref': f'{course_slug}:{ps}', 'title': title, 'kind': 'kurs', 'topic': topic,
                'age_min_m': amin, 'age_max_m': amax, 'schedule': 'Kurstermine im Bäderland-Shop',
                'registration': 'nötig', 'venue': pool, 'address': bl_pool_address(ps, addr_cache) if ps in pool_slugs else None,
                'lat': lat, 'lon': lon, 'url': durl, 'provider': 'Bäderland Hamburg',
                'raw': {'bookable_now': bookable, 'duration': dur.group(1).strip() if dur else None},
            })
        print(f'  {title}: {len(locs)} pools')
    n = replace_offers(con, 'baederland_kurse', offers)
    print(f'baederland_kurse: {n} offers')
    return n, skipped


def main():
    con = connect()
    which = sys.argv[1:] or ['elbkinder', 'baederland']
    skipped = []
    if 'elbkinder' in which:
        skipped += import_elbkinder(con)[1]
    if 'baederland' in which:
        skipped += import_baederland(con)[1]
    for u, why in skipped:
        print(f'skipped {u}: {why}')


if __name__ == '__main__':
    main()
