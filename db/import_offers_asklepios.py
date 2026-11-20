"""Import parent and baby courses and the information evenings of the Asklepios birth clinics in Hamburg.

Source: the clinics' own course and event search on https://www.asklepios.com (the provider agreed to be read; the
host is in PERMITTED_HOSTS, so the robots.txt lines 'Disallow: /api/' and '/.rest' do not block the search API the
pages themselves call). Clinics: Asklepios Klinik Altona (with the Elternschule), Barmbek, Nord - Heidberg and Wandsbek.
Asklepios Klinik Harburg publishes no birth courses (no Geburtshilfe pages) and is not in the data.

1. Courses: POST /api/search with the course endpoint of the clinic course pages
   (/<clinic>/anmeldung-aufenthalt/anmeldung-aufnahme/kurse). The endpoint returns the courses of all Asklepios clinics;
   only the Hamburg ones are kept. Each course carries its next free date ('Freie Termine ab'), fee and place; further
   dates are only shown inside the samedi booking flow, which is not used. So each course is one dated offer (the next
   free date) and links to the course page; courses without a free date are skipped.
2. Events: the same search with the event endpoint and the target group 'Werdende Eltern' (information evenings in
   Barmbek, Altona and Nord - Heidberg, the online 'Digitales Elternforum' of the Hamburg birth clinics).
3. Nord - Heidberg: the calendar has no start time for its evenings; the time comes from its page ('Beginn: 18 Uhr').
4. Wandsbek publishes its information evening only as a rule ('An jedem zweiten und vierten Dienstag im Monat ... um
   18:00 Uhr'), kept as a recurring group, and its Stillcafé & Krabbelgruppe (weekly) from the Familienzentrum page.
Course leaders' and midwives' names are never stored (the courses of freelance midwives on the Wandsbek and
Nord - Heidberg pages are listed under their names without dates and are not imported).
"""
import re
import sys
from datetime import date, datetime, timedelta

from offers_util import WEEKDAYS, age_of, clean, finish, get, group, termin

SOURCE_ID = 'asklepios_geburtshilfe_hamburg'
BASE = 'https://www.asklepios.com'
API = BASE + '/api/search'
COURSE_EP = '/.rest/search/course/de/f29ce804-f373-481c-bf1a-acc512bea2b9?preselect=facilityId'
EVENT_EP = '/.rest/search/event/de/f29ce804-f373-481c-bf1a-acc512bea2b9?preselect=facilityId'
PARENTS_GROUP = 'cde3ac3c-ab2c-4df7-a561-293744c45a40'  # target group 'Werdende Eltern'
PROVIDER = 'Asklepios Kliniken Hamburg'
CLINICS = {  # facility name in the API -> (venue, address, clinic slug)
    'Asklepios Klinik Altona': ('Asklepios Klinik Altona', 'Paul-Ehrlich-Straße 1, 22763 Hamburg', 'altona'),
    'Asklepios Klinik Barmbek': ('Asklepios Klinik Barmbek', 'Rübenkamp 220, 22307 Hamburg', 'barmbek'),
    'Asklepios Klinik Nord - Heidberg': ('Asklepios Klinik Nord - Heidberg', 'Tangstedter Landstraße 400, 22417 Hamburg', 'nord-heidberg'),
    'Asklepios Klinik Wandsbek': ('Asklepios Klinik Wandsbek', 'Alphonsstraße 14, 22043 Hamburg', 'wandsbek'),
}
COORDS = {'altona': (53.55412, 9.90264), 'barmbek': (53.606537, 10.036112), 'nord-heidberg': (53.674656, 10.028693),
          'wandsbek': (53.56879, 10.0913)}  # published by the clinics (latLon of the course search, route links)
WANDSBEK_INFO = BASE + '/wandsbek/abteilungen-spezialistinnen/abteilungen/geburtshilfe/informationsabende-fuer-werdende-eltern'
HEIDBERG_INFO = BASE + '/nord-heidberg/abteilungen-spezialistinnen/abteilungen/geburtshilfe/informationsabend'
WANDSBEK_FZ = BASE + '/wandsbek/abteilungen-spezialistinnen/abteilungen/geburtshilfe/familienzentrum-hamburg-ost'
PARENTS = re.compile(r'geburt|schwanger|stillen|still|wochenbett|säuglingspflege|neugeboren|erste hilfe|akupunktur|geschwister|'
                     r'infoabend|informationsabend|elternforum|antenatal|psychisch|ernährung|kaiserschnitt', re.I)
