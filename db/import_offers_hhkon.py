"""Import the children's group courses and family events of the Hamburger Konservatorium (music school).

Sources (robots.txt only disallows /i/):
- courses: the page 'Gruppenangebote für Kinder im Alter von 0-6 Jahren'
  (https://hamburger-konservatorium.de/lernen/gruppenangebote/musikangebote-fuer-0-bis-6-jaehrige/), read as WordPress
  page content through /wp-json/wp/v2/pages/<id>: per section (Eltern-Kind-Kurse, Musikalische Früherziehung,
  Kinderchöre) and venue, one list item per weekday, time and age group. Leaders' names are never stored.
- events: 'The Events Calendar' REST API (/wp-json/tribe/events/v1/events); only family events are kept (title or text
  matches the family keywords, or category 'Familienkonzert'); entries in the category 'Ohne Datum' carry a placeholder
  date and are skipped. Pupils' recitals ('Klassenvorspiel') are kept only when they are family concerts.
Venues: addresses as published in the site footer ('Standorte'); coordinates from the local OSM extract (address index).
"""
import re
import sys

from offers_util import FAMILY, WEEKDAYS, clean, finish, from_event, get, group, read_tribe
from import_offers_jugendmusikschule import age_text

SOURCE_ID = 'hamburger_konservatorium'
BASE = 'https://hamburger-konservatorium.de'
PAGE = BASE + '/lernen/gruppenangebote/musikangebote-fuer-0-bis-6-jaehrige/'
PROVIDER = 'Hamburger Konservatorium'
VENUES = {  # site footer 'Standorte'; coordinates from the local OSM extract's address index (data/raw/addresses.json)
    'Musik.Werk.Stadt': ('Hamburger Konservatorium, Musik.Werk.Stadt (Ottensen)', 'Lilly-Giordano-Stieg 1, 22763 Hamburg', (53.559692, 9.916576)),
    'Goßlerhaus': ('Hamburger Konservatorium, Goßlerhaus', 'Goßlers Park 1, 22587 Hamburg', (53.564777, 9.808757)),
    'Flachsland': ('Hamburger Konservatorium, Haus Flachsland', 'Bramfelder Straße 9, 22305 Hamburg', (53.58216, 10.04539)),  # no. 9 not mapped: between nos. 8 and 10
}
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
ITEM = re.compile(r'^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\s+(\d{1,2})(?::(\d\d))?\s*'
                  r'(?:[–-]\s*(\d{1,2})(?::(\d\d))?\s*)?Uhr:?\s*(.+)$')
DEFAULT_AGE = {'Eltern-Kind': (18, 48), 'Früherziehung': (48, 84), 'Kinderchöre': (60, 144)}


def venue(text):
    for key, (name, addr, (lat, lon)) in VENUES.items():
        if key.lower() in text.lower():
            return name, addr, lat, lon
    return None, None, None, None


def courses():
    html = get(PAGE).text
    pid = re.search(r'wp-json/wp/v2/pages/(\d+)', html)
    content = get(f'{BASE}/wp-json/wp/v2/pages/{pid.group(1)}?_fields=content').json()['content']['rendered'] if pid else html
    offers, section, where = [], '', (None, None, None, None)
    for tag, inner in re.findall(r'(?s)<(h2|h3|li)\b[^>]*>(.*?)</\1>', content):
        text = clean(re.split(r'<br\s*/?>\s*Leitung', inner)[0])
        if tag == 'h2':
            section, where = text, (None, None, None, None)
            continue
        if tag == 'h3':
            where = venue(text)
            continue
        m = ITEM.match(text)
        if not m or not where[0] or not re.search(r'Eltern-Kind|Früherziehung|Kinderch', section):
            continue
        wd = DAYS[m.group(1).lower()]
        tf = f'{int(m.group(2)):02d}:{m.group(3) or "00"}'
        tt = f'{int(m.group(4)):02d}:{m.group(5) or "00"}' if m.group(4) else None
        what = re.sub(r'\s+', ' ', m.group(6)).strip(' ,')
        what_age = re.sub(r'(\d) j[äa]hrige', r'\1 Jahre', what)
        what_age = re.sub(r'\b(\d)\s*-\s*(\d) Klasse', r'\1. bis \2. Klasse', what_age)  # 'Cantolino (1-4 Klasse)'
        pre = re.search(r'Vorschule bis (?:zur )?(\d)\.\s*Klasse', what_age)
        age = (60, (int(pre.group(1)) + 6) * 12) if pre else age_text(what_age)
        if age == (None, None):
            age = next((v for k, v in DEFAULT_AGE.items() if k in section), (None, None))
        title = what if not section.startswith('Kinderch') else f'Kinderchor {what}'
        title = re.sub(r'^Musikalische Früherziehung,?\s*', 'Musikalische Früherziehung ', title).replace('Alter ', '')
        name, addr, lat, lon = where
        offers.append(group(f'kurs:{wd}:{tf}:{name[-12:]}:{title[:20]}', title, PAGE, PROVIDER, weekday=wd, venue=name, address=addr, lat=lat, lon=lon,
                            time_from=tf, time_to=tt, age=age, registration='nötig', topic='musik',
                            schedule=f'{WEEKDAYS[wd]} {tf}{"–" + tt if tt else ""}, wöchentlich'))
    return offers


def events():
    offers = []
    for e in read_tribe(BASE):
        if 'Ohne Datum' in e['cats']:
            continue
        if not (FAMILY.search(f'{e["title"]} {e["text"]}') or 'Familienkonzert' in e['cats']):
            continue
        name, addr, lat, lon = venue(e.get('venue') or '')
        offers.append(from_event(e, PROVIDER, venue=name, address=addr, lat=lat, lon=lon))
        if offers[-1]['time_to'] == offers[-1]['time_from']:  # the calendar repeats the start as end time
            offers[-1]['time_to'] = None
        if name:  # the API venue name is generic; use the published site name and address
            offers[-1].update(venue=name, address=addr, lat=e.get('lat') or lat, lon=e.get('lon') or lon)
    return offers


def main():
    offers = courses()
    try:
        offers += events()
    except Exception as e:  # the course list alone is still worth keeping
        print(f'  events: {type(e).__name__}: {e}')
    return finish(SOURCE_ID, 'Hamburger Konservatorium: Kurse für Kinder und Familienkonzerte', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
