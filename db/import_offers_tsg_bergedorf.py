"""Needs Playwright (jsfetch). Import the children's courses of TSG Bergedorf from the yolawo booking widgets on its pages.

Source: the TSG pages that embed the widgets (Kissland Kinderturnen and Kindersportschule in Wentorf, Sportzentrum Bult,
Sportforum, be.fit BilleBad). Each widget https://widgets.yolawo.de/w/<id> is rendered with js_get(); the course list
the widget itself loads while rendering (title, type, date range, weekday slots with times, place, price) is taken
from the captured JSON. Course series become one 'kurs' per weekday slot; one-day events become a 'termin'.
Kept: titles naming an age up to 12 or children / parents (Eltern-Kind-Turnen, Mini Kiss, Kinderturn-Sonntag ...).
robots.txt: tsg-bergedorf.de allows the pages; widgets.yolawo.de has no robots.txt. api.yolawo.de has 'Disallow: /'
for all crawlers, so that API is never called directly; only what the widget page loads in the browser is read.
"""
import re
import sys
from datetime import date, datetime, timedelta, timezone

from jsfetch import js_get
from offers_util import FAMILY, WEEKDAYS, age_of, clean, finish, get, group, termin

SOURCE_ID = 'tsg_bergedorf'
BASE = 'https://www.tsg-bergedorf.de'
PROVIDER = 'TSG Bergedorf von 1860 e.V.'
PAGES = ['/de/tsg/standorte/tsg-kissland-wentorf/kissland--kinderturnen/', '/de/tsg/standorte/tsg-kissland-wentorf/kindersportschule/',
         '/de/tsg/standorte/tsg-sportzentrum-bult/kursplan--anmeldung/', '/de/tsg/standorte/tsg-sportforum/befit-sportforum/kursangebote/',
         '/de/tsg/standorte/befit-studios/bille-bad/kursprogramm/']
DAYS = {d: i for i, d in enumerate(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])}
NOT_KIDS = re.compile(r'senior|erwachsene|erw\.|jug\.|damen|herren|rücken|pilates|yoga(?!.*kind)|zumba|aerobic|fitness|reha|ü\s?\d\d|50\+|'
                      r'schwanger|wettkampf', re.I)
NOUNS = {'musik', 'ball', 'bällen', 'eltern', 'kind', 'kindern', 'mama', 'papa', 'spaß', 'spiel', 'freunden', 'geräten', 'begleitung'}
VENUES = {'TSG sports center Bult': 'TSG Sportzentrum Bult'}


def no_names(title):
    """'Kinderturnen 5-8 Jahre mit Steffi am LUI' -> 'Kinderturnen 5-8 Jahre am LUI' (course leaders are private persons)."""
    t = re.sub(r'\s+(?:mit|bei)\s+([A-ZÄÖÜ][a-zäöüß]+)\b', lambda m: m.group(0) if m.group(1).lower() in NOUNS else '', title)
    t = re.sub(r'\s*\(siehe Beschreibung\)', '', t)
    return re.sub(r'\s+', ' ', t).strip(' -–')


def age_in_title(title, today):
    a = age_of(title)
    if a[0] is None:
        jg = sorted(int(y) for y in re.findall(r'(?:Jg\.|Jahrgang)\s*((?:19|20)\d\d)', title))
        jg += [int(y) for y in re.findall(r'(?:Jahrgang|Jg\.)\s*(?:19|20)\d\d\s*-\s*((?:19|20)\d\d)', title)]
        if jg:
            return max(0, (today.year - max(jg) - 1) * 12), (today.year - min(jg) + 1) * 12
    return a


def local(ts):
    """UTC timestamp -> Hamburg local time (CET/CEST rule, no tz database needed)."""
    t = datetime.fromisoformat(ts.replace('Z', '+00:00')).astimezone(timezone.utc).replace(tzinfo=None)
    def last_sunday(month):
        d = date(t.year, month, 31)
        return datetime(d.year, month, 31 - (d.weekday() + 1) % 7, 1)
    summer = last_sunday(3) <= t < last_sunday(10)
    return t + timedelta(hours=2 if summer else 1)


