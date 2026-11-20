"""Import the parent and baby courses of 'Marina - die Elternschule' at the Kath. Marienkrankenhaus Hamburg.

Source: the clinic's WordPress events (https://www.marienkrankenhaus.org/veranstaltungen/<slug>/), found through the
Yoast event sitemap (event-sitemap.xml). Each event page has a structured date block ('Veranstaltungsdatum'), a
cancelled block, an address and a fee block; many courses instead list their dates in the text, one line per run
('26.10. – 07.12.26 von 18:30 – 20:30 Uhr, 7x montags'). Both are read; lines marked 'ausgebucht' are dropped.
Kept: pregnancy, birth, baby, toddler and child offers and parent courses (Erste Hilfe am Kind, Stillvorbereitung,
Infoabend 'Rund um die Geburt'); adult-only health courses and staff/professional events are skipped.
Course leaders' and midwives' names are never stored (they are cut from titles and never read from the text).

robots.txt: 'User-agent: * / Disallow:' (everything allowed, Yoast default).
Terms: imprint (https://www.marienkrankenhaus.org/impressum/): 'Der Inhalt dieser Website darf nicht zu kommerziellen
Zwecken kopiert, verbreitet, verändert oder Dritten zugänglich gemacht werden.' -> Julian asks.
"""
import re
import sys
from datetime import date, timedelta

from offers import age_range
from offers_util import MONTHS, WEEKDAYS, age_of, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'marienkrankenhaus_elternschule'
BASE = 'https://www.marienkrankenhaus.org'
PAGE = BASE + '/elternschule/'
PROVIDER = 'Elternschule Marina (Marienkrankenhaus Hamburg)'
VENUE_MARINA = 'Elternschule Marina, Ärztehaus Marienkrankenhaus'
ADDR_MARINA = 'Hinrichsenstraße 1, 22087 Hamburg'
VENUE_CLINIC = 'Marienkrankenhaus Hamburg'
ADDR_CLINIC = 'Alfredstraße 9, 22087 Hamburg'
HORIZON = 270  # days ahead; some pages list dates for more than a year

# slugs that are clearly not for families (skipped before fetching)
SKIP_SLUG = re.compile(r'reiki|hno-|sonokurs|fitwork|feetwork|seniorfit|wirbelsaeule|onkolog|klangentspannung|yoga-reset|holistische|'
                       r'schlafberatung|einzelsitzung|individuelle-begleitung|akupunktur', re.I)
FAMILY_TITLE = re.compile(r'schwanger|zwerge|kleinkind|krabbel|geburt|childbirth|birth|baby|babys|säugling|kind|eltern|still|rückbildung|wochenbett|väter|'
                          r'mama|mütter|delfi|pekip|beikost|geschwister|kolostrum|wickeln|trage|hypnobirthing|first aid|familie', re.I)
ADULT_TITLE = re.compile(r'mitarbeitende|senior|reiki|hno|sonograf|pflegetag', re.I)
PARENT_TITLE = re.compile(r'schwanger|geburt|childbirth|birth|hypnobirthing|kolostrum|stillvorbereitung|säuglingspflege|baby basic|'
                          r'väter|infoabend|geschwister|erste hilfe|first aid|stoffwindel|trage', re.I)
DATE = r'(\d{1,2})\.\s?(\d{1,2})\.(\d{4}|\d{2}(?!\d))?'
RANGE = re.compile(DATE + r'\s*(?:–|-|bis)\s*' + DATE)
SINGLE = re.compile(r'(?<![\d.])' + DATE)
LONG = re.compile(r'(\d{1,2})\.\s*(' + '|'.join(MONTHS) + r')\s*(\d{4})', re.I)
TIMES = re.compile(r'(\d{1,2})[:.](\d{2})\s*(?:Uhr)?\s*(?:–|-|bis)\s*(\d{1,2})[:.](\d{2})')
ONE_TIME = re.compile(r'(?:\bum\s*|\b)(\d{1,2}):(\d{2})\s*Uhr|\bum\s*(\d{1,2})[:.](\d{2})')
WEEKDAY_WORDS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']


def year4(y):
    return None if y is None else int(y) + (2000 if len(y) == 2 else 0)


def mkdate(d, m, y):
    try:
        return date(y, int(m), int(d))
    except (ValueError, TypeError):
        return None


def next_year_for(d, m, today):
    """Year for a 'dd.mm.' without year: the next occurrence from today (a little in the past is fine)."""
    for y in (today.year, today.year + 1):
        x = mkdate(d, m, y)
        if x and x >= today - timedelta(days=60):
            return y
    return today.year


def times_of(text):
    t = SINGLE.sub(' D ', LONG.sub(' D ', text))  # dates removed, so '26.10.26 – 07.12.26' is not read as a time
    m = TIMES.search(t)
    if m:
        return f'{int(m.group(1)):02d}:{m.group(2)}', f'{int(m.group(3)):02d}:{m.group(4)}'
    m = ONE_TIME.search(t)
    if m:
        h, mi = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        return f'{int(h):02d}:{mi}', None
    return None, None


