"""Import family events of the Archäologisches Museum Hamburg (Harburg) from its events calendar API.

robots.txt has no rules. The imprint only limits copying pages outside copyright law, so only facts are stored
(title, date, time, age, price, link). Lectures and adult tours are dropped by a family keyword filter.
"""
import re
import sys

from offers_util import FAMILY, age_of, finish, osm_coords, price_of, read_tribe, termin

SOURCE_ID = 'amh_museum'
BASE = 'https://amh.de'
PROVIDER = 'Archäologisches Museum Hamburg'
EXTRA = re.compile(r'zeitreise|bastel|kreativ-w|familien-|escape-tour|werkstatt', re.I)


def main():
    lat0, lon0 = osm_coords('Archäologisches Museum Hamburg', 'Helms-Museum')
    offers = []
    for e in read_tribe(BASE):
        if not (FAMILY.search(e['title'] + ' ' + e['text']) or EXTRA.search(e['title'])) or re.match(r'vortrag', e['title'], re.I):
            continue
        price, free = price_of(e['cost'])
        day = e['start'].date()
        offers.append(termin(f'{e["id"]}:{day}', e['title'], day, e['url'], PROVIDER, venue=e['venue'], address=e['address'],
                             lat=e['lat'] or lat0, lon=e['lon'] or lon0, time_from=None if e['allday'] else e['start'].strftime('%H:%M'),
                             time_to=e['end'].strftime('%H:%M') if e['end'] and e['end'].date() == day and not e['allday'] else None,
                             price=price, free=free, age=age_of(e['title'] + ' ' + e['text']), description=e['text'][:200]))
    return finish(SOURCE_ID, 'Archäologisches Museum Hamburg: Familienprogramm', BASE + '/programm/veranstaltungskalender/', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
