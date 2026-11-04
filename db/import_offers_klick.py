"""Import dated family events of KL!CK Kindermuseum from its theatre and holiday programme pages.

The site sets Crawl-delay: 10, which polite_fetch honours. Only facts are stored; past dates are dropped.
"""
import re
import sys
from datetime import date
from html import unescape

from common import connect, register_source
from offers import replace_offers
from robots_glob import polite_fetch

SOURCE_ID = 'klick_kindermuseum'
BASE = 'https://www.kindermuseum-hamburg.de'
THEATRE = BASE + '/kitas/ferienprogramm-2/'
HOLIDAYS = BASE + '/stadtteil/ferienprogramme/'
VENUE = 'KL!CK Kindermuseum'
ADDRESS = 'Brandstücken 43-45, 22549 Hamburg'  # interim site during renovation, as stated on the museum's contact page
LAT, LON = 53.5826463, 9.852832  # OSM node/12883611612, tagged as the interim site
MONTHS = {m: i + 1 for i, m in enumerate(['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'])}


def clean(s):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<(script|style).*?</\1>|<[^>]+>', ' ', s or ''))).strip()


def theatre(today):
    """Lines like '04. 12. 2026: Title Company'. The page states: free for all, starts at 10:00."""
    html = polite_fetch(THEATRE, retries=2, timeout=40).text
    out = []
    for m in re.finditer(r'(?s)<strong>\s*(\d{2})\.\s*(\d{2})\.\s*(\d{4}):\s*(.+?)</strong>', html):
        d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        if d >= today:
            out.append({'source_ref': f'theater:{d}', 'title': clean(m.group(4))[:120], 'kind': 'termin', 'topic': 'theater',
                        'weekday': d.weekday(), 'time_from': '10:00', 'start_date': d.isoformat(), 'price': 'kostenlos', 'free': 1, 'url': THEATRE})
    return out


def workshops(today):
    """Blocks 'Workshop 1: Title Datum: 22. Oktober 2026 Uhrzeit: 12:00–16:00 Uhr Kosten: 30 € ... Ab 6 Jahren'."""
    text = clean(polite_fetch(HOLIDAYS, retries=2, timeout=40).text)
    out = []
    rx = (r'Workshop \d+:\s*(.+?)\s*Datum:\s*(\d{1,2})\.\s*(\w+)\s+(\d{4})\s*Uhrzeit:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*Uhr'
          r'\s*Kosten:\s*(\d+)\s*€(.{0,500}?)(?=Workshop \d+:|$)')
    for m in re.finditer(rx, text):
        if m.group(3) not in MONTHS:
            continue
        d = date(int(m.group(4)), MONTHS[m.group(3)], int(m.group(2)))
        if d < today:
            continue
        age = re.search(r'Ab (\d+) Jahren', m.group(8))
        out.append({'source_ref': f'workshop:{d}:{m.group(1)[:30]}', 'title': m.group(1)[:120], 'kind': 'termin', 'weekday': d.weekday(),
                    'time_from': m.group(5), 'time_to': m.group(6), 'start_date': d.isoformat(), 'price': f'{m.group(7)} €', 'free': 0,
                    'age_min_m': int(age.group(1)) * 12 if age else None, 'registration': 'nötig', 'url': HOLIDAYS})
    return out


def main():
    today = date.today()
    offers = theatre(today) + workshops(today)
    if not offers:
        sys.exit('no future events found; keeping existing data')
    for o in offers:
        o.update(venue=VENUE, address=ADDRESS, lat=LAT, lon=LON, provider=VENUE)
    con = connect()
    register_source(con, SOURCE_ID, 'KL!CK Kindermuseum: Kindertheater und Ferienangebote', BASE + '/familien/veranstaltungen/',
                    'Fakten mit Link, keine Lizenz angegeben', 'KL!CK Kindermuseum Hamburg e.V.', priority=60)
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers')
    for o in offers:
        print(' ', o['start_date'], o['time_from'], o['title'], '|', o['price'])


if __name__ == '__main__':
    sys.exit(main())
