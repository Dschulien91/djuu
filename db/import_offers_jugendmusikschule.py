"""Import the children's courses of the Staatliche Jugendmusikschule Hamburg (JMS) from its hamburg.de subject pages.

Source: the JMS pages under https://www.hamburg.de/politik-und-verwaltung/behoerden/bsfb/einrichtungen-beratung/
staatliche-jugendmusikschule-hamburg/ (one page per subject; robots.txt of hamburg.de allows these paths). Each subject
page has a 'Freie Plätze' section: course title, 'Alter:', 'Zeit:'/'Termin:' (weekday and time), 'Ort:' (school or
JMS site) per district ('Stadtbereich'). Every listed weekday/time/place becomes one weekly offer, linked to its
subject page; registration goes through the district office. Leaders' names ('Leitung:') are never stored.
Kept: courses for children up to 12 (Eltern-Kind-Kurs, Musikalische Früherziehung, Entdeckungsreise, children's
choirs, Tanz, Musiktheater, beginner orchestras ...). A subject without any parsable time keeps one offer without a
schedule (as before for Eltern-Kind-Kurs and Früherziehung), so the link stays in the app.
"""
import json
import re
import sqlite3
import sys
from datetime import date

from common import DB_PATH
from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords
from import_offers_sportvereine import ages, place

SOURCE_ID = 'jugendmusikschule_hamburg'
BASE = 'https://www.hamburg.de/politik-und-verwaltung/behoerden/bsfb/einrichtungen-beratung/staatliche-jugendmusikschule-hamburg/'
PAGE = BASE + 'fachbereiche/grundfaecher-273234'
PROVIDER = 'Staatliche Jugendmusikschule Hamburg'
ADDRESS = 'Mittelweg 42, 20148 Hamburg'
# subject page -> (default title, default age in months when a course gives none, topic)
SUBJECTS = {
    'eltern-kind-kurs-273264': ('Eltern-Kind-Kurs Musik', (6, 42), 'musik'),
    'musikalische-frueherziehung-273340': ('Musikalische Früherziehung', (42, 84), 'musik'),
    'musikalische-entdeckungsreise-273338': ('Musikalische Entdeckungsreise', (60, 96), 'musik'),
    'musiktheater-fuer-kinder-273344': ('Musiktheater für Kinder', (72, 132), 'musik'),
    'kinderchor-hamburg-1147100': ('Kinderchor', (None, None), 'musik'),
    'maedchenchor-hamburg-273330': ('Mädchenchor Hamburg', (None, None), 'musik'),
    'combo-carina-elementares-zusammenspiel-273250': ('Combo Carina – elementares Zusammenspiel', (84, 156), 'musik'),
    'tanz-273384': ('Tanz', (None, None), 'sport'),
    'orchesterschule-273358': ('Orchesterschule', (None, None), 'musik'),
    'solfege-273378': ('Solfège', (None, None), 'musik'),
    'kinder-und-jugendsingschule-st-michaelis-in-kooperation-mit-der-jugendmusikschule-hamburg-125696':
        ('Kinder- und Jugendsingschule St. Michaelis', (None, None), 'musik'),
}
LAT, LON = osm_coords('Staatliche Jugendmusikschule Hamburg')  # JMS centre, Mittelweg 42
DAY = r'(?:montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonntags?|mo\.|di\.|mi\.|do\.|fr\.|sa\.)'
DAYNUM = {'mo': 0, 'di': 1, 'mi': 2, 'do': 3, 'fr': 4, 'sa': 5, 'so': 6}
T = r'(\d{1,2})(?:[.:](\d\d))?'
SLOT = re.compile(rf'(?i)((?:{DAY}\s*(?:,|und|&|oder)?\s*)+)(?:Gruppe\s*\d+:\s*)?{T}\s*(?:-|–|bis)\s*{T}\s*(?:h\b|Uhr)?')
MORE = re.compile(rf'^\s*(?:&|und|,)\s*{T}\s*(?:-|–|bis)\s*{T}\s*(?:h\b|Uhr)?')
META = re.compile(r'^(Alter|Zeit|Termin|Wann|Ort|Wo|Kontakt|Leitung|Beschreibung|Anmelden|Anmeldung|Plätze|Sehr wenig|Ggf\.|'
                  r'Neue Kurse|Hier ist|Für Kinder|\(für|Freie Plätze|Wartezeit|Keine)', re.I)
STOP = re.compile(r'^(Informationen zum Fach|Fachliche Informationen|In welchem Alter|Was lerne)', re.I)


def hm(h, m):
    return f'{int(h):02d}:{m or "00"}'


def days_of(text):
    return sorted({DAYNUM[d[:2].lower()] for d in re.findall(DAY, text, re.I)})


