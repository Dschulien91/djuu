"""Import family and children's concerts and workshops of Elbphilharmonie and Laeiszhalle as offers.

Source: the public programme list https://www.elbphilharmonie.de/de/programm/ with the site's own audience filters
(FAM = Familien, 0JA/1JA/3JA/6JA/8JA = age groups, NDR_ED = NDR Familienkonzerte); each filter list is read page by
page through its 'load more' URL (/de/programm/<dd-mm-yyyy>/<filter>/) as far as the site lists (about 8 months).
Every kept event page is read once for the MusicEvent JSON-LD (venue, address, end time) and the organiser line.

Left out: school and Kita concerts (Schulkonzert, Kitakonzert, 'Klasse 1–4', 'Vorschule'), offers for 14+ / adults,
'für Menschen mit und ohne Demenz', sold-out dates ('Ausverkauft') and concerts organised by the Symphoniker Hamburg,
the Hamburgische Staatsoper or the Philharmonisches Staatsorchester (own importers: import_offers_symphoniker.py,
import_offers_staatsoper.py). The NDR family concerts (also those in the Rolf-Liebermann-Studio, filter NDR_ED) and the
Hamburger Camerata's family concerts are imported here; ndr.de lists the same concerts (no separate NDR importer) and
hamburgercamerata.de is a parked domain.

Facts only: title, date, time, hall, age, price 'ab', link to the event page.
robots.txt: elbphilharmonie.de is in PERMITTED_HOSTS (the provider agreed), so robots.txt is not applied; the per-host
pause still is.
"""
import json
import re
import sys
from datetime import date, datetime

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'elbphilharmonie_familie'
SITE = 'https://www.elbphilharmonie.de'
PAGE = SITE + '/de/programm/FAM/'
FILTERS = ['FAM', '0JA', '1JA', '3JA', '6JA', '8JA', 'NDR_ED']
HOUSES = {  # house -> (address, lat, lon)
    'elbphilharmonie': ('Platz der Deutschen Einheit 1, 20457 Hamburg', 53.54132, 9.98418),
    'laeiszhalle': ('Johannes-Brahms-Platz, 20355 Hamburg', 53.55590, 9.98086),
}
SCHOOL = re.compile(r'schulkonzert|kitakonzert|kita-konzert|\bklassen?\s*\d|vorschule|für schulklassen|kita-gruppen', re.I)
NOT_FOR_KIDS = re.compile(r'demenz|ab 1[4-9] jahr|ab 1[4-9] und|jugendliche ab 1[4-9]|erwachsene\b(?! und kinder)', re.I)
OTHER_IMPORTER = re.compile(r'symphoniker hamburg|staatsoper|philharmonisches staatsorchester|philharmoniker hamburg', re.I)


def list_items(flt):
    """All events of one filter list: dicts with id, url, title, subtitle, date, times, venue, status."""
    url, out = f'{SITE}/de/programm/{flt}/', []
    for _ in range(40):
        html = get(url).text
        items = re.findall(r'<li id="event_id_[^"]+"(.*?)</li>\s*(?=<li id="event_id|</ul>)', html, re.S)
        for it in items:
            href = re.search(r'href="(/de/programm/[^"]+/(\d+))"', it)
            dt = re.search(r'datetime="(\d{4}-\d\d-\d\d)', it)
            if not (href and dt):
                continue
            tm = clean((re.search(r'(?s)class="time">(.*?)</span>', it) or [0, ''])[1])
            place = re.search(r'(?s)class="cell small-6 medium-8 xlarge-12 place-cell">(.*?)</div>', it)
            status = re.search(r'(?s)class="cell status-info(.*)', it)
            status = re.sub(r'(?s)<button class="event__bookmark.*?</button>', '', status.group(1)) if status else ''
            out.append({'id': href.group(2), 'url': SITE + href.group(1), 'slug': href.group(1).split('/')[3],
                        'title': clean((re.search(r'(?s)class="event-title[^"]*">(.*?)</p>', it) or [0, ''])[1]),
                        'sub': clean((re.search(r'(?s)class="event-subtitle">(.*?)</p>', it) or [0, ''])[1]),
                        'day': date.fromisoformat(dt.group(1)),
                        'times': [f'{int(h):02d}:{m or "00"}' for h, m in re.findall(r'(\d{1,2})(?::(\d\d))?\s*Uhr', tm)],
                        'venue': clean(place.group(1)) if place else '', 'status': clean(status)})
        nxt = re.search(r'data-url="(/de/programm/[^"]+)"', html)
        if not items or not nxt:
            break
        url = SITE + nxt.group(1)
    return out


