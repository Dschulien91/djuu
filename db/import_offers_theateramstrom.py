"""Import public children's performances of Theater am Strom from the schedule on its children's productions page.

robots.txt has no rules against the page. The imprint limits copying outside copyright law, so only facts are stored:
title, date, time, venue, age. Performances reserved for school classes are dropped.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, termin

SOURCE_ID = 'theater_am_strom'
BASE = 'https://www.theateramstrom.de'
PAGE = BASE + '/produktionen/kinder/'
PROVIDER = 'Theater am Strom'


def main():
    offers = []
    for block in re.split(r'class="productions-schedule--teaser"', get(PAGE).text)[1:]:
        teaser = clean(block[:200].split('</p>')[0].lstrip('>'))
        title = clean((re.search(r'(?s)productions-schedule--title">(.*?)</h4>', block) or [0, ''])[1])
        if not title:
            continue
        for dd, mm, yy, tm, where in re.findall(r'(\d\d)\.(\d\d)\.(\d{4})\s+(\d\d:\d\d)\s*Uhr\s*(.{0,120})', clean(block)):
            if re.search(r'schulklassen', where, re.I):
                continue
            day = date(int(yy), int(mm), int(dd))
            venue = re.split(r'\s+(?:Gruppen|Nach|Für|Eintritt|\d\d\.\d\d\.)', where)[0].strip()
            address = venue if re.search(r'\d{5} Hamburg', venue) else None
            offers.append(termin(f'{title[:40]}:{day}:{tm}', title, day, PAGE, PROVIDER, venue=venue.split(',')[0] if venue else PROVIDER, address=address, time_from=tm,
                                 age=age_of(re.sub(r'\bab (\d+)\s*$', r'ab \1 Jahren', teaser)), topic='theater'))
    return finish(SOURCE_ID, 'Theater am Strom: Kindertheater', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
