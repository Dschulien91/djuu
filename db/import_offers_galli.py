"""Import the public children's and family shows of the Galli Theater Hamburg from its children's programme page.

Source: https://www.galli-hamburg.de/spielplan-kinder/ (WordPress, Events Manager list: date, title, time / genre, venue,
price). The Galli ensemble plays as a guest in district culture centres, churches and Theater Wedel; the venue address
comes from the theatre's own location page (/locations/<slug>/), the age ('ab 3 Jahren') from the event page.
Kept: shows with family prices (Erw/Kinder) or on weekends / afternoons. Dropped: weekday-morning shows for Kitas and
schools (single group ticket, registration), sold-out dates (finish()). At Kunstklinik Eppendorf and KIKU Kinderkulturhaus
Lohbrügge the 'stadtkultur' source already imports the Galli shows from the centres' own pages: a Galli date there is
kept only if stadtkultur has another show of that day at that venue but not this time (second show of the day), or no
show of that day at all; if both list the day with different times, the venue's own page wins.
robots.txt: only /wp-admin/ and the cache folder are disallowed.
"""
import re
import sqlite3
import sys
from datetime import date
from html import unescape

from common import DB_PATH
from offers_util import MONTHS_SHORT, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'galli_theater'
BASE = 'https://galli-hamburg.de'
PAGE = 'https://www.galli-hamburg.de/spielplan-kinder/'
PROVIDER = 'Galli Theater Hamburg'
ELSEWHERE = {'kunstklinik': 'Kunstklinik Eppendorf', 'kiku': 'KIKU Kinderkulturhaus Lohbrügge'}  # stadtkultur providers


def stadtkultur_times():
    """{(provider, date): {times}} of the dated stadtkultur offers at the venues in ELSEWHERE."""
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        rows = con.execute(f"SELECT provider, start_date, time_from FROM offers WHERE source_id='stadtkultur' AND kind='termin' "
                           f"AND provider IN ({','.join('?' * len(ELSEWHERE))})", list(ELSEWHERE.values())).fetchall()
    except sqlite3.OperationalError:
        rows = []
    finally:
        con.close()
    out = {}
    for prov, day, tf in rows:
        out.setdefault((prov, day), set()).add(tf)
    return out
OSM = {'Kulturschloss Wandsbek': 'Kulturschloss Wandsbek', 'Kunstklinik Kulturzentrum Eppendorf': 'Kunstklinik',
       'KIKU Kinderkulturhaus Lohbrügge': 'Kinderkulturhaus Lohbrügge'}


def detail(url, cache={}):
    """(age, location url) of one event page."""
    if url not in cache:
        t = get(url).text
        info = clean((re.search(r'(?s)class="EMdata">(.*?)</div>', t) or [0, ''])[1])
        body = clean(t)
        loc = re.search(r'href="(https://galli-hamburg\.de/locations/[^"]+)"', t)
        cache[url] = (age_of(body[body.find('Termine'):] if 'Termine' in body else body), loc.group(1) if loc else None, info)
    return cache[url]


def address(loc_url, cache={}):
    if loc_url and loc_url not in cache:
        t = get(loc_url).text
        m = re.search(r'(?s)</strong>\s*<br\s*/?>\s*([^<]+?)\s*<br\s*/?>\s*((?:\d{5})?[^<]+?)\s*<br', t)
        cache[loc_url] = f'{clean(m.group(1))}, {clean(m.group(2))}' if m else None
    return cache.get(loc_url)


def main():
    html = get(PAGE).text
    rows, month_year = [], None
    for part in re.split(r'(<h2>[^<]+</h2>)', html):
        h = re.match(r'<h2>(\w+)\.? (\d{4})</h2>', part)
        if h:
            month_year = (MONTHS_SHORT.get(h.group(1).lower()[:3]), int(h.group(2)))
            continue
        if not month_year or not month_year[0]:
            continue
        for b in part.split('class="spielplanV1"')[1:]:
            d = re.search(r'datumV1">(\d{1,2})<', b)
            a = re.search(r'(?s)titelV1"><a href="([^"]+)">(.*?)</a>', b)
            if not (d and a):
                continue
            sub = clean((re.search(r'(?s)untertitelV1">(.*?)</div>', b) or [0, ''])[1])
            tm = re.match(r'(\d{1,2}):(\d\d)\s*h\s*/?\s*(.*)', sub)
            rows.append({'day': date(month_year[1], month_year[0], int(d.group(1))), 'url': a.group(1), 'title': clean(a.group(2)),
                         'tf': f'{int(tm.group(1)):02d}:{tm.group(2)}' if tm else None, 'genre': tm.group(3).strip() if tm else sub,
                         'venue': unescape(clean((re.search(r'(?s)gastspielortV1">(.*?)</div>', b) or [0, ''])[1])),
                         'price': clean((re.search(r'(?s)preisV1">(.*?)</div>', b) or [0, ''])[1])})
    known = stadtkultur_times()
    galli_times = {}
    for r in rows:
        r['other'] = next((prov for key, prov in ELSEWHERE.items() if key in r['venue'].lower()), None)
        galli_times.setdefault((r['other'], r['day'].isoformat()), set()).add(r['tf'])
    offers = []
    for r in rows:
        day, tf, venue, price = r['day'], r['tf'], r['venue'], r['price']
        if r['other']:
            theirs = known.get((r['other'], day.isoformat()), set())
            if tf in theirs or (theirs and not theirs & galli_times[(r['other'], day.isoformat())]):
                if tf not in theirs:
                    print(f'  time differs from {r["other"]}: {day} {tf} {r["title"]} (theirs: {sorted(theirs)}), kept theirs')
                continue
        if not re.search(r'erw|kind', price, re.I) and day.weekday() < 5 and (tf or '00:00') < '13:00':
            continue  # Kita / school show
        age, loc, _ = detail(r['url'])
        p = re.sub(r'\s+', ' ', price.replace('€', ' €')).replace(' ,', ',').strip()
        p = re.sub(r'(\d)\s+€', r'\1 €', p) if re.search(r'\d', p) else ''
        lat, lon = osm_coords(OSM[venue]) if venue in OSM else (None, None)
        offers.append(termin(f'{r["url"].rstrip("/").rsplit("/", 1)[-1]}:{day}:{tf}', r['title'], day, r['url'], PROVIDER,
                             venue=venue or PROVIDER, address=address(loc), lat=lat, lon=lon, time_from=tf, price=p[:40] or None,
                             free=0 if p else None, age=age, topic='theater', description=r['genre'][:100] or None))
    return finish(SOURCE_ID, 'Galli Theater Hamburg: Kinder- und Familientheater', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
