"""Import weekly children's courses and family dates of LOLA Kulturzentrum Lohbrügge from its public pages.

robots.txt only blocks wp-admin. The imprint limits copying outside copyright law, so only facts are stored; descriptions
and contact names are read only to recognise family offers and are never stored.

/kurse-workshops/ lists courses as posts with a day-and-time label ('Di. 16:15'), /programm/ lists dated events.
"""
import re
import sys
from datetime import date

from offers_util import FAMILY, WEEKDAYS, age_of, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'lola_lohbruegge'
BASE = 'https://lola-hh.de'
PROVIDER = 'LOLA Kulturzentrum Lohbrügge'
DAY = {d: i for i, d in enumerate(WEEKDAYS)}


def blocks(html):
    for block in re.split(r'class="col-sm-12 post ', html)[1:]:
        title = clean((re.search(r'(?s)<h2>(.*?)</h2>', block) or [0, ''])[1])
        sub = clean((re.search(r'(?s)<h3>(.*?)</h3>', block) or [0, ''])[1])
        desc = clean((re.search(r'(?s)post-description">(.*?)</div>', block) or [0, ''])[1])
        slug = (re.search(r'data-post-hash="#([^"]+)"', block) or [0, ''])[1]
        yield block, title, sub, desc, slug


def main():
    lat, lon = osm_coords('LOLA', 'Lola Kulturzentrum', 'Kulturzentrum Lola')
    offers = []
    page = BASE + '/programm/'
    for block, title, sub, desc, slug in blocks(get(page).text):
        if not title or not FAMILY.search(f'{title} {sub}'):
            continue
        for dd, mm, yy in re.findall(r'post-next-events-date">(\d\d)\.(\d\d)\.(\d{4})<', block):
            day = date(int(yy), int(mm), int(dd))
            offers.append(termin(f'{slug or title[:40]}:{day}', f'{title} – {sub}' if sub else title, day, f'{page}#{slug}', PROVIDER,
                                 venue=PROVIDER, lat=lat, lon=lon, age=age_of(f'{title} {sub}')))
    page = BASE + '/kurse-workshops/'
    for block, title, sub, desc, slug in blocks(get(page).text):
        if not title or not FAMILY.search(f'{title} {sub}'):
            continue
        when = re.search(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s*(\d{1,2})[:.](\d\d)', clean(block.split('post-description')[0]))
        wd = DAY[when.group(1)] if when else None
        tf = f'{int(when.group(2)):02d}:{when.group(3)}' if when else None
        offers.append(group(slug or title[:40], title, f'{page}#{slug}', PROVIDER, kind='gruppe', weekday=wd, time_from=tf, venue=PROVIDER, lat=lat, lon=lon,
                            schedule=f'{WEEKDAYS[wd]} {tf}, wöchentlich' if when else None, age=age_of(f'{title} {sub} {desc}'), description=sub))
    return finish(SOURCE_ID, 'LOLA Lohbrügge: Kinder und Familie', BASE + '/kurse-workshops/', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
