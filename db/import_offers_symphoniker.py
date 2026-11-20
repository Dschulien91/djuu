"""Import the children's concerts of the Symphoniker Hamburg (Hasi-Konzerte, Kinderkonzerte) from the orchestra's own site.

Source: https://www.symphonikerhamburg.de/konzerte - the season list, where every concert carries the orchestra's own
category classes; kept are concerts in 'Konzerte für Kinder' (category_102). Each item lists all its dates, the hall and
the age ('für 3–6 Jährige'). Weekday performances before 13:30 (school concerts) are left out.
Facts only: title, date, time, hall, age, link to the orchestra's concert page. The concerts take place in the
Laeiszhalle, but nothing is read from the Elbphilharmonie/Laeiszhalle website.

robots.txt: none (404), nothing disallowed.
Terms: imprint says 'Die Vervielfältigung von Daten und Informationen ... bedarf der vorherigen Zustimmung des Symphoniker
Hamburg e.V.' -> only facts are kept; Julian asks.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'symphoniker_hamburg'
BASE = 'https://www.symphonikerhamburg.de'
PAGE = BASE + '/konzerte'
PROVIDER = 'Symphoniker Hamburg'
HALLS = {'Laeiszhalle': ('Johannes-Brahms-Platz, 20355 Hamburg', ('Laeiszhalle',))}


def main():
    html = get(PAGE).text
    offers = []
    for m in re.finditer(r'<div class="magazine-item ([^"]*)">(.*?)(?=<div class="magazine-item |\Z)', html, re.S):
        if 'category_102' not in m.group(1).split():
            continue
        block = m.group(2)
        title = clean((re.search(r'(?s)<h2>(.*?)</h2>', block) or [0, ''])[1])
        kind = clean((re.search(r'(?s)class="kTyp">(.*?)</p>', block) or [0, ''])[1])
        sub = clean((re.search(r'(?s)class="rte">(.*?)</div>', block) or [0, ''])[1])
        hall = clean((re.search(r'(?s)class="kOrt">(.*?)</p>', block) or [0, ''])[1])
        href = re.search(r'href="(/konzerte/[^"]+)"', block)
        if not (title and href):
            continue
        name = kind if kind and title.lower() in kind.lower() else (f'{title}: {kind}' if kind and kind != title else title)
        age = age_of(re.sub(r'(?i)j(ä|ae)hrige', 'Jahre', sub))
        addr, osm = next((v for k, v in HALLS.items() if k in hall), (None, ()))
        lat, lon = osm_coords(*osm) if osm else (None, None)
        for dd, mm, yy, hh, mi in re.findall(r'(\d{1,2})\.(\d{1,2})\.(\d{4})\s*<span class="hour">(\d{1,2}):(\d\d) Uhr', block):
            day, tm = date(int(yy), int(mm), int(dd)), f'{int(hh):02d}:{mi}'
            if day.weekday() < 5 and tm < '13:30':  # school concerts
                continue
            offers.append(termin(f'{href.group(1).rsplit("-", 1)[-1]}:{day}:{tm}', name, day, BASE + href.group(1), PROVIDER,
                                 venue=hall or PROVIDER, address=addr, lat=lat, lon=lon, time_from=tm, age=age,
                                 registration='Tickets', topic='musik'))
    return finish(SOURCE_ID, 'Symphoniker Hamburg: Konzerte für Kinder', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
