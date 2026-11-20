"""Import weekly children's sports groups of sports clubs in Hamburg's north-east from their own pages.

Same rules as import_offers_sportvereine.py (one source per club; run all, or name source ids as arguments): only
children's offers with weekday and time; facts only (title, weekday, time, age, venue, address, link). Trainers' names
and phone numbers on the pages are never stored. Venue coordinates come from the city's school / sports facility
records, OSM records with the same street and house number, or OSM names; nothing is geocoded online.

- sv_bergstedt: SV Bergstedt, page 'Turnen & Kindertanz' https://svbergstedt.de/turnen-kindertanz/ (one Divi tab block
  per group: 'Alter & Zeit' / 'Ort' / 'Trainer*in'; robots.txt only blocks /wp-admin/). Groups with a waiting list are kept
  with registration 'Warteliste'.
- tsv_duwo08: TSV DUWO 08 (Duvenstedt/Wohldorf-Ohlstedt), pages under https://www.duwo08.de/sportangebote/:
  Eltern-Kind-Turnen and Familienturnen ('Wann:' / 'Wo:'), Fußballkindergarten and the youth football teams up to
  about 12 years ('Trainingsort' / 'Trainingszeit' with a summer and a winter schedule; the current season's slot is
  used). robots.txt only blocks /wp-content/uploads/wpforms/.

Checked, not built (see the round-3 report): SC Alstertal-Langenhorn (course list only in a Yolawo booking widget whose
API api.yolawo.de has robots.txt 'Disallow: /'), HSV Barmbek-Uhlenhorst (Kleinkinderturnen without times, admission
stop), SC Ottensen (robots.txt names AI crawlers -> Julian asks first).
"""
import re
import sqlite3
import sys
from datetime import date
from urllib.parse import urljoin

from common import DB_PATH
from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords
from import_offers_sportvereine import DAYS, ages, for_kids, place, street_coords

DAY = r'(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)s?'
SLOT = re.compile(DAY + r',?\s*(?:von\s*)?(\d{1,2})[.:](\d\d)\s*(?:Uhr\s*)?(?:-|–|bis)\s*(\d{1,2})[.:](\d\d)', re.I)


def hm(h, m):
    return f'{int(h):02d}:{m}'


def addr_coords(address):
    """lat, lon of an OSM object with exactly this street and house number ('Teekoppel 9, 22395 Hamburg')."""
    m = re.match(r'\s*([^,\d]+?)\s+(\d+\s?[a-z]?)\b', address or '')
    if not m:
        return None, None
    street, no = m.group(1).strip(), m.group(2).replace(' ', '')
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND raw LIKE ? AND raw LIKE ? AND lat IS NOT NULL LIMIT 1",
                          (f'%"addr:street": "{street}"%', f'%"addr:housenumber": "{no}"%')).fetchone()
        if not row:  # schools: the city's records carry the address in their raw data
            row = con.execute("SELECT lat, lon FROM source_records WHERE source_id IN ('hh_schulen_frei', 'hh_schulen_staatlich') "
                              "AND raw LIKE ? AND lat IS NOT NULL LIMIT 1", (f'%{street} {no}%',)).fetchone()
    finally:
        con.close()
    return row or (None, None)


def locate(venue, address):
    """Coordinates for a venue with a published address: exact OSM address, then the city's records by street."""
    lat, lon = addr_coords(address)
    if lat is None:
        hit = street_coords(address)
        if hit:
            lat, lon = hit[0], hit[1]
    if lat is None and venue:
        lat, lon, _ = place(venue, address)
    return lat, lon


def text_lines(html):
    html = re.sub(r'(?s)<(script|style)\b.*?</\1>', ' ', html)
    return [t for t in (clean(x) for x in re.split(r'<br\s*/?>|</p>|</li>|</div>|</h\d>', html)) if t]


# ---------------------------------------------------------------- SV Bergstedt
SVB = 'https://svbergstedt.de/turnen-kindertanz/'


