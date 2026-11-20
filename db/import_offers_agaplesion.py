"""Import the parent courses of the two AGAPLESION clinics in Hamburg.

1. AGAPLESION Diakonieklinikum Hamburg (DKH), 'Elternschule Familientreffpunkt':
   course list https://www.d-k-h.de/leistungsspektrum/geburtshilfe-und-familientreffpunkt/angebote-des-familientreffpunkts
   (TYPO3 'aga-seminars' tables: one row per course run, linked to a seminar page with every session's date, time and
   room and the number of free places), plus the 'Informationsabend für werdende Eltern' pages linked from
   https://www.d-k-h.de/ueber-uns/presse/veranstaltungen (first page only; the pagination links carry a cHash).
2. AGAPLESION Bethesda Krankenhaus Bergedorf: the same 'aga-seminars' list on its course page (currently empty) and
   the information evening rule published on the obstetrics page ('Jeden zweiten und letzten Donnerstag im Monat ...
   um 17:30 Uhr'), kept as a recurring group.
Course leaders are never stored (the seminar pages name them; that column is not read).

robots.txt: d-k-h.de and klinik-bergedorf.de answer 404 for /robots.txt (no rules); only plain paths are fetched.
Terms: no reuse clause found in the imprints.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from offers import age_range
from offers_util import MONTHS, WEEKDAYS, age_of, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'agaplesion_hh'
DKH = 'https://www.d-k-h.de'
DKH_LIST = DKH + '/leistungsspektrum/geburtshilfe-und-familientreffpunkt/angebote-des-familientreffpunkts'
DKH_NEWS = DKH + '/ueber-uns/presse/veranstaltungen'
DKH_PROVIDER = 'AGAPLESION Diakonieklinikum Hamburg (Elternschule Familientreffpunkt)'
DKH_VENUE = 'AGAPLESION Diakonieklinikum Hamburg'
DKH_ADDRESS = 'Hohe Weide 17, 20259 Hamburg'
BKB = 'https://www.klinik-bergedorf.de'
BKB_PAGE = BKB + '/leistungsspektrum/geburtshilfe'
BKB_LIST = BKB + '/leistungsspektrum/geburtshilfe/kursangebote-der-geburtshilfe'
BKB_PROVIDER = 'AGAPLESION Bethesda Krankenhaus Bergedorf'
BKB_ADDRESS = 'Glindersweg 80, 21029 Hamburg'
PARENTS = re.compile(r'geburtsvorbereit|wochenend|paare|schwanger|werdende|säuglingspflege|erste hilfe|informationsabend|infoabend', re.I)
ORDINALS = {'ersten': 1, 'zweiten': 2, 'dritten': 3, 'vierten': 4, 'letzten': -1}
WEEKDAY_WORDS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']


def dmy(s):
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', s or '')
    return date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None


def list_seminars(url):
    """(detail url, title, section heading) of every run in the 'aga-seminars' tables of one page."""
    soup = BeautifulSoup(get(url).text, 'html.parser')
    out = {}
    for frame in soup.select('div.frame'):
        table = frame.select_one('div.aga-seminars table.event-list')
        if not table:
            continue
        heading = clean(frame.find('h2').get_text(' ')) if frame.find('h2') else ''
        for tr in table.select('tbody tr'):
            a = tr.find('td').find('a') if tr.find('td') else None
            if a and a.get('href'):
                out.setdefault(urljoin(url, a['href']), (clean(a.get_text(' ')), heading))
    return list(out.items())


def read_seminar(url):
    """Title, sessions [(day, from, to, room)], free places and a price hint of one seminar page."""
    soup = BeautifulSoup(get(url).text, 'html.parser')
    box = soup.select_one('div.aga-seminars div.event-detail') or soup
    title = clean(box.find('h1').get_text(' ')) if box.find('h1') else None
    sessions = []
    for tr in box.select('table tr'):
        tds = tr.find_all('td')
        if len(tds) < 3:
            continue
        day = dmy(tds[0].get_text())
        times = re.findall(r'(\d{1,2}:\d{2})', tds[1].get_text())
        if day:
            sessions.append((day, times[0] if times else None, times[1] if len(times) > 1 else None, clean(tds[2].get_text(' '))))
    free_places = None
    for h3 in box.find_all('h3'):
        if 'Freie Plätze' in h3.get_text() and h3.find_next_sibling('p'):
            free_places = clean(h3.find_next_sibling('p').get_text())
    intro = ' '.join(clean(p.get_text(' ')) for p in box.find_all('p', recursive=False)[:3])
    if not sessions:  # no session table: the header line '04.01.2027, 12:00 — 01.03.2027, 13:15' gives first and last day
        m = re.search(r'(\d{1,2}\.\d{1,2}\.\d{4}),?\s*(\d{1,2}:\d{2})?\s*[—–-]\s*(\d{1,2}\.\d{1,2}\.\d{4}),?\s*(\d{1,2}:\d{2})?', intro)
        if m:
            first, last = dmy(m.group(1)), dmy(m.group(3))
            sessions = [(first, m.group(2), m.group(4), '')] + ([(last, m.group(2), m.group(4), '')] if last != first else [])
            return title, sessions, free_places, intro, True
    return title, sorted(sessions), free_places, intro, False


def price_from(intro):
    """A course fee such as '9 Treffen à 22 EUR'; partner fees and health-insurance notes are not prices of the course."""
    if re.search(r'partnergebühr|partner', intro, re.I):
        return None, None
    m = re.search(r'(\d+(?:,\d\d)?)\s*(?:€|EUR|Euro)', intro)
    return (m.group(1) + ' €', 0) if m else (None, None)


def short_title(t):
    t = clean(t).split(' | ')[0]
    t = re.sub(r'\s*(bitte bringen sie|sie erhalten).*$', '', t, flags=re.I)
    return t.strip()


def seminar_offers(list_url, provider, venue, address, latlon, today):
    offers = []
    for url, (list_title, heading) in list_seminars(list_url):
        try:
            title, sessions, free_places, intro, span_only = read_seminar(url)
        except Exception as e:  # one broken seminar page must not stop the import
            print(f'  {url}: {type(e).__name__}: {e}')
            continue
        title = short_title(title or list_title)
        if not sessions or sessions[-1][0] < today:
            continue
        if free_places == '0':
            continue  # fully booked
        first, last = sessions[0], sessions[-1]
        if PARENTS.search(title + ' ' + heading) and not re.search(r'mit baby|mit kind', title, re.I):
            age = (None, None)
        else:
            age = age_of(title)
            if age == (None, None):
                m = re.search(r'(\d+)\.\s*(?:lebens)?monat', title, re.I)  # 'vom 3.-6. Lebensmonat', 'bis zum 6. Monat'
                age = age_range(title) if not m else (0, int(m.group(1)) + 1)
        if age == (None, None) and not PARENTS.search(title + ' ' + heading):
            m = re.search(r'(\d+)\.?\s*[-–]\s*(\d+)\.\s*lebensmonat', list_title, re.I)  # FEP: 'vom 3.-6. Lebensmonat'
            age = (int(m.group(1)), int(m.group(2)) + 1) if m else ((0, 12) if re.search(r'baby|pekip|säugling', title, re.I) else age)
        topic = 'erste_hilfe' if re.search(r'erste hilfe', title, re.I) else ('pekip' if re.search(r'pekip|fep', title, re.I) else None)
        if not topic and re.search(r'geburtsvorbereitung', heading, re.I):
            topic = 'geburtsvorbereitung'
        price, free = price_from(intro)
        ref = url.rstrip('/').rsplit('/', 1)[1][:80]
        kw = dict(venue=venue, address=address, lat=latlon[0], lon=latlon[1], price=price, free=free, registration='nötig', topic=topic)
        if len(sessions) == 1:
            offers.append(termin(f'{ref}:{first[0]}', title, first[0], url, provider, time_from=first[1], time_to=first[2], age=age, **kw))
            continue
        days = {s[0].weekday() for s in sessions}
        wd = '/'.join(WEEKDAYS[d] for d in sorted(days)) if len(days) <= 2 else WEEKDAYS[first[0].weekday()]
        times = f'{first[1] or ""}{"–" + first[2] if first[2] else ""}'
        if span_only:
            wd = WEEKDAYS[first[0].weekday()]
            schedule = f'{wd} {times}, {first[0]:%d.%m.}–{last[0]:%d.%m.}'
        else:
            schedule = f'{wd} {times}, {len(sessions)}× ab {first[0]:%d.%m.}'
        offers.append(group(f'{ref}:{first[0]}', title, url, provider, kind='kurs', weekday=first[0].weekday(), schedule=schedule.replace('  ', ' '),
                            time_from=first[1], time_to=first[2], start=first[0], end=last[0], sessions=None if span_only else len(sessions),
                            age=age, **kw))
    return offers


def dkh_infoabende(latlon, today):
    soup = BeautifulSoup(get(DKH_NEWS).text, 'html.parser')
    links = sorted({urljoin(DKH, a['href']) for a in soup.find_all('a', href=True)
                    if re.search(r'/veranstaltung-detail/informationsabend-fuer-werdende-eltern', a['href'])})
    offers = []
    for url in links:
        box = BeautifulSoup(get(url).text, 'html.parser')
        text = clean(box.get_text(' '))
        m = re.search(r'(\d{1,2})\.\s*(' + '|'.join(MONTHS) + r')\s*(\d{4})', text, re.I)
        if not m:
            continue
        day = date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
        if day < today:
            continue
        t = re.search(r'Beginn:\s*(\d{1,2}:\d{2})', text)
        place = re.search(r'Ort:\s*([A-ZÄÖÜa-zäöüß \-]{3,40}?)\s+(?:Cookies|Zurück|Teilen|$)', text)
        venue = f'{DKH_VENUE}, {clean(place.group(1))}' if place else DKH_VENUE
        offers.append(termin(f'infoabend:{day}', 'Informationsabend für werdende Eltern', day, url, DKH_PROVIDER, venue=venue,
                             address=DKH_ADDRESS, lat=latlon[0], lon=latlon[1], time_from=t.group(1) if t else None,
                             free=None, registration=None, topic='geburtsvorbereitung'))
    return offers


def bkb_infoabend(latlon):
    """The rule 'Jeden zweiten und letzten Donnerstag im Monat ... um 17:30 Uhr' as one recurring group."""
    text = clean(BeautifulSoup(get(BKB_PAGE).text, 'html.parser').get_text(' '))
    m = re.search(r'jeden\s+(ersten|zweiten|dritten|vierten|letzten)(?:\s+und\s+(ersten|zweiten|dritten|vierten|letzten))?\s+('
                  + '|'.join(WEEKDAY_WORDS) + r')\s+im\s+monat[^.]{0,80}?(\d{1,2}[:.]\d{2})\s*uhr', text, re.I)
    if not m or 'infoabend' not in text[max(0, m.start() - 10):m.end() + 40].lower():
        return []
    wd = WEEKDAY_WORDS.index(m.group(3).lower())
    nth = ' und '.join(f'{g}' for g in (m.group(1), m.group(2)) if g)
    tf = m.group(4).replace('.', ':')
    return [group('infoabend', 'Infoabend für werdende Eltern (Kreißsaal-Team)', BKB_PAGE, BKB_PROVIDER, weekday=wd,
                  schedule=f'jeden {nth} {WEEKDAYS[wd]} im Monat, {tf}', venue=BKB_PROVIDER, address=BKB_ADDRESS,
                  lat=latlon[0], lon=latlon[1], time_from=tf, registration='offen' if 'ohne anmeldung' in text.lower() else None,
                  topic='geburtsvorbereitung')]


def main():
    today = date.today()
    dkh_ll = osm_coords('Agaplesion Diakonieklinikum Hamburg')
    bkb_ll = osm_coords('Bethesda Krankenhaus Bergedorf')
    offers = []
    for name, fn in [('DKH seminars', lambda: seminar_offers(DKH_LIST, DKH_PROVIDER, DKH_VENUE, DKH_ADDRESS, dkh_ll, today)),
                     ('DKH Infoabende', lambda: dkh_infoabende(dkh_ll, today)),
                     ('BKB seminars', lambda: seminar_offers(BKB_LIST, BKB_PROVIDER, BKB_PROVIDER, BKB_ADDRESS, bkb_ll, today)),
                     ('BKB Infoabend', lambda: bkb_infoabend(bkb_ll))]:
        try:
            found = fn()
        except Exception as e:  # keep the other clinic if one site fails
            print(f'  {name}: {type(e).__name__}: {e}')
            found = []
        print(f'  {name}: {len(found)}')
        offers += found
    return finish(SOURCE_ID, 'AGAPLESION Hamburg: Elternschule-Kurse (DKH, Bethesda Bergedorf)', DKH_LIST, 'AGAPLESION Hamburg', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
