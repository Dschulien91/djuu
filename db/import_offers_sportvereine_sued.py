"""Import weekly children's groups of more Hamburg sports clubs (south and east) from their own training-time pages.

Same rules as import_offers_sportvereine.py (one source per club; run all or name source ids as arguments): only
children's offers (age range ending at 14 or earlier, or a clear children's title), facts only (title, weekday, time,
age, venue, address, link); leaders' names, phone numbers and e-mails on the pages are never stored.
Venue coordinates: the city's school/sports facility records and OSM names via place(), else OSM address records in
the local DB, else the fixed list VENUES below (taken from the local OSM extract / the city's school records).

- tv_fischbek: TV Fischbek von 1921, Joomla articles 'Trainingszeiten' of the departments Turnen, Boxen and Handball
  (https://www.tvfischbek.de/index.php/sportarten/...). robots.txt only blocks Joomla system folders.
  Handball: the youth timetable grid (hall x weekday); youth classes (Minis, E-, D-Jugend) get the usual DHB age bands.
- tus_finkenwerder: TuS Finkenwerder von 1893, timetable https://tusfinkenwerder.de/trainingszeiten-kalender/
  (MotoPress Timetable, first table = all sports; robots.txt 'Disallow:' empty). Football youth classes (G/F/E/D)
  get the usual DFB age bands.
- htb_harburg: Harburger Turnerbund von 1865 (HTB), PDF 'Sportangebote' linked from
  https://www.harburger-turnerbund.de/htb-sportangebote/ (flipbook; robots.txt only blocks wp-admin). Pages whose
  text is letter-spaced in the PDF (cricket/fencing, football) cannot be read and are skipped.
- wtsv_concordia: Wandsbeker TSV Concordia, https://wtsv-concordia.de/sportarten/<sport>/ (tables 'Uhrzeit |
  Sportstätten', Turnen tables 'Gruppe | Wochentag | Uhrzeit', Karate text lines; robots.txt only blocks wp-admin).
  Turnen names no hall ('Trainiert wird bei allen Kursen in Hamburg Jenfeld'): venue is the club's Jenfeld grounds.
"""
import io
import re
import sqlite3
import sys
from html import unescape
from urllib.parse import urljoin

import pdfplumber

from common import DB_PATH
from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords
from import_offers_sportvereine import DAYS, KIDS, ages, for_kids, hhmm, place, street_coords

TIME = re.compile(r'(\d{1,2}[.:]\d\d)\s*(?:Uhr)?\s*[-–]\s*(\d{1,2}[.:]\d\d)')
WDAY = re.compile(r'\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\b\.?', re.I)
# venue key -> (address, lat, lon); from the local OSM extract's address index or the city's school records
VENUES = {
    'Uwe-Seeler-Halle': ('Heidschnuckenring 31, 21149 Hamburg', 53.467151, 9.818458),
    'Uwe Seeler Halle': ('Heidschnuckenring 31, 21149 Hamburg', 53.467151, 9.818458),
    'CU-Arena': ('Am Johannisland 2-4, 21147 Hamburg', 53.475019, 9.854562),
    'Arena Süderelbe': ('Neumoorstück 1, 21147 Hamburg', 53.477898, 9.867308),
    'Gorch Fock Halle': ('Benittstraße 3, 21129 Hamburg', 53.534544, 9.878887),  # street centre
    'Vahrenwinkelweg 2': ('Vahrenwinkelweg 28, 21075 Hamburg', 53.456552, 9.931950),  # HTB club grounds (OSM)
    'Hans-Dewitz-Ring': ('Hans-Dewitz-Ring 21, 21075 Hamburg', 53.459953, 9.947025),
    'Dempwolffstr': ('Dempwolffstraße 7, 21073 Hamburg', 53.458838, 9.965015),
    'Schule am Park': ('Schwarzenbergstraße 52, 21073 Hamburg', 53.462818, 9.976358),
    'Wandsbeker All': ('Wandsbeker Allee 54, 22041 Hamburg', 53.575705, 10.069383),
}


