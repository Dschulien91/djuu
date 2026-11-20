"""Import children's dates of the Bergedorfer Museumslandschaft (Bergedorfer Schloss, Rieck Haus) from its programme page.

Source: https://www.bergedorfer-museumslandschaft.de/programm (one page; each entry carries data-location,
data-category and data-month). Kept: category 'kinder' (holiday programmes), 'erdbeerfest' (family fair at the
Rieck Haus) and entries whose title names children or families. In late autumn the list often has no such
entry; finish() then keeps the previous data.
robots.txt: 'Disallow:' (empty).
"""
import re
import sys
from datetime import date

from offers_util import FAMILY, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'bergedorfmuseum'
BASE = 'https://www.bergedorfer-museumslandschaft.de'
PAGE = BASE + '/programm'
PROVIDER = 'Bergedorfer Museumslandschaft'
PLACES = {
    'schloss': ('Bergedorfer Schloss', 'Bergedorfer Schloßstraße 4, 21029 Hamburg', ['Bergedorfer Schloss', 'Schloss Bergedorf']),
    'rieck': ('Rieck Haus', 'Curslacker Deich 284, 21039 Hamburg', ['Rieck Haus', 'Rieck-Haus']),
}


def main():
    html = get(PAGE).text
    offers, coords = [], {}
    for loc, cat, block in re.findall(r'(?s)<div class="event"\s*data-location="([^"]*)"\s*data-category="([^"]*)"\s*data-month="\d+">(.*?)</a>', html):
        title = clean((re.search(r'(?s)event-title">(.*?)</h2>', block) or [0, ''])[1])
        sub = clean((re.search(r'(?s)event-subtitle">(.*?)</p>', block) or [0, ''])[1])
        if not (re.search(r'kinder|erdbeerfest', cat) or FAMILY.search(f'{title} {sub}')):
            continue
        href = re.search(r'href="([^"]+)"', block).group(1)
        when = clean((re.search(r'(?s)event-date">(.*?)</div>', block) or [0, ''])[1])
        ds = re.findall(r'(\d\d)\.(\d\d)\.(\d{4})', when)
        if not ds:
            continue
        day = date(int(ds[0][2]), int(ds[0][1]), int(ds[0][0]))
        end = date(int(ds[-1][2]), int(ds[-1][1]), int(ds[-1][0])) if len(ds) > 1 else None
        tm = re.search(r'(\d\d:\d\d)\s*-\s*(\d\d:\d\d)', when)
        venue, address, names = PLACES.get(loc, (PROVIDER, None, []))
        if loc not in coords:
            coords[loc] = osm_coords(*names) if names else (None, None)
        lat, lon = coords[loc]
        offers.append(termin(href.strip('/').split('/')[2] + f':{day}', f'{title}: {sub}' if sub and len(sub) <= 50 else title, day, BASE + href,
                             PROVIDER, venue=venue, address=address, lat=lat, lon=lon, end=end,
                             time_from=tm.group(1) if tm else None, time_to=tm.group(2) if tm else None,
                             age=age_of(f'{title} {sub}'), topic='feste' if 'erdbeerfest' in cat else None))
    return finish(SOURCE_ID, 'Bergedorfer Museumslandschaft: Kinder und Familien', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