ORDINALS = {'ersten': 1, 'zweiten': 2, 'dritten': 3, 'vierten': 4, '1.': 1, '2.': 2, '3.': 3, '4.': 4}
WEEKDAY_WORDS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']


def search(endpoint, flt=None, limit=12):
    """All items of one search endpoint (the page asks 12 at a time)."""
    items, offset = [], 0
    while offset < 600:
        d = get(API, method='POST', json={'searchEndpoint': endpoint, 'q': '', 'o': offset, 'l': limit, 'f': False,
                                          'filter': flt or {}}).json()
        items += d.get('items') or []
        offset += limit
        if offset >= int(d.get('count') or 0) or not d.get('items'):
            return items
    return items


def clinic_of(text):
    for name, (venue, address, slug) in CLINICS.items():
        key = name.split('Klinik ')[1].replace(' ', '').lower()
        if key in re.sub(r'\s', '', text or '').lower():
            return venue, address, slug
    return None


def price_of(fee):
    t = clean(fee)
    if not t or t in ('0', 'siehe Kursinfo'):
        return (None, None) if t != '0' else ('kostenlos', 1)
    if re.search(r'kassenleistung', t, re.I):
        return t[:60], 0
    t = re.sub(r'(\d),(\d\d)\s*(?!€)', r'\1,\2 €', t).replace('€ €', '€').replace('  ', ' ')
    return t.strip()[:60], 0


def courses(today):
    out = []
    for it in search(COURSE_EP):
        clinic = CLINICS.get(clean(it.get('facility')))
        when = it.get('nextAvailableDate')
        if not clinic or not when or it.get('available') is False:
            continue
        start = datetime.fromisoformat(when)
        venue, address, slug = clinic
        title = re.sub(r'\s+', ' ', clean(it.get('title'))).strip(' -')
        place = clean(it.get('addressName'))
        online = place.lower() == 'online' or bool(re.search(r'\bonline\b', title, re.I))
        if 'elternschule' in place.lower():
            venue = f'Elternschule der {venue}'
        lat, lon = (float(x) for x in it['latLon'].split(',')) if it.get('latLon') else COORDS[slug]
        age = (None, None) if PARENTS.search(title) and not re.search(r'geschwister', title, re.I) else age_of(title)
        if age == (None, None) and re.search(r'baby|delfi|beikost|säugling', title, re.I) and not PARENTS.search(title):
            age = (0, 12)
        price, free = price_of(it.get('fee'))
        out.append(termin(f'kurs:{it.get("slug") or it.get("uuid")}:{start.date()}', title, start.date(), BASE + it['link'], PROVIDER,
                          venue='Online' if online else venue, address=None if online else address,
                          lat=None if online else lat, lon=None if online else lon, time_from=start.strftime('%H:%M'),
                          price=price, free=free, age=age, registration='nötig',
                          topic='erste_hilfe' if re.search(r'erste hilfe', title, re.I) else None))
    return out


def events(today):
    out = []
    starts = {}  # clinic -> start time of its information evening as its page states it ('Beginn: 18 Uhr')
    try:
        m = re.search(r'Beginn:\s*(\d{1,2})(?:[:.](\d\d))?\s*Uhr', page_text(HEIDBERG_INFO))
        if m:
            starts['nord-heidberg'] = f'{int(m.group(1)):02d}:{m.group(2) or "00"}'
    except Exception as e:
        print(f'  Heidberg info page: {type(e).__name__}: {e}')
    for it in search(EVENT_EP, {'targetGroupId': PARENTS_GROUP}):
        loc = clean(it.get('location'))
        title = clean(it.get('title'))
        online = bool(re.search(r'online', loc, re.I))
        clinic = clinic_of(loc)
        if not clinic and not (online and re.search(r'hamburg', title, re.I)):
            continue  # an event of a clinic outside Hamburg
        try:
            day = datetime.strptime(it.get('fullDate') or '', '%d.%m.%Y').date()
        except ValueError:
            continue
        tf, tt = it.get('timeStart'), it.get('timeEnd')
        venue, address, slug = clinic or ('Online', None, None)
        if tf == tt or tf in ('09:59', '00:00'):  # placeholder time in the calendar: take the start the clinic page states
            tf, tt = starts.get(slug), None
        lat, lon = COORDS.get(slug, (None, None))
        room = loc if clinic and loc != venue else None
        out.append(termin(f'event:{it.get("slug") or it.get("uuid")}:{day}', title, day, BASE + it['link'], PROVIDER,
                          venue='Online' if online else (f'{venue}, {room.split(",", 1)[1].strip()}' if room and ',' in room else venue),
                          address=None if online else address, lat=None if online else lat, lon=None if online else lon,
                          time_from=tf, time_to=tt, free=1, price='kostenlos', topic='geburtsvorbereitung',
                          registration='nötig' if online else None))
    return out


