"""Import family days of the Freilichtmuseum am Kiekeberg (Rosengarten-Ehestorf, south of Hamburg) and its Museumsbauernhof Wennerstorf.

Source: https://www.kiekeberg-museum.de/de/kalender (one page, cards with genre tags). Kept genres: Aktionstage,
Gelebte Geschichte, Zuschauen & Mitmachen ('Sonntags im Museum') and Mitmachprogramm für Kinder; dropped:
Museumsakademie (adult craft courses) and Sonderereignisse (farm shop sales). Each event page is read once for
date with year, time, place and entry ('Wann und wo?'). Children and teens under 18 enter free.
robots.txt: 'Disallow:' (empty). Terms: none on reuse found in imprint/AGB.
Coordinates: the museum is outside Hamburg's OSM extract, so the HVV stop 'Ehestorf, Museum Kiekeberg' in front
of the entrance is used.
"""
import re
import sqlite3
import sys
from datetime import date

from common import DB_PATH
from offers_util import MONTHS, clean, finish, get, termin

SOURCE_ID = 'kiekeberg'
BASE = 'https://www.kiekeberg-museum.de'
PAGE = BASE + '/de/kalender'
PROVIDER = 'Freilichtmuseum am Kiekeberg'
KEEP = re.compile(r'aktionstage|gelebte-geschichte|zuschauen-mitmachen|mitmachprogramm|ferien|kinder', re.I)
DROP = re.compile(r'museumsakademie|sonderereignisse', re.I)
PLACES = {
    'wennerstorf': ('Museumsbauernhof Wennerstorf', 'Lindenstraße 4, 21279 Wennerstorf', None),
    'kiekeberg': ('Freilichtmuseum am Kiekeberg', 'Am Kiekeberg 1, 21224 Rosengarten-Ehestorf', 'Ehestorf, Museum Kiekeberg'),
}
DAY = re.compile(r'(\d{1,2})\.\s*(?:(' + '|'.join(MONTHS) + r')\s*)?', re.I)


def stop_coords(name):
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='hvv_gtfs' AND name=? LIMIT 1", (name,)).fetchone()
        return row or (None, None)
    finally:
        con.close()


def section(html, label):
    m = re.search(rf'(?s)<strong>{label}:?</strong>(.*?)</p>', html)
    return clean(re.sub(r'(?i)<br\s*/?>', ' ', m.group(1))) if m else ''


def dates(text):
    """'Fr 27.– So 29. November 2026' -> (27.11.2026, 29.11.2026); 'So 6. Dezember 2026' -> (6.12., None)."""
    y = re.search(r'\b(20\d\d)\b', text)
    if not y:
        return None, None
    head = text[:y.end()]
    parts = [(int(d), MONTHS.get((mo or '').lower())) for d, mo in DAY.findall(head)]
    parts = [p for p in parts if p[0] <= 31]
    if not parts:
        return None, None
    last_month = next((mo for _, mo in reversed(parts) if mo), None)
    if not last_month:
        return None, None
    year = int(y.group(1))
    d1, m1 = parts[0][0], parts[0][1] or last_month
    start = date(year - 1 if m1 > last_month else year, m1, d1)
    end = date(year, last_month, parts[-1][0]) if len(parts) > 1 else None
    return start, end


def topic_of(title, tags):
    """Explicit topics: the shared keyword list would read 'Traktorentreffen' as a group meeting."""
    if re.search(r'oster|nikolaus|weihnacht|advent|jahrmarkt|kinderfest|museumsnacht', title, re.I):
        return 'feste'
    if 'mitmachprogramm' in tags:
        return 'kreativ'
    if 'zuschauen-mitmachen' in tags:
        return 'wissen'
    return 'sonstiges'


def main():
    html = get(PAGE).text
    kie = stop_coords('Ehestorf, Museum Kiekeberg')
    offers = []
    for b in re.split(r'<li data-tags="', html)[1:]:
        tags = b[:b.find('"')]
        href = re.search(r'href="(/de/kalender/[^"?#]+)"', b)
        title = clean((re.search(r'(?s)class="title">(.*?)</p>', b) or [0, ''])[1])
        if not (href and title) or DROP.search(tags) or not KEEP.search(tags):
            continue
        url = BASE + href.group(1)
        page = get(url).text
        start, end = dates(section(page, 'Datum'))
        if not start:
            continue
        when = section(page, 'Zeit') or section(page, 'Uhrzeit')
        tm = re.search(r'(\d{1,2})(?:[.:](\d\d))?\s*(?:bis|[-–])\s*(\d{1,2})(?:[.:](\d\d))?\s*Uhr', when)
        entry = section(page, 'Eintritt')
        if re.search(r'unter 18[^.]*frei', entry, re.I) and re.search(r'\d+\s*Euro', entry):
            price, free = f'unter 18 frei, Erwachsene {re.search(r"(\d+)\s*Euro", entry).group(1)} €', None
        elif re.search(r'^frei|kostenlos|eintritt frei', entry, re.I):
            price, free = 'kostenlos', 1
        else:
            price, free = (entry[:40] or None), None
        key = 'wennerstorf' if 'wennerstorf' in tags or 'Wennerstorf' in section(page, 'Ort') else 'kiekeberg'
        venue, address, _ = PLACES[key]
        lat, lon = kie if key == 'kiekeberg' else (None, None)
        genre = clean((re.search(r'(?s)class="genre">(.*?)</p>', b) or [0, ''])[1])
        offers.append(termin(f'{href.group(1).rsplit("/", 1)[-1].lower()}:{start}', title, start, url, PROVIDER, venue=venue, address=address,
                             lat=lat, lon=lon, end=end,
                             time_from=f'{int(tm.group(1)):02d}:{tm.group(2) or "00"}' if tm else None,
                             time_to=f'{int(tm.group(3)):02d}:{tm.group(4) or "00"}' if tm else None,
                             price=price, free=free, description=genre or None,
                             topic=topic_of(title, tags)))
    return finish(SOURCE_ID, 'Freilichtmuseum am Kiekeberg: Aktionstage und Mitmachprogramm', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
