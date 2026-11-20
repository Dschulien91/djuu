"""Import the family programme of the Internationales Maritimes Museum Hamburg (IMMH, Kaispeicher B).

Sources (imm-hamburg.de, WordPress):
  /wp-json/wp/v2/posts?categories=<'Veranstaltung'>   current event posts (date in the excerpt, e.g. '13.12.26');
                                                      each post page is read for 'Uhrzeit', 'Kosten', 'Anmeldung'
  /wp-json/tribe/events/v1/events                     The Events Calendar (tours, simulator rides, holiday programme)
Kept: posts and calendar events that name children, families, Märchen or the holiday programme (category
'Ferienprogramm'); general tours, lectures and the Punsch bar are left out. The IMMH dates in the Museumsdienst
calendar are not imported there (import_offers_museumsdienst.py skips this museum), so nothing is doubled.
Permanent offers (Schnitzeljagd with Käpt'n Kuddel, bookable children's tours via the Museumsdienst) have no dates and
are not imported. Names of storytellers / guides in the time lines are not stored.

robots.txt: imm-hamburg.de is in PERMITTED_HOSTS (the provider agreed; wp-json allowed); the per-host pause applies.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, from_event, get, osm_coords, read_tribe, termin

SOURCE_ID = 'imm_hamburg'
BASE = 'https://imm-hamburg.de'
PAGE = BASE + '/kinder-familien/'
PROVIDER = 'Internationales Maritimes Museum Hamburg'
VENUE = 'Internationales Maritimes Museum Hamburg'
ADDRESS = 'Koreastraße 1, 20457 Hamburg'
LAT, LON = 53.54326, 10.00151  # Kaispeicher B
KIDS = re.compile(r'kinder|\bkind\b|kids|famili|eltern|baby|märchen|piraten|schnitzeljagd|ferien|lütt|\bab \d{1,2} jahren', re.I)


def section(html, name):
    m = re.search(r'(?s)<span>' + name + r'</span></h3><div class="text-top-reduced">(.*?)</div>', html)
    return [clean(p) for p in re.findall(r'(?s)<p>(.*?)</p>', m.group(1))] if m else []


def main():
    global LAT, LON
    LAT, LON = next((c for c in [osm_coords('Internationales Maritimes Museum Hamburg', 'Internationales Maritimes Museum')] if c[0]), (LAT, LON))
    offers = []
    cats = get(BASE + '/wp-json/wp/v2/categories?per_page=100&_fields=id,name').json()
    ev_cat = next((c['id'] for c in cats if c['name'] == 'Veranstaltung'), None)
    posts = get(f'{BASE}/wp-json/wp/v2/posts?categories={ev_cat}&per_page=50&_fields=id,link,title,excerpt').json() if ev_cat else []
    for p in posts:
        title, excerpt = clean(p['title']['rendered']), clean(p['excerpt']['rendered'])
        d = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{2,4})', excerpt)
        if not d:
            continue
        html = get(p['link']).text
        k = html.find('<span>Uhrzeit</span>')
        body = clean(html[max(0, k - 4000):k])[-1500:] if k > 0 else ''
        if not KIDS.search(f'{title} {body}'):
            continue
        y = int(d.group(3))
        day = date(y + 2000 if y < 100 else y, int(d.group(2)), int(d.group(1)))
        times = [t for line in section(html, 'Uhrzeit') for t in re.findall(r'(\d{1,2}:\d\d)', line)]
        cost = ' '.join(section(html, 'Kosten'))
        reg = ' '.join(section(html, 'Anmeldung'))
        price, free = (('Museumseintritt', 0) if re.search(r'museumseintritt', cost, re.I) else
                       ('kostenlos', 1) if re.search(r'kostenlos|frei', cost, re.I) else (cost[:40] or None, None))
        offers.append(termin(f'post{p["id"]}:{day}', re.sub(r'^(Lesung|Führung|Special):\s*', '', title), day, p['link'], PROVIDER,
                             venue=VENUE, address=ADDRESS, lat=LAT, lon=LON, time_from=times[0] if times else None,
                             time_to=times[-1] if len(times) > 1 else None, price=price, free=free, age=age_of(f'{title} {body}'),
                             registration='offen' if re.search(r'keine anmeldung', reg, re.I) else ('nötig' if reg else None)))
    for e in read_tribe(BASE, pages=5):
        if not ('Ferienprogramm' in e['cats'] or KIDS.search(f'{e["title"]} {e["text"][:300]}')):
            continue
        if e['start'].date() < date.today() and not (e.get('end') and e['end'].date() >= date.today()):
            continue
        offers.append(from_event(e, PROVIDER, venue=VENUE, address=ADDRESS, lat=LAT, lon=LON))
    return finish(SOURCE_ID, 'Internationales Maritimes Museum Hamburg: Kinder & Familien', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
