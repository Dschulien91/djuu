"""Import the Kampnagel productions for a young audience (children up to 12) from kampnagel.de.

Source: the site's own calendar API that the page kampnagel.de/kalender uses (POST /api/calendar with the token from
POST /api/csrf; two-month windows, the next six months), which lists every performance with production link, time, hall
and ticket status. Kampnagel marks productions for young people on the production page ('Auch für junges Publikum
geeignet', topic 'Junges Publikum') and gives an age recommendation for every production ('Empfohlen ab 10 Jahren').
Kept: marked productions recommended from 12 years or younger; most of the programme is adult and is left out.
Sold-out or cancelled performances are dropped. Facts only: title, date, time, hall, age, price, link to the production page.
When nothing qualifies, finish() keeps the old data and reports 'no current offers'.

robots.txt: '*' must not read /cpresources/ and /cache/; the calendar API and production pages are allowed.
"""
import json
import re
import sys
from datetime import date, datetime, timedelta

import requests

from common import fetch
from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'kampnagel_junges_publikum'
BASE = 'https://kampnagel.de'
PAGE = BASE + '/spielzeit-programm/junges-publikum'
PROVIDER = 'Kampnagel'
ADDRESS = 'Jarrestraße 20, 22303 Hamburg'
YOUNG = re.compile(r'Auch für junges Publikum geeignet|#\s*(für)?\s*Junges\s*Publikum|/thema/junges-publikum"', re.I)
MAX_AGE_YEARS = 12


def calendar(months=6):
    token = fetch(BASE + '/api/csrf', method='POST', headers={'Accept': 'application/json'}, check_robots=True).json()['token']
    start, items = date.today(), []
    for _ in range(months // 2):
        end = (start.replace(day=1) + timedelta(days=62)).replace(day=1) - timedelta(days=1)
        body = {'categories': {}, 'productions': [], 'hideLongTerm': False, 'date': {'from': start.isoformat(), 'to': end.isoformat()}}
        r = fetch(BASE + '/api/calendar', method='POST', data=json.dumps(body), check_robots=True,
                  headers={'X-CSRF-Token': token, 'Content-Type': 'application/json', 'Accept': 'application/json'})
        for block in r.json().get('blocks', []):
            items += block.get('items', [])
        start = end + timedelta(days=1)
    return items


def main():
    items = calendar()
    print(f'  {len(items)} performances, {len({i["href"] for i in items})} productions in the calendar')
    lat, lon = osm_coords('Kampnagel')
    prods, offers = {}, []
    for it in items:
        href = it.get('href') or ''
        if not href.startswith(BASE + '/produktionen/'):
            continue
        if href not in prods:
            try:
                html = get(href).text
            except (requests.RequestException, PermissionError, RuntimeError) as e:
                print(f'  skip {href}: {e}')
                prods[href] = None
                continue
            text = clean(html[html.find('<main'):] if '<main' in html else html)
            rec = re.search(r'Empfohlen ab (\d{1,2}) Jahren', text, re.I)
            young = YOUNG.search(html) is not None
            ok = young and rec and int(rec.group(1)) <= MAX_AGE_YEARS
            price = (re.search(r'Tickets:\s*([^()]{1,40}?)\s*(\(|Info\b|Empfohlen)', text) or [0, None])[1]
            prods[href] = {'age': age_of(rec.group(0)), 'price': price.replace('Euro', '€') if price else None,
                           'free': 1 if price and re.search(r'frei|kostenlos', price, re.I) else None} if ok else None
        p = prods[href]
        if not p:
            continue
        status = f'{it.get("status") or ""} {it.get("statusValue") or ""}'
        if re.search(r'ausverkauft|abgesagt|entfällt|sold ?out|cancel', status, re.I):
            continue
        start = datetime.fromisoformat(it['eventStart']['date'][:19])
        hall = clean((it.get('location') or {}).get('title') or '')
        title = clean(it.get('title') or '')  # the calendar's title is the artist or company, the subline the work
        if title.isupper():
            title = title.title()
        if it.get('subline'):
            title = f'{clean(it["subline"])} – {title}'
        free = 1 if it.get('statusValue') == 'free' else p['free']
        offers.append(termin(it['id'], title, start.date(), href, PROVIDER, venue=f'Kampnagel ({hall})' if hall else 'Kampnagel', address=ADDRESS,
                             lat=lat, lon=lon, time_from=None if it.get('daily') else start.strftime('%H:%M'),
                             price='kostenlos' if free == 1 else p['price'], free=free, age=p['age'],
                             registration='Anmeldung' if it.get('statusValue') == 'register' else 'Tickets', topic='theater'))
    print(f'  {sum(1 for v in prods.values() if v)} of {len(prods)} productions for a young audience (up to {MAX_AGE_YEARS})')
    return finish(SOURCE_ID, 'Kampnagel: Junges Publikum (bis 12 Jahre)', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
