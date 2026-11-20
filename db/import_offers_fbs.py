"""Import baby, toddler, children's and pregnancy/after-birth courses of the Evangelische Familienbildung Hamburg.

Source: the provider's Kufer course portal on https://www.fbs-hamburg.de (TYPO3 'kuportal'), nine Hamburg sites
(Elternschule Altona, Elternschule Osdorf, Alstertal, Blankenese, HafenCity, Hamm-Bergedorf, Harburg,
Niendorf-Lokstedt, Winterhude-Uhlenhorst). The Schleswig-Holstein sites (Norderstedt, Pinneberg, Uetersen) are left out.

What is read (all allowed by robots.txt):
- the first page of each site's category listing, /standorte/<site>/kurse/<category> (title, subtitle with the
  child's age, first date and time, course number, room, booking status),
- the course detail page /standorte/<site>/kurse/einrichtung/<inst>/kurs/<knr>/filterbeibehalten/1 (every session
  date and time, fee, address). Detail facts already read are cached in data/raw/fbs_details.json (no texts, no
  names) and reused while the listing date is unchanged, so a run fetches at most MAX_DETAILS new detail pages;
  courses not yet read keep the listing facts (first date and time) until a later run.
- weekly open groups without dates ('Di 10:00 - 12:00 Uhr / außer in den HH-Ferien') become kind 'gruppe'.
Undated individual consultations are skipped; a course shared by several sites (online courses) is kept once.

robots.txt: 'Disallow: /*cHash', '/*?id=*', '/*&id=*', '/*?L=0*'. Every further listing page (pagination,
sub-category filter, the full /kurssuche) carries a cHash and is therefore not fetched: only the first ten courses
(sorted by date) of each site and category are seen per run. The complete catalogue needs Julian's ask first.
Only facts are stored; the course text is read only for the age and never saved. Course leaders are never stored.
Terms: the sites' disclaimer says 'Die Vervielfältigung von Informationen oder Daten, insbesondere die Verwendung von
Texten, Textteilen oder Bildmaterial bedarf der vorherigen Zustimmung' -> Julian asks.
"""
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime

from bs4 import BeautifulSoup

from common import DB_PATH
from offers import topic_of
from offers_util import WEEKDAYS, age_of as util_age_of, clean, finish, get, group

SOURCE_ID = 'ev_fbs_hamburg'
BASE = 'https://www.fbs-hamburg.de'
PROVIDER = 'Evangelische Familienbildung Hamburg'
MAX_DETAILS = 60  # new detail pages per run; the rest comes from the cache of earlier runs

SITES = {  # slug -> display name
    'elternschule-altona': 'Ev. Elternschule Altona',
    'elternschule-osdorf': 'Ev. Elternschule Osdorf',
    'familienbildung-alstertal': 'Ev. Familienbildung Alstertal',
    'familienbildung-blankenese': 'Ev. Familienbildung Blankenese',
    'familienbildung-hafencity': 'Ev. Familienbildung HafenCity',
    'familienbildung-hamm-bergedorf': 'Ev. Familienbildung Hamm-Bergedorf',
    'familienbildung-harburg': 'Ev. Familienbildung Harburg',
    'familienbildung-niendorf-lokstedt': 'Ev. Familienbildung Niendorf-Lokstedt',
    'familienbildung-winterhude-uhlenhorst': 'Ev. Familienbildung Winterhude-Uhlenhorst',
}
# category slug -> group: 'all' kept completely (minus adult-only), 'kids' children's courses below 14,
# 'filter' only when the title is about pregnancy, babies, children or families.
CATEGORIES = {
    'rund-um-die-geburt': 'all',
    'mit-babys-leben-bis-12-monate': 'all',
    'mit-kindern-leben-bis-6-jahre': 'all',
    'familienzeit': 'filter',
    'kinder-jugendliche': 'kids',
    'gesundheit-bewegung': 'filter',
    'kochen-kreatives-naehen': 'filter',
    'wissenswertes-beratung': 'filter',
}
FAMILY_TITLE = re.compile(r'schwanger|geburt|rückbildung|baby|säugling|kleinkind|krabbel|eltern(?!schule)|mit kind|kinder|kind\b|'
                          r'mama|papa|mütter|väter|vater|zwilling|still|wochenbett|delfi|pekip|monat|famili|erste hilfe|'
                          r'oma|opa|großeltern|geschwister|kita|trotz|\bab \d+ jahr|\d+\s*[-–]\s*\d+ jahr', re.I)
