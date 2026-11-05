"""Import children's courses and family events of BraKuLa (Bramfelder Kulturladen) from its public programme page.

robots.txt has no rules for the programme, imprint has no reuse restriction. Keeps entries of the genre
'Kinder und Jugendliche' and entries naming children or families. Repeated dates are folded into one course.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import FAMILY, age_of, clean, finish, fold_weekly, get, osm_coords, termin

SOURCE_ID = 'brakula'
BASE = 'https://www.brakula.de'
PROVIDER = 'BraKuLa Bramfelder Kulturladen'
ADDRESS = 'Bramfelder Chaussee 265, 22177 Hamburg'


def main():
    lat, lon = osm_coords('BraKuLa', 'Brakula', 'Bramfelder Kulturladen')
    offers = []
    for block in re.split(r'row card teaser va', get(BASE + '/programm').text)[1:]:
        title = clean((re.search(r'(?s)class="title">(.*?)</p>', block) or [0, ''])[1])
        genre = clean((re.search(r'(?s)class="genre">(.*?)</p>', block) or [0, ''])[1])
        body = clean((re.search(r'(?s)class="genre">.*?</p>(.*?)</div>', block) or [0, ''])[1])
        d = re.search(r'(\d\d)\.(\d\d)\.(\d{4})', block)
        tm = re.search(r'(\d\d:\d\d) Uhr', block)
        href = re.search(r'href="(/programm/[^"]+)"', block)
        if not (title and d and href):
            continue
        if not (re.search(r'kinder|famil', genre, re.I) or FAMILY.search(title)):
            continue
        day = date(int(d.group(3)), int(d.group(2)), int(d.group(1)))
        slug = href.group(1).strip('/').split('/')[1]
        offers.append(termin(f'{slug}:{day}', title, day, urljoin(BASE, href.group(1)), PROVIDER, venue=PROVIDER, address=ADDRESS, lat=lat, lon=lon,
                             time_from=tm.group(1) if tm else None, age=age_of(f'{title} {body}'), registration='nötig' if genre.startswith('Kurse') else None,
                             description=body[:150]))
    return finish(SOURCE_ID, 'BraKuLa: Kinder und Familie', BASE + '/programm', PROVIDER, fold_weekly(offers))


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