def lines_of(html):
    """The page's rich text as (tag, text) lines: headings, paragraphs and list items."""
    body = html[html.find('km1-richtext'):]
    out = []
    for tag, inner in re.findall(r'(?s)<(h[1-4]|p|li)\b[^>]*>(.*?)</\1>', body):
        for part in re.split(r'<br\s*/?>', inner):
            text = clean(part)
            if text:
                out.append((tag, text))
    return out


def age_text(text, today=None):
    """Age in months from 'Alter: 1,5-3 Jahre', 'Alter: 4 Jahre', 'August 2028 eingeschult', '1. Klasse', 'Grundschulkinder'."""
    today = today or date.today()
    m = re.search(r'(?:August|Sommer)\s+(20\d\d)\D{0,30}eingeschult', text)
    if m:  # Hamburg: children who turn 6 by 30 June start school in August of that year
        lo = (today.year - (int(m.group(1)) - 6)) * 12 + (today.month - 7)
        return (lo, lo + 12) if 0 < lo < 72 else (None, None)  # a past school year: the text is stale, use the default
    num = r'(\d{1,2}(?:,5)?)'
    m = re.search(num + r'\s*(?:-|–|bis|/)\s*' + num + r'\s*(Jahre|J\b|Monate)', text)
    if m:
        f = 1 if m.group(3) == 'Monate' else 12
        lo, hi = (float(x.replace(',', '.')) for x in m.group(1, 2))
        return round(lo * f), round(hi * f) + (12 if f == 12 else 0)
    m = re.search(r'(\d)\.\s*(?:(?:und|/|-|–|bis)\s*(?:zur\s*)?(\d)\.\s*)?(?:Klasse|Schuljahr)', text)
    if m:
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        return (a + 5) * 12, (b + 6) * 12
    if re.search(r'Grundschulkind', text):
        return 72, 120
    m = re.search(r'\b(\d{1,2})\s*Jahre\b', text)
    if m and not re.search(r'\bab\s*(ca\.\s*)?\d', text):
        return int(m.group(1)) * 12, int(m.group(1)) * 12 + 12
    return ages(text)


def venue_of(text):
    """'Stadtbereich Nord, Carl-Cohn-Schule, Carl-Cohn-Str. 2' -> (venue, address or None, lat, lon)."""
    v = re.sub(r'^(Stadtbereich [\w-]+,\s*|Unterrichtsort\s+)', '', text.strip(' ,;')).strip()
    v = re.sub(r'^([^(]*schule)\s*\(([A-ZÄÖÜ][a-zäöüß]+)\)$', r'\1 \2', v)  # 'Bugenhagenschule (Alsterdorf)': the district is part of the name
    if re.match(r'(Raum [^,]+ (im|in)\s+)?Mittelweg 42', v) or re.search(r'Michael Otto Haus', v):
        return 'Staatliche Jugendmusikschule, Mittelweg 42', ADDRESS, LAT, LON
    addr = None
    m = re.search(r'([A-ZÄÖÜ][^,/]*?\d+\s?[a-z]?)\s*[,/]\s*(\d{5})\s*Hamburg', v)
    if m:  # 'Waschhaus Lohbrügge, Mendelstraße 32 c / 21031 Hamburg'
        addr = f'{m.group(1).strip()}, {m.group(2)} Hamburg'
        v = v[:m.start()].strip(' ,') or v
    lat, lon, found = place(v, addr)
    if lat is None:
        core = re.sub(r'^(Grund)?[Ss]chule\s+', '', re.split(r'[,(]', v)[0]).strip()
        lat, lon, found = place(core, addr)
        inner = re.search(r'\(([^)]{8,})\)', v)
        if lat is None and inner:  # 'BZBS Borgweg (Bildungszentrum für Blinde und Sehbehinderte)'
            lat, lon, found = place(inner.group(1), addr)
        if lat is None:
            lat, lon, found = free_school(re.split(r'[,(]', v)[0].strip())
        if lat is None:
            lat, lon = osm_coords(re.split(r'[,(]', v)[0].strip())
    return v or None, addr or found, lat, lon


def free_school(name):
    """Coordinates and address of a non-state school ('Bugenhagenschule Alsterdorf') from the city's school records."""
    words = re.sub(r'schule\b', '-Schule', name).split()
    if len(words) < 2:
        return None, None, None
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        row = con.execute("SELECT lat, lon, raw FROM source_records WHERE source_id='hh_schulen_frei' AND name LIKE ? AND lat IS NOT NULL "
                          "ORDER BY name LIKE '%Grundschule%' DESC LIMIT 1", (f'%{" ".join(words)}%',)).fetchone()
    finally:
        con.close()
    if not row:
        return None, None, None
    d = json.loads(row[2])
    return row[0], row[1], ', '.join(x for x in [d.get('adresse_strasse_hausnr'), d.get('adresse_ort')] if x) or None