ADULT = re.compile(r'für frauen|nur für erwachsene|ohne kind|qualifizierung|fortbildung|kindertagespflege|tagesmütter|'
                   r'jugendliche ab 1[4-9]|ab 1[6-9] jahr|senior|für jugendliche|abschiedsfeier|kochtreff für alle', re.I)
OPEN = re.compile(r'offene[rs]? |offener treff|treff\b|café|cafe|babytreff|spielgruppe|krabbelgruppe', re.I)
MONTHS = {m: i + 1 for i, m in enumerate(['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august',
                                          'september', 'oktober', 'november', 'dezember'])}

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
    street = norm_street(m.group(1))
    for s in (street, street.replace('alle', 'allee') if street.endswith('alle') else None):  # 'Baakenalle' typo
        hit = s and _idx.get(f'{s}|{m.group(2).lower().replace(" ", "")}')
        if hit:
            return tuple(hit)
    return None, None


# --- pages ----------------------------------------------------------------------------------------------

def page(url):
    r = get(url)
    return r.content.decode('utf-8', 'replace')


def list_category(site, cat):
    """Courses on the first (robots-allowed) page of one site's category listing."""
    soup = BeautifulSoup(page(f'{BASE}/standorte/{site}/kurse/{cat}'), 'html.parser')
    out = []
    for row in soup.select('div.kw-table-row'):
        a = row.find('a', href=re.compile(r'/kurs/[^/]+/filterbeibehalten'))
        if not a:
            continue
        cols = a.find_all('div', recursive=False)
        title_div = a.select_one('div.kurstitel')
        lines = [clean(x) for x in title_div.stripped_strings] if title_div else []
        data = [clean(c.get_text(' ')) for c in cols if 'kw-table-label' not in (c.get('class') or []) and c is not title_div]
        img = row.find('img', title=True)
        out.append({'knr': re.search(r'/kurs/([^/]+)/', a['href']).group(1), 'url': BASE + a['href'],
                    'title': lines[0] if lines else '', 'subtitle': ' '.join(lines[1:]),
                    'when': data[0] if data else '', 'room': data[2] if len(data) > 2 else '',
                    'status': img['title'] if img else None})
    return out


def parse_detail(html):
    soup = BeautifulSoup(html, 'html.parser')
    h2 = soup.select_one('div.kw-kurs-container')
    h2 = h2.find_previous('h2') if h2 else None
    fields = {}
    pane = soup.select_one('#kurs')
    desc = ''
    if pane:
        for p in pane.find_all('p'):
            b = p.find('strong')
            if b:
                fields[clean(b.get_text()).rstrip(':')] = clean(p.get_text(' ').replace(b.get_text(), '', 1))
                img = p.find('img', title=True)
                if img:
                    fields['Status'] = img['title']
            elif not desc:
                desc = clean(p.get_text(' '))
    address = None
    loc = soup.select_one('#kursort a[href*="maps"]')
    if loc:
        parts = [clean(s) for s in loc.stripped_strings]
        address = ', '.join(p for p in parts if p)
    sessions = []
    for r in soup.select('#kw-kurstage div.kw-table-row'):
        cells = [clean(c.get_text(' ')) for c in r.select('div.kw-table-data')]
        if len(cells) < 2:
            continue
        d = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', cells[0])
        t = re.findall(r'(\d{1,2}:\d{2})', cells[1])
        if d:
            sessions.append((date(int(d.group(3)), int(d.group(2)), int(d.group(1))).isoformat(),
                             t[0] if t else None, t[1] if len(t) > 1 else None))
    lines = [clean(s) for s in h2.stripped_strings] if h2 else []
    keep_fields = {k: v for k, v in fields.items() if k in ('Status', 'Gebühr')}
    return {'title': lines[0] if lines else None, 'subtitle': ' '.join(lines[1:]), 'fields': keep_fields,
            'text_age': list(age_of(desc[:400], date.fromisoformat(min(sessions)[0]) if sessions else date.today())),
            'address': address, 'sessions': sorted(sessions)}


