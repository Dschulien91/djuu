"""Import baby, toddler and pregnancy/after-birth courses of the Katholische Familienbildungsstaette Hamburg.

Source: the provider's KuferWeb course catalogue (https://www.familienbildung-hh.de/programm/kw/...).
- category listings (paginated) give the course numbers (KNR) and titles,
- the course detail page gives title, price, registration status and the age hints,
- the per-course iCal (wp-content/kuferweb/webbasys/ics.php?knr=<KNR>) gives every session date and time.

Polite: robots.txt is honoured and its Crawl-delay of 5 s is kept between all requests to the site.
Only facts are stored (title, schedule, age, price, venue, address, link); the description is used only to
derive the child's age and is not saved. Course leaders' names are never stored.
"""
import re
import sys
import time
from collections import Counter
from datetime import date, datetime
from html import unescape

from bs4 import BeautifulSoup

from common import connect, fetch, register_source
from offers import age_range, parse_price, replace_offers, topic_of

SOURCE_ID = 'kath_fbs_hamburg'
BASE = 'https://www.familienbildung-hh.de'
HOST_DELAY = 5.0  # robots.txt Crawl-delay
PROVIDER = 'Kath. Familienbildungsstätte Hamburg'
MAIN_VENUE = 'Kath. Familienbildungsstätte Hamburg'
MAIN_STREET = 'Lübecker Str. 101'
MAIN_ADDRESS = 'Lübecker Str. 101, 22087 Hamburg'
MAIN_LATLON = (53.5629, 10.0300)  # fallback if Nominatim is unavailable

# (category id, parent id, group): 'baby' and 'birth' are taken completely, 'kids' only for children
# starting below 3 years, 'filter' only when the title is clearly about pregnancy, babies or toddlers.
CATEGORIES = [
    (8, 50, 'baby'),     # Babys
    (58, 8, 'baby'),     # Delfi
    (59, 8, 'baby'),     # Musikangebote
    (72, 8, 'baby'),     # Spiel - Bewegung
    (73, 8, 'baby'),     # offene Angebote
    (74, 8, 'baby'),     # Leben mit dem Baby
    (7, 51, 'birth'),    # Rund um die Geburt
    (71, 50, 'kids'),    # Kinder
    (76, 71, 'kids'),    # Spiel - Bewegung
    (77, 71, 'kids'),    # Musikangebote
    (78, 71, 'kids'),    # Papa mit Kind
    (79, 71, 'kids'),    # offene Angebote
    (80, 71, 'kids'),    # Leben mit dem Kind
    (9, 71, 'kids'),     # Kinder ohne Eltern
    (1, 51, 'filter'),   # Eltern
    (12, 50, 'filter'),  # Wohlbefinden - Fitness (Schwangerschafts-/Rueckbildungsyoga)
]
OPEN_CATEGORIES = {73, 79}
FAMILY_TITLE = re.compile(r'schwanger|geburt|rückbildung|baby|säugling|kleinkind|krabbel|eltern-kind|mit kind|'
                          r'mama|papa|zwilling|still|wochenbett|delfi|pekip|monat', re.I)
OLDER = re.compile(r'pubertät|schulkind|teenager|jugendliche|ohne eltern', re.I)
BEWEGUNG = re.compile(r'turn|bewegung|first step', re.I)
OPEN_TITLE =re.compile(r'café|cafe|treff|krabbelgruppe|offene', re.I)
WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
MONTHS = {m: i + 1 for i, m in enumerate(['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august',
                                          'september', 'oktober', 'november', 'dezember'])}

_last = [0.0]


def get(url):
    """Fetch one page of the site, keeping the Crawl-delay and honouring robots.txt."""
    wait = HOST_DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    try:
        r = fetch(url, check_robots=True, timeout=60, retries=3)
    finally:
        _last[0] = time.time()
    try:
        return r.content.decode('utf-8')  # the iCal is served without charset; pages are UTF-8 too
    except UnicodeDecodeError:
        return r.content.decode('latin-1')


def clean(text):
    return re.sub(r'\s+', ' ', unescape(text or '')).replace('\xa0', ' ').strip()


# --- listings -------------------------------------------------------------------------------------------