def parse_subject(slug, html):
    default_title, default_age, topic = SUBJECTS[slug]
    url = BASE + slug
    offers, title, age, pending, started, slot_key = [], None, (None, None), [], False, ''

    def flush(venue=None):
        nonlocal pending
        for wd, tf, tt, inline, s_age in pending:
            where = inline or venue
            v, addr, lat, lon = venue_of(where) if where else (None, None, None, None)
            t = title or default_title
            a = s_age
            if a == (None, None):
                n = re.search(r'Früherziehung\s*([12])\b', t)
                a = {'1': (42, 66), '2': (54, 78)}[n.group(1)] if n else default_age if default_title.split()[0] in t else (None, None)
            if a[0] is not None and a[0] >= 12 * 12:
                continue
            if a == (None, None) and not re.search(r'kind|eltern|früh|vorchor|mäuse|kantorei', t, re.I):
                continue
            label = t
            if a != (None, None) and not re.search(r'\d', t):
                lo, hi = a[0] // 12, (a[1] - 1) // 12 if a[1] else None
                label = f'{t} ({lo} J.)' if hi == lo else f'{t} ({lo}–{hi} J.)' if hi else f'{t} (ab {lo} J.)'
            offers.append(group(f'{slug.rsplit("-", 1)[-1]}:{wd}:{tf}:{(v or "")[:24]}', label, url, PROVIDER, weekday=wd,
                                schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich (Schuljahr)', venue=v or PROVIDER,
                                address=addr, lat=lat, lon=lon, time_from=tf, time_to=tt, age=a, registration='nötig (über den Stadtbereich)',
                                topic=topic))
        pending = []

    for tag, text in lines_of(html):
        if re.match(r'Freie Plätze', text) and tag.startswith('h'):
            started = True
            continue
        if STOP.match(text) and tag.startswith('h'):
            if started:
                break
            continue
        if tag.startswith('h') and 'Stadtbereich' in text:
            flush()
            continue
        km = re.match(r'^([A-Za-zÄÖÜäöüß &.-]{2,25}):\s*', text)
        key = km.group(1).strip().lower() if km else ''
        cont = not key and title and re.match(rf'(?i){DAY}', text) and SLOT.match(text)  # next line of a 'Zeit:' list
        if key.startswith(('zeit', 'termin', 'wann')) or cont:
            if key:
                slot_key = key
            body = text[km.end():] if key else text
            matches = list(SLOT.finditer(body))
            for i, m in enumerate(matches):
                tail = body[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(body)]
                inline = None
                if 'ort' in slot_key:  # 'Zeit & Ort: Montag, 15:00-16:00 Uhr, Mittelweg 42'
                    inline = re.sub(r'^\s*(?:&\s*' + T + r'\s*(?:-|–)\s*' + T + r'\s*Uhr)?\s*,?\s*', '', tail).strip(' ,&') or None
                for wd in days_of(m.group(1)):
                    pending.append((wd, hm(m.group(2), m.group(3)), hm(m.group(4), m.group(5)), inline, age))
                    more = MORE.match(tail)
                    if more:
                        pending.append((wd, hm(more.group(1), more.group(2)), hm(more.group(3), more.group(4)), inline, age))
            if 'ort' in slot_key:
                flush()
            continue
        if key in ('ort', 'wo'):
            flush(text[km.end():])
            continue
        if key == 'alter' or re.search(r'eingeschult', text):
            age = age_text(text)
            continue
        if not started or META.match(text) or key in ('kontakt', 'leitung', 'beschreibung'):
            continue
        if tag in ('p', 'h4') and len(text) < 90 and not text.endswith('.'):
            flush()
            title = re.sub(r'\s*[-–]?\s*\(?(freie Plätze|Plätze frei)\)?!*\s*$', '', text, flags=re.I).strip(' -–')
            age = age_text(title) if re.search(r'\d\s*(?:-|–)\s*\d|Jahre', title) else (None, None)
            slot_key = ''
    flush()
    return offers


def main():
    offers = []
    for slug, (title, age, topic) in SUBJECTS.items():
        try:
            html = get(BASE + slug).text
        except Exception as e:
            print(f'  {slug}: {type(e).__name__}')
            continue
        found = parse_subject(slug, html)
        if not found and slug in ('eltern-kind-kurs-273264', 'musikalische-frueherziehung-273340'):
            found = [group(slug, title, BASE + slug, PROVIDER, venue=PROVIDER, address=ADDRESS, lat=LAT, lon=LON, age=age,
                           registration='nötig (über den Stadtbereich)', topic=topic, schedule='Termine beim jeweiligen Stadtbereich der Musikschule')]
        print(f'  {slug.rsplit("-", 1)[0]}: {len(found)}')
        offers += found
    return finish(SOURCE_ID, 'Staatliche Jugendmusikschule Hamburg: Kurse für Kinder', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