# --- normalisation --------------------------------------------------------------------------------------

def age_of(text, start=None):
    t = (text or '').lower()
    t = re.sub(r'(\d+)\s*(?:to|until)\s*(\d+)', r'\1-\2', t)
    t = re.sub(r'\bmonths?\b', 'monate', t)
    t = re.sub(r'\byears?\b', 'jahre', t)
    t = re.sub(r'(\d+)\s*-\s*(\d+)\s*(?:lebens)?monat', r'\1-\2 monat', t)
    t = re.sub(r'von (\d+) bis (\d+) (monat|jahr)', r'\1-\2 \3', t)
    m = re.search(r'(' + '|'.join(MONTHS) + r')\s*(?:/|bis|-|–|und)\s*(' + '|'.join(MONTHS) + r')?\s*(\d{4})\s*geb', t) \
        or re.search(r'(' + '|'.join(MONTHS) + r')()\s*(\d{4})\s*geb', t)
    if m and start:
        first, last = MONTHS[m.group(1)], MONTHS[m.group(2)] if m.group(2) else MONTHS[m.group(1)]
        y = int(m.group(3))
        oldest = (start.year - y) * 12 + start.month - first
        youngest = (start.year - y) * 12 + start.month - last
        if 0 <= youngest <= oldest < 72:
            return youngest, oldest + 1
    m = re.search(r'(\d+(?:,5)?)\s*(?:-|–|bis)\s*(\d+(?:,5)?)\s*(jahr|j\.)', t)  # '1,5 - 3 Jahren', '3 - 4,5 J.'
    if m:
        a, b = (float(x.replace(',', '.')) for x in m.group(1, 2))
        if a < b:
            return int(a * 12), int(b * 12) + 12
    lo, hi = util_age_of(t)
    if lo is None and hi is None:
        m = re.search(r'\((\d+)\s*-\s*(\d+)\s*monat', t)
        if m:
            return int(m.group(1)), int(m.group(2)) + 1
        if re.search(r'ersten lebensjahr|1\. lebensjahr', t):
            return 0, 12
    return lo, hi


def price_of(text):
    m = re.search(r'(\d+(?:\.\d{3})*,\d{2}|\d+)\s*€', text or '')
    if m:
        value = float(m.group(1).replace('.', '').replace(',', '.'))
        return ('kostenlos', 1) if value == 0 else (m.group(1) + ' €', 0)
    if re.search(r'kostenlos|kostenfrei|gebührenfrei', text or '', re.I):
        return 'kostenlos', 1
    return None, None


def registration_of(status):
    s = (status or '').lower()
    if 'warteliste' in s or 'ausgebucht' in s or 'belegt' in s:
        return 'Warteliste'
    if 'keine anmeldung' in s or 'abgeschlossen' in s:
        return 'geschlossen'
    if 'ohne anmeldung' in s:
        return 'offen'
    return 'nötig' if s else None


def room_prefix(room):
    m = re.match(r'([A-Z]{2,5})_', room or '')
    return m.group(1) if m else None


def weekly_when(text):
    m = re.match(r'\s*(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s+(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?', text or '')
    return (WEEKDAYS.index(m.group(1)), m.group(2).zfill(5), m.group(3) and m.group(3).zfill(5)) if m else None


