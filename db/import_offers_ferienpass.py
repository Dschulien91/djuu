"""Import the dated holiday offers of the Hamburger Ferienpass (Behörde für Schule und Berufsbildung) for children.

Source: https://ferienpass-hamburg.de/ - the public offer list is a JSON endpoint of the site itself
(/courses/list?command={"first":..,"offset":..}); robots.txt is empty. Each offer links to its own Ferienpass page.
Kept: offers with dates in or near Hamburg (postcodes 20/21/22...), not 'Reisen' (holiday trips away) and not online-only,
for children up to 13 (finish() drops 14+). Consecutive dates (gap <= 3 days) become one entry with start and end.
The course provider's contact data (often a private person) is never stored, only the place where the offer happens.
Offers at venues that already have their own importer (Planetarium, Archäologisches Museum) are skipped.
"""
import json
import re
import sys
from datetime import date, datetime, timedelta
from urllib.parse import quote

from offers_util import clean, finish, get, osm_coords, termin
from import_offers_sportvereine import place

SOURCE_ID = 'ferienpass_hamburg'
BASE = 'https://ferienpass-hamburg.de'
PROVIDER = 'Hamburger Ferienpass'
TRIPS = 'ecc8003e-6fa7-4123-a309-aa8243140a7a'  # category 'Reisen'
COVERED = re.compile(r'planetarium|archäologisches museum', re.I)
NOT_A_PLACE = re.compile(r'^(start|startpunkt|beginn)\b|^\s*$', re.I)


def blocks(dates):
    """Course dates -> runs of (first day, last day, time text); a gap of more than 3 days starts a new run."""
    days = sorted({(datetime.fromisoformat(d['from']).date(), datetime.fromisoformat(d['to']).date(), clean(d.get('dateTimeInfo'))) for d in dates})
    runs = []
    for a, b, info in days:
        if runs and (a - runs[-1][1]).days <= 3 and runs[-1][2] == info:
            runs[-1][1] = max(runs[-1][1], b)
        else:
            runs.append([a, b, info])
    return runs


def main():
    courses, first = [], 0
    while True:
        d = get(f'{BASE}/courses/list?command=' + quote(json.dumps({'first': first, 'offset': 100, 'searchTerm': ''}))).json()
        courses += d.get('result') or []
        first += 100
        if first >= int(d.get('totalCount') or 0) or not d.get('result'):
            break
    offers, horizon = [], date.today() + timedelta(days=240)
    for c in courses:
        if not c.get('published', True) or not c.get('isActive', True) or c.get('online') or TRIPS in (c.get('categories') or []):
            continue
        loc = c.get('locationProvider') or {}
        plz = clean(loc.get('postalCode'))
        if not re.match(r'2[012]\d{3}$', plz):
            continue
        venue = clean(loc.get('name'))
        if COVERED.search(venue):
            continue
        street = clean(loc.get('address'))
        address = ', '.join(x for x in [street, f'{plz} {clean(loc.get("city")) or "Hamburg"}'] if x)
        person = re.match(r'([A-ZÄÖÜ][a-zäöüß]+ ){1,2}[A-ZÄÖÜ][a-zäöüß]+ - (.+)$', venue)  # 'First Last - Business' -> 'Business'
        if person and not venue.startswith(('Die ', 'Der ', 'Das ')) and not re.search(r'e\.\s?V\.|gmbh|schule|verein|studio|museum|haus', person.group(0).split(' - ')[0], re.I):
            venue = person.group(2)
        if NOT_A_PLACE.search(venue):
            venue = clean(loc.get('addressSuffix')) or street or PROVIDER
        lat, lon = osm_coords(venue) if len(venue) > 6 else (None, None)
        if lat is None:
            lat, lon, _ = place(venue, address)
        lo, hi = c.get('minimumAge'), c.get('maximumAge')
        age = ((lo * 12) if lo else None, (hi + 1) * 12 if hi and hi < 99 else None)
        price = c.get('price')
        price_txt, free = ('kostenlos', 1) if price in (0, '0') else ((f'{price} €'.replace('.', ','), 0) if price else (None, None))
        reg = 'offen' if c.get('noRegistrationRequired') else 'nötig'
        desc = clean(c.get('description')).split('\n')[0][:150] or None
        for a, b, info in blocks(c.get('courseDates') or []):
            if b < date.today() or a > horizon:
                continue
            tm = re.search(r'(\d{1,2})[:.](\d\d)\s*(?:Uhr)?\s*[-–]\s*(\d{1,2})[:.](\d\d)', info or '')
            one = re.search(r'(\d{1,2})[:.](\d\d)', info or '')
            tf = f'{int(tm.group(1)):02d}:{tm.group(2)}' if tm else (f'{int(one.group(1)):02d}:{one.group(2)}' if one else None)
            tt = f'{int(tm.group(3)):02d}:{tm.group(4)}' if tm else None
            if not tf and (b - a).days >= 2:
                continue  # a place that is open during the holidays (museum, playground, park), not an event: places live on the map
            offers.append(termin(f'{c["identifier"]}:{a}', clean(c['title']), a, c.get('uri') or BASE, PROVIDER, venue=venue, address=address,
                                 lat=lat, lon=lon, time_from=tf, time_to=tt, price=price_txt, free=free, age=age, end=b if b > a else None,
                                 registration=reg, description=desc))
    return finish(SOURCE_ID, 'Hamburger Ferienpass: Ferienangebote', BASE + '/', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
