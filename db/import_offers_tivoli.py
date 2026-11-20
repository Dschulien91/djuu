"""Import the children's and family shows of Schmidts Tivoli (Schmidt Theater, Schmidts Tivoli, Schmidtchen) from tivoli.de.

Source: the theatre's own kids page /programm-tickets/kindertheater lists every current family production with a link to its
show page. Each show page names the age recommendation ('empfohlen für Menschen ab 5 Jahren') and links its full date list
(/programm-tickets/spielplan/show/<id>); the dates come from the spielplan's own list endpoint for that show
(ajax.call?...route=loadSpielplanList&requestParameter[show]=<id>, 20 performances per page, offset paging). Show pages
without that link (one-off concerts, readings) give their dates in the block 'Die nächsten Vorstellungen'.
Kept: every listed performance except sold-out ones. Facts only: title, date, time, house, age, link to the show page.

robots.txt: '*' may read everything except /typo3/, /typo3conf/, '/*?id=*', powermail and '/ajax.call?*' at the root;
tivoli.de is in PERMITTED_HOSTS (provider agreed to be read), so the spielplan list endpoint below the show path is read
with the normal per-host pause.
"""
import re
import sys
from datetime import date

import requests

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'tivoli_kindertheater'
BASE = 'https://www.tivoli.de'
KIDS = BASE + '/programm-tickets/kindertheater'
LIST = BASE + '/programm-tickets/spielplan/ajax.call?nameSpace=tx_auwtivoli_ajaxtivoli&route=loadSpielplanList'
PROVIDER = 'Schmidts Tivoli'
HOUSES = {  # house name on the site -> venue, address, OSM name, fallback coordinates
    'Schmidt Theater': ('Schmidt Theater', 'Spielbudenplatz 24-25, 20359 Hamburg', 'Schmidt Theater', (53.549136, 9.963875)),
    'Schmidts Tivoli': ('Schmidts Tivoli', 'Spielbudenplatz 27-28, 20359 Hamburg', 'Schmidts Tivoli', (53.549162, 9.964258)),
    'Schmidtchen': ('Schmidtchen (Klubhaus St. Pauli)', 'Spielbudenplatz 21-22, 20359 Hamburg', 'Schmidtchen', (53.549244, 9.964349)),
}
NOT_SHOWS = re.compile(r'/(kindertheater|spielplan|alle-veranstaltungen|gutscheine|jahresvorschau|gastspiele|silvester)(/|$)')


def house_of(text):
    for key, val in HOUSES.items():
        if key.lower() in text.lower():
            return val
    return HOUSES['Schmidts Tivoli']


class Days:
    """The site gives day and month only, in date order: the year starts at this year and counts up when the month falls back."""
    def __init__(self, today):
        self.today, self.year, self.prev = today, today.year, None

    def __call__(self, day, month):
        if self.prev is None and (date(self.year, month, day) - self.today).days < -60:
            self.year += 1
        elif self.prev is not None and (month, day) < self.prev:
            self.year += 1
        self.prev = (month, day)
        return date(self.year, month, day)


def performances(show_id, today):
    """All listed performances of one show: (ref, date, time, house text, sold out)."""
    out, last_day, offset, days = [], None, 0, Days(today)
    while offset < 600:
        url = f'{LIST}&requestParameter%5Bshow%5D={show_id}'
        if offset:
            url += f'&requestParameter%5Boffset%5D={offset}'
        html = get(url).text
        if 'class="perf"' not in html:
            break
        # a page starts without a day divider when it continues the previous page's last day
        for chunk in re.split(r'(?=<div class="day-divider">)', html):
            d = re.search(r'class="day-label">\s*\w+<br/><span class="time">(\d{1,2})\.(\d{1,2})\.</span>', chunk)
            if d:
                last_day = days(int(d.group(1)), int(d.group(2)))
            for pid, body in re.findall(r'(?s)<div class="perf" id="p(\d+)">(.*?)(?=<div class="perf" id=|$)', chunk):
                tm = re.search(r'class="time">(\d{1,2}):(\d\d)<', body)
                if not (tm and last_day):
                    continue
                house = clean((re.search(r'(?s)class="perf-lower"><span>(.*?)</span>', body) or [0, ''])[1])
                out.append((pid, last_day, f'{int(tm.group(1)):02d}:{tm.group(2)}', house, 'Ausverkauft' in body))
        offset += 20
    return out