def place(locs):
    for loc in locs or []:
        a = loc.get('address') or {}
        if a.get('streetLine'):
            venue = re.sub(r',.*$', '', loc.get('name') or '') or PROVIDER
            c = loc.get('coordinates') or {}
            return venue, f'{a["streetLine"]}, {a.get("postal", "")} {a.get("city", "")}'.strip(), c.get('lat'), c.get('lng')
    name = re.sub(r',.*$', '', (locs or [{}])[0].get('name') or '') if locs else ''
    return name or PROVIDER, None, None, None


def kids(title):
    a = age_of(title)
    if NOT_KIDS.search(title):
        return False
    return (a[0] is not None and a[0] < 13 * 12) or bool(FAMILY.search(title) or re.search(r'\bminis?\b|mini[ -]?kiss|\bkiss\b|kita|kleinkind|jg\.|jahrgang', title, re.I))


def main():
    today = date.today()
    widgets = {}
    for path in PAGES:
        for wid in re.findall(r'widgets\.yolawo\.de/w/([0-9a-f]{24})', get(BASE + path).text):
            widgets.setdefault(wid, BASE + path)
    offers = []
    for wid, page_url in widgets.items():
        try:
            _, data = js_get(f'https://widgets.yolawo.de/w/{wid}', capture_json=True)
        except Exception as e:
            print(f'  widget {wid}: {type(e).__name__} {str(e)[:60]}')
            continue
        items = next((d for u, d in data if '/offers' in u and isinstance(d, list)), [])
        print(f'  widget {wid}: {len(items)} offers ({page_url.rstrip("/").rsplit("/", 1)[-1]})')
        for o in items:
            title = no_names(clean(o.get('title')))
            rng = (o.get('dates') or {}).get('range') or {}
            if not title or o.get('canceled') or not rng.get('to') or not kids(title):
                continue
            start, end = local(rng['from']), local(rng['to'])
            if end.date() < today:
                continue
            p = o.get('pricing') or {}
            lo, hi = p.get('lowestPrice'), p.get('highestPrice')
            price = (f'{lo:.2f} €'.replace('.', ',') if lo == hi or not hi else f'{lo:.2f}–{hi:.2f} €'.replace('.', ',')) if lo else None
            age = age_in_title(title, today)
            slots = (o.get('dates') or {}).get('weekdays') or []
            if o.get('type', '').startswith('COURSE_SERIE') and slots:
                for s in slots:
                    wd = DAYS.get(s.get('dayOfWeek'))
                    if wd is None:
                        continue
                    tf = f'{s["from"]["hour"]:02d}:{s["from"]["minute"]:02d}'
                    tt = f'{s["to"]["hour"]:02d}:{s["to"]["minute"]:02d}'
                    venue, address, lat, lon = place(s.get('locations') or (o.get('dates') or {}).get('locations'))
                    venue = VENUES.get(venue, venue)
                    if not address:
                        venue, address, lat, lon = place((o.get('dates') or {}).get('locations')) if (o.get('dates') or {}).get('locations') else (venue, None, None, None)
                    offers.append(group(f'{o["id"]}:{wd}:{tf}', title, page_url, PROVIDER, kind='kurs', weekday=wd,
                                        schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, ' + (f'{start:%d.%m.}–{end:%d.%m.%Y}' if (end.date() - today).days < 400 else 'laufend'), venue=venue, address=address,
                                        lat=lat, lon=lon, time_from=tf, time_to=tt, price=price, free=1 if lo == 0 else None, age=age,
                                        start=start.date(), end=end.date(), registration='nötig', topic='sport'))
            else:
                if start.date() < today:
                    continue
                venue, address, lat, lon = place((o.get('dates') or {}).get('locations'))
                venue = VENUES.get(venue, venue)
                same_day = start.date() == end.date()
                offers.append(termin(f'{o["id"]}:{start.date()}', title, start.date(), page_url, PROVIDER, venue=venue, address=address,
                                     lat=lat, lon=lon, time_from=start.strftime('%H:%M'), time_to=end.strftime('%H:%M') if same_day else None,
                                     end=None if same_day else end.date(), price=price, free=1 if lo == 0 else None, age=age,
                                     registration='nötig', topic='sport'))
    return finish(SOURCE_ID, 'TSG Bergedorf: Kinderkurse (Kinderturnen, Kindersport)', BASE + PAGES[0], PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