def jsonld_event(html):
    for block in re.findall(r'(?s)<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html):
        try:
            d = json.loads(block, strict=False)  # descriptions contain raw newlines
        except ValueError:
            continue
        for e in (d if isinstance(d, list) else [d]):
            if isinstance(e, dict) and 'Event' in str(e.get('@type', '')):
                return e
    return {}


def age_in(text):
    t = re.sub(r'(\d+)\s*[-–]?\s*jährige', r'\1 Jahre', text or '', flags=re.I)
    t = re.sub(r'(\d)\s*[-–]\s*(\d+)\s*jahr\b', r'\1-\2 jahre', t, flags=re.I)  # 'Babykonzert: 0–1 Jahr'
    return age_of(t)


def main():
    events = {}
    for flt in FILTERS:
        got = list_items(flt)
        print(f'  filter {flt:7} {len(got):3} events')
        for e in got:
            events.setdefault(e['id'], e)
    offers, skipped = [], {'school': 0, 'not_for_kids': 0, 'sold_out': 0, 'other_importer': 0}
    coords = {}
    for e in sorted(events.values(), key=lambda x: x['day']):
        head = f'{e["slug"]} {e["title"]} {e["sub"]}'
        if SCHOOL.search(head):
            skipped['school'] += 1
            continue
        if NOT_FOR_KIDS.search(f'{e["title"]} {e["sub"]}'):
            skipped['not_for_kids'] += 1
            continue
        if re.search(r'ausverkauft', e['status'], re.I):
            skipped['sold_out'] += 1
            continue
        if OTHER_IMPORTER.search(e['sub']):
            skipped['other_importer'] += 1
            continue
        if e['day'] < date.today():
            continue
        html = get(e['url']).text
        org = clean((re.search(r'(?s)class="cell block-promoters">\s*<p>(.*?)</p>', html) or [0, ''])[1]).replace('Veranstalter:', '').strip()
        if OTHER_IMPORTER.search(org):
            skipped['other_importer'] += 1
            continue
        ev = jsonld_event(html)
        loc = ev.get('location') or {}
        venue = clean(loc.get('name')) or e['venue'] or 'Elbphilharmonie'
        house = next((k for k in HOUSES if k in venue.lower()), None)
        if house:
            address, lat, lon = HOUSES[house]
        else:  # e.g. Rolf-Liebermann-Studio, Bunker Feldstraße
            address = re.sub(r',(?=\d{5})', ', ', clean(loc.get('address'))) or None
            if venue not in coords:
                words = venue.split(' ', 1)  # 'KörberHaus LichtwarkTheater': hall, then house
                coords[venue] = osm_coords(venue, *(words[::-1] if len(words) == 2 else []))
            lat, lon = coords[venue]
        ends = re.search(r'(?s)Ende\s*(?:ca\.)?\s*<span>(.*?)</span>', html)
        ends = re.findall(r'(\d{1,2})(?::(\d\d))?', ends.group(1)) if ends else []
        ends = [f'{int(h):02d}:{m or "00"}' for h, m in ends]
        price = re.search(r'Tickets ab\s*€?\s*(\d+(?:,\d\d)?)', e['status'])
        age = age_in(e['sub'])
        if age == (None, None):
            age = age_in(clean(ev.get('description'))[:600])
        title = e['title']
        part = e['sub'].split(' / ')[0].strip()
        if part and (part.startswith(('„', '"', '»')) or (len(part) < 40 and not re.search(r'\d|\bmit\b|für|familien', part, re.I))):
            title = f'{title} – {part}'
        times = e['times'] or [None]
        provider = 'Laeiszhalle' if house == 'laeiszhalle' else 'Elbphilharmonie'
        for k, tf in enumerate(times):
            tt = ends[k] if len(ends) == len(times) else None
            offers.append(termin(f'{e["id"]}:{tf}', title, e['day'], e['url'], provider, venue=venue, address=address, lat=lat, lon=lon,
                                 time_from=tf, time_to=tt, price=f'ab {price.group(1)} €' if price else None,
                                 free=0 if price else None, age=age, registration='Ticket', topic='musik',
                                 description=f'Veranstalter: {org}'[:200] if org else None))
    print(f'  {len(events)} listed events, skipped: {skipped}')
    return finish(SOURCE_ID, 'Elbphilharmonie & Laeiszhalle: Familien- und Kinderkonzerte', PAGE, 'Elbphilharmonie Hamburg / HamburgMusik gGmbH',
                  offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