def bergstedt():
    provider = 'SV Bergstedt'
    html = get(SVB).text
    offers = []
    sections = re.split(r'<h1 class="et_pb_module_heading">', html)[1:]
    for sec in sections:
        name = clean(sec.split('</h1>', 1)[0])
        for body in sec.split('<div class="et_pb_all_tabs">')[1:]:  # one tab block per group
            parts = re.findall(r'(?s)<div class="et_pb_tab_content">(.*?)</div>', body)
            if len(parts) < 2:
                continue
            when, where = text_lines(parts[0]), ' '.join(text_lines(parts[1]))
            age_txt = when[0] if when else ''
            age = ages(age_txt.replace('&', '-'))
            note = ' '.join(when)
            title = f'{name} ({age_txt.split(",")[0].strip()})' if re.search(r'\d', age_txt) else name
            title = title.replace('Elternkindturnen', 'Eltern-Kind-Turnen').replace('(Ab', '(ab')
            if not for_kids(f'{name} kinder', age) or re.search(r'Turnreise', name):
                continue
            venue, _, address = where.partition(',')
            address = address.strip() or None
            lat, lon = locate(venue.strip(), address)
            if venue.strip() == 'Gymnastikhalle':
                venue = 'SV Bergstedt, Gymnastikhalle'
            course = re.search(r'(\d+)\s*Termine\s*/\s*(\d+)\s*€', note)
            for m in SLOT.finditer(note):
                wd = DAYS[m.group(1).lower()]
                tf, tt = hm(m.group(2), m.group(3)), hm(m.group(4), m.group(5))
                offers.append(group(f'{name[:20]}:{wd}:{tf}', title, SVB, provider, kind='kurs' if course else 'gruppe', weekday=wd,
                                    venue=venue.strip(), address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, age=age,
                                    price=f'{course.group(2)} € ({course.group(1)} Termine)' if course else None, free=0 if course else None,
                                    sessions=int(course.group(1)) if course else None,
                                    registration='Warteliste' if 'Warteliste' in note else ('nötig' if 'Anmeldung' in note else None),
                                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, ' + ('Kurs' if course else 'wöchentlich (Abweichungen in den Ferien)')))
    return finish('sv_bergstedt', 'SV Bergstedt: Kinderturnen und Kindertanz', SVB, provider, offers)


# ---------------------------------------------------------------- TSV DUWO 08
DUWO = 'https://www.duwo08.de/sportangebote/'
DUWO_TURNEN = ['kinderturnen/eltern-kind-turnen/', 'kinderturnen/familienturnen/']
DUWO_VENUES = {  # published place names -> address (club pages; school addresses from the city's school records)
    'Schule am Walde': 'Kupferredder 12, 22397 Hamburg',
    'Sthamerstraße': 'Sthamerstraße 30, 22397 Hamburg',
    'Gymnasium Ohlstedt': None,
}


def duwo_place(text):
    text = text.replace('Gymansium', 'Gymnasium')
    for key, addr in DUWO_VENUES.items():
        if key in text:
            venue = re.sub(r'^(?:Der\s+)?|[„“"]', '', re.split(r',\s*(?=[A-ZÄÖÜ][a-zäöüß]+(?:weg|redder|straße)\s*\d)', text)[0]).strip()
            lat, lon, found = place(key if key != 'Sthamerstraße' else 'Sportplatz Sthamerstraße', addr)
            return venue, addr or found, lat, lon
    lat, lon, found = place(text)
    return text, found, lat, lon


def duwo():
    provider = 'TSV DUWO 08'
    offers = []
    for path in DUWO_TURNEN:
        url = DUWO + path
        lines = text_lines(get(url).text)
        title = None
        for i, line in enumerate(lines):
            if re.match(r'(Eltern-Kind-Turnen|Familienturnen)\s+für Kinder', line):
                title = line.strip()
            m = re.match(r'Wann:\s*(.*)', line)
            if not (m and title):
                continue
            slot = SLOT.search(m.group(1))
            where = next((re.sub(r'^Wo:\s*', '', x) for x in lines[i + 1:i + 3] if x.startswith('Wo:')), '')
            if not slot:
                continue
            wd = DAYS[slot.group(1).lower()]
            tf, tt = hm(slot.group(2), slot.group(3)), hm(slot.group(4), slot.group(5))
            venue, address, lat, lon = duwo_place(where)
            offers.append(group(f'{path}:{wd}:{tf}', re.sub(r'\s+für Kinder von\s+', ' ', title).replace('Jahren', 'Jahre'), url, provider,
                                weekday=wd, venue=venue, address=address, lat=lat, lon=lon, time_from=tf, time_to=tt,
                                age=ages(title), registration='Probestunde nach Anmeldung',
                                schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich'))
    offers += duwo_football(provider)
    return finish('tsv_duwo08', 'TSV DUWO 08: Kinderturnen und Kinderfußball', DUWO + 'kinderturnen/', provider, offers)


FDAY = r'(Mo|Di|Mi|Do|Fr|Sa|So)[a-z]*'  # 'Dientag' and other typos on the team pages
FSLOT = re.compile(FDAY + r',?\s*(\d{1,2})[.:](\d\d)\s*(?:Uhr\s*)?(?:-|–)\s*(\d{1,2})[.:](\d\d)(?:\s*Uhr)?'
                   r'((?:\s*und\s*\d{1,2}[.:]\d\d\s*(?:-|–)\s*\d{1,2}[.:]\d\d(?:\s*Uhr)?)*)\s*(\([^)]*\))?')
SEASONS = r'(?:Frühling|Frühjahr)/Sommer|Herbst/Winter'


def season_part(text, winter):
    """The part of 'Frühling/Sommer: ... Herbst/Winter: ...' for the current season (the whole text if not split)."""
    want = 'Herbst/Winter' if winter else r'(?:Frühling|Frühjahr)/Sommer'
    m = re.search(rf'(?:{want})\s*:\s*(.*?)(?=(?:{SEASONS})\s*:|$)', text)
    return m.group(1).strip() if m else text.strip(' :')


def duwo_football(provider):
    """Fußballkindergarten and youth teams up to about 12 years: current season's training slots."""
    index = get(DUWO + 'fussball/jugendfussball/junioren/').text
    teams = sorted(set(re.findall(r'href="(https://www\.duwo08\.de/sportangebote/fussball/jugendfussball/junioren/(?:fussballkindergarten|jg20\d\d)/)"', index)))
    today = date.today()
    winter = today.month >= 10 or today.month <= 3
    offers = []
    for url in teams:
        html = get(url).text
        h1 = clean((re.search(r'(?s)<h1[^>]*>(.*?)</h1>', html) or [0, ''])[1])
        a = html.find('<article')
        text = ' '.join(text_lines(html[a:html.find('</article>', a)] if a >= 0 else html))
        age = ages(h1)
        if age[0] is None or age[0] >= 12 * 12:
            continue
        team = re.split(r'\s+(?:\(|Bezirksliga|Kreisliga)', h1)[0].strip(' ,')
        title = team if 'kindergarten' in team.lower() else f'Fußball {team}'
        title = title.replace('JG ', 'Jahrgang ')
        ort = re.search(r'Trainingsort\s*:?\s*(.*?)\s*Trainingszeit', text)
        zeit = re.search(r'Trainingszeit\s*:?\s*(.*?)\s*(?:Trainerteam|Trainer\b|Betreuer)', text)
        if not zeit:
            continue
        where = season_part(ort.group(1) if ort else '', winter)
        hall = re.sub(r'.*?Sthamerstraße 30\s*', '', where).strip() or where  # winter: pitch and a hall are listed
        for slot in FSLOT.finditer(season_part(zeit.group(1), winter)):
            wd = DAYS.get(slot.group(1).lower())
            if wd is None:
                continue
            indoor = 'Halle' in (slot.group(7) or '') or 'Sthamerstraße' not in where
            venue, address, lat, lon = duwo_place(hall if indoor else 'Sportplatz Sthamerstraße 30')
            times = [(slot.group(2, 3), slot.group(4, 5))] + [((p, q), (r, t)) for p, q, r, t in
                                                              re.findall(r'(\d{1,2})[.:](\d\d)\s*(?:-|–)\s*(\d{1,2})[.:](\d\d)', slot.group(6) or '')]
            for (h1_, m1), (h2_, m2) in times:
                tf, tt = hm(h1_, m1), hm(h2_, m2)
                offers.append(group(f'{url.rstrip("/").rsplit("/", 1)[1]}:{wd}:{tf}', title, url, provider, weekday=wd, venue=venue, address=address,
                                    lat=lat, lon=lon, time_from=tf, time_to=tt, age=age, topic='sport',
                                    registration='Probetraining nach Absprache',
                                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich ({"Herbst/Winter" if winter else "Frühling/Sommer"})'))
    return offers


SOURCES = {'sv_bergstedt': bergstedt, 'tsv_duwo08': duwo}


def main(names=None):
    ok = False
    for sid in names or SOURCES:
        try:
            ok = bool(SOURCES[sid]()) or ok
        except SystemExit as e:
            print(e)
        except Exception as e:  # one club failing must not stop the others
            print(f'{sid}: {type(e).__name__}: {e}')
    return ok


if __name__ == '__main__':
    sys.exit(0 if main(sys.argv[1:]) else 1)
