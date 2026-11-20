"""Import weekly children's sports groups and courses of Hamburg sports clubs from their own public course plans.

One file, one source per club (run all, or name source ids as arguments). Only children's offers are kept: an age range
that ends at 14 years or earlier, or a clear children's title (Kinderturnen, Eltern-Kind, Seepferdchen ...). Facts only:
title, weekday, time, age, venue, address, price, link. Course leaders' names are on the pages but never stored.
Fully booked courses ('Keine freien Plätze') are dropped. Venue coordinates come from the city's school and sports
facility records (matched by street) or from OSM names; nothing is geocoded online.

- niendorfer_tsv: Niendorfer TSV, course system https://kursbuchungen.niendorfer-tsv.de/ (one listing of all offers;
  robots.txt of that host is 404 = no rules; www.niendorfer-tsv.de only blocks wp-admin). Links go to each offer's
  booking page. Terms: earlier skipped for its terms -> Julian asks.
- sv_eidelstedt: SV Eidelstedt, search form https://sve-hamburg.de/sportangebotsuche/ (one POST with empty filters
  returns all offers; robots.txt 'Disallow:' empty = everything allowed).
- sc_poppenbuettel: SC Poppenbüttel, club search https://www.scpoppenbuettel.de/de/leistungen/sportsuche/ (paged list;
  robots.txt only blocks CMS internals such as /ajax-cms, /view-file).
- ht16_kinderturnen: Hamburger Turnerschaft von 1816, table on
  https://www.ht16.de/sport/kinderturnen/trainingszeiten-orte/ (robots.txt only blocks WooCommerce/wp-admin paths).
  HT16 course bookings (Kurssuche, swimming courses, holiday camps) run on ht16.kurabu.com, whose robots.txt says
  'Disallow: /' -> not used.
- tsv_sasel_turnen: TSV Sasel, Turnen subpages under https://tsv-sasel.de/turnen/ (robots.txt only blocks wp-admin).
"""
import json
import re
import sqlite3
import sys
from datetime import date
from urllib.parse import quote_plus, urljoin

from common import DB_PATH
from offers_util import WEEKDAYS, age_of, clean, finish, get, group, osm_coords

DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6,
        'mo': 0, 'di': 1, 'mi': 2, 'do': 3, 'fr': 4, 'sa': 5, 'so': 6}
KIDS = re.compile(r'kinder|\bkids?\b|minis?\b|eltern[- ]kind|eltern und kind|mutter[- ]kind|vater[- ]kind|baby|babys|krabbel|seepferd|'
                  r'seeräuber|bronze|wassergewöhn|schwimmanfänger|bewegungsschule|zwerge|früherziehung|musikgarten|ballentdecker|'
                  r'fußball-?kindergarten|schulkind|grundschul', re.I)
ADULT = re.compile(r'senior|erwachsen|reha|herzsport|frauen|männer|damen|herren|ü\d\d|50 ?plus|60 ?plus|aqua power|pilates|zumba', re.I)
_coords = {}
KNOWN = {'Redingskamp': ('Redingskamp 25, 22523 Hamburg', 'SV Eidelstedt von 1880 eV - Redingskamp')}  # SV Eidelstedt club grounds, address published on sve-hamburg.de


def snorm(s):
    """Street spelling folded for comparison: 'Holstenstraße', 'Holstenstr.' -> 'holstenstr.'"""
    return re.sub(r'(?i)str(aße|\.)', 'str.', s or '').lower()


