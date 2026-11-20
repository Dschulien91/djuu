"""Import the family show (Christmas panto) of The English Theatre of Hamburg from its season page.

Source: eth-hamburg.de/season-2627/ (the season page linked from the home page as 'season-<yy><yy>'), which lists each
production with its run ('26 November – 27 December 2026') and a short blurb. Kept: productions whose blurb calls them a
panto or a show for the whole family / children; everything else at the ETH is evening theatre for adults. One entry per
run (start and end date): single performance dates are only in the external ticket shop
(englishtheatre-shop.comfortticket.de), whose robots.txt disallows all crawlers, so it is neither read nor linked.
The site's events feed (/events.ics) holds only the evening specials and is not used. Facts only: title, run, link.

robots.txt: '*' may read everything except /wp-admin/.
"""
import re
import sys
from datetime import date

from offers_util import MONTHS, clean, finish, get, osm_coords, termin

SOURCE_ID = 'english_theatre_family'
BASE = 'https://eth-hamburg.de'
PROVIDER = 'The English Theatre of Hamburg'
ADDRESS = 'Lerchenfeld 14, 22081 Hamburg'
EN_MONTHS = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
                                             'october', 'november', 'december'])}
MONTH_RX = '|'.join(list(EN_MONTHS) + list(MONTHS))
RUN = re.compile(rf'(\d{{1,2}})\.?\s*({MONTH_RX})?\s*(\d{{4}})?\s*[–-]\s*(\d{{1,2}})\.?\s*({MONTH_RX})\s*(\d{{4}})', re.I)
FAMILY_SHOW = re.compile(r'\bpanto(mime)?\b|whole family|for (the )?(children|kids)|family show|kinder|familie', re.I)


def month(name):
    name = name.lower()
    return EN_MONTHS.get(name) or MONTHS.get(name)


def main():
    home = get(BASE + '/').text
    season = sorted(set(re.findall(r'href="(https://eth-hamburg\.de/season-\d{4}/)"', home)))
    page = season[-1] if season else BASE + '/'
    text = clean(get(page).text)
    lat, lon = osm_coords('The English Theatre of Hamburg', 'English Theatre')
    offers = []
    # each production: '<TITLE> ... <run> <blurb> TICKETS'
    for seg in text.split('TICKETS'):
        run = RUN.search(seg)
        if not run or not FAMILY_SHOW.search(seg[run.end():]):
            continue
        d1, m1, y1, d2, m2, y2 = run.groups()
        end = date(int(y2), month(m2), int(d2))
        m_start = month(m1) if m1 else end.month
        start = date(int(y1) if y1 else (end.year if m_start <= end.month else end.year - 1), m_start, int(d1))
        head = seg[:run.start()].strip()
        title = (re.search(r"((?:THE |A |AN )?[A-Z0-9][A-Z0-9’'!?&,.: -]{3,60})(?= based on| by | adapted|$)", head) or [0, ''])[1].strip()
        if not title:
            continue
        title = title.title().replace("’S", "’s").replace("'S", "'s")
        label = f'{title} – Christmas Panto (englisch)' if re.search(r'panto', seg, re.I) else f'{title} (englisch)'
        offers.append(termin(f'{start}:{re.sub(r"[^a-z]+", "-", title.lower()).strip("-")}', label, start, page, PROVIDER,
                             venue=PROVIDER, address=ADDRESS, lat=lat or 53.56945, lon=lon or 10.028875, end=end,
                             registration='Tickets', topic='theater'))
    return finish(SOURCE_ID, 'English Theatre of Hamburg: Familienstück (Panto)', page, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