def where(venue, address=None):
    """lat, lon, address for a venue text such as 'Halle: CU-Arena, Am Johannisland 2-4' or 'Clubhaus Vahrenwinkelweg 28'."""
    v = re.sub(r'^Halle:\s*', '', venue or '').strip(' ,')
    for key, (addr, lat, lon) in VENUES.items():
        if key.lower() in f'{v} {address or ""}'.lower():
            return lat, lon, addr
    address = re.sub(r'(?<=[a-zß])str\.(?=\s*\d)', 'straße', address or '') or None
    lat, lon, addr = place(v, address)
    if lat is None:
        m = re.search(r'([A-ZÄÖÜ][\wäöüß.-]*(?:\s[A-ZÄÖÜ][\wäöüß.-]*)?)\s+(\d+)', f'{address or ""} {v}')
        hit = street_coords(f'{m.group(1)} {m.group(2)}') if m else None
        if hit:
            return hit[0], hit[1], address or hit[2]
        if m:
            street = m.group(1).replace('str.', 'straße')
            con = sqlite3.connect(DB_PATH, timeout=60)
            try:
                row = con.execute("SELECT lat, lon FROM source_records WHERE source_id='osm' AND raw LIKE ? AND raw LIKE ? AND lat IS NOT NULL LIMIT 1",
                                  (f'%"addr:street": "{street}"%', f'%"addr:housenumber": "{m.group(2)}%')).fetchone()
            finally:
                con.close()
            if row:
                lat, lon = row
    return lat, lon, addr or address


