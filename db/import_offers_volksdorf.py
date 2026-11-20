"""Import family days of the Museumsdorf Volksdorf from its public event calendar (CM4all event widget).

Source: https://museumsdorf-volksdorf.de/Museumsdorf-erleben/Veranstaltungskalender/ (one list page; detail pages
for entry price and time). Kept: festivals and entries naming children/families (Advent im Dorf, Ostern, Hoffest,
Erntefest ...); dropped: club meetings (Wolle und Masche, Spinnkreis, Plattdüütsch Krink).
robots.txt: '*' group only blocks /.cm4all/ system paths, Crawl-delay 10 (honoured by get()).
"""
import re
import sys
from datetime import date
from html import unescape

from offers_util import FAMILY, clean, finish, get, osm_coords, termin

SOURCE_ID = 'museumsdorf_volksdorf'
BASE = 'https://museumsdorf-volksdorf.de'
PAGE = BASE + '/Museumsdorf-erleben/Veranstaltungskalender/'
PROVIDER = 'Museumsdorf Volksdorf'
ADDRESS = 'Im Alten Dorfe 46-48, 22359 Hamburg'
KEEP = re.compile(r'advent|oster|hoffest|erntefest|dorffest|fest\b|markt|kinder|famil|tierweihnacht|laterne|nikolaus|pfingst|schaf|pferd', re.I)
DROP = re.compile(r'arbeitskreis|spinnkreis|krink|strickkreis|mitgliederversammlung|ehrenamt', re.I)


def main():
    lat, lon = osm_coords('Museumsdorf Volksdorf')
    html = get(PAGE).text
    cells = re.findall(r'(?s)padding-bottom: 10px\s*">(\d\d)\.(\d\d)\.(\d{4})</div>.*?word-break: break-word;[^>]*>(.*?)</div>', html)
    offers = []
    for dd, mm, yy, cell in cells:
        head = clean((re.search(r'(?s)<b>(.*?)</b>', cell) or [0, ''])[1])
        teaser = clean(re.sub(r'(?s)<b>.*?</b>', ' ', cell, count=1))
        tm = re.match(r'(\d\d:\d\d)\s*bis\s*(\d\d:\d\d)\s*(.*)', head)
        title = tm.group(3) if tm else head
        if not title or DROP.search(title) or not (KEEP.search(title) or FAMILY.search(title + ' ' + teaser)):
            continue
        day = date(int(yy), int(mm), int(dd))
        href = re.search(r'href="([^"]+)"', cell)
        url = BASE + unescape(href.group(1)).split('#')[0] if href else PAGE
        time_from, time_to = (tm.group(1), tm.group(2)) if tm else (None, None)
        price, free = None, None
        if href and day >= date.today():
            text = clean(get(url).text)
            text = text[text.find(title):][:4000] if title in text else text
            m = re.search(r'(\d{1,2})(?::(\d\d))?\s*(?:bis|[-–])\s*(\d{1,2})(?::(\d\d))?\s*Uhr', text)
            if m and not time_from:
                time_from, time_to = f'{int(m.group(1)):02d}:{m.group(2) or "00"}', f'{int(m.group(3)):02d}:{m.group(4) or "00"}'
            e = re.search(r'Eintritt:?\s*([^.]{3,90}?(?:frei|Euro|€)[^.]{0,60})', text)
            if e:
                ent = e.group(1)
                adult = re.search(r'(\d+)(?:,-|,\d\d)?\s*(?:Euro|€)', ent)
                kids = re.search(r'Kinder bis (\d+) Jahre[^,.]*frei', ent)
                if adult and kids:
                    price = f'Kinder bis {kids.group(1)} frei, Erwachsene {adult.group(1)} €'
                elif adult:
                    price, free = f'{adult.group(1)} €', 0
                elif re.search(r'frei', ent):
                    price, free = 'kostenlos', 1
        offers.append(termin(f'{day}:{title.lower()}', title, day, url, PROVIDER, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                             time_from=time_from, time_to=time_to, price=price, free=free,
                             topic='feste' if re.search(r'advent|oster|fest|weihnacht|nikolaus|laterne|pfingst', title, re.I) else None))
    return finish(SOURCE_ID, 'Museumsdorf Volksdorf: Feste und Familientage', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
