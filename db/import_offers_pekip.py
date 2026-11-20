"""Import PEKiP courses in Hamburg from the course search of PEKiP e.V. (https://pekip.de/kurse-finden).

The public search page is rendered on the server (Nuxt); its embedded __NUXT_DATA__ holds the result list, and
each course page (/kurse-finden/kurs/kurs-<id>) holds start date, start time, number of units, price, venue with
coordinates and the birth months of the babies. robots.txt: only /typo3 is disallowed; the pages read here are
the same public HTML pages a visitor opens (the JSON API is not called directly).
Kept: courses whose venue is in Hamburg. Course leaders' names, e-mails, phone numbers and profile texts are
never stored; a venue title that contains the leader's name is dropped.
Terms: impressum has no reuse clause.
"""
import json
import re
import sys
from datetime import date, timedelta

from offers_util import WEEKDAYS, clean, finish, get, group

SOURCE_ID = 'pekip'
BASE = 'https://pekip.de'
PROVIDER = 'PEKiP e.V. (Kursleitung)'
SEARCH = BASE + '/kurse-finden?query=Hamburg&range=50&page={}'
MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']


def devalue(arr):
    """Decode Nuxt's devalue payload (a flat list whose items reference each other by index)."""
    memo = {}

    def h(i):
        if not isinstance(i, int) or i < 0:
            return None
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in ('ShallowReactive', 'Reactive', 'Ref', 'ShallowRef'):
                r = h(v[1]) if len(v) > 1 else None
            elif v and isinstance(v[0], str) and v[0] in ('EmptyRef', 'EmptyShallowRef'):
                r = None
            elif v and v[0] == 'Date':
                r = v[1]
            elif v and v[0] == 'Set':
                r = [h(x) for x in v[1:]]
            else:
                r = []
                memo[i] = r
                r.extend(h(x) for x in v)
        elif isinstance(v, dict):
            r = {}
            memo[i] = r
            for k, x in v.items():
                r[k] = h(x)
        else:
            r = v
        memo[i] = r
        return r
    return h(0)


def nuxt(url):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', get(url).text, re.S)
    return devalue(json.loads(m.group(1))) if m else {}


def page_content(d, ctype):
    for key, page in (d.get('data') or {}).items():
        if key.startswith('t3:page') and isinstance(page, dict):
            for ce in (page.get('content') or {}).get('colPos0') or []:
                if ce and ce.get('type') == ctype:
                    return ce.get('content') or {}
    return {}


def search():
    links, page, last = {}, 1, 1
    while page <= min(last, 10):
        c = (nuxt(SEARCH.format(page)).get('data') or {}).get('courses') or {}
        last = ((c.get('pagination') or {}).get('lastPage')) or 1
        for r in c.get('results') or []:
            if r.get('type') != 'courses':
                continue
            loc = (r.get('data') or {}).get('location') or {}
            if (loc.get('city') or '').strip().lower() != 'hamburg':
                continue
            links[r['id']] = ((r.get('data') or {}).get('course') or {}).get('link')
        page += 1
    return links


def main():
    offers = []
    for cid, link in sorted(search().items()):
        if not link:
            continue
        url = BASE + link
        c = page_content(nuxt(url), 'course_search_detail')
        course, prof = c.get('course') or {}, c.get('profile') or {}
        loc = course.get('location') or {}
        if not course.get('startDate') or (loc.get('city') or '').strip().lower() != 'hamburg':
            continue
        start = date.fromisoformat(course['startDate'])
        units = course.get('units') or None
        end = start + timedelta(weeks=units - 1) if units and units > 1 else None
        # child age at the first session from the birth window
        age = (None, None)
        if course.get('born_from') and course.get('born_to'):
            bf, bt = date.fromisoformat(course['born_from']), date.fromisoformat(course['born_to'])
            lo = max(0, (start.year - bt.year) * 12 + start.month - bt.month)
            hi = (start.year - bf.year) * 12 + start.month - bf.month + 1
            age = (lo, max(hi, lo + 1))
            if (bf.year, bf.month) == (bt.year, bt.month):
                born = f'{MONTHS[bt.month - 1]} {bt.year}'
            elif bf.year == bt.year:
                born = f'{MONTHS[bf.month - 1]}–{MONTHS[bt.month - 1]} {bt.year}'
            else:
                born = f'{MONTHS[bf.month - 1]} {bf.year}–{MONTHS[bt.month - 1]} {bt.year}'
            title = f'PEKiP-Kurs (Babys geb. {born})'
        else:
            title = 'PEKiP-Kurs'
        names = [n for n in (prof.get('firstName'), prof.get('lastName')) if n and len(n) > 2]
        venue = clean(loc.get('title'))
        if not venue or any(n.lower() in venue.lower() for n in names) or re.fullmatch(r'[\d\s]+', venue):
            venue = 'PEKiP-Gruppe'
        street, zip_ = clean(loc.get('street')), clean(loc.get('zip'))
        address = ', '.join(x for x in [street, f'{zip_} Hamburg' if zip_ else 'Hamburg'] if x)
        cost = course.get('costs')
        price, free = (f'{cost:g} €'.replace('.', ','), 0) if isinstance(cost, (int, float)) and cost > 0 else (None, None)
        tf = course.get('startTime') or None
        wd = start.weekday()
        schedule = f'{WEEKDAYS[wd]} {tf or ""}, ab {start:%d.%m.}' + (f', {units} Termine' if units else '')
        offers.append(group(cid, title, url, PROVIDER, kind='kurs', weekday=wd, schedule=schedule.replace('  ', ' '), venue=venue,
                            address=address, lat=loc.get('latitude'), lon=loc.get('longitude'), time_from=tf, price=price, free=free,
                            age=age, start=start, end=end, sessions=units, registration='nötig', topic='pekip'))
    return finish(SOURCE_ID, 'PEKiP e.V.: PEKiP-Kurse in Hamburg', BASE + '/kurse-finden', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