def offer(source, ref, title, url, provider, wd, tf, tt, age, venue, address=None, lat=None, lon=None, note=None):
    if lat is None:
        lat, lon, address = where(venue, address)
    return group(f'{ref}:{wd}:{tf}', title, url, provider, weekday=wd, venue=venue, address=address, lat=lat, lon=lon,
                 time_from=tf, time_to=tt, age=age, schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich' + (f' ({note})' if note else ''))


def youth_age(title):
    """Age band of a youth class ('E-Jugend', 'F Jugend', 'Minis') in months (DFB/DHB classes, two years each)."""
    m = re.search(r'\b([A-G])[\s-]*Jugend', title)
    if m:
        lo = {'G': 4, 'F': 7, 'E': 9, 'D': 11, 'C': 13, 'B': 15, 'A': 17}[m.group(1)]
        return lo * 12, lo * 12 + 24
    m = re.search(r'\bU\s?(\d{1,2})\b', title)  # 'Kinder U10': under 10, two-year band
    if m:
        return (int(m.group(1)) - 2) * 12, int(m.group(1)) * 12
    if re.search(r'super minis', title, re.I):
        return 36, 72
    if re.search(r'\bminis\b', title, re.I):
        return 48, 96
    if re.search(r'\bmaxis\b', title, re.I):
        return 72, 108
    return None, None


def cells_of(row):
    return [clean(c) for c in re.findall(r'(?s)<t[dh][^>]*>(.*?)</t[dh]>', row)]


# ---------------------------------------------------------------- TV Fischbek
TVF = 'https://www.tvfischbek.de/index.php/sportarten/'
TVF_PAGES = ['turnen?view=article&id=90:trainingszeiten-turnen&catid=34:turnen',
             'boxen?view=article&id=40:boxen-trainingszeiten&catid=20:boxen',
             'taekwon-do?view=article&id=727:taekwondo-trainingszeiten2&catid=33:taekwondo']
TVF_HANDBALL = 'handball?view=article&id=78:trainingszeiten-handball&catid=22:handball'


def fischbek():
    provider = 'TV Fischbek von 1921'
    offers = []
    for page in TVF_PAGES:
        url = TVF + page
        html = get(url).text
        body = html[html.find('articleBody'):]
        body = body[:body.find('</table>')] if '</table>' in body else body
        sport = page.split('?')[0].replace('-', ' ').title()
        wd, cur = None, None
        for row in re.findall(r'(?s)<tr\b.*?</tr>', body):
            cells = [c for c in cells_of(row) if c]
            if not cells:
                continue
            if cells[0].lower() in DAYS:
                wd = DAYS[cells[0].lower()]
                continue
            m = TIME.match(cells[0])
            if m and wd is not None:
                cur = {'tf': hhmm(m.group(1)), 'tt': hhmm(m.group(2)), 'title': cells[1] if len(cells) > 1 else sport, 'venue': None, 'wd': wd}
                offers.append(cur)
                continue
            if cur and not cur['venue'] and re.search(r'halle|arena|platz|\d', cells[0], re.I) and not cells[0].startswith('('):
                cur['venue'] = cells[0]
            elif cur and cur['venue'] and re.match(r'^[A-ZÄÖÜ][\wäöüß-]+(?:ring|weg|straße)\s*\d', cells[0]):
                cur['venue'] += ', ' + cells[0]  # 'Uwe-Seeler-Halle' / 'Heidschnuckenring 31' on two rows
            if cur is not None:
                cur.setdefault('url', url)
        for o in offers:
            o.setdefault('url', url)
    out = []
    for o in offers:
        title = re.sub(r'\s*-\s*', '-', o['title']).replace('Eltern-Kind-', 'Eltern-Kind-').strip()
        title = re.sub(r'\s+beim TVF', '', title)
        age = ages(title)
        if not for_kids(title, age) or (age[0] is None and not KIDS.search(title)):
            continue
        if 'boxen' in o['url'] and 'Box' not in title:
            title = f'Boxen: {title}'
        if 'taekwon' in o['url'] and 'Taekwon' not in title:
            title = f'Taekwon-Do: {title}'
        venue = o['venue'] or 'TV Fischbek'
        venue = re.sub(r'^Halle:\s*', '', venue)
        out.append(offer('tv_fischbek', o['url'].split('id=')[1].split(':')[0] + ':' + title[:25], title, o['url'], provider, o['wd'], o['tf'], o['tt'], age, venue))
    # handball youth grid: one table per hall, columns = weekdays
    url = TVF + TVF_HANDBALL
    html = get(url).text
    body = html[html.find('articleBody'):]
    for hall, addr, table in re.findall(r'(?s)<h5[^>]*>(.*?)</h5>\s*<address>(.*?)</address>\s*<table.*?>(.*?)</table>', body):
        hall, addr = clean(hall), clean(addr).strip('()')
        rows = re.findall(r'(?s)<tr\b.*?</tr>', table)
        head = cells_of(rows[0]) if rows else []
        cols = {i: DAYS[c.lower()] for i, c in enumerate(head) if c.lower() in DAYS}
        for row in rows[1:]:
            cells = cells_of(row)
            m = TIME.search(cells[0] if cells else '')
            if not m:
                continue
            for i, team in enumerate(cells):
                if i not in cols or not team:
                    continue
                age = youth_age(team)
                if age[0] is None or age[0] >= 12 * 12:
                    continue
                out.append(offer('tv_fischbek', f'hb:{team}', f'Handball {team}', url, provider, cols[i], hhmm(m.group(1)), hhmm(m.group(2)),
                                 age, hall, addr))
    return finish('tv_fischbek', 'TV Fischbek: Kindersport', TVF + 'turnen', provider, out)


# ---------------------------------------------------------------- TuS Finkenwerder
TUSF = 'https://tusfinkenwerder.de/trainingszeiten-kalender/'


def finkenwerder():
    provider = 'TuS Finkenwerder von 1893'
    html = get(TUSF).text
    i = html.find('mptt-shortcode-table')
    table = html[i:html.find('</table>', i)]
    cols = {cid: DAYS[name.lower()] for cid, name in re.findall(r'<th data-index="\d+" data-column-id="(\d+)">(\w+)</th>', table)}
    offers = []
    for cid, cell in re.findall(r'(?s)<td class="mptt-shortcode-event[^"]*" data-column-id="(\d+)".*?>(.*?)</td>', table):
        for eid, ev in re.findall(r'(?s)<div data-event-id="(\d+)"(.*?)(?=<div data-event-id=|$)', cell):
            t = re.search(r'event-title">(.*?)</span>', ev)
            times = re.findall(r'datetime="(\d\d:\d\d)"', ev)
            if not t or len(times) < 2 or cid not in cols:
                continue
            title = clean(t.group(1))
            desc = re.search(r'(?s)event-description">(.*?)</p>', ev)
            parts = [clean(p) for p in re.split(r'</?br\s*/?>|\n', unescape(desc.group(1)))] if desc else []
            parts = [p for p in parts if p and not p.startswith('mit ')]
            place_txt = next((p for p in reversed(parts) if re.search(r'\d{5}', p)), None)
            note = ' '.join(p for p in parts if p != place_txt and not re.search(r'individual|freies training', p, re.I))[:60] or None
            age = ages(title)
            if age == (None, None):
                age = youth_age(title)
            if re.search(r'nur nach absprache|leistung|individual', f'{title} {note or ""}', re.I):
                continue
            if age[0] is not None and age[0] >= 12 * 12:  # C-Jugend and older
                continue
            if not for_kids(title, age) or (age[0] is None and not KIDS.search(title)):
                continue
            venue, addr = (place_txt.split('|', 1) + [None])[:2] if place_txt and '|' in place_txt else (place_txt, None)
            venue, addr = (venue or '').strip(), (addr or '').strip() or None
            if addr is None and venue and re.search(r'\d{5}', venue):
                addr = venue
                venue = venue.split(',')[0]
            title = title.replace(' – ', ': ', 1)
            offers.append(offer('tus_finkenwerder', eid, title, TUSF, provider, cols[cid], times[0], times[1], age, venue or provider,
                                addr, note=note if note and len(note) < 40 else None))
    return finish('tus_finkenwerder', 'TuS Finkenwerder: Kindersport', TUSF, provider, offers)


# ---------------------------------------------------------------- Harburger Turnerbund (PDF)
HTB = 'https://www.harburger-turnerbund.de/htb-sportangebote/'


def pdf_lines(page):
    """Words of a PDF page grouped into lines (tops within 3 pt), each line a list of words left to right."""
    words = sorted(page.extract_words(), key=lambda w: (w['top'], w['x0']))
    lines = []
    for w in words:
        if lines and abs(lines[-1][0]['top'] - w['top']) <= 3:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w['x0']) for l in lines]


