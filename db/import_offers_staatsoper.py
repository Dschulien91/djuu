"""Import family and children's performances of the Hamburgische Staatsoper from its public calendar.

The site's robots.txt allows the calendar and the imprint restricts only the use of photos. Facts only: title, date,
time, venue, age and price. Programmes reserved for school classes and guest performances elsewhere are dropped.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'hamburgische_staatsoper'
BASE = 'https://www.die-hamburgische-staatsoper.de'
PAGE = BASE + '/de/kalender'
PROVIDER = 'Hamburgische Staatsoper'
ADDRESS = 'Große Theaterstraße 25, 20354 Hamburg'
FAMILY = re.compile(r'kinder|famili|\bab \d{1,2} jahr', re.I)
SCHOOL_ONLY = re.compile(r'vermittlungsprogramm für schüler|auswärtiges gastspiel|schulen|probenbesuche', re.I)
TOO_OLD = re.compile(r'\bab (9|[1-9]\d) jahr', re.I)  # regular repertoire with an age note, not a children's offer


def main():
    lat, lon = osm_coords('Hamburgische Staatsoper')
    offers = []
    for block in re.split(r'class="event-entry"', get(PAGE).text)[1:]:
        d = re.search(r'event__date">\w+ (\d{1,2})\.(\d{1,2})\.(\d\d)<', block)
        tm = re.search(r'class="event__datetime">(\d\d:\d\d)<', block)
        a = re.search(r'(?s)event__title">\s*<a href="([^"]+)">(.*?)</a>', block)
        if not (d and a):
            continue
        title = clean(a.group(2))
        loc = clean((re.search(r'(?s)event__location">(.*?)</div>', block) or [0, ''])[1])
        sub = clean((re.search(r'(?s)event__subtitle">(.*?)</div>', block) or [0, ''])[1])
        rest = clean((re.search(r'(?s)event__controls">(.*)', block) or [0, ''])[1])[:200]
        extra = clean((re.search(r'(?s)event__supportingprogram">(.*?)</ul>', block) or [0, ''])[1])
        text = f'{title} {sub} {extra} {rest} {loc}'
        if not FAMILY.search(text) or SCHOOL_ONLY.search(text) or TOO_OLD.search(text):
            continue
        day = date(2000 + int(d.group(3)), int(d.group(2)), int(d.group(1)))
        pm = re.search(r'·\s*(\d+)\s*€', rest)
        price, free = price_of(f'{pm.group(1)} €') if pm else (None, None)
        in_house = 'staatsoper' in loc.lower()
        offers.append(termin(f'{a.group(1).rsplit("/", 1)[-1]}:{day}:{tm.group(1) if tm else ""}', title, day, urljoin(BASE, a.group(1)), PROVIDER, venue=loc or PROVIDER,
                             address=ADDRESS if in_house else None, lat=lat if in_house else None, lon=lon if in_house else None, time_from=tm.group(1) if tm else None,
                             price=price, free=free, age=age_of(text), topic='theater'))
    return finish(SOURCE_ID, 'Hamburgische Staatsoper: Familienprogramm', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
