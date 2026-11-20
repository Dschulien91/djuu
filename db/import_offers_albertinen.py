"""Import parent courses and information evenings of the two Immanuel Albertinen birth clinics in Hamburg.

1. Albertinen Krankenhaus (Schnelsen), Albertinen ElternZentrum: one page per course under
   https://albertinen.de/abteilungen/fachabteilungen/geburtshilfe/leistungspektrum/vor-der-geburt/elternzentrum-albertinen/
   Each page shows the next date(s) of that course as event teasers (date, title, time, link to the event page).
   The information evening page lists its dates explicitly (two per month) plus an online session in English.
2. Evangelisches Amalie Sieveking Krankenhaus (Volksdorf): the information evenings are published as rules
   ('An jedem 1. Dienstag des Monats ... um 19 Uhr', 'am 3. Donnerstag jeden Monat' virtual) and kept as recurring
   groups; event teasers on the page are added as dated events. The 'Offener Stilltreff' is kept as a group. The other
   courses on the Amalie pages are run by named freelance midwives without dates and are not imported.
Course leaders' names are never stored.

robots.txt (albertinen.de, amalie.de): 'Disallow: /*?' and 'Crawl-delay: 30' - only plain paths are fetched and the
30 s delay is kept (about 12 requests, ~5 minutes). The site-wide event calendar is a search API with query
parameters (immanuelalbertinen.de/api/v1/calendar/subsites?tx_solr...), disallowed by '/*?', so it is not used.
Terms: imprint (https://immanuelalbertinen.de/impressum/): 'Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
der Verwertung ... bedürfen der schriftlichen Zustimmung' (standard copyright notice) -> Julian asks.
"""
import re
import sys
from datetime import date, datetime, timedelta
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from offers_util import WEEKDAYS, age_of, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'immanuel_albertinen_geburtshilfe'
ALB = 'https://albertinen.de'
ALB_GH = ALB + '/abteilungen/fachabteilungen/geburtshilfe/leistungspektrum/vor-der-geburt'
ALB_EZ = ALB_GH + '/elternzentrum-albertinen/'
ALB_INFO = ALB_GH + '/infoabend-fuer-werdende-eltern/'
ALB_PROVIDER = 'Albertinen Krankenhaus (Albertinen ElternZentrum)'
ALB_VENUE = 'Albertinen Krankenhaus'
ALB_ADDRESS = 'Süntelstraße 11a, 22457 Hamburg'
AMA = 'https://amalie.de'
AMA_GH = AMA + '/abteilungen/fachabteilungen/geburtshilfe/unser-angebot'
AMA_INFO = AMA_GH + '/vor-der-geburt/infoabende/'
AMA_AFTER = AMA_GH + '/nach-der-geburt/kursangebote-nach-der-geburt/'
AMA_PROVIDER = 'Ev. Amalie Sieveking Krankenhaus'
AMA_ADDRESS = 'Haselkamp 33, 22359 Hamburg'
WEEKDAY_WORDS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']
PARENTS = re.compile(r'geburtsvorbereit|crashkurs|schwanger|werdende|erste hilfe|akupunktur|infoabend|rückbildung', re.I)


def teasers(soup, base):
    """Event teasers (date tag, linked title, <time datetime>) of a page as (day, title, url, from, to)."""
    out = []
    for tag in soup.select('li.tags__item--background'):
        box, with_h3 = tag, None
        for _ in range(8):  # smallest ancestor holding the title and, if present, the times
            box = box.parent
            if box is None:
                break
            if box.find('h3'):
                with_h3 = with_h3 or box
                if box.find('time'):
                    break
        box = box if box is not None and box.find('h3') and box.find('time') else with_h3
        if box is None:
            continue
        a = box.find('h3').find('a', href=True)
        times = [t.get('datetime') for t in box.find_all('time') if t.get('datetime')]
        m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', tag.get_text())
        if not (a and m):
            continue
        day = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        tf = datetime.fromisoformat(times[0]).strftime('%H:%M') if times else None
        tt = datetime.fromisoformat(times[1]).strftime('%H:%M') if len(times) > 1 else None
        out.append((day, clean(a.get_text(' ')), urljoin(base, a['href']), tf, tt))
    return out


def page(url):
    return BeautifulSoup(get(url).text, 'html.parser')


def content_text(soup):
    html = str(soup)
    a, b = html.find('TYPO3SEARCH_begin'), html.rfind('TYPO3SEARCH_end')
    return clean(BeautifulSoup(html[a:b] if a > 0 else html, 'html.parser').get_text(' '))


