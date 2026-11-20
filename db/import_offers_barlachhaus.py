"""Import children's and family dates of the Ernst Barlach Haus (Jenischpark) from its public event calendar.

Source: https://www.barlach-haus.de/programm/veranstaltungskalender/ (one page, accordion entries with category,
title, subtitle, short line, date). Kept: entries whose category/title/short line names children or families
(Kinderführung 'Nachts im Museum', Familienfest ...). Price and registration from the entry text; text not stored.
robots.txt: 'Disallow:' (empty).
"""
import re
import sys
from datetime import date

from offers_util import FAMILY, MONTHS, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'barlachhaus'
BASE = 'https://www.barlach-haus.de'
PAGE = BASE + '/programm/veranstaltungskalender/'
PROVIDER = 'Ernst Barlach Haus'
ADDRESS = 'Baron-Voght-Straße 50a, 22609 Hamburg'


def div(block, cls):
    return clean((re.search(rf'(?s)class="event__{cls}"[^>]*>(.*?)</div>', block) or [0, ''])[1])


def main():
    lat, lon = osm_coords('Ernst Barlach Haus')
    html = get(PAGE).text
    today = date.today()
    offers = []
    for li in re.split(r'<li id="vaid-', html)[1:]:
        cat, title, sub, short = div(li, 'category'), div(li, 'title'), div(li, 'subtitle'), div(li, 'description')
        text = clean((re.search(r'(?s)class="event__text[^"]*">(.*?)</div>', li) or [0, ''])[1])
        if not title or not FAMILY.search(f'{cat} {title} {sub} {short}') or re.search(r'ausverkauft|abgesagt', f'{title} {sub}', re.I):
            continue
        d = re.search(r'(?s)event__day">(\d{1,2})</span><br>\s*(\w+)<br>\s*(?:(\d{1,2})(?:[.:](\d\d))?\s*(?:[–-]\s*(\d{1,2})(?:[.:](\d\d))?)?\s*Uhr)?', li)
        href = re.search(r'href="(/veranstaltung/[^"]+)"', li)
        if not (d and href) or d.group(2).lower() not in MONTHS:
            continue
        month = MONTHS[d.group(2).lower()]
        year = today.year + (1 if month < today.month - 1 else 0)
        day = date(year, month, int(d.group(1)))
        price, free = None, None
        p = re.search(r'(\d+)\s*Euro', text)
        if p:
            price, free = f'{p.group(1)} €', 0
        elif re.search(r'kostenlos|kostenfrei', f'{short} {text}', re.I):
            price, free = 'kostenlos (zzgl. Museumseintritt)', None
        reg = 'nötig' if re.search(r'voranmeldung|anmeldung (unter|erforderlich|nötig)', text, re.I) else ('offen' if re.search(r'ohne anmeldung', text, re.I) else None)
        full = f'{title}: {sub}' if sub and len(sub) <= 50 else title
        offers.append(termin(f'{href.group(1).strip("/").rsplit("/", 1)[-1]}:{day}', full, day, BASE + href.group(1), PROVIDER, venue=PROVIDER,
                             address=ADDRESS, lat=lat, lon=lon,
                             time_from=f'{int(d.group(3)):02d}:{d.group(4) or "00"}' if d.group(3) else None,
                             time_to=f'{int(d.group(5)):02d}:{d.group(6) or "00"}' if d.group(5) else None,
                             price=price, free=free, age=age_of(f'{short} {text}'.replace('Kinder von', 'Kinder')), registration=reg,
                             description=cat or None))
    return finish(SOURCE_ID, 'Ernst Barlach Haus: Kinder und Familien', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