def sessions_of(text):
    m = re.search(r'(\d+)\s*x\b', text)
    return int(m.group(1)) if m else None


def parse_runs(lines, today):
    """Dated runs from the text lines: ('range', start, end, tf, tt, n, ctx) or ('single', day, tf, tt, ctx)."""
    # join a dated line with the undated continuation lines that follow ('von 10:00 – 11:00 Uhr', '5x montags')
    joined, ctx, ctx_of = [], None, []
    for line in lines:
        has_date = SINGLE.search(line) or LONG.search(line)
        if re.match(r'geburtsmonat', line, re.I):
            ctx = clean(line).rstrip(':')
            continue
        if not has_date and joined and re.match(r'(von\s|\d{1,2}[:.]\d\d|\d+\s*x|,|um\s|jeweils)', line, re.I) and len(line) < 80:
            joined[-1] += ' ' + line
            continue
        joined.append(line)
        ctx_of.append(ctx)
    undated = [j for j in joined if not (SINGLE.search(j) or LONG.search(j))]
    g_from, g_to = next((times_of(u) for u in undated if times_of(u)[0]), (None, None))
    g_n = next((sessions_of(u) for u in undated if sessions_of(u)), None)
    runs = []
    for line, c in zip(joined, ctx_of):
        moved = re.search(r'auf den (.*?) geändert', line)  # '13.12. ... Achtung!! Datum auf den 20.11.2026 von ... geändert'
        if moved:
            line = moved.group(1)
        low = line.lower()
        if not (SINGLE.search(line) or LONG.search(line)):
            continue
        if re.search(r'ausgebucht|abgesagt|entfällt|preis|gebühr|achtung|ab dem|bis zum', low):
            continue
        line = re.sub(r'\(?\s*nicht am[^)]*\)?', ' ', line)
        tf, tt = times_of(line)
        if not tf:
            tf, tt = g_from, g_to
        r = RANGE.search(line)
        if r:
            y2 = year4(r.group(6)) or next_year_for(r.group(4), r.group(5), today)
            end = mkdate(r.group(4), r.group(5), y2)
            y1 = year4(r.group(3)) or (y2 - 1 if int(r.group(2)) > int(r.group(5)) else y2)
            start = mkdate(r.group(1), r.group(2), y1)
            if start and end and start <= end:
                runs.append(('range', start, end, tf, tt, sessions_of(line) or g_n, c))
            continue
        days = [mkdate(m.group(1), MONTHS[m.group(2).lower()], int(m.group(3))) for m in LONG.finditer(line)]
        for m in SINGLE.finditer(line):
            y = year4(m.group(3)) or next_year_for(m.group(1), m.group(2), today)
            days.append(mkdate(m.group(1), m.group(2), y))
        for d in days:
            if d:
                runs.append(('single', d, tf, tt, c))
    return runs


def structured_date(block):
    """'21. März 2027, 10:00 – 14:00' or '12. Januar 2027 – 19. Januar 2027, 10:00 – 12:00'."""
    days = [mkdate(m.group(1), MONTHS[m.group(2).lower()], int(m.group(3))) for m in LONG.finditer(block)]
    tf, tt = times_of(block)
    if not days:
        return None
    return days[0], days[-1], tf, tt


def clean_title(t):
    t = clean(t)
    t = re.sub(r'^NEU:?\s+', '', t)
    t = re.sub(r'\s*[-–]?\s*(freie Plätze|neuer Termin)\s*$', '', t, flags=re.I)
    t = re.sub(r'\s+mit\s+[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\s*$', '', t)  # '... mit Vorname Nachname'
    t = re.sub(r'\s*[-–]?\s*Kurs ab \d{1,2}\.\d{1,2}\.\d{2,4}\s*$', '', t)
    if len(t) > 60 and ':' in t:  # 'Delfi Babygruppe: DELFI – Denken · Entwickeln · ...'
        t = t.split(':')[0]
    return t.strip(' -–')


def price_of_fee(fee):
    f = (fee or '').lower()
    if not f:
        return None, None
    if re.search(r'kostenlos|kostenfrei', f):
        return 'kostenlos', 1
    if re.search(r'trägt die krankenkass|von (den meisten )?(gesetzlichen )?krankenkass|von der krankenkasse übernommen', f):  # birth preparation: paid by the health insurance, the amount shown is the partner fee
        return None, None
    if 'spende' in f:
        return 'auf Spendenbasis', None
    m = re.search(r'(\d+(?:,\d\d)?)\s*(?:,-)?\s*€', fee)
    if m and m.group(1) not in ('0', '0,00'):
        return m.group(1) + ' €', 0
    return None, None


def section(h, start, end):
    m = re.search(re.escape(start) + r'(.*?)' + re.escape(end), h, re.S)
    return m.group(1) if m else ''