def list_category(cat_id, parent_id):
    """All (knr, title) of one category, following the listing's pagination."""
    url = f'{BASE}/programm/kw/bereich/kategorien/kategorie-id/{cat_id}/oberkategorie-id/{parent_id}/kategorie-name/x/'
    seen_pages, todo, found = set(), [url], {}
    while todo:
        page = todo.pop(0)
        if page in seen_pages:
            continue
        seen_pages.add(page)
        soup = BeautifulSoup(get(page), 'html.parser')
        for box in soup.select('div.kw-ue'):
            a = box.select_one('h4.kw-ue-title a')
            m = a and re.search(r'/kurs/([^/]+)/', a.get('href', ''))
            if m:
                found[m.group(1)] = clean(a.get_text())
        for a in soup.select('ul.pagination a.blaetternindex'):
            href = a.get('href', '').split('#')[0]
            if href and href not in seen_pages:
                todo.append(href)
    return found


# --- iCal -----------------------------------------------------------------------------------------------

def parse_ics(text):
    """Sessions as list of (start datetime, end datetime, location) from a KuferWeb VCALENDAR."""
    text = re.sub(r'\r?\n[ \t]', '', text)  # unfold continuation lines
    sessions = []
    for block in re.findall(r'BEGIN:VEVENT(.*?)END:VEVENT', text, re.S):
        fields = {}
        for line in block.strip().splitlines():
            if ':' in line:
                key, val = line.split(':', 1)
                fields[key.split(';')[0].upper()] = val.strip()
        try:
            start = datetime.strptime(fields['DTSTART'][:15], '%Y%m%dT%H%M%S')
            end = datetime.strptime(fields.get('DTEND', fields['DTSTART'])[:15], '%Y%m%dT%H%M%S')
        except (KeyError, ValueError):
            continue
        loc = fields.get('LOCATION', '').replace('\\,', ',').replace('\\n', ' ')
        sessions.append((start, end, clean(loc)))
    return sorted(sessions)


# --- detail page ----------------------------------------------------------------------------------------

def parse_detail(html):
    soup = BeautifulSoup(html, 'html.parser')
    root = soup.select_one('div.kw-kursdetails') or soup
    title = clean(root.select_one('h2.kw-title').get_text()) if root.select_one('h2.kw-title') else None
    fields = {}
    for row in root.select('div.kw-kurs div.row'):
        label = row.find('b')
        cols = row.find_all('div', recursive=False)
        if label and len(cols) == 2:
            fields[clean(label.get_text()).rstrip(':')] = clean(cols[1].get_text(' '))
    # description column next to the fact box (only used for age hints, never stored)
    desc = ''
    for col in root.select('div.kw-kurs div.col-md-9'):
        if not col.find('iframe'):
            desc = clean(col.get_text(' '))
            break
    venue_lines = []
    for h3 in root.find_all('h3'):
        if clean(h3.get_text()) == 'Kursort':
            venue_lines = [clean(s) for s in h3.parent.stripped_strings][1:]
            break
    return {'title': title, 'fields': fields, 'desc': desc, 'venue_lines': venue_lines}


# --- normalisation --------------------------------------------------------------------------------------

def norm_age_text(text):
    t = (text or '').lower()
    t = re.sub(r'zwischen\s*(\d+)\s*und\s*(\d+)', r'\1-\2', t)  # 'zwischen 0 und 18 Monaten'
    t = re.sub(r'(\d+(?:[.,]5)?)\s*(?:bis|to|until)\s*(\d+)', r'\1-\2', t)  # '6 bis 18 Monate', '3 to 7 months'
    t = re.sub(r'\bmonths?\b', 'monate', t)
    t = re.sub(r'\byears?\b', 'jahre', t)
    t = re.sub(r'(\d+)\s*-\s*(\d+)\s*(?:lebens)?monat', r'\1-\2 monat', t)
    return t


def age_of(text):
    t = norm_age_text(text)
    lo, hi = age_range(t)
    if lo is None and hi is None:
        m = re.search(r'bis\s*(\d+)\s*(jahr|j\.)', t)
        if m:
            return 0, int(m.group(1)) * 12 + 12
        if re.search(r'ersten lebensjahr|1\. lebensjahr', t):
            return 0, 12
    return lo, hi