def page_text(url):
    html = get(url).text
    i = html.find('<main')
    return clean(re.sub(r'(?s)<(script|style).*?</\1>', ' ', html[i if i > 0 else 0:]))


def wandsbek():
    venue, address, slug = CLINICS['Asklepios Klinik Wandsbek']
    lat, lon = COORDS[slug]
    out = []
    text = page_text(WANDSBEK_INFO)
    m = re.search(r'An jedem (\w+\.?) und (\w+\.?) (' + '|'.join(WEEKDAY_WORDS) + r') im Monat.{0,160}?(\d{1,2}:\d\d) Uhr(?: im ([^.]{3,40}))?',
                  text, re.I)
    if m and m.group(1).lower() in ORDINALS and m.group(2).lower() in ORDINALS:
        wd = WEEKDAY_WORDS.index(m.group(3).lower())
        n1, n2 = ORDINALS[m.group(1).lower()], ORDINALS[m.group(2).lower()]
        room = clean(m.group(5) or '').replace('Konferenzraum ', '').strip('"„“ ')
        out.append(group('infoabend', 'Informationsabend für werdende Eltern', WANDSBEK_INFO, PROVIDER, weekday=wd,
                         schedule=f'jeden {n1}. und {n2}. {WEEKDAYS[wd]} im Monat, {m.group(4)} (außer an Feiertagen)',
                         venue=f'{venue}, {room}' if room else venue, address=address, lat=lat, lon=lon, time_from=m.group(4),
                         free=1, price='kostenlos', registration='offen' if re.search(r'Anmeldung ist nicht nötig', text) else None,
                         topic='geburtsvorbereitung'))
    text = page_text(WANDSBEK_FZ)
    m = re.search(r'Stillcafé & Krabbelgruppe (Für das erste Lebensjahr )?(' + '|'.join(WEEKDAY_WORDS) + r')s? von (\d{1,2}:\d\d) bis (\d{1,2}:\d\d)',
                  text, re.I)
    if m:
        wd = WEEKDAY_WORDS.index(m.group(2).lower().rstrip('s'))
        out.append(group('stillcafe', 'Stillcafé & Krabbelgruppe (erstes Lebensjahr)', WANDSBEK_FZ, PROVIDER, weekday=wd,
                         schedule=f'{WEEKDAYS[wd]} {m.group(3)}–{m.group(4)}, wöchentlich (nach Terminvereinbarung)',
                         venue=venue, address=address, lat=lat, lon=lon, time_from=m.group(3), time_to=m.group(4), age=(0, 12),
                         registration='nötig', topic='beratung'))
    return out


def main():
    today = date.today()
    until = today + timedelta(days=365)
    offers = []
    for name, fn in [('courses', courses), ('events', events), ('Wandsbek', lambda _: wandsbek())]:
        try:
            got = [o for o in fn(today) if not o.get('start_date') or o['start_date'] <= until.isoformat()]
        except Exception as e:  # one part failing keeps the others
            print(f'  {name}: {type(e).__name__}: {e}')
            got = []
        print(f'  {name}: {len(got)}')
        offers += got
    return finish(SOURCE_ID, 'Asklepios Kliniken Hamburg: Elternkurse und Infoabende Geburtshilfe',
                  BASE + '/altona/abteilungen-spezialistinnen/elternschule/kurse-der-elternschule', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