def htb():
    provider = 'Harburger Turnerbund von 1865 (HTB)'
    html = get(HTB).text
    m = re.search(r'pdfUrl&quot;:&quot;(https:[^&]*?Sportangebot[^&]*?\.pdf)', html)
    if not m:
        raise ValueError('Sportangebote PDF not found')
    pdf_url = m.group(1).replace('\\/', '/')
    with pdfplumber.open(io.BytesIO(get(pdf_url).content)) as pdf:
        pages = [pdf_lines(p) for p in pdf.pages]
    offers, title = [], None
    for lines in pages:
        for words in lines:
            text = ' '.join(w['text'] for w in words)
            text = re.sub(r'\bDienst ag\b', 'Dienstag', text)
            wm = re.match(r'^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\s+' + TIME.pattern, text)
            if not wm:
                if '|' in text and not re.search(r'@|Abteilungsleiter|Ansprechpartner|Tel\.|\d{4} -', text) and not text.startswith('|'):
                    title = text
                continue
            if not title:
                continue
            # venue: words after '|' up to the first wide gap (the leader column follows)
            after = [w for w in words if w['x0'] > next((x['x0'] for x in words if x['text'] == '|'), 10 ** 6)]
            vw = []
            for w in after:
                if vw and w['x0'] - vw[-1]['x1'] > 20:
                    break
                vw.append(w)
            venue = re.sub(r'(\w)\s+(\w)$', r'\1\2', ' '.join(w['text'] for w in vw)) if vw else None
            venue = re.sub(r'stra\s?(ß|ss)\s?e', 'straße', venue or '') or None
            t = re.sub(r'\s*\|\s*', ' | ', title).strip(' |')
            parts = [p.strip() for p in t.split('|')]
            label = ' – '.join([parts[0]] + [p for p in parts[1:] if not re.match(r'^(TTC-Harburg|LEVEL \d|Level \d|Basic)\b', p)][:2])
            label = re.sub(r'(\d)\s*-\s*(\d)', r'\1–\2', label)  # '(3 -6 Jahre)' and '(3 - 6 Jahre)' are the same group
            jg = re.search(r'\((20\d\d)\s*-\s*(20\d\d)\)|Jahrg(?:ä|a)nge\s*(20\d\d)\s*/\s*(20\d\d)', t)
            age = ages(f'JG {jg.group(1) or jg.group(3)}/{jg.group(2) or jg.group(4)}') if jg else ages(re.sub(r'(\d) 1/2', r'\1,5', t))
            if re.search(r'Jahrg(?:ä|a)nge\s*20\d\d\s*und älter|Wettkampf', t):
                continue
            if not for_kids(t, age) or (age[0] is None and not KIDS.search(t)):
                continue
            wd = DAYS[wm.group(1).lower()]
            offers.append(offer('htb_harburg', label[:30], label, HTB, provider, wd, hhmm(wm.group(2)), hhmm(wm.group(3)), age,
                                venue or 'Harburger Turnerbund'))
    return finish('htb_harburg', 'Harburger Turnerbund: Kindersport', HTB, provider, offers)


# ---------------------------------------------------------------- WTSV Concordia
WTSVC = 'https://wtsv-concordia.de/sportarten/'
WTSVC_SPORTS = ['turnen', 'judo', 'karate', 'jiu-jitsu', 'handball', 'tischtennis', 'volleyball', 'tennis', 'schach', 'fitness']
JENFELD = 'Wandsbeker TSV Concordia, Bekkamp (Jenfeld)'