def age_from_birth_months(text, start):
    """'Babys, die im Dezember 25 - Februar 26 geboren wurden' -> age in months at the first session."""
    m = re.search(r'(' + '|'.join(MONTHS) + r')\s*(\d{2,4})\s*[-–]\s*(' + '|'.join(MONTHS) + r')\s*(\d{2,4})[^.]{0,30}geboren',
                  (text or '').lower())
    if not m or not start:
        return None, None

    def months(mon, yr):
        y = int(yr) + (2000 if len(yr) == 2 else 0)
        return (start.year - y) * 12 + start.month - MONTHS[mon]

    oldest, youngest = months(m.group(1), m.group(2)), months(m.group(3), m.group(4))
    if youngest < 0 or oldest > 72:
        return None, None
    return youngest, oldest + 1


def price_of(text):
    """parse_price() would read '100,00 €' as free because of the '0,00' substring, so handle amounts first."""
    if not text:
        return None, None
    m = re.search(r'(\d+(?:\.\d{3})*,\d{2}|\d+)\s*€', text)
    if m:
        value = float(m.group(1).replace('.', '').replace(',', '.'))
        if value == 0:
            return 'kostenlos', 1
        return m.group(1) + ' €', 0
    return parse_price(text)


def registration_of(status):
    s = (status or '').lower()
    if 'warteliste' in s or 'ausgebucht' in s:
        return 'Warteliste'
    if 'abgeschlossen' in s or 'geschlossen' in s:
        return 'geschlossen'
    if 'keine anmeldung' in s:  # KuferWeb: course not bookable (any more)
        return 'geschlossen'
    if 'ohne anmeldung' in s:
        return 'offen'
    return 'nötig' if s else None


def venue_of(location):
    """Split an iCal LOCATION 'Name, Room, Street 1, 22087 Hamburg' into (venue, address)."""
    parts = [p.strip() for p in (location or '').split(',') if p.strip()]
    zip_idx = next((i for i, p in enumerate(parts) if re.match(r'\d{5}\b', p)), None)
    if zip_idx is None or zip_idx == 0:
        return None, None
    address = f'{parts[zip_idx - 1]}, {parts[zip_idx]}'
    name = parts[0] if zip_idx >= 2 else None
    return name, address


def schedule_of(sessions):
    first = sessions[0][0]
    weekday = Counter(s[0].weekday() for s in sessions).most_common(1)[0][0]
    t_from, t_to = sessions[0][0].strftime('%H:%M'), sessions[0][1].strftime('%H:%M')
    if len(sessions) == 1:
        return weekday, t_from, t_to, f'{WEEKDAYS[first.weekday()]} {first:%d.%m.} {t_from}–{t_to}'
    days = {s[0].weekday() for s in sessions}
    day = WEEKDAYS[weekday] if len(days) == 1 else '/'.join(WEEKDAYS[d] for d in sorted(days))
    return weekday, t_from, t_to, f'{day} {t_from}–{t_to}, {len(sessions)}× ab {first:%d.%m.}'


_geo = {}


def geocode(address):
    """One Nominatim lookup per distinct address (usage policy: <= 1 request/s, identifying user agent)."""
    if address in _geo:
        return _geo[address]
    latlon = None
    try:
        r = fetch('https://nominatim.openstreetmap.org/search', params={'q': address, 'format': 'jsonv2', 'limit': 1,
                                                                        'countrycodes': 'de'}, timeout=30, retries=2)
        hits = r.json()
        if hits:
            latlon = (round(float(hits[0]['lat']), 6), round(float(hits[0]['lon']), 6))
    except Exception as e:  # geocoding is optional; keep the offer without coordinates
        print(f'  geocode failed for {address}: {e}')
    time.sleep(1.1)
    if latlon is None and address == MAIN_ADDRESS:
        latlon = MAIN_LATLON
    _geo[address] = latlon
    return latlon


# --- main -----------------------------------------------------------------------------------------------

