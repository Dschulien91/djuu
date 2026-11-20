"""Import children's and family performances of the Deutsches SchauSpielHaus Hamburg and the Junges SchauSpielHaus.

Sources: the monthly schedules https://junges.schauspielhaus.de/spielplan?schedule[0]=month:YYYY-MM and
https://schauspielhaus.de/spielplan?schedule[0]=month:YYYY-MM (both Drupal, server-rendered rows). A row is kept when the
theatre gives an age under 12 ('8+', 'Empfohlen ab 10 Jahren'). Rows marked 'Schulvorstellung', weekday
performances before 13:30 (school/Kita shows) and rows marked 'Ausverkauft' are left out.
Facts only: title, date, time, stage, age, link to the play page.

robots.txt: Drupal default, only /admin, /search, /user ... disallowed; the schedule is allowed.
Terms: imprint has no reuse clause found -> nothing to ask.
"""
import re
import sys
from datetime import date

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'schauspielhaus'
SITES = [  # base, provider, default venue, address, OSM names, fallback coordinates
    ('https://junges.schauspielhaus.de', 'Junges SchauSpielHaus Hamburg', 'Junges SchauSpielHaus, Wiesendamm', 'Wiesendamm 28, 22305 Hamburg',
     ('Junges SchauSpielHaus', 'Junges Schauspielhaus'), (None, None)),
    ('https://schauspielhaus.de', 'Deutsches SchauSpielHaus Hamburg', 'Deutsches SchauSpielHaus Hamburg', 'Kirchenallee 39, 20099 Hamburg',
     ('Deutsches Schauspielhaus', 'Deutsches SchauSpielHaus'), (53.5545, 10.0094)),
]
MONTHS_AHEAD = 7


def months():
    d = date.today().replace(day=1)
    for _ in range(MONTHS_AHEAD):
        yield d
        d = date(d.year + d.month // 12, d.month % 12 + 1, 1)


def main():
    offers = []
    for base, provider, venue, address, osm, fallback in SITES:
        lat, lon = osm_coords(*osm)
        if lat is None:
            lat, lon = fallback
        for month in months():
            html = get(f'{base}/spielplan?schedule%5B0%5D=month%3A{month:%Y-%m}').text
            for block in html.split('<li class="views-row">')[1:]:
                dm = re.search(r'data-taiko-date="(\d{1,2})/(\d{1,2})"', block)
                link = re.search(r'class="list-row-item__main-link" href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
                info = clean((re.search(r'(?s)class="list-row-item__main-info">(.*?)</div>', block) or [0, ''])[1])
                status = clean((re.search(r'(?s)class="list-row-item__status">(.*?)</span>', block) or [0, ''])[1])
                tm = re.search(r'(\d{1,2})\.(\d\d) Uhr', info)
                if not (dm and link and tm) or int(dm.group(2)) != month.month:
                    continue
                age = re.search(r'(?:/\s*(\d{1,2})\+|ab (\d{1,2}) Jahren)', info)
                if not age:
                    continue
                years = int(age.group(1) or age.group(2))
                if years >= 12 or re.search(r'schulvorstellung|kita', info, re.I) or re.search(r'ausverkauft|abgesagt', status + info, re.I):
                    continue
                day = date(month.year, month.month, int(dm.group(1)))
                time_from = f'{int(tm.group(1)):02d}:{tm.group(2)}'
                if day.weekday() < 5 and time_from < '13:30':  # school/Kita shows
                    continue
                parts = [clean(p) for p in info.split('/')]
                at = next((i for i, p in enumerate(parts) if re.search(r'\d Uhr$', p)), None)
                stage = parts[at + 1] if at is not None and at + 1 < len(parts) and not re.search(r'\d', parts[at + 1]) else None
                title = clean(link.group(2))
                url = link.group(1) if link.group(1).startswith('http') else base + link.group(1)
                offers.append(termin(f'{base.split("//")[1]}:{link.group(1)}:{day}:{time_from}', title, day, url, provider,
                                     venue=f'{provider.replace(" Hamburg", "")}, {stage}' if stage and stage not in provider else venue,
                                     address=address, lat=lat, lon=lon, time_from=time_from, age=(years * 12, None),
                                     registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'SchauSpielHaus Hamburg: Kinder- und Familienvorstellungen', SITES[0][0] + '/spielplan',
                  'Deutsches SchauSpielHaus Hamburg', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
