"""Import family dates of the Deichtorhallen Hamburg from the public calendar page.

No robots.txt on the site, imprint has no reuse restriction. The calendar is one page with all dates; dates are
kept when title or tags name families or children. Only facts are stored, with the link to the detail page.
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from offers_util import FAMILY, age_of, clean, finish, get, termin

SOURCE_ID = 'deichtorhallen'
BASE = 'https://www.deichtorhallen.de'
PAGE = BASE + '/de/kalender/'
PROVIDER = 'Deichtorhallen Hamburg'
ADDRESSES = {'halle für aktuelle kunst': 'Deichtorstraße 1-2, 20095 Hamburg', 'phoxxi': 'Deichtorstraße 1-2, 20095 Hamburg',
             'sammlung falckenberg': 'Wilstorfer Straße 71, 21073 Hamburg'}


def main():
    html = get(PAGE).text
    offers = []
    for tags, org, block in re.findall(r'(?s)<li data-org-date="([^"]*)"\s+data-tags="([^"]*)">(.*?)</li>', html) and \
            [(m.group(2), m.group(1), m.group(3)) for m in re.finditer(r'(?s)<li data-org-date="([^"]*)"\s+data-tags="([^"]*)">(.*?)</li>', html)]:
        title = clean((re.search(r'(?s)lead title">(.*?)</p>', block) or [0, ''])[1])
        sub = clean((re.search(r'(?s)lead subline">(.*?)</p>', block) or [0, ''])[1])
        if not (FAMILY.search(f'{title} {sub} {tags}') or re.search(r'famil|kinder', tags, re.I)):
            continue
        d = re.match(r'(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)', org)
        if not d:
            continue
        day = date(int(d.group(1)), int(d.group(2)), int(d.group(3)))
        dateline = clean((re.search(r'(?s)lead date">(.*?)</p>', block) or [0, ''])[1])
        times = re.search(r'(\d{1,2})(?::(\d\d))?\s*[–-]\s*(\d{1,2})(?::(\d\d))?\s*Uhr', dateline)
        loc = clean((re.search(r'(?s)class="location">(.*?)</p>', block) or [0, ''])[1])
        href = re.search(r'href="([^"]+)"', block)
        address = next((a for k, a in ADDRESSES.items() if k in loc.lower()), None)
        offers.append(termin(f'{d.group(0)}:{title[:60]}', title, day, urljoin(BASE, href.group(1)) if href else PAGE, PROVIDER, venue=loc or PROVIDER,
                             address=address, time_from=d.group(4), time_to=f'{int(times.group(3)):02d}:{times.group(4) or "00"}' if times else None,
                             age=age_of(f'{title} {sub}'), description=sub))
    return finish(SOURCE_ID, 'Deichtorhallen Hamburg: Familienprogramm', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