def street_coords(text):
    """(lat, lon, address) of the first school or sports facility whose published address starts with a street in text."""
    for m in re.finditer(r"([A-ZÄÖÜ][\wäöüß.\- ]+?(?:straße|str\.|weg|damm|redder|kamp|koppel|stieg|allee|chaussee|ring|platz|wisch|"
                         r"moor|ort|holt|markt|garten|grund|deich|twiete)\b\.?)\s*(\d+[a-z]?)?", text or '', re.I):
        street, no = m.group(1).strip(), m.group(2)
        key = f'{street} {no or ""}'.strip()
        if key in _coords:
            if _coords[key]:
                return _coords[key]
            continue
        _coords[key] = None
        con = sqlite3.connect(DB_PATH, timeout=60)
        try:
            rows = con.execute("SELECT lat, lon, raw FROM source_records WHERE source_id IN ('hh_schulen_staatlich', 'hh_sportstaetten') "
                               "AND raw LIKE ? AND lat IS NOT NULL", (f'%{re.sub(r"(?i)(str)(aße|\.)", r"\1", street)}%',)).fetchall()
        finally:
            con.close()
        for lat, lon, raw in rows:
            d = json.loads(raw)
            addr = d.get('adresse') or ', '.join(x for x in [d.get('adresse_strasse_hausnr'), d.get('adresse_ort')] if x)
            norm = snorm(addr)
            want = snorm(street)
            if norm.startswith(want) and (not no or re.match(rf'{re.escape(want)}\s*{no}\b', norm)):
                _coords[key] = (lat, lon, addr)
                return _coords[key]
        for lat, lon, raw in rows:  # same street, other house number: close enough for the map pin
            d = json.loads(raw)
            addr = snorm(d.get('adresse') or d.get('adresse_strasse_hausnr') or '')
            if addr.startswith(snorm(street)):
                _coords[key] = (lat, lon, None)
                return _coords[key]
    return None


def place(venue, address=None):
    """lat, lon, address for a venue name and/or address text."""
    for known, (addr, osm) in KNOWN.items():
        if venue and known in venue:
            lat, lon = osm_coords(osm)
            return lat, lon, address or addr
    hit = street_coords(address) or street_coords(venue)
    if hit:
        return hit[0], hit[1], address or hit[2]
    if not venue:
        return None, None, address
    core = re.sub(r'\s*(\(.*?\)|Halle \d|groß|klein|neue Halle|Gym \d|,.*)$', '', venue).strip()
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:  # school or sports facility of that name in the city's records
        row = con.execute("SELECT lat, lon, raw FROM source_records WHERE source_id IN ('hh_schulen_staatlich', 'hh_sportstaetten') "
                          "AND name LIKE ? AND lat IS NOT NULL ORDER BY length(name) LIMIT 1", (f'%{core}%',)).fetchone() if len(core) > 8 else None
    finally:
        con.close()
    if row:
        d = json.loads(row[2])
        return row[0], row[1], address or d.get('adresse') or ', '.join(x for x in [d.get('adresse_strasse_hausnr'), d.get('adresse_ort')] if x) or None
    lat, lon = osm_coords(venue)
    return lat, lon, address


def ages(text):
    """age_of plus 'bis 3 Jahre', half years ('1,5 Jahre') and bare '2 - 4' columns."""
    t = re.sub(r'(\d),5', r'\1', text or '')
    t = re.sub(r'(\d)\s*J\b\.?', r'\1 Jahre', re.sub(r'(\d)\s*Mon\b\.?', r'\1 Monate', t))
    m = re.search(r'\bbis\s*(\d+)\s*jahr', t, re.I)
    if m and not re.search(r'\d\s*bis\s*\d', t):
        return 0, int(m.group(1)) * 12 + 12
    m = re.search(r'(\d+)\s*(?:und|bis|-|–)\s*(\d+)\s*jährig', t, re.I)
    if m:
        return int(m.group(1)) * 12, int(m.group(2)) * 12 + 12
    m = re.search(r'\bJG\.?\s*(20\d\d|\d\d)(?:\s*[/&-]\s*(20\d\d|\d\d))?', t, re.I)
    if m:  # birth years ('JG 2018', 'JG 12/13') -> age this year
        years = [int(y) % 100 + 2000 for y in m.groups() if y]
        return (date.today().year - max(years)) * 12, (date.today().year - min(years) + 1) * 12
    return age_of(t)