def albertinen_info(soup, latlon, today):
    text = content_text(soup)
    m = re.search(r'jeden\s+(\w+)\s+und\s+(\w+)\s+(' + '|'.join(WEEKDAY_WORDS) + r')\s+im\s+monat\s+um\s+(\d{1,2})(?:[:.](\d\d))?\s*uhr\s+(?:in\s+der\s+)?([^.]{3,40}?)\s+statt',
                  text, re.I)
    tf = f'{int(m.group(4)):02d}:{m.group(5) or "00"}' if m else None
    venue = f'{ALB_VENUE}, {clean(m.group(6))}' if m else ALB_VENUE
    offers = []
    for d, mo, y in re.findall(r'(?<![\d.])(\d{2})\.(\d{2})\.(\d{4})', text):
        day = date(int(y), int(mo), int(d))
        if day >= today:
            offers.append(termin(f'infoabend:{day}', 'Informationsabend Geburtshilfe für werdende Eltern', day, ALB_INFO, ALB_PROVIDER,
                                 venue=venue, address=ALB_ADDRESS, lat=latlon[0], lon=latlon[1], time_from=tf,
                                 registration='offen' if re.search(r'ohne Anmeldung', text) else None, topic='geburtsvorbereitung'))
    # 'Online information session for english speaking parents 30th November 2026, 6pm'
    months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    for mm in re.finditer(r'(\d{1,2})(?:st|nd|rd|th)\s+(' + '|'.join(months) + r')\s+(\d{4}),?\s*(\d{1,2})\s*(am|pm)', text, re.I):
        day = date(int(mm.group(3)), months.index(mm.group(2).lower()) + 1, int(mm.group(1)))
        hour = int(mm.group(4)) % 12 + (12 if mm.group(5).lower() == 'pm' else 0)
        if day >= today and re.search(r'english', text[max(0, mm.start() - 120):mm.start()], re.I):
            offers.append(termin(f'infoabend-en:{day}', 'Online information session for English-speaking parents', day, ALB_INFO, ALB_PROVIDER,
                                 venue='Online', time_from=f'{hour:02d}:00', topic='geburtsvorbereitung'))
    return offers


def albertinen_courses(latlon, today):
    soup = page(ALB_EZ)
    links = sorted({urljoin(ALB, a['href']) for a in soup.find_all('a', href=True)
                    if re.match(r'/abteilungen/fachabteilungen/geburtshilfe/leistungspektrum/vor-der-geburt/elternzentrum-albertinen/[^#?]+/$', a['href'])})
    offers = list(teaser_offers(soup, ALB, ALB_PROVIDER, ALB_VENUE, ALB_ADDRESS, latlon, today))
    for url in links:
        offers += teaser_offers(page(url), ALB, ALB_PROVIDER, 'Albertinen ElternZentrum', ALB_ADDRESS, latlon, today)
    return offers


SPAN = re.compile(r'[:,]?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})?\s*(?:bis|-|–)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})')
WEEKEND = re.compile(r'\s+am\s+\d{1,2}\./\d{1,2}\.\d{1,2}\.\d{4}')
LEADER = re.compile(r'\s+mit\s+(?:Hebamme|Kursleiterin|Kursleitung|Physiotherapeutin)\s+[A-ZÄÖÜ][\w-]+(?:\s+[A-ZÄÖÜ][\w-]+)?')


def split_title(title, day):
    """Cut leader names and date spans out of a teaser title; returns (title, last day or None)."""
    title = LEADER.sub('', title)
    end = None
    m = SPAN.search(title)
    if m:
        try:
            end = date(int(m.group(6)), int(m.group(5)), int(m.group(4)))
            if end < day:  # '06.01. - 17.02.2026' on a course starting in January 2027
                end = end.replace(year=end.year + 1)
        except ValueError:
            end = None
        title = (title[:m.start()] + title[m.end():])
    if WEEKEND.search(title) or re.search(r'wochenende|weekend', title, re.I):
        title = WEEKEND.sub('', title)
        end = end or day + timedelta(days=1)
    title = re.sub(r'\s+', ' ', title).strip(' :-–')
    return title, (end if end and end > day else None)


def teaser_offers(soup, base, provider, venue, address, latlon, today):
    for day, title, url, tf, tt in teasers(soup, base):
        title, end = split_title(title, day)
        if (end or day) < today:
            continue
        age = (None, None) if PARENTS.search(title) else age_of(title)
        if age == (None, None) and not PARENTS.search(title) and re.search(r'baby|säugling|beikost', title, re.I):
            age = (0, 12)
        topic = 'erste_hilfe' if re.search(r'erste hilfe', title, re.I) else ('geburtsvorbereitung' if re.search(r'infoabend', title, re.I) else None)
        online = re.search(r'virtuell|online', title, re.I)
        kw = dict(venue='Online' if online else venue, address=None if online else address, lat=None if online else latlon[0],
                  lon=None if online else latlon[1], time_from=tf, time_to=tt, age=age,
                  registration='nötig' if topic != 'geburtsvorbereitung' or end else None, topic=topic)
        ref = f'{url.rstrip("/").rsplit("/", 1)[1][:80]}:{day}'
        if end:
            when = (f'{WEEKDAYS[day.weekday()]}–{WEEKDAYS[end.weekday()]} {day:%d.%m.}–{end:%d.%m.}' if (end - day).days <= 2
                    else f'{WEEKDAYS[day.weekday()]} {day:%d.%m.}–{end:%d.%m.}')
            yield group(ref, title, url, provider, kind='kurs', weekday=day.weekday(), start=day, end=end,
                        schedule=when + (f', {tf}' + (f'–{tt}' if tt else '') if tf else ''), **kw)
        else:
            yield termin(ref, title, day, url, provider, **kw)


