"""Import performances of Theater für Kinder (Allee Theater) from its public dates page.

Only facts are stored (title, date, time, age, link). The imprint reserves its own texts and graphics,
so no descriptions or images are kept. School performances are left out.
"""
import re
import sqlite3
import sys
from datetime import date
from html import unescape

from common import DB_PATH, connect, register_source
from offers import age_range, replace_offers
from robots_glob import polite_fetch

SOURCE_ID = 'allee_theater'
DATES = 'https://alleetheater.de/kindertheater/termine-theater-fuer-kinder/'
ADDRESS = 'Max-Brauer-Allee 76, 22765 Hamburg'
MONTHS = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'])}
ROW = re.compile(r'(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\s+(\d{1,2})\s+([A-Za-zä]{3})\s+(\d{2})\s+(\d{2}:\d{2})h\s+(.*?)Zum Stück', re.S)


def text_with_links(html):
    html = re.sub(r'(?s)<(script|style).*?</\1>', ' ', html)
    html = re.sub(r'<a\b[^>]*href="([^"]+)"[^>]*>', r' [[\1]] ', html)
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', ' ', html)))


def clean(s):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<(script|style).*?</\1>|<[^>]+>', ' ', s or ''))).strip()


def osm_coords(name):
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        return con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND name=? AND lat IS NOT NULL LIMIT 1", (name,)).fetchone() or (None, None)
    finally:
        con.close()


def play_facts(url):
    html = polite_fetch(url, retries=2).text
    m = re.search(r'(?s)<title>(.*?)</title>', html)
    title = re.split(r'\s+[-–|]\s+', clean(m.group(1)))[0] if m else url.rstrip('/').rsplit('/', 1)[-1]
    a = re.search(r'Empfohlen[^.]{0,40}?ab\s*\d+\s*Jahr\w*', clean(html))
    return title, age_range(a.group(0)) if a else (None, None)


def main():
    today = date.today()
    first = polite_fetch(DATES, retries=2).text
    # The page renders one month; its month slider ticks these date checkboxes and reloads. Same request, one per month.
    values = sorted(set(re.findall(r'value="(\d{4}-\d{2}-\d{2} \d{2}:\d{2})"', first)))
    months = sorted({v[:7] for v in values if v[:10] >= today.isoformat()})
    pages = []
    for month in months:
        query = '-,-'.join(v.replace(' ', '+') for v in values if v.startswith(month) and v[:10] >= today.isoformat())
        for paged in range(1, 6):  # results come in pages of 10
            html = polite_fetch(f'{DATES}?_sfm_start_date_time={query}' + (f'&sf_paged={paged}' if paged > 1 else ''), retries=2).text
            pages.append(html)
            if len(ROW.findall(text_with_links(html))) < 10:
                break
    rows, school = [], 0
    for html in pages or [first]:
        for m in ROW.finditer(text_with_links(html)):
            _, day, mon, yy, tm, body = m.groups()
            # 'Zum Stück' is the anchor text, so the link to the play is the last marker before it
            link = re.findall(r'\[\[(https://alleetheater\.de/events/[^\]]+)\]\]', body)
            if mon not in MONTHS or not link:
                continue
            d = date(2000 + int(yy), MONTHS[mon], int(day))
            if re.search(r'schulvorstellung|schulveranstaltung', body, re.I):
                school += 1
                continue
            if d >= today:
                rows.append((link[-1], d, tm))
    if not rows:
        sys.exit('no performances parsed; keeping existing data')
    plays = {u: play_facts(u) for u in sorted({r[0] for r in rows})}
    lat, lon = osm_coords('Theater für Kinder')
    offers, seen = [], set()
    for url, d, tm in rows:
        ref = f'{url.rstrip("/").rsplit("/", 1)[-1]}:{d}:{tm}'
        if ref in seen:
            continue
        seen.add(ref)
        title, (amin, amax) = plays[url]
        offers.append({
            'source_ref': ref, 'title': title[:120], 'kind': 'termin', 'topic': 'theater', 'age_min_m': amin, 'age_max_m': amax,
            'weekday': d.weekday(), 'time_from': tm, 'start_date': d.isoformat(), 'registration': 'nötig',
            'venue': 'Theater für Kinder (Allee Theater)', 'address': ADDRESS, 'lat': lat, 'lon': lon, 'url': url, 'provider': 'Allee Theater',
        })
    con = connect()
    register_source(con, SOURCE_ID, 'Allee Theater: Theater für Kinder', DATES,
                    'Fakten mit Link, keine Lizenz angegeben', 'Allee Theater', priority=60)
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers, {len(plays)} plays, {school} school rows skipped; '
          f'{min(o["start_date"] for o in offers)} to {max(o["start_date"] for o in offers)}')
    for u, (t, a) in plays.items():
        print(' ', t, a, u)


if __name__ == '__main__':
    sys.exit(main())
