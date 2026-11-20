"""Import the Hamburg performances of the Kammerpuppenspiele (puppet theatre for children) at the Theater am Wandsbeker Markt.

Source: the company's own Hamburg page kammerpuppenspiele.de/hamburg/ ('Spielplan Hamburg – November 2026' ...). Each play
block has the title, the age ('ab 3 Jahre') and three columns: weekdays, dates (dd.mm.yyyy) and times
('11:00 + 14:00 Uhr', '16:30 Uhr*' = Familientag, '16:30 Uhr – entfällt!'). Cancelled times are left out.
Facts only: play, date, time, age, link to the Hamburg page.

robots.txt: '*' may read everything except /wp-admin/.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'kammerpuppenspiele'
PAGE = 'https://kammerpuppenspiele.de/hamburg/'
PROVIDER = 'Kammerpuppenspiele (Figurentheater)'
VENUE = 'Theater am Wandsbeker Markt'
ADDRESS = 'Schloßstraße 78, 22041 Hamburg'


def main():
    html = get(PAGE).text
    body = html[html.find('Spielplan Hamburg'):] if 'Spielplan Hamburg' in html else html
    addr = re.search(r'Theater am Wandsbeker Markt\s*[–-]\s*([^<–-]+?)\s*[–-]\s*(\d{5}) Hamburg', clean(body))
    address = f'{addr.group(1).strip()}, {addr.group(2)} Hamburg' if addr else ADDRESS
    lat, lon = osm_coords('Theater am Wandsbeker Markt', 'Theatersaal Wandsbeker Marktplatz')
    offers = []
    for block in re.split(r'(?=<p[^>]*>\s*<strong>)', body):  # one segment per play title (the <hr> lines are not reliable)
        title = clean((re.search(r'(?s)<p[^>]*>\s*<strong>(.*?)</strong>\s*</p>', block) or [0, ''])[1])
        paras = [clean(p) for p in re.findall(r'(?s)<p[^>]*>(.*?)</p>', block)]
        dates = [p for p in paras if re.fullmatch(r'\d{1,2}\.\d{1,2}\.\d{4}', p)]
        if not (title and dates):
            continue
        age = age_of(' '.join(p for p in paras if re.search(r'\bab \d', p)))
        first = paras.index(dates[0])
        times = [p for p in paras[first + len(dates):] if 'Uhr' in p][:len(dates)]
        for d, t in zip(dates, times):
            if re.search(r'entf[äa]llt|abgesagt|ausverkauft', t, re.I):
                continue
            dd, mm, yy = (int(x) for x in d.split('.'))
            day = date(yy, mm, dd)
            for hh, mi in re.findall(r'(\d{1,2}):(\d\d)', t):
                tm = f'{int(hh):02d}:{mi}'
                offers.append(termin(f'{day}T{tm}', title, day, PAGE, PROVIDER, venue=VENUE, address=address,
                                     lat=lat or 53.571962, lon=lon or 10.07247, time_from=tm, age=age, registration='Tickets',
                                     topic='theater', description='Familientag' if '*' in t else None))
    return finish(SOURCE_ID, 'Kammerpuppenspiele: Spielplan Hamburg', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
