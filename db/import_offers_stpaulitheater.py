"""Import the children's shows (Weihnachtsstück, Kinder-Theaterkonzerte) of the St. Pauli Theater from its own site.

Source: the site's WordPress REST list of its events in the theatre's own event type 'Kinder'
(/wp-json/wp/v2/ajde_events?event_type=20); menu_order holds the first performance date, so only current plays are read.
Dates come from the play page ('Termin Samstag, 9. Januar 2027 Beginn: 11 und 15 Uhr') or, for long runs, from the
theatre's own date sheet linked there ('Alle Vorstellungstermine auf einen Blick', PDF). Weekday performances before
13:30 are school/Kita shows and are left out. Facts only: title, date, time, age, link to the play page.

robots.txt: '*' may read everything except /wp-admin/ and one secret path. Terms: imprint has no reuse clause found.
"""
import io
import re
import sys
from datetime import date, timedelta

from offers_util import MONTHS, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'st_pauli_theater'
BASE = 'https://www.st-pauli-theater.de'
LIST = BASE + '/wp-json/wp/v2/ajde_events?event_type=20&per_page=50&_fields=id,link,title,menu_order'
PROVIDER = 'St. Pauli Theater'
ADDRESS = 'Spielbudenplatz 29–30, 20359 Hamburg'
SHEET_ROW = re.compile(r'\b(Mo|Di|Mi|Do|Fr|Sa|So) (\d{1,2})\.(\d{1,2})\.\s+((?:\d{1,2}[.:]\d\d(?:\s*Uhr)?(?:\s*\([A-Z]+\))?\s*/?\s*)+)')
TEXT_DATE = re.compile(r'(\d{1,2})\.\s*(' + '|'.join(MONTHS) + r')\s+(\d{4}),?\s*(?:Beginn:?|um|,)?\s*((?:\d{1,2}(?:[.:]\d\d)?(?:\s*(?:und|,|/)\s*)?)+)\s*Uhr', re.I)


def sheet_dates(pdf_bytes, first):
    import pdfplumber  # installed in the server image (pypdf is not)
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = ' '.join(p.extract_text() or '' for p in pdf.pages)
    out = []
    for _, dd, mm, times in SHEET_ROW.findall(text):
        year = first.year + (1 if int(mm) < first.month - 6 else 0)
        for hh, mi in re.findall(r'(\d{1,2})[.:](\d\d)', times):
            out.append((date(year, int(mm), int(dd)), f'{int(hh):02d}:{mi}'))
    return out


def text_dates(text):
    out = []
    for dd, mon, yy, times in TEXT_DATE.findall(text):
        for t in re.findall(r'\d{1,2}(?:[.:]\d\d)?', times):
            hh, _, mi = t.replace(':', '.').partition('.')
            out.append((date(int(yy), MONTHS[mon.lower()], int(dd)), f'{int(hh):02d}:{mi or "00"}'))
    return out


def main():
    lat, lon = osm_coords('St. Pauli Theater', 'St. Pauli-Theater')
    if lat is None:
        lat, lon = 53.549101, 9.962988
    since = (date.today() - timedelta(days=90)).strftime('%Y%m%d')
    offers = []
    for e in get(LIST).json():
        if not (20000101 <= int(e.get('menu_order') or 0) <= 29991231) or str(e['menu_order']) < since:
            continue
        first = date(int(str(e['menu_order'])[:4]), int(str(e['menu_order'])[4:6]), int(str(e['menu_order'])[6:]))
        url = e['link']
        html = get(url).text
        title = clean(e['title']['rendered'])
        body = clean(html)
        sheet = re.search(r'href="([^"]+\.pdf)"[^>]*>\s*Alle Vorstellungstermine', html)
        dates = sheet_dates(get(sheet.group(1)).content, first) if sheet else text_dates(body)
        age = age_of(re.sub(r'(?i)ab (\d+) Jahre\b', r'ab \1 Jahren', body))
        for day, tm in sorted(set(dates)):
            if day.weekday() < 5 and tm < '13:30':  # school/Kita shows
                continue
            offers.append(termin(f'{e["id"]}:{day}:{tm}', title, day, url, PROVIDER, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                                 time_from=tm, age=age, registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'St. Pauli Theater: Kinderstücke', BASE + '/das-junge-st-pauli-theater/', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
