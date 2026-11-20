"""Import the children's and family plays of the four Hamburg houses of the Stäitsch theatre group from their own sites:
Altonaer Theater, Hamburger Kammerspiele, Harburger Theater and LichtwarkTheater Bergedorf (theater-bergedorf.de).

Sources: each site's event sitemap (/event-sitemap.xml, WordPress) lists the play pages (/programm/<slug>/); only pages
changed in the last months are read. A play is kept when its page names children or families as audience ('Für Kinder
ab 5 Jahren', 'Kinderstück', 'für die ganze Familie' ...). Dates come from the play page's own date list (it can include school dates);
the separate Kita/school pages ('kita-und-schulvorstellungen', 'schulvorstellungen-...') are
skipped, and weekday performances before 13:30 (school/Kita shows) are left out. Facts only: title, date, time, age, link.

robots.txt (all four): only /wp-admin/ disallowed.
Terms: all four imprints say 'Jegliche kommerzielle Verwendung und/oder Weiterverarbeitung der Abbildungen aus dieser
Website sowie der Texte selbst ist untersagt' -> no texts or images are kept, only facts; Julian asks.
"""
import re
import sys
from datetime import date, timedelta

import requests

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'staeitsch_theater'
HOUSES = [  # base, provider, address, OSM names, fallback coordinates (from the redaktion entries)
    ('https://www.altonaer-theater.de', 'Altonaer Theater', 'Museumstraße 17, 22765 Hamburg', ('Altonaer Theater',), (53.548459, 9.934332)),
    ('https://hamburger-kammerspiele.de', 'Hamburger Kammerspiele', 'Hartungstraße 9-11, 20146 Hamburg', ('Hamburger Kammerspiele',), (53.5699, 9.9899)),
    ('https://www.harburger-theater.de', 'Harburger Theater', 'Museumsplatz 2, 21073 Hamburg', ('Harburger Theater',), (53.459014, 9.977045)),
    ('https://www.theater-bergedorf.de', 'LichtwarkTheater Bergedorf', 'Holzhude 1, 21029 Hamburg', ('LichtwarkTheater', 'Lichtwarkhaus', 'Haus im Park'), (None, None)),
]
FAMILY_PAGE = re.compile(r'f(ü|ue)r (kinder|die ganze familie|familien|groß und klein)|kinderstück|familienstück|weihnachtsmärchen|'
                         r'(empfohlen|geeignet) (für kinder )?ab \d{1,2} jahren|\bab \d{1,2} jahren\b', re.I)
SCHOOL_SLUG = re.compile(r'schul|kita', re.I)
DATE = re.compile(r'\b(mo|di|mi|do|fr|sa|so),?\s+(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?\s+(\d{1,2}):(\d\d)', re.I)


def recent_pages(base, months=5):
    xml = get(base + '/event-sitemap.xml').text
    cutoff = (date.today() - timedelta(days=30 * months)).isoformat()
    rows = re.findall(r'<loc>(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?</loc>\s*<lastmod>(?:<!\[CDATA\[)?(\d{4}-\d\d-\d\d)', xml)
    return [u for u, mod in rows if mod >= cutoff and '/programm/' in u and not SCHOOL_SLUG.search(u.rstrip('/').rsplit('/', 1)[-1])]


def performances(text):
    """Dates of the page's own date list: 'sa, 28.11.26 15:00', 'so 29.11.2026 14:00', 'So 29.11. 14:00' (year implied)."""
    today = date.today()
    out = set()
    for _, dd, mm, yy, hh, mi in DATE.findall(text):
        if yy:
            y = int(yy) + (2000 if len(yy) == 2 else 0)
        else:  # no year: the next such date from today on
            y = today.year if (int(mm), int(dd)) >= (today.month, today.day) else today.year + 1
        try:
            out.add((date(y, int(mm), int(dd)), f'{int(hh):02d}:{mi}'))
        except ValueError:
            continue
    return sorted(out)


def main():
    offers, kept = [], []
    for base, provider, address, osm, fallback in HOUSES:
        lat, lon = osm_coords(*osm)
        if lat is None:
            lat, lon = fallback
        try:
            pages = recent_pages(base)
        except (requests.RequestException, PermissionError, RuntimeError) as e:
            print(f'  {provider}: no sitemap ({e})')
            continue
        for url in pages:
            try:
                html = get(url).text
            except (requests.RequestException, PermissionError, RuntimeError) as e:
                print(f'  skip {url}: {e}')
                continue
            m = re.search(r'(?s)<title>(.*?)</title>', html)
            title = clean(m.group(1)).split(' - ')[0] if m else url.rstrip('/').rsplit('/', 1)[-1]
            body = clean(re.sub(r'(?s)<(header|nav|footer)\b.*?</\1>', ' ', html))
            if not FAMILY_PAGE.search(body):
                continue
            age = age_of(body)
            if age[0] is not None and age[0] >= 14 * 12:
                continue
            dates = performances(body)
            if not dates:
                continue
            kept.append((provider, title, age, len(dates), url))
            slug = url.rstrip('/').rsplit('/', 1)[-1]
            for day, tm in dates:
                if day.weekday() < 5 and tm < '13:30':  # weekday mornings are Kita/school shows
                    continue
                offers.append(termin(f'{provider}:{slug}:{day}:{tm}', title, day, url, provider, venue=provider, address=address,
                                     lat=lat, lon=lon, time_from=tm, age=age, registration='Tickets', topic='theater'))
    for k in kept:
        print(' play:', *k)
    return finish(SOURCE_ID, 'Altonaer Theater, Hamburger Kammerspiele, Harburger Theater, LichtwarkTheater: Kinder- und Familienstücke',
                  HOUSES[0][0], 'Altonaer Theater / Hamburger Kammerspiele / Harburger Theater / LichtwarkTheater', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
