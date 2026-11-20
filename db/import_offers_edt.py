"""Import the children's and family shows of the Ernst Deutsch Theater from its own programme pages.

Source: https://www.ernst-deutsch-theater.de/programm - the programme tiles carry the theatre's own filter class 'kinder';
each such play page lists its performances ('21/11 Samstag 11.00 Uhr Buchen'). Weekday performances before 13:30 are
the theatre's Kita/school shows (the play page refers schools and Kitas to a separate booking letter) and are left out,
as are rows marked sold out. Facts only: title, date, time, age, price as published, link to the play page.

robots.txt: none (404), so nothing is disallowed. Terms: imprint has no reuse clause found -> nothing to ask.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'ernst_deutsch_theater'
BASE = 'https://www.ernst-deutsch-theater.de'
PAGE = BASE + '/programm'
PROVIDER = 'Ernst Deutsch Theater'
ADDRESS = 'Friedrich-Schütter-Platz 1, 22087 Hamburg'
ROW = re.compile(r'<span class="date[^"]*">(\d{1,2})/(\d{1,2})</span>.*?<span class="time[^"]*">(\d{1,2})\.(\d\d) Uhr</span>.*?'
                 r'class="button1[^"]*"[^>]*>([^<]*)</a>', re.S)


def plays():
    html = get(PAGE).text
    out = []
    for m in re.finditer(r'<div class="element-item ([^"]*)">(.*?)(?=<div class="element-item |\Z)', html, re.S):
        href = re.search(r'href="(/programm/veranstaltung/[^"]+)"', m.group(2))
        if href and re.search(r'\bkinder\b', m.group(1)) and href.group(1) not in out:
            out.append(href.group(1))
    return out


def main():
    lat, lon = osm_coords('Ernst Deutsch Theater', 'Ernst-Deutsch-Theater')
    if lat is None:
        lat, lon = 53.569245, 10.026
    today = date.today()
    offers = []
    for path in plays():
        url = BASE + path
        html = get(url).text
        title = clean((re.search(r'(?s)<h1[^>]*>(.*?)</h1>', html) or [0, path])[1])
        title = title.title() if title.isupper() else title
        head = clean((re.search(r'(?s)<h1.*?<section>', html) or [''])[0])
        age = age_of(head) if age_of(head)[0] is not None else age_of(clean(html))
        price = re.search(r'(?s)<b>Karten</b>(.*?)</div>', html)
        price, free = price_of(price.group(1).replace(" bis ", " – ")) if price else (None, None)
        first = re.search(r'class="nextEvent".*?(\d{1,2})\.(\d{1,2})\.(\d{4})<br>\s*(\d{1,2})\.(\d\d) Uhr.*?class="button1[^"]*"[^>]*>([^<]*)</a>', html, re.S)
        year = int(first.group(3)) if first else today.year
        rows = ROW.findall(html)
        if not rows and first:  # single date: only the 'next performance' box, no list
            rows = [(first.group(1), first.group(2), first.group(4), first.group(5), first.group(6))]
        prev = None
        for dd, mm, hh, mi, status in rows:
            day = date(year, int(mm), int(dd))
            if prev and day < prev:  # list runs in date order: a smaller date means the next year
                year += 1
                day = date(year, int(mm), int(dd))
            prev = day
            tm = f'{int(hh):02d}:{mi}'
            if re.search(r'ausverkauft|abgesagt', status, re.I):
                continue
            if day.weekday() < 5 and tm < '13:30':  # Kita/school shows
                continue
            offers.append(termin(f'{path.rsplit("-", 1)[-1]}:{day}:{tm}', title, day, url, PROVIDER, venue=PROVIDER, address=ADDRESS,
                                 lat=lat, lon=lon, time_from=tm, age=age, price=price, free=free, registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Ernst Deutsch Theater: Kinder- und Familienstücke', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