def text_lines(fragment):
    t = re.sub(r'(?s)<(script|style).*?</\1>', ' ', fragment)
    t = re.sub(r'(?i)<br\s*/?>|</p>|</li>|</h\d>|</div>|</section>', '\n', t)
    return [x for x in (clean(s) for s in t.split('\n')) if x]


def build(url, h, today, latlon):
    title_m = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
    if not title_m:
        return [], 'no title'
    title = clean_title(title_m.group(1))
    if ADULT_TITLE.search(title) or not FAMILY_TITLE.search(title):
        return [], 'not family'
    if 'wurde abgesagt' in clean(section(h, '<!-- Event CANCELLED INFO -->', '<!-- END CANCELLED INFO -->')):
        return [], 'cancelled'
    content = h[title_m.end():h.find('Hier finden Sie') if 'Hier finden Sie' in h else len(h)]
    content = re.sub(r'(?s)<section class="event-details-block"><p class="txt-fluid-l ">Kursleitung:.*?</section>', ' ', content)  # leaders
    loc = clean(section(h, '<!-- Event Location -->', '</section>'))
    fee = clean(section(h, 'Teilnahmegeb', '</section>'))
    price, free = price_of_fee(fee)
    registration = 'offen' if re.search(r'Anmeldung ist für diese Veranstaltung nicht erforderlich|ohne Anmeldung|einfach vorbeikommen', h) else 'nötig'
    online = re.search(r'\bonline\b', title, re.I) and not re.search(r'vor ort', title, re.I)
    if online:
        venue, address, lat, lon = 'Online', None, None, None
    elif 'Alfredstr' in loc and 'Hinrichsen' not in loc:
        venue, address, (lat, lon) = VENUE_CLINIC, ADDR_CLINIC, latlon
    else:
        venue, address, (lat, lon) = VENUE_MARINA, ADDR_MARINA, latlon
    if PARENT_TITLE.search(title) and not re.search(r'mit baby|mit kind|babymassage', title, re.I):
        age = (None, None)
    else:
        age = age_of(title)
        if age == (None, None):
            age = age_range(title)
    topic = 'geburtsvorbereitung' if re.search(r'infoabend|childbirth|birth preparation|hypnobirthing', title, re.I) else None
    if re.search(r'erste hilfe|first aid', title, re.I):
        topic = 'erste_hilfe'
    slug = url.rstrip('/').rsplit('/', 1)[1]
    kw = dict(venue=venue, address=address, lat=lat, lon=lon, price=price, free=free, registration=registration, topic=topic)

    sd = structured_date(section(h, '<!-- Event DATE -->', '<!-- END Event DATE -->'))
    if sd:
        start, end, tf, tt = sd
        if start == end:
            runs = [('single', start, tf, tt, None)]
        else:
            runs = [('range', start, end, tf, tt, sessions_of(clean(content)), None)]
    else:
        runs = parse_runs(text_lines(content), today)
    offers, limit = [], today + timedelta(days=HORIZON)
    for run in runs:
        if run[0] == 'single':
            _, day, tf, tt, ctx = run
            if day < today or day > limit:
                continue
            t = f'{title} ({ctx})' if ctx else title
            offers.append(termin(f'{slug}:{day}:{tf}', t, day, url, PROVIDER, time_from=tf, time_to=tt, age=age, **kw))
        else:
            _, start, end, tf, tt, n, ctx = run
            if end < today or start > limit:
                continue
            t = f'{title} ({ctx})' if ctx else title
            if (end - start).days <= 2:  # weekend course
                when = f'{WEEKDAYS[start.weekday()]}–{WEEKDAYS[end.weekday()]} {start:%d.%m.}–{end:%d.%m.}'
            else:
                when = f'{WEEKDAYS[start.weekday()]} {start:%d.%m.}–{end:%d.%m.}' + (f', {n} Termine' if n else '')
            schedule = when + (f', {tf}' + (f'–{tt}' if tt else '') if tf else '')
            offers.append(group(f'{slug}:{start}:{tf}', t, url, PROVIDER, kind='kurs', weekday=start.weekday(), schedule=schedule,
                                time_from=tf, time_to=tt, start=start, end=end, sessions=n, age=age, **kw))
    return offers, None if offers else 'no current dates'


def main():
    today = date.today()
    latlon = osm_coords('Marienkrankenhaus')
    urls = re.findall(r'<loc>([^<]+)</loc>', get(BASE + '/event-sitemap.xml').text)
    offers, skipped = [], {}
    for url in urls:
        if SKIP_SLUG.search(url):
            skipped['skipped slug'] = skipped.get('skipped slug', 0) + 1
            continue
        try:
            found, why = build(url, get(url).text, today, latlon)
        except Exception as e:  # one broken page must not stop the import
            found, why = [], f'error {type(e).__name__}'
        offers += found
        if why:
            skipped[why] = skipped.get(why, 0) + 1
    print(f'{len(urls)} event pages, skipped: {skipped}')
    return finish(SOURCE_ID, 'Elternschule Marina: Kurse rund um Geburt, Baby und Kind', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