def collect():
    courses = {}  # knr -> {'title', 'cats', 'groups'}
    for cat_id, parent_id, group in CATEGORIES:
        found = list_category(cat_id, parent_id)
        print(f'  category {cat_id}: {len(found)} courses')
        for knr, title in found.items():
            if group == 'filter' and not FAMILY_TITLE.search(title):
                continue
            c = courses.setdefault(knr, {'title': title, 'cats': set(), 'groups': set()})
            c['cats'].add(cat_id)
            c['groups'].add(group)
    return courses


def build(knr, meta, today):
    detail_url = f'{BASE}/programm/kw/bereich/kursdetails/kurs/{knr}/'
    sessions = parse_ics(get(f'{BASE}/wp-content/kuferweb/webbasys/ics.php?knr={knr}'))
    if not sessions:
        return None, 'no sessions'
    if sessions[-1][0].date() < today:
        return None, 'past'
    d = parse_detail(get(detail_url))
    title = d['title'] or meta['title']
    f = d['fields']
    start = sessions[0][0]

    lo, hi = age_of(title)
    if lo is None and hi is None:
        lo, hi = age_from_birth_months(d['desc'], start)
    if lo is None and hi is None:
        lo, hi = age_of(d['desc'])
    groups = meta['groups']
    topic = topic_of(title)
    if topic == 'sonstiges' and BEWEGUNG.search(title):
        topic = 'pekip'
    parents = topic in ('geburtsvorbereitung', 'rueckbildung')
    if OLDER.search(title) or (lo is not None and lo >= 36):
        return None, 'older children'
    if 'baby' not in groups and 'birth' not in groups:
        # kids / filtered categories: keep only offers for children starting below 3 years or for (expecting) parents
        if not parents and not (lo is not None and lo < 36):
            return None, 'older children'
    if parents and not re.search(r'mit baby|mit kind', title, re.I):
        lo, hi = None, None  # pregnancy courses: no child age
    elif lo is None and hi is None and 'baby' in groups:
        lo, hi = 0, 12

    venue, address = venue_of(sessions[0][2])
    if not address and len(d['venue_lines']) >= 2:
        address = ', '.join(d['venue_lines'][-2:])
    if re.match(r'online', sessions[0][2], re.I):
        venue, address = 'Online', None
    if address and address.startswith(MAIN_STREET):
        venue, address = MAIN_VENUE, MAIN_ADDRESS
    latlon = geocode(address) if address else None

    weekday, t_from, t_to, schedule = schedule_of(sessions)
    price, free = price_of(f.get('Gebühr'))
    status = f.get('Status')
    kind = 'gruppe' if (meta['cats'] & OPEN_CATEGORIES or OPEN_TITLE.search(title)) else 'kurs'
    registration = registration_of(status)
    return {
        'source_ref': knr,
        'title': title,
        'kind': kind,
        'topic': topic,
        'age_min_m': lo,
        'age_max_m': hi,
        'weekday': weekday,
        'time_from': t_from,
        'time_to': t_to,
        'start_date': start.date().isoformat(),
        'end_date': sessions[-1][0].date().isoformat(),
        'sessions': len(sessions),
        'schedule': schedule,
        'price': price,
        'free': free,
        'registration': registration,
        'venue': venue or MAIN_VENUE,
        'address': address,
        'lat': latlon[0] if latlon else None,
        'lon': latlon[1] if latlon else None,
        'url': detail_url,
        'provider': PROVIDER,
        'raw': {'status': status, 'categories': sorted(meta['cats']), 'location': sessions[0][2]},
    }, None


def main():
    con = connect()
    register_source(con, SOURCE_ID, 'Katholische Familienbildungsstätte Hamburg', BASE,
                    'Fakten mit Link, keine Lizenz angegeben', 'Kath. Familienbildungsstätte Hamburg e.V.', priority=65)
    today = date.today()
    courses = collect()
    print(f'{len(courses)} candidate courses')
    offers, skipped = [], Counter()
    for knr, meta in sorted(courses.items()):
        try:
            offer, reason = build(knr, meta, today)
        except Exception as e:
            print(f'  {knr}: {type(e).__name__}: {e}')
            skipped['error'] += 1
            continue
        if offer:
            offers.append(offer)
        else:
            skipped[reason] += 1
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{n} offers imported, skipped: {dict(skipped)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