def next_shows(html, today):
    """Fallback: the 'Die nächsten Vorstellungen' block of a show page."""
    out, days, seen = [], Days(today), set()
    for dd, mm, hh, mi, rest in re.findall(r'(?s)ticket-suggestions__date[^>]*>\s*\w+\s+(\d{1,2})\.(\d{1,2})\.\s*</div>\s*'
                                           r'<div class=.ticket-suggestions__time.>\s*(\d{1,2}):(\d\d)\s*Uhr\s*</div>(.*?)</div>', html):
        if (dd, mm, hh, mi) in seen:  # the block can appear twice (desktop and mobile layout)
            continue
        seen.add((dd, mm, hh, mi))
        out.append((None, days(int(dd), int(mm)), f'{int(hh):02d}:{mi}', '', 'usverkauft' in rest))
    return out


NUMBERS = {'zwei': 2, 'drei': 3, 'vier': 4, 'fünf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10, 'elf': 11, 'zwölf': 12}


def age_text(text):
    return age_of(re.sub(r'\bab (' + '|'.join(NUMBERS) + r')\b', lambda m: f'ab {NUMBERS[m.group(1).lower()]}', text, flags=re.I))


def main():
    today = date.today()
    kids = get(KIDS).text
    paths = []
    for p in re.findall(r'class="cce-teaser">\s*<a href="(/programm-tickets/[a-z0-9-]+)"', kids):  # the show teasers only
        if not NOT_SHOWS.search(p) and p not in paths:
            paths.append(p)
    offers = []
    for path in paths:
        try:
            html = get(BASE + path).text
        except (requests.RequestException, PermissionError, RuntimeError) as e:
            print(f'  skip {path}: {e}')
            continue
        main_html = html[html.find('<main'):] if '<main' in html else html
        title = clean((re.search(r'(?s)<h1[^>]*>(.*?)</h1>', main_html) or re.search(r'(?s)<title>(.*?)</title>', html) or [0, ''])[1])
        title = re.sub(r'\s*[|–-]\s*Schmidts? Tivoli.*$', '', title).strip()
        sub = clean((re.search(r'(?s)</h1>.{0,600}?<h2[^>]*>(.*?)</h2>', main_html) or [0, ''])[1])
        if sub and len(sub) <= 50 and sub.lower() not in title.lower():  # guest shows: artist name plus programme title
            title = f'{title}: {sub}'
        text = clean(main_html)
        info = re.search(r'(?s)<div class="ce-bodytext">\s*<h5>(.*?)</h5>(.*?)</div>', html)
        house_text = clean(info.group(1)) if info else text[:3000]
        age = age_text(clean(info.group(2))) if info else (None, None)
        if age == (None, None):
            age = age_text(re.sub(r'\bab \d+ (Euro|€)', '', text[:6000]))
        show = re.search(r'href="/programm-tickets/spielplan/show/(\d+)', html)
        perfs = performances(show.group(1), today) if show else next_shows(html, today)
        if not perfs:
            print(f'  no dates: {path}')
        for pid, day, tm, house, sold in perfs:
            if sold:
                continue
            venue, address, osm, (flat, flon) = house_of(house or house_text)
            lat, lon = osm_coords(osm)
            ref = f'{show.group(1) if show else path.rsplit("/", 1)[1]}:{pid or day.isoformat() + "T" + tm}'
            offers.append(termin(ref, title, day, BASE + path, PROVIDER, venue=venue, address=address, lat=lat or flat, lon=lon or flon,
                                 time_from=tm, age=age, registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'Schmidts Tivoli: Kindertheater und Familienshows', KIDS, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