def for_kids(title, age):
    if ADULT.search(title) and not KIDS.search(title):
        return False
    lo, hi = age
    if lo is not None and lo >= 14 * 12:
        return False
    if hi is not None:
        return hi <= 15 * 12
    if lo is not None and lo <= 10 * 12 and not KIDS.search(title):
        return lo < 7 * 12  # open-ended 'ab 6 Jahre' groups are mostly mixed with adults; keep only the young ones
    return bool(KIDS.search(title))


def hhmm(s):
    return s.replace('.', ':').zfill(5)


# ---------------------------------------------------------------- Niendorfer TSV
NTSV = 'https://kursbuchungen.niendorfer-tsv.de/'


def niendorf():
    provider = 'Niendorfer TSV'
    html = get(NTSV + '?cat_id=&filter%5B0%5D=99999', timeout=120).text
    offers = []
    for entry in html.split('<div class="eventsEntry">')[1:]:
        head = clean((re.search(r'(?s)<h2>(.*?)</h2>', entry) or [0, ''])[1])
        for block in entry.split('<div class="eventsEntryData">')[1:]:
            col = {n: clean(v) for n, v in re.findall(r'(?s)eventsEntryDateShortCol eventsEntryDateShortCol(\d)">(.*?)</div>', block.split('eventsEntryDataLong')[0])}
            sub = clean((re.search(r'(?s)Col2"><strong>(.*?)</strong>', block) or [0, ''])[1])
            ctype = clean((re.search(r'courseType">([^<]*)', block) or [0, ''])[1])
            when = re.match(r'(\w\w)\s+(\d\d:\d\d)-(\d\d:\d\d)', col.get('1', ''))
            if not when or when.group(1).lower() not in DAYS:
                continue
            title = sub if not head or head.lower() in sub.lower() else (head if sub.lower() in head.lower() else f'{head}: {sub}')
            age_txt = col.get('4', '')
            age = ages(age_txt + ' Jahre' if re.fullmatch(r'\d+\s*-\s*\d+', age_txt) else age_txt)
            if age == (None, None):
                age = ages(title)
            if not for_kids(f'{head} {sub}', age):
                continue
            if re.search(r'\d', age_txt) and not re.search(r'\d', title):
                title = f'{title} ({age_txt.replace(" - ", "–")})'
            full ='Keine freien Plätze' in block
            span = re.search(r'(\d\d)\.(\d\d)\.(\d{4})?\s*-\s*(\d\d)\.(\d\d)\.(\d{4})', col.get('5', ''))
            if full and (ctype == 'Kurs' or span):
                continue
            wd = DAYS[when.group(1).lower()]
            loc = re.search(r'(?s)eventsEntryDataLongDate">.*?ShortCol8">\s*(.*?)<br />\s*<a[^>]*>(.*?)<i>', block)
            venue = clean(loc.group(1)) if loc else None
            address = clean(loc.group(2).replace('<br />', ', ')) if loc else None
            lat, lon, address = place(venue, address)
            guest = re.search(r'(?s)Tarife für Gäste.*?Beitrag/Preis: </div>([^<]+)', block)
            member = re.search(r'(?s)Tarife für Mitglieder.*?Beitrag/Preis: </div>([^<]+)', block)
            price = clean(guest.group(1)) if guest else (clean(member.group(1)) + ' (Mitglieder)' if member else None)
            if price and price.startswith('0,00'):
                price = None
            book = re.search(r'href="(/buchung/\?id=[^"&]+)', block)
            note = clean((re.search(r'(?s)eventNotice"><strong>[^<]*</strong>(.*?)</span>', block) or [0, ''])[1]).strip(' /')
            start = end = None
            kind = 'gruppe'
            if span:
                y2 = int(span.group(6))
                y1 = int(span.group(3)) if span.group(3) else (y2 - 1 if int(span.group(2)) > int(span.group(5)) else y2)
                start, end, kind = date(y1, int(span.group(2)), int(span.group(1))), date(y2, int(span.group(5)), int(span.group(4))), 'kurs'
            tf, tt = when.group(2), when.group(3)
            sched = f'{WEEKDAYS[wd]} {tf}–{tt}, ' + (f'{start:%d.%m.}–{end:%d.%m.%Y}' if start else 'wöchentlich')
            ref = (book.group(1).split('id=')[1] if book else f'{head}:{sub}') + f':{wd}:{tf}'
            offers.append(group(ref, title, urljoin(NTSV, book.group(1)) if book else NTSV, provider, kind=kind, weekday=wd, schedule=sched,
                                venue=venue, address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, price=price,
                                free=0 if price else None, age=age, start=start, end=end,
                                registration='nötig' if kind == 'kurs' or 'Anmeldung' in entry else None, description=note[:150] or None))
    return finish('niendorfer_tsv', 'Niendorfer TSV: Kinder- und Schwimmangebote', NTSV, provider, offers)