def first_when(text):
    m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})(?:,\s*(\d{1,2}:\d{2}))?', text or '')
    if not m:
        return None, None
    return date(int(m.group(3)), int(m.group(2)), int(m.group(1))), m.group(4)


CACHE = DB_PATH.parent / 'raw' / 'fbs_details.json'  # detail pages already read (data/raw is not in git)


def cached():
    """Detail data of earlier runs, keyed by course number."""
    try:
        return json.loads(CACHE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def save_cache(details, today):
    keep_ = {k: v for k, v in details.items() if not v.get('sessions') or v['sessions'][-1][0] >= today.isoformat()}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(keep_, ensure_ascii=False), encoding='utf-8')


# --- main -----------------------------------------------------------------------------------------------

def keep(meta, groups):
    text = meta['title'] + ' ' + meta['subtitle']
    if ADULT.search(text):
        return False
    if 'all' in groups:
        return True
    if 'kids' in groups:
        lo, _ = age_of(text)
        return lo is None or lo < 14 * 12
    return bool(FAMILY_TITLE.search(text))


def build(site, meta, det):
    title = det.get('title') or meta['title'] if det else meta['title']
    subtitle = (det.get('subtitle') if det else None) or meta['subtitle']
    full = f'{title} – {subtitle}' if subtitle else title
    sessions = det['sessions'] if det else []
    start, t_from = first_when(meta['when'])
    if sessions:
        start = date.fromisoformat(sessions[0][0])
        t_from = sessions[0][1]
    weekly = None if start else weekly_when(meta['when'])
    if not start and not weekly:
        return None
    t_to = sessions[0][2] if sessions else None
    if weekly:
        t_from, t_to = weekly[1], weekly[2]
    lo, hi = age_of(f'{title} {subtitle}', start or date.today())
    if lo is None and hi is None and det:
        lo, hi = det.get('text_age') or (None, None)
    if lo is None and hi is None and 'mit-babys-leben-bis-12-monate' in meta.get('cats', ()):
        lo, hi = 0, 12
    topic = topic_of(title + ' ' + subtitle)
    parents = topic in ('geburtsvorbereitung', 'rueckbildung')
    if parents and not re.search(r'mit baby|mit kind|babys von', full, re.I):
        lo, hi = None, None
    if lo is not None and lo >= 14 * 12:
        return None
    address = det.get('address') if det else None
    address = address or ADDR_BY_ROOM.get((site, room_prefix(meta['room']))) or ADDR_BY_SITE.get(site)
    lat, lon = coords(address) if address else (None, None)
    venue = SITES[site]
    if re.match(r'online', meta['room'] or '', re.I):
        venue, address, lat, lon = 'Online', None, None, None
    price, free = price_of((det or {}).get('fields', {}).get('Gebühr'))
    status = (det or {}).get('fields', {}).get('Status') or meta['status']
    kind = 'gruppe' if weekly or OPEN.search(title) else 'kurs'
    days = sorted({s[0] for s in sessions})
    if weekly:
        wd = weekly[0]
        note = ', außer in den Hamburger Ferien' if 'ferien' in meta['when'].lower() else ''
        schedule = f'{WEEKDAYS[wd]} {t_from}{"–" + t_to if t_to else ""}, wöchentlich{note}'
    elif len(days) > 1:
        wds = Counter(date.fromisoformat(d).weekday() for d in days)
        wd = wds.most_common(1)[0][0]
        day = WEEKDAYS[wd] if len(wds) == 1 else '/'.join(WEEKDAYS[d] for d in sorted(wds))
        schedule = f'{day} {t_from or ""}{"–" + t_to if t_to else ""}, {len(days)}× ab {start:%d.%m.}'
    else:
        wd = start.weekday()
        schedule = f'{WEEKDAYS[wd]} {start:%d.%m.} {t_from or ""}{"–" + t_to if t_to else ""}'.strip()
    o = group(meta['knr'], full, meta['url'], PROVIDER, kind=kind, weekday=wd, schedule=schedule.replace('  ', ' '),
              venue=venue, address=address, lat=lat, lon=lon, time_from=t_from, time_to=t_to, price=price, free=free,
              age=(lo, hi), start=start, end=date.fromisoformat(days[-1]) if len(days) > 1 else None,
              sessions=(len(days) or None) if not weekly else None, registration=registration_of(status), topic=topic)
    o['raw'] = {'site': site, 'categories': sorted(meta.get('cats', ())), 'room': meta['room'], 'status': status}
    return o


