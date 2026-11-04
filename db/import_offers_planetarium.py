"""Import the children's programme of Planetarium Hamburg from its public schedule page.

robots.txt only blocks the CMS backend. The imprint limits copying of pages to private use, so no page
is stored: only facts are kept (title, date, time, age, price, link). Shows in the schedule category
'Kinderveranstaltungen' become one dated 'termin' per performance.
"""
import re
import sqlite3
import sys
from datetime import date
from html import unescape
from urllib.parse import urljoin

from common import DB_PATH, connect, register_source
from offers import age_range, replace_offers
from robots_glob import polite_fetch

SOURCE_ID = 'planetarium_hamburg'
BASE = 'https://www.planetarium-hamburg.de/'
SCHEDULE = BASE + 'de/spielplan'
VENUE = 'Planetarium Hamburg'
ADDRESS = 'Linnering 1, 22299 Hamburg'
MONTHS = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'])}


def clean(s):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<(script|style).*?</\1>|<[^>]+>', ' ', s or ''))).strip()


def osm_coords(name):
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        return con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND name=? AND lat IS NOT NULL LIMIT 1", (name,)).fetchone() or (None, None)
    finally:
        con.close()


def show_facts(url):
    """Age recommendation and ticket price from the show page."""
    text = clean(polite_fetch(url, retries=2).text)
    m = re.search(r'Empfohlen[^.]{0,60}?\d+[^.]{0,20}Jahr\w*', text)
    age = age_range(m.group(0)) if m else (None, None)
    p = re.search(r'Eintritt:\s*(\d+,\d+)\s*Euro(?:,\s*ermäßigt\s*(\d+,\d+)\s*Euro)?', text)
    price = None
    if p:
        price = f'{p.group(1)} €' + (f', ermäßigt {p.group(2)} €' if p.group(2) else '')
    return age, price


def main():
    today = date.today()
    html = polite_fetch(SCHEDULE, retries=2).text
    items = []
    for block in re.findall(r'(?s)<li class="repertoire_item">(.*?)repertoire_item__data__info', html):
        sub = re.search(r'(?s)repertoire_item__hl__sub">(.*?)</span>', block)
        title = re.search(r'(?s)repertoire_item__hl__main">(.*?)</span>', block)
        href = re.search(r'href="(de/veranstaltungen-tickets/details/[^"]+)"', block)
        when = re.search(r'am (\d{2})\.(\w{3}) (\d{4}) um (\d{2}:\d{2}) Uhr', block)
        if not (sub and title and href and when) or clean(sub.group(1)) != 'Kinderveranstaltungen':
            continue
        if when.group(2) not in MONTHS:
            continue
        d = date(int(when.group(3)), MONTHS[when.group(2)], int(when.group(1)))
        if d >= today:
            items.append((clean(title.group(1)), urljoin(BASE, href.group(1)), d, when.group(4)))
    if not items:
        sys.exit("no children's shows parsed; keeping existing data")

    facts = {url: show_facts(url) for url in sorted({i[1] for i in items})}
    lat, lon = osm_coords('Planetarium')
    offers = []
    for title, url, d, tm in items:
        (amin, amax), price = facts[url]
        offers.append({
            'source_ref': f'{url.rsplit("/", 1)[-1]}:{d}:{tm}', 'title': title[:120], 'kind': 'termin', 'topic': 'theater',
            'age_min_m': amin, 'age_max_m': amax, 'weekday': d.weekday(), 'time_from': tm, 'start_date': d.isoformat(),
            'price': price, 'free': 0 if price else None, 'registration': 'nötig', 'venue': VENUE, 'address': ADDRESS,
            'lat': lat, 'lon': lon, 'url': url, 'provider': VENUE,
        })
    con = connect()
    register_source(con, SOURCE_ID, 'Planetarium Hamburg: Kinderveranstaltungen', SCHEDULE,
                    'Fakten mit Link, keine Lizenz angegeben', 'Planetarium Hamburg', priority=60)
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers, {len(facts)} shows, {sum(1 for o in offers if o["age_min_m"] is not None)} with age, '
          f'{sum(1 for o in offers if o["price"])} with price; {min(o["start_date"] for o in offers)} to {max(o["start_date"] for o in offers)}')
    for url, ((amin, amax), price) in facts.items():
        print(' ', url.rsplit('/', 1)[-1], '|', amin, amax, price)


if __name__ == '__main__':
    sys.exit(main())