# ---------------------------------------------------------------- SV Eidelstedt
SVE = 'https://sve-hamburg.de/sportangebotsuche/'


def eidelstedt():
    provider = 'SV Eidelstedt'
    html = get(SVE, method='POST', data=[('search', ''), ('alter', ''), ('wochentag[]', ''), ('zeit', ''), ('zeitbis', '')]).text
    table = html[html.find('id="s-results"'):]
    offers = []
    for row in re.findall(r'(?s)<tr>(.*?)</tr>', table):
        cells = [clean(c) for c in re.findall(r'(?s)<td>(.*?)</td>', row)]
        href = re.search(r'href="([^"]+)"', row)
        if len(cells) < 5 or cells[1].lower() not in DAYS:
            continue
        sport, wd_name, tm, age_txt, venue = cells[:5]
        m = re.match(r'(\d\d:\d\d)\s*-\s*(\d\d:\d\d)', tm)
        am = re.match(r'(\d+)\s*-\s*(\d+)?', age_txt)
        age = ((int(am.group(1)) * 12, int(am.group(2)) * 12 + 12 if am.group(2) else None) if am else (None, None))
        if not m or not for_kids(sport, age):
            continue
        wd = DAYS[wd_name.lower()]
        title = sport + (f' {am.group(1)}–{am.group(2)} Jahre' if am and am.group(2) else (f' ab {am.group(1)} Jahren' if am else ''))
        lat, lon, address = place(venue.split(',')[0])
        url = urljoin(SVE, href.group(1).lower() + '/') if href else SVE
        offers.append(group(f'{sport}:{wd}:{m.group(1)}:{venue}', title, url, provider, weekday=wd, venue=venue or provider,
                            address=address, lat=lat, lon=lon, time_from=m.group(1), time_to=m.group(2), age=age,
                            schedule=f'{WEEKDAYS[wd]} {m.group(1)}–{m.group(2)}, wöchentlich'))
    return finish('sv_eidelstedt', 'SV Eidelstedt: Kindersport', SVE, provider, offers)