ADDR_BY_ROOM, ADDR_BY_SITE = {}, {}


def main():
    today = date.today()
    courses = {}  # knr -> (site, meta, groups)
    for site in SITES:
        for cat, grp in CATEGORIES.items():
            try:
                rows = list_category(site, cat)
            except Exception as e:  # a missing category on one site is fine
                print(f'  {site}/{cat}: {type(e).__name__}: {e}')
                continue
            for m in rows:
                c = courses.setdefault(m['knr'], [site, m, set()])
                c[2].add(grp)
                c[1].setdefault('cats', set()).add(cat)
        print(f'  {site}: {sum(1 for c in courses.values() if c[0] == site)} courses so far')
    picked = {k: v for k, v in courses.items() if keep(v[1], v[2])}
    print(f'{len(courses)} listed, {len(picked)} family courses')

    cache = cached()
    details, fetched = {}, 0
    # upcoming courses first; courses that already started need the detail page for their last date
    def rank(k):
        start = first_when(picked[k][1]['when'])[0]
        if start:
            return (0 if start >= today else 2, start)
        return (1, today) if weekly_when(picked[k][1]['when']) else (3, today)
    order = [k for k in sorted(picked, key=rank) if rank(k)[0] < 3]
    for knr in order:
        site, meta, _ = picked[knr]
        start, _ = first_when(meta['when'])
        c = cache.get(knr)
        if c and c.get('when') == meta['when']:
            details[knr] = c
            continue
        if fetched >= MAX_DETAILS:
            continue
        try:
            details[knr] = parse_detail(page(meta['url']))
            details[knr]['when'] = meta['when']
        except Exception as e:
            print(f'  {knr}: {type(e).__name__}: {e}')
        fetched += 1
    for knr, d in list(details.items()):  # learn each site's addresses from the detail pages
        site, meta, _ = picked[knr]
        if d.get('address'):
            ADDR_BY_ROOM.setdefault((site, room_prefix(meta['room'])), d['address'])
            ADDR_BY_SITE.setdefault(site, Counter())[d['address']] += 1
    for site, cnt in list(ADDR_BY_SITE.items()):
        ADDR_BY_SITE[site] = cnt.most_common(1)[0][0]
    save_cache(details, today)
    print(f'detail pages: {fetched} fetched, {len(details) - fetched} from cache, {len(picked) - len(details)} listing only')

    offers, dropped, seen = [], Counter(), set()
    for knr, (site, meta, _) in picked.items():
        o = build(site, meta, details.get(knr))
        if not o:
            dropped['no date or older'] += 1
        elif (o.get('end_date') or o.get('start_date') or '9999') < today.isoformat():
            dropped['past' + (' (listing only)' if knr not in details else '')] += 1
        elif (o['title'].lower(), o.get('start_date'), o.get('weekday'), o.get('time_from'), o.get('address')) in seen:
            dropped['same course listed by another site'] += 1  # e.g. the online courses every site lists
        else:
            seen.add((o['title'].lower(), o.get('start_date'), o.get('weekday'), o.get('time_from'), o.get('address')))
            offers.append(o)
    print(f'dropped: {dict(dropped)}')
    return finish(SOURCE_ID, 'Evangelische Familienbildung Hamburg: Kurse für Schwangere, Babys, Kinder und Familien',
                  BASE, 'Evangelische Familienbildung Hamburg (Ev.-Luth. Kirchenkreise Hamburg-Ost und Hamburg-West/Südholstein)',
                  offers, priority=65)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
