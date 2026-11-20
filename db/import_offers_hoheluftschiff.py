"""Import the performances of the HoheLuftschiff Kindertheater (Theater Zeppelin Ensemble, Eimsbüttel) from its own schedule.

Source: https://hoheluftschiff.de/spielplan (Kirby CMS, server-rendered; every date links to /stueck/<slug>/<YYYYMMDD-HHMM>,
schema.org Event data alongside). The whole house is a children's theatre, so every row is kept except weekday
performances before 13:30 (Kita and school bookings, see 'Infos für Kitas & Schulen') and rows marked 'Ausverkauft'.
Facts only: title, date, time, age ('3+'), link to the date's own page.

robots.txt: '*' must not read /buchungen/ only. Terms: imprint has no reuse clause found -> nothing to ask.
"""
import re
import sys
from datetime import date

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'hoheluftschiff'
PAGE = 'https://hoheluftschiff.de/spielplan'
PROVIDER = 'HoheLuftschiff Kindertheater & Theater Zeppelin Ensemble'
VENUE = 'HoheLuftschiff Kindertheater'
ADDRESS = 'Kaiser-Friedrich-Ufer 23, 20253 Hamburg'
ROW = re.compile(r'<a\s[^>]*?href="(https://hoheluftschiff\.de/stueck/([\w-]+)/(\d{4})(\d\d)(\d\d)-(\d{1,2})(\d\d))"[^>]*>(.*?)</a>', re.S)


def main():
    lat, lon = osm_coords('HoheLuftschiff', 'Hoheluftschiff', 'Theater Zeppelin')
    offers, seen = [], set()
    for url, slug, y, m, d, hh, mi, body in ROW.findall(get(PAGE).text):
        title = clean((re.search(r'(?s)<div class="flex-grow[^"]*">(.*?)</div>', body) or re.search(r'(?s)<h2[^>]*>(.*?)</h2>', body) or [0, ''])[1])
        title = re.sub(r'\s*\d{1,2}\+$', '', title)
        if not title or re.search(r'ausverkauft|abgesagt|entfällt', clean(body), re.I):
            continue
        if url in seen:
            continue
        seen.add(url)
        day, tm = date(int(y), int(m), int(d)), f'{int(hh):02d}:{mi}'
        if day.weekday() < 5 and tm < '13:30':  # Kita and school bookings
            continue
        age = re.search(r'(\d{1,2})\+', clean(body))
        offers.append(termin(f'{slug}:{day}:{tm}', title, day, url, PROVIDER, venue=VENUE, address=ADDRESS, lat=lat, lon=lon,
                             time_from=tm, age=(int(age.group(1)) * 12, None) if age else (None, None), registration='Tickets',
                             topic='theater'))
    return finish(SOURCE_ID, 'HoheLuftschiff Kindertheater: Spielplan', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
