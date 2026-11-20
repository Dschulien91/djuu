"""Import BUND Hamburg's children's environment groups (Kinder-Umweltgruppen) and its family events.

Sources (BUND Landesverband Hamburg, bund-hamburg.de):
- https://www.bund-hamburg.de/themen/umweltbildung/haus-der-bundten-natur/kinder-und-jugendgruppen/ : one table per site
  (Haus der BUNDten Natur im Kellinghusenpark, Gut Karlshöhe, BUND Naturerlebnisgarten im Wilhelmsburger Inselpark) with
  weekday, rhythm, time and age. Each row becomes one 'gruppe'. Rows run as a cooperation with one primary school (only
  for its pupils) and the BUNDjugend (15-27 years) are left out; the leaders' names in the table are never stored.
- https://www.bund-hamburg.de/service/termine/ : the event list (date, time, title, place). Kept only events for children
  or families (title, or the event's own page naming children/families or a child age); work parties, talks and
  workshops for adults are left out. Currently none qualify, so the source may consist of the groups only.
robots.txt: allows everything except TYPO3 paths, '/*?id=*' and '&type=98' (not used).
"""
import re
import sys
from datetime import date

from offers_util import MONTHS, WEEKDAYS, age_of, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'bund_hamburg'
BASE = 'https://www.bund-hamburg.de'
GROUPS = BASE + '/themen/umweltbildung/haus-der-bundten-natur/kinder-und-jugendgruppen/'
EVENTS = BASE + '/service/termine/'
PROVIDER = 'BUND Hamburg'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
# site heading -> (venue, OSM name for the pin, address)
SITES = {'Kellinghusenpark': ('Haus der BUNDten Natur (Kellinghusenpark)', 'Kellinghusenpark', 'Kellinghusenpark, Eppendorf, Hamburg'),
         'Karlshöhe': ('Gut Karlshöhe', 'Gut Karlshöhe', 'Karlshöhe 60d, 22175 Hamburg'),
         'Naturerlebnisgarten': ('BUND Naturerlebnisgarten (Wilhelmsburger Inselpark)', 'BUND Naturerlebnisgarten', 'Wilhelmsburger Inselpark, Hamburg')}
KIDS = re.compile(r'kinder|famili|eltern|kids|ferien|für groß und klein|für jung und alt', re.I)
ADULT = re.compile(r'pflegeeinsatz|arbeitseinsatz|helfer gesucht|vortrag|symposium|themenabend|workshop|tagung|online', re.I)


def hm(t):
    h, _, m = t.replace('.', ':').partition(':')
    return f'{int(h):02d}:{m or "00"}'


def groups():
    html = get(GROUPS).text
    offers = []
    for head, table in re.findall(r'(?s)<h3[^>]*>(.*?)</h3>\s*<table.*?>(.*?)</table>', html):
        head = clean(head)
        key = next((k for k in SITES if k in head), None)
        if not key:
            print(f'  unknown site {head!r}')
            continue
        venue, osm, address = SITES[key]
        lat, lon = osm_coords(osm)
        for row in re.findall(r'(?s)<tr>(.*?)</tr>', table):
            cells = [clean(c) for c in re.findall(r'(?s)<t[dh][^>]*>(.*?)</t[dh]>', row)]
            if len(cells) < 3 or cells[0].lower() == 'termin':
                continue
            when, hours, who = cells[:3]
            wd = next((d for k, d in DAYS.items() if when.lower().startswith(k)), None)
            t = re.search(r'(\d{1,2}[.:]\d\d)\s*(?:-|–)\s*(\d{1,2}[.:]\d\d)', hours)
            if wd is None or not t or re.search(r'kooperation|bundjugend', who + ' ' + when, re.I):
                continue
            age = age_of(who.replace('–', '-'))
            if age[0] is None:
                m = re.search(r'ab (\d+) jahr', who, re.I)
                age = (int(m.group(1)) * 12, None) if m else (72, None)
            if age[0] >= 13 * 12:
                continue
            tf, tt = hm(t.group(1)), hm(t.group(2))
            rhythm = 'alle 14 Tage' if '14' in when else 'wöchentlich'
            label = re.sub(r'^\w+\s*', '', when).strip(' ,')  # 'Dienstag 1, 14-tägig' -> '1, 14-tägig'
            n = re.match(r'(\d)\b', label)
            title = f'Kinder-Umweltgruppe {key if key != "Naturerlebnisgarten" else "Naturerlebnisgarten Wilhelmsburg"} ({who})'
            if key == 'Kellinghusenpark':
                title = f'Kinder-Umweltgruppe im Haus der BUNDten Natur ({who})'
            offers.append(group(f'gruppe:{key}:{wd}:{tf}:{n.group(1) if n else ""}', title, GROUPS, PROVIDER, weekday=wd,
                                venue=venue, address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, age=age,
                                registration='Anmeldung beim BUND Hamburg nötig', topic='wissen',
                                schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, {rhythm}' + (f' (Gruppe {n.group(1)})' if n else '')))
    return offers


def events():
    html = get(EVENTS).text
    offers = []
    for href, body in re.findall(r'(?s)<a[^>]+href="(/service/termine/detail/event/[^"]+)"[^>]*>(.*?)</a>', html):
        title = clean((re.search(r'(?s)<h3[^>]*>(.*?)</h3>', body) or re.search('(.*)', body)).group(1))
        cap = clean((re.search(r'(?s)rte-paragraph__caption">(.*?)</p>', body) or re.search('()', body)).group(1))
        place = clean((re.search(r'(?s)<p class="rte-paragraph">\s*Ort:(.*?)</p>', body) or re.search('()', body)).group(1))
        m = re.match(r'(\d{1,2})\.\s*(\w+)\s*(20\d\d)', cap)
        if not m or m.group(2).lower() not in MONTHS or ADULT.search(title):
            continue
        url = BASE + href
        if not KIDS.search(title):
            detail = clean(get(url).text)
            if not re.search(r'für (kinder|familien)|familienexkursion|kinder (ab|von) \d|\bab \d+ jahren', detail, re.I):
                continue
        else:
            detail = title
        day = date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
        t = re.search(r'um (\d{1,2}(?:[.:]\d\d)?)\s*(?:-|bis)\s*(?:ca\.\s*)?(\d{1,2}(?:[.:]\d\d)?)?', cap)
        tf = hm(t.group(1)) if t else None
        tt = hm(t.group(2)) if t and t.group(2) else None
        offers.append(termin(f'event:{href.rstrip("/").rsplit("/", 1)[1]}:{day}', title, day, url, PROVIDER, venue=place or PROVIDER,
                             address=place or None, time_from=tf, time_to=tt, age=age_of(detail), topic='wissen'))
    return offers


def main():
    return finish(SOURCE_ID, 'BUND Hamburg: Kinder-Umweltgruppen und Familientermine', GROUPS, PROVIDER, groups() + events())


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
