"""Import children's and family events of Kulturmix in Langenhorn e.V. (LaLi Kulturhaus, Tangstedter Landstraße 182a).

Source: https://www.kulturmix-in-langenhorn.de/veranstaltungskalender/ ('Kommende Termine', a Jimdo page). The list looks
script-driven, but rendering it in a browser loads no JSON and shows the same list that is already in the page source, so
plain get() is used: per entry the date ('Samstag, 24.10.2026'), the time ('19:00 Uhr'), the place ('Ort: LaLi Kulturhaus'),
the title (bold line) and the 'Weitere Infos' link. Kept: entries whose title or short text names children or families
(Kindertheater, Kinderkino, Familien ..., FAMILY keywords). When no such entry is listed, finish() reports 'no current offers'.
The entries of import_offers_flohmaerkte's 'kulturmix_langenhorn' candidate (tribe/iCal probe) find nothing on this Jimdo site,
so there is no overlap. Börner Speeldeel's Christmas play at the LaLi is a hand entry in data/redaktion/termine.json (other
organiser, LaLi cinema hall) and is not on this calendar.
robots.txt: '*' may read everything except /app/ and /j/; Crawl-Delay 5 is honoured by get().
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import FAMILY, age_of, clean, finish, get, price_of, termin

SOURCE_ID = 'kulturmix_langenhorn'
BASE = 'https://www.kulturmix-in-langenhorn.de'
PAGE = BASE + '/veranstaltungskalender/'
PROVIDER = 'Kulturmix in Langenhorn e.V.'
VENUE, ADDRESS, LAT, LON = 'LaLi Kulturhaus', 'Tangstedter Landstraße 182a, 22415 Hamburg', 53.658379, 10.020698  # as in termine.json (LaLi)
NOT_KIDS = re.compile(r'open stage|jamsession|ab 1[4-8]|erwachsene|lesung für erwachsene', re.I)


def main():
    html = get(PAGE).text
    html = html[html.find('Kommende Termine'):]
    parts = re.split(r'<strong>\s*(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*(\d\d)\.(\d\d)\.(\d{4})\s*</strong>', html)
    offers = []
    for i in range(1, len(parts) - 3, 4):
        d, m, y, chunk = parts[i], parts[i + 1], parts[i + 2], parts[i + 3]
        day = date(int(y), int(m), int(d))
        text = clean(chunk)
        t = re.search(r'(\d{1,2})[:.](\d\d)\s*Uhr', text)
        title = re.search(r'(?s)<b>(.*?)</b>', chunk)
        title = clean(title.group(1)) if title else ''
        place = re.search(r'Ort:\s*([^<]+)', chunk)
        link = re.search(r'href="(/veranstaltungen/[^"]+)"', chunk)
        blurb = clean(re.sub(r'(?s)^.*?</b>', '', chunk))[:400]
        if not title or not FAMILY.search(f'{title} {blurb}') or NOT_KIDS.search(title):
            continue
        place = clean(place.group(1)) if place else VENUE
        at_lali = 'lali' in place.lower()
        price, free = price_of((re.search(r'(?:Eintritt|Preis)[^.]{0,40}?(\d+(?:,\d\d)?\s*(?:€|Euro)|frei|kostenlos)', text) or [None, None])[1] or '')
        offers.append(termin(f'{day}:{title[:40]}', title, day, urljoin(BASE, link.group(1)) if link else PAGE, PROVIDER,
                             venue=VENUE if at_lali else place, address=ADDRESS if at_lali else None,
                             lat=LAT if at_lali else None, lon=LON if at_lali else None,
                             time_from=f'{int(t.group(1)):02d}:{t.group(2)}' if t else None, price=price, free=free,
                             age=age_of(f'{title} {blurb}'), description=blurb[:200]))
    return finish(SOURCE_ID, 'Kulturmix Langenhorn: Kinder- und Familienveranstaltungen im LaLi', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
