"""Import family dates of Bürgerhaus Bornheide (Osdorfer Born) from its public calendar.

robots.txt only blocks wp-admin. The imprint limits copying outside copyright law, so only facts are stored; teaser
texts are read only to recognise family offers. Repeated dates are folded into a weekly group.
"""
import re
import sys
from datetime import date

from offers_util import FAMILY, age_of, clean, finish, fold_weekly, get, osm_coords, termin

SOURCE_ID = 'buergerhaus_bornheide'
BASE = 'https://buergerhaus-bornheide.de'
PAGE = BASE + '/kalender/'
PROVIDER = 'Bürgerhaus Bornheide'


def main():
    lat, lon = osm_coords('Bürgerhaus Bornheide')
    offers = []
    for block in re.split(r'class="termine-dynamik', get(PAGE).text)[1:]:
        href = re.search(r'href="([^"]+)"', block)
        d = re.search(r'termin-datum">(\d\d)\.(\d\d)\.(\d\d)<', block)
        tm = re.search(r'termin-uhrzeit">(\d{1,2}):(\d\d)', block)
        h5 = re.search(r'(?s)<h5>(.*?)</h5>(.*?)</div>', block)
        if not (href and d and h5):
            continue
        title, text = clean(h5.group(1)), clean(h5.group(2))
        if not FAMILY.search(f'{title} {text}') or re.search(r'rechtsberatung|sozialberatung', title, re.I):
            continue
        day = date(2000 + int(d.group(3)), int(d.group(2)), int(d.group(1)))
        offers.append(termin(f'{href.group(1).rstrip("/").rsplit("/", 1)[-1]}:{day}', title, day, href.group(1), PROVIDER, venue=PROVIDER, lat=lat, lon=lon,
                             time_from=f'{int(tm.group(1)):02d}:{tm.group(2)}' if tm else None, age=age_of(f'{title} {text}'), description=text[:150]))
    return finish(SOURCE_ID, 'Bürgerhaus Bornheide: Kinder und Familie', PAGE, PROVIDER, fold_weekly(offers, kind='gruppe', min_count=2))


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