def concordia():
    provider = 'Wandsbeker TSV Concordia'
    offers = []
    j_lat, j_lon, _ = place('Bekkamp 52, 22045 Hamburg')
    for sport in WTSVC_SPORTS:
        url = f'{WTSVC}{sport}/'
        try:
            html = get(url).text
        except Exception as e:
            print(f'  {sport}: {type(e).__name__}')
            continue
        name = sport.replace('-', ' ').title().replace('Jiu Jitsu', 'Jiu-Jitsu')
        heading, section_age = None, (None, None)
        for chunk in re.split(r'(?=<h[1-4]\b)|(?=<table\b)', html):
            hm = re.match(r'(?s)<h[1-4][^>]*>(.*?)</h[1-4]>', chunk)
            if hm and clean(hm.group(1)) not in ('Unser', 'Unsere', ''):
                heading = clean(hm.group(1))
                section_age = ages(re.sub(r'Kindern? von (\d+) bis (\d+) Jahren', r'\1-\2 Jahre', clean(chunk)[:400]))
            if not chunk.startswith('<table'):
                continue
            for row in re.findall(r'(?s)<tr\b.*?</tr>', chunk[:chunk.find('</table>')]):
                cells = cells_of(row)
                for i, c in enumerate(cells):
                    m = TIME.search(c)
                    if not m:
                        continue
                    same = WDAY.search(c)
                    d = same or (WDAY.fullmatch(cells[i - 1].strip(' .')) if i else None)
                    if not d:
                        continue
                    wd = DAYS[d.group(1).lower()]
                    if same:  # 'Gruppe | Mo., 16:30 – 17:30 | Sportstätte'
                        label = cells[i - 1] if i >= 1 else None
                    else:  # 'Gruppe | Wochentag | Uhrzeit' (or just 'Wochentag | Uhrzeit')
                        label = cells[i - 2] if i >= 2 else None
                    venue_txt = cells[i + 1] if i + 1 < len(cells) and re.search(r'halle|straße|weg|all', cells[i + 1], re.I) else None
                    group_name = heading if sport == 'turnen' and heading else name
                    title = f'{group_name} {label}' if label and label not in group_name else group_name
                    age = ages(title)
                    if age == (None, None) and sport == 'turnen' and not label:  # 'Begleitetes Turnen für Kinder von 1 bis 3 Jahren'
                        age = section_age
                    if not for_kids(title, age) or (age[0] is None and not KIDS.search(title)):
                        continue
                    if venue_txt:
                        offers.append(offer('wtsv_concordia', f'{sport}:{label}', title, url, provider, wd, hhmm(m.group(1)), hhmm(m.group(2)), age, venue_txt))
                    else:
                        offers.append(offer('wtsv_concordia', f'{sport}:{label}', title, url, provider, wd, hhmm(m.group(1)), hhmm(m.group(2)), age,
                                            JENFELD, 'Bekkamp, 22045 Hamburg', j_lat, j_lon))
        if sport == 'karate':  # text lines: 'Adresse: ... (Sporthalle) Kinder (7-14 Jahre): Di. & Do.: 17:30-19:00'
            text = clean(html)
            for addr, block in re.findall(r'Adresse:\s*([^()]+?)\s*\(Sporthalle\)(.*?)(?=Adresse:|$)', text):
                for label, days, tf, tt in re.findall(r'((?:Kinder|Jugendliche)[^:]{0,40}?):\s*((?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s*&?\s*)+):\s*(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)', block):
                    title = f'Karate {label.strip()}'
                    age = ages(title)
                    if not for_kids(title, age):
                        continue
                    for d in re.findall(r'(Mo|Di|Mi|Do|Fr|Sa|So)\.', days):
                        offers.append(offer('wtsv_concordia', f'karate:{label[:15]}', title, url, provider, DAYS[d.lower()], hhmm(tf), hhmm(tt), age,
                                            f'Sporthalle {addr.split(",")[0]}', addr.strip()))
    return finish('wtsv_concordia', 'Wandsbeker TSV Concordia: Kindersport', WTSVC + 'turnen/', provider, offers)


SOURCES = {'tv_fischbek': fischbek, 'tus_finkenwerder': finkenwerder, 'htb_harburg': htb, 'wtsv_concordia': concordia}


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