def amalie_rules(soup, latlon):
    """'An jedem 1. Dienstag des Monats ... um 19 Uhr im Amalie Forum', 'am 3. Donnerstag jeden Monat' (virtual)."""
    text = content_text(soup)
    offers = []
    for m in re.finditer(r'(?:an\s+)?(?:jedem|am)\s+(\d)\.\s+(' + '|'.join(WEEKDAY_WORDS) + r')\s+(?:des|jeden)\s+monats?([^.]{0,120})', text, re.I):
        n, wd = int(m.group(1)), WEEKDAY_WORDS.index(m.group(2).lower())
        before = text[max(0, m.start() - 60):m.start()].lower()
        tail = m.group(3)
        hour = re.search(r'um\s+(\d{1,2})(?:[:.](\d\d))?\s*uhr', tail, re.I)
        virtual = 'virtuell' in before or 'virtuell' in tail.lower()
        tf = f'{int(hour.group(1)):02d}:{hour.group(2) or "00"}' if hour else ('19:00' if virtual and '19:00' in text else None)
        place = re.search(r'im\s+(Amalie\s+\w+)', tail)
        title = 'Virtueller Infoabend für werdende Eltern' if virtual else 'Infoabend für werdende Eltern'
        offers.append(group(f'infoabend:{"online" if virtual else "vor-ort"}', title, AMA_INFO, AMA_PROVIDER, weekday=wd,
                            schedule=f'jeden {n}. {WEEKDAYS[wd]} im Monat' + (f', {tf}' if tf else ''),
                            venue='Online' if virtual else (f'{AMA_PROVIDER}, {place.group(1)}' if place else AMA_PROVIDER),
                            address=None if virtual else AMA_ADDRESS, lat=None if virtual else latlon[0], lon=None if virtual else latlon[1],
                            time_from=tf, registration='nötig' if virtual else None, topic='geburtsvorbereitung'))
    return offers


def amalie_stilltreff(soup, latlon):
    text = content_text(soup)
    m = re.search(r'Offener Stilltreff[^.]{0,30}?(' + '|'.join(WEEKDAY_WORDS) + r')\w*\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})', text, re.I)
    if not m:
        return []
    wd = WEEKDAY_WORDS.index(m.group(1).lower())
    return [group('stilltreff', 'Offener Stilltreff', AMA_AFTER, AMA_PROVIDER, weekday=wd, schedule=f'{WEEKDAYS[wd]} {m.group(2)}–{m.group(3)}',
                  venue=AMA_PROVIDER, address=AMA_ADDRESS, lat=latlon[0], lon=latlon[1], time_from=m.group(2), time_to=m.group(3),
                  age=(0, 12), registration='offen' if re.search(r'ohne voranmeldung', text[m.end():m.end() + 60], re.I) else None,
                  topic='beratung')]


def main():
    today = date.today()
    alb_ll = osm_coords('Albertinen Krankenhaus')
    ama_ll = osm_coords('Amalie-Sieveking-Krankenhaus')
    offers = []
    steps = [('Albertinen Infoabend', lambda: albertinen_info(page(ALB_INFO), alb_ll, today)),
             ('Amalie Infoabend', lambda: amalie_rules(soup_ama_info[0], ama_ll) + [  # dated teasers other than the info evening the rules already cover
                 o for o in teaser_offers(soup_ama_info[0], AMA, AMA_PROVIDER, AMA_PROVIDER, AMA_ADDRESS, ama_ll, today)
                 if not re.search(r'infoabend', o['title'], re.I)]),
             ('Amalie Stilltreff', lambda: amalie_stilltreff(page(AMA_AFTER), ama_ll)),
             ('Albertinen ElternZentrum', lambda: albertinen_courses(alb_ll, today))]
    soup_ama_info = [None]
    for name, fn in steps:
        try:
            if name == 'Amalie Infoabend':
                soup_ama_info[0] = page(AMA_INFO)
            found = fn()
        except Exception as e:  # keep the other clinic if one page fails
            print(f'  {name}: {type(e).__name__}: {e}')
            found = []
        print(f'  {name}: {len(found)}')
        offers += found
    return finish(SOURCE_ID, 'Albertinen & Amalie: Elternkurse und Infoabende Geburtshilfe', ALB_EZ, 'Immanuel Albertinen Diakonie', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