# ---------------------------------------------------------------- SC Poppenbüttel (Netzcocktail club search)
def club_search(source_id, name, provider, page, max_pages=30):
    offers, seen, venues, n = [], set(), {}, 1
    while n <= max_pages:
        html = get(page + (f'?Special_Club_SearchList103_page={n}&search103=' if n > 1 else '')).text
        blocks = re.split(r'<div class="extended-club-search-info hidden" aria-hidden="true" id="itemDateDetails', html)[1:]
        for b in blocks:
            bid = b.split('"', 1)[0].replace('_Mobile', '')
            if bid in seen:
                continue
            seen.add(bid)
            title = clean((re.search(r'(?s)<h2 class="headline3">(.*?)</h2>', b) or [0, ''])[1])
            labels = dict((clean(k), clean(v)) for k, v in re.findall(r'(?s)box-content-label">(.*?)</span><span class="box-content-content">(.*?)</span>', b))
            age = ages(labels.get('Alter:', '') + ' ' + title) if labels.get('Alter:') else ages(title)
            if not title or not for_kids(title + ' ' + ' '.join(v for k, v in labels.items() if k == 'Sportart:'), age):
                continue
            ort = re.search(r'(?s)box-headline">Ort</div><div class="box-content-wrapper"><div class="box-content">(.*?)</div>', b)
            parts = [clean(p).replace('\u200b', '') for p in re.split(r'<br\s*/?>', ort.group(1))] if ort else []
            parts = [p for p in parts if p and p != 'Deutschland']
            venue = parts[0] if parts else None
            address = ', '.join(parts[1:]) or None
            if address:
                address = re.sub(r', (\d{5})(?:, Hamburg)?$', r', \1 Hamburg', address)
            lat, lon, address = place(venue, address)
            if venue and address:
                venues[venue] = (lat, lon, address)
            terms = re.search(r'(?s)box-headline">Termine</div>(.*?)</table>', b)
            for wd_name, tf, tt, where in re.findall(r'(?s)<tr><td>(\w+)</td><td><span class="date-time">(\d\d:\d\d)</span>\s*&ndash;\s*'
                                                     r'<span class="date-time">(\d\d:\d\d)</span></td>(?:<td>(.*?)</td>)?', terms.group(1) if terms else ''):
                if wd_name.lower() not in DAYS:
                    continue
                wd = DAYS[wd_name.lower()]
                where = clean(where) or venue
                key = (title.lower(), wd, tf, where)
                if key in seen:
                    continue
                seen.add(key)
                v_lat, v_lon, v_addr = (lat, lon, address) if where == venue else venues.get(where) or place(where)
                offers.append(group(f'{bid}:{wd}:{tf}', title, page, provider, weekday=wd, venue=where, address=v_addr, lat=v_lat, lon=v_lon,
                                    time_from=tf, time_to=tt, age=age, schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich'))
        if f'Special_Club_SearchList103_page={n + 1}&' not in html:
            break
        n += 1
    return finish(source_id, name, page, provider, offers)


def poppenbuettel():
    return club_search('sc_poppenbuettel', 'SC Poppenbüttel: Kindersport', 'SC Poppenbüttel', 'https://www.scpoppenbuettel.de/de/leistungen/sportsuche/')


# ---------------------------------------------------------------- HT16
HT16 = 'https://www.ht16.de/sport/kinderturnen/trainingszeiten-orte/'


def ht16():
    provider = 'Hamburger Turnerschaft von 1816 (HT16)'
    html = get(HT16).text
    offers, wd = [], None
    for row in re.findall(r'(?s)<tr.*?</tr>', html):
        cells = [clean(c) for c in re.findall(r'(?s)<t[dh][^>]*>(.*?)</t[dh]>', row)]
        if len(cells) < 5:
            continue
        if cells[0].lower() in DAYS:
            wd = DAYS[cells[0].lower()]
        m = re.match(r'(\d\d:\d\d)\s*-\s*(\d\d:\d\d)', cells[2])
        if wd is None or not m or re.search(r'fällt|entfällt', ' '.join(cells), re.I):
            continue
        title = cells[1].rstrip(' *') + (' (ohne Eltern)' if '*' in cells[1] else '')
        venue = cells[4]
        lat, lon, address = place(venue, (re.search(r'\((.*?)\)', venue) or [0, None])[1])
        offers.append(group(f'{wd}:{m.group(1)}:{cells[1][:20]}', f'{title} {cells[3]}', HT16, provider, weekday=wd, venue=venue,
                            address=address, lat=lat, lon=lon, time_from=m.group(1), time_to=m.group(2), age=ages(cells[3]),
                            schedule=f'{WEEKDAYS[wd]} {m.group(1)}–{m.group(2)}, wöchentlich', price='20 € im Monat (Beitrag)', free=0,
                            registration='Warteliste' if 'Warteliste' in html else 'nötig'))
    return finish('ht16_kinderturnen', 'HT16: Kinderturnen', HT16, provider, offers)


# ---------------------------------------------------------------- TSV Sasel
SASEL = 'https://tsv-sasel.de/turnen/'
SLOT = re.compile(r'(?:(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\s+)?(\d{1,2}[.:]\d\d)\s*(?:Uhr)?\s*[–-]\s*(\d{1,2}[.:]\d\d)\s*Uhr,?\s*')
LABEL = re.compile(r'(?<=\s)(?:[A-ZÄÖÜ][\wäöü+-]* |\+ |und ){1,4}\d+(?:,5)?\s*[–-]\s*\d+\s*(?:J\b|Jahre)')  # 'Step Kids + Spiele 10 – 16 Jahre'
NOTE = re.compile(r'\*+|Gerne .*?Mitmachen!|Nur mit Voranmeldung.*?\d{2,}(?: \d+)*|Hier leider.*?Warteliste|bitte Anmeldung unter: \S+', re.I)


def school_age(text):
    m = re.search(r'(\d+)\.\s*(?:und|bis|-)\s*(\d+)\.\s*(?:Schuljahr|Klasse)', text)
    if m:
        return (int(m.group(1)) + 5) * 12, (int(m.group(2)) + 6) * 12
    m = re.search(r'ab (\d+)\.\s*(?:Schuljahr|Klasse)', text)
    return ((int(m.group(1)) + 5) * 12, None) if m else (None, None)


def sasel():
    provider = 'TSV Sasel'
    index = get(SASEL).text
    pages = sorted(set(re.findall(r'href="(https://tsv-sasel\.de/turnen/[^"/]+/)"', index)))
    offers, seen = [], set()
    for url in pages:
        html = get(url).text
        body = re.sub(r'(?s)<(script|style|header|footer|nav)\b.*?</\1>', ' ', html[html.find('<body'):])
        text = clean(body)
        text = text[text.find('Subtitle'):].split('-->')[0]
        if 'Trainingszeiten' not in text:
            continue
        head, times = text.split('Trainingszeiten', 1)
        name = re.split(r' (?:Wir|Gemeinsam|Mit allen|Es) ', clean(head.replace('Subtitle', '')))[0].replace('Grund-schul', 'Grundschul')
        wait = 'Warteliste' in times
        slots = list(SLOT.finditer(times))
        label = clean(NOTE.sub(' ', times[:slots[0].start()])) if slots else ''
        wd = None
        for i, m in enumerate(slots):
            wd = DAYS[m.group(1).lower()] if m.group(1) else wd
            rest = times[m.end():slots[i + 1].start() if i + 1 < len(slots) else len(times)]
            cuts = [c.end() for c in [re.search(r'[A-Za-zäöüß.-]+ \d+[a-z]?\b(?!\.)', rest)] if c]
            cuts += [c.start() for c in [LABEL.search(rest)] if c]
            where, after = (rest[:min(cuts)], rest[min(cuts):]) if cuts else (rest, '')
            parts = [re.sub(r'^Turnen und Spiele ', '', p.strip()) for p in where.split(',') if p.strip()]
            if len(parts) > 1 and re.fullmatch(r'(?:vordere |hintere )?Halle|im Studio', parts[0], re.I):
                parts = parts[1:]
            venue = re.sub(r'^(?:Turnen und Spiele |im |Halle )+', '', parts[0]) if parts else provider
            addr = ', '.join(p for p in parts[1:] if re.search(r'\d|weg|str', p, re.I)) or None
            lat, lon, address = place(venue, addr)
            lab = label if len(label) < 45 else ''
            label = clean(NOTE.sub(' ', after)).strip(' ,;') or label
            age = school_age(lab)
            if age == (None, None):
                age = ages(lab or name)
            if age == (None, None):
                age = ages(name)
            title = name if not lab or lab.lower() in name.lower() else (lab if lab.split()[0] == name.split()[0] else f'{name} – {lab}')
            tf, tt = hhmm(m.group(2)), hhmm(m.group(3))
            key = (wd, tf, lat or venue)
            if wd is None or key in seen or (age[0] or 0) >= 13 * 12 or not (age != (None, None) or KIDS.search(title)):
                continue
            seen.add(key)
            offers.append(group(f'{url.rstrip("/").rsplit("/", 1)[1]}:{wd}:{tf}', title, url, provider, weekday=wd, venue=venue,
                                address=address and (address if 'Hamburg' in address else address + ', Hamburg'), lat=lat, lon=lon,
                                time_from=tf, time_to=tt, age=age, registration='Warteliste' if wait else None,
                                schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich (nicht in den Schulferien)'))
    return finish('tsv_sasel_turnen', 'TSV Sasel: Kinderturnen', SASEL, provider, offers)


# ---------------------------------------------------------------- Walddörfer SV
WSV = 'https://walddoerfer-sv.de/sportsuche/'
WSV_SPORTS = ['Kinderturnen', 'Kinderturnen ohne Eltern', 'Schwimmschule', 'Ferienprogramm', 'Kinder- und Jugendtheater', 'Ballett',
              'Trampolin', 'Parkour', 'Gerätturnen', 'Rhythmische Sportgymnastik', 'Young Motion Team', 'Judo', 'Karate - Do', 'Leichtathletik',
              'Hip Hop', 'Breakdance', 'Fechten', 'Klettern', 'Capoeira', 'Taekwondo', 'Tanzsport', 'Basketball', 'Handball', 'Fußball',
              'Inline - Skating', 'Schach', 'Tennis', 'Tischtennis', 'Badminton', 'Volleyball']


def walddoerfer():
    provider = 'Walddörfer SV'
    rows = []
    for sport in WSV_SPORTS:  # one sport per request: the search is slow for combined filters
        try:
            rows += re.findall(r'(?s)<tr class="clickable-row[^"]*" data-href="([^"]+)">(.*?)</tr>', get(f'{WSV}?Sportart%5B%5D={quote_plus(sport)}', timeout=90).text)
        except Exception as e:
            print(f'  {sport}: {type(e).__name__}')
    offers = []
    for row in rows:
        href, body = row
        cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', body)]
        if len(cells) < 4:
            continue
        title, when, sport, venue = cells[:4]
        m = re.match(r'(\w\w)\.,\s*(\d\d:\d\d)\s*-\s*(\d\d:\d\d)', when)
        if not m or m.group(1).lower() not in DAYS:
            continue
        if re.search(r'Alle Plätze sind vergeben|Warteliste\s*-\s*geschlossen', body + title):
            continue
        title = re.sub(r'\s+W$', '', title).strip()
        if sport.lower() not in title.lower() and (len(title) < 30 or title.startswith(('Jugend', 'Leistungsgruppe', 'Breitensportgruppe'))):
            title = f'{sport}: {title}'
        age = ages(title)
        if not for_kids(f'{title} {sport}', age):
            continue
        wd = DAYS[m.group(1).lower()]
        if 'Sportforum' in venue:
            v_name, lat, lon, address = 'Walddörfer Sportforum', None, None, 'Halenreie 32-34, 22359 Hamburg'
        else:
            v_name = venue
            lat, lon, address = place(venue)
        free_places = re.search(r'Freie Plätze:\s*(\d+)', body)
        offers.append(group(href.rstrip('/').rsplit('/', 1)[-1] + f':{wd}:{m.group(2)}', title, href, provider, weekday=wd, venue=v_name,
                            address=address, lat=lat, lon=lon, time_from=m.group(2), time_to=m.group(3), age=age,
                            registration='Warteliste' if 'Warteliste' in title else 'nötig',
                            schedule=f'{WEEKDAYS[wd]} {m.group(2)}–{m.group(3)}, wöchentlich' + (' (Online-Buchung je Termin)' if free_places else '')))
    return finish('walddoerfer_sv', 'Walddörfer SV: Kindersport', WSV, provider, offers)


SOURCES = {'niendorfer_tsv': niendorf, 'sv_eidelstedt': eidelstedt, 'sc_poppenbuettel': poppenbuettel, 'ht16_kinderturnen': ht16,
           'tsv_sasel_turnen': sasel, 'walddoerfer_sv': walddoerfer}


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
