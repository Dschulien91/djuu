"""Import the weekly groups of the Eltern-Kind-Zentren and family centres that Diakonie Hamburg lists
(https://www.diakonie-hamburg.de/de/rat-und-hilfe/familien/familienzentren/), each from the centre's OWN page.

Every centre writes its programme as free text. Only offers stated clearly with a weekday and a time are kept
('Mittwochs „Gedichte für Wichte“ 10:30 Uhr', 'donnerstags von 14:30 bis 16 Uhr eine offene Krabbelgruppe',
opening hours of the open parent-child café). Fortnightly / monthly dates, counselling slots, German courses,
adult sport and breakfasts for the whole neighbourhood are skipped. One source, provider = the centre.
Elbkinder EKiZ come from import_offers_elbkinder.py and are not read here.

Not read (no weekday + time on the page): Maria-Magdalena EKiZ Osdorfer Born (page shows only hotline hours),
EKiZ Kita Moorwisch (programme only as PDF flyer), Kita Wackelzahn (site unreachable), the eva-kita pages of
Bei der Hammer Kirche and Ochsenwerder (Kita pages without family-centre times), Pestalozzi offices and the
Familienratsbüro (counselling only).
robots.txt: none of the pages read is disallowed.
"""
import re
import sys

from import_offers_stadtkultur import age_in, good_age, lines_of, page, strip_names, times
import sqlite3

from common import DB_PATH
from offers_util import WEEKDAYS, finish, group

SOURCE_ID = 'diakonie_ekiz'
LIST = 'https://www.diakonie-hamburg.de/de/rat-und-hilfe/familien/familienzentren/'
CENTRES = [  # provider, venue, address, exact OSM names (only where the OSM record is this place), pages
    ('Eltern-Kind-Zentrum Iserbrook (Ev.-Luth. Kirchengemeinde Sülldorf-Iserbrook)', 'Eltern-Kind-Zentrum Iserbrook',
     'Schenefelder Landstraße 202, 22589 Hamburg', (), ['https://www.kgmsi.de/kinder']),
    ('Eltern-Kind-Zentrum Haakestraße (Ev. Kita St. Petrus)', 'Eltern-Kind-Zentrum Haakestraße', 'Haakestraße 98, 21075 Hamburg',
     ('Evangelische Kita St. Petrus Harburg',), ['https://ekiz-eissendorf.eva-kita.de']),
    ('Eltern-Kind-Zentrum im LutherCampus (Ev.-Luth. Luther-Kirchengemeinde Bahrenfeld)', 'Eltern-Kind-Zentrum im LutherCampus',
     'Lyserstraße 23, 22761 Hamburg', (), ['https://www.lutherkirche.net/luthercampus/eltern-kind-zentrum']),
    ('Eltern-Kind-Zentrum Reiherstieg (Kindertagesheim Emmaus)', 'Eltern-Kind-Zentrum Reiherstieg', 'Mannesallee 21, 21107 Hamburg',
     (), ['https://www.ekiz-reiherstieg.de/', 'https://www.ekiz-reiherstieg.de/angebot.html']),
    ('KiFaZ Dringsheide (Stiftung Das Rauhe Haus)', 'Kinder- und Familienzentrum Dringsheide', 'Dringsheide 3, 22119 Hamburg',
     ('Kinder- und Familienzentrum Dringsheide',), ['https://www.kifaz-dringsheide.de/unser-programm/regelmaessige-termine/']),
]
WD = r'(mo|di|mi|do|fr|sa|so)(?:ntag|nstag|ttwoch|nnerstag|eitag|mstag|nnabend|nntag)?s?'
WD_ANY = re.compile(r'\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)s?\b', re.I)
NOT_WEEKLY = re.compile(r'14-t[äa]g|vierzehnt|alle (zwei|2|drei|3|vier|4) wochen|alle 14 tage|im monat|einmal|jeden (ersten|zweiten|dritten|'
                        r'vierten|letzten|\d\.)|\d\. und \d\.|nach absprache|nach vereinbarung|in den ferien', re.I)
SKIP = re.compile(r'deutschkurs|sprachkurs|für erwachsene|fit & hip|coreszon|frauen und mütter|beratung|sprechstunde|frühstück|mittagessen|'
                  r'nähen|stadtteil|öffnungszeiten des büros|telefon|hotline|kita-platz|krankenschwester|job', re.I)
OPEN_HOURS = re.compile(r'öffnungs?zeit', re.I)


def exact_coords(names):
    """OSM coordinates by exact name only (a partial match would pick another church or Kita of the same name)."""
    if not names:
        return None, None
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        row = con.execute(f"SELECT lat, lon FROM source_records WHERE source_id='osm' AND lat IS NOT NULL AND name IN ({','.join('?' * len(names))})",
                          list(names)).fetchone()
        return row or (None, None)
    finally:
        con.close()


def wd_list(text):
    """Weekdays named in a text, ranges such as 'Dienstag bis Donnerstag' expanded."""
    t = text.lower()
    names = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']
    rng = re.search(r'\b(montag|dienstag|mittwoch|donnerstag|freitag)s?\s*(?:bis|-|–)\s*(dienstag|mittwoch|donnerstag|freitag|samstag)', t)
    if rng:
        return list(range(names.index(rng.group(1)), names.index(rng.group(2)) + 1))
    out = []
    for m in WD_ANY.finditer(t):
        w = m.group(1).replace('sonnabend', 'samstag')
        if names.index(w) not in out:
            out.append(names.index(w))
    return out


def title_inline(line, prev):
    """Name of an offer in a line that also carries weekday and time."""
    q = re.search(r'[„"]([^“"]{3,50})[“"]', line)
    if q:
        return q.group(1)
    m = WD_ANY.search(line)
    before = line[:m.start()].strip(' :,-–') if m else ''
    before = re.sub(r'^(jeden|immer|wöchentlich|ebenfalls)\b.*', '', before, flags=re.I).strip()
    if len(before.split()) >= 2 and not times(before)[0]:
        return before
    m = re.search(r'\b(?:eine?|einen)\s+((?:offene[nr]?\s+)?[\wÄÖÜäöüß-]+(?:gruppe|treff|café|cafe|kreis|zeit|stunde|spiel\w*))\b', line, re.I)
    if m:
        return m.group(1)[0].upper() + m.group(1)[1:]
    if prev and len(prev) < 50 and not WD_ANY.search(prev) and not times(prev)[0] and not prev.endswith(('.', ':', '!', '?')):
        return prev
    return None


def parse(lines, url, centre):
    provider, venue, address, osm, _ = centre
    lat, lon = exact_coords(osm)
    ekiz = venue.startswith('Eltern-Kind-Zentrum')  # Hamburg EKiZ are free of charge (except lunch)
    out, current_wd, structured = [], None, {}
    for i, line in enumerate(lines):
        if len(line) > 400:
            continue
        line = re.sub(r'zwischen (\d{1,2}(?:[:.]\d\d)?)(?: uhr)? und (\d{1,2}(?:[:.]\d\d)?)', r'\1 - \2', line, flags=re.I)
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        title, ctx, days, tf, tt = None, line, [], None, None
        if re.fullmatch(r'(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)', line, re.I):
            above = ' '.join(lines[max(0, i - 7):i])
            if OPEN_HOURS.search(above) and times(nxt)[0] and re.match(r'(von\s+)?\d', nxt, re.I):
                # 'Öffnungszeiten des EKiZ / Dienstag / von 09:00 bis 13:00 Uhr / Donnerstag / ...'
                title, ctx, days = 'Offener Eltern-Kind-Treff (Öffnungszeit)', f'{line} {nxt}', wd_list(line)
                tf, tt = times(nxt)
            else:
                current_wd = wd_list(line)[0]  # weekday heading of a structured week list
                continue
        if title:
            pass
        elif re.match(r'^\d{1,2}([:.]\d\d)?\s*(uhr\s*)?(-|–|bis)\s*\d{1,2}([:.]\d\d)?\s*uhr', line, re.I) and current_wd is not None \
                and not WD_ANY.search(line) and i + 1 < len(lines):
            # 'HH:MM - HH:MM Uhr' line under a weekday heading, the name follows (KiFaZ style)
            tf, tt = times(line)
            title = nxt
            if structured.setdefault(title, current_wd) != current_wd:
                current_wd = None  # the same list again (mobile copy) without weekday headings: stop
                continue
            desc = ' '.join(lines[i + 2:i + 5])
            ctx = f'{line} {nxt} {desc}'
            days = [current_wd]
        elif WD_ANY.search(line) or re.match(WD + r'\.?\s*[-–:]', line, re.I):
            days = wd_list(line)
            tf, tt = times(line)
            if not tf and nxt and not WD_ANY.search(nxt):
                tf, tt = times(nxt)
                ctx = f'{line} {nxt}'
            if not (days and tf):
                continue
            above = ' '.join(lines[max(0, i - 3):i])
            if OPEN_HOURS.search(above) and not re.search(r'[„"]', line):
                title = 'Offener Eltern-Kind-Treff (Öffnungszeit)'
            else:
                title = title_inline(line, lines[i - 1] if i else '')
        if not (title and days and tf):
            continue
        if NOT_WEEKLY.search(ctx) or SKIP.search(title) or SKIP.search(ctx[:120]) and not re.search(r'krabbel|eltern-kind|baby|kinder', title, re.I):
            continue
        title = strip_names(re.sub(r'\s+', ' ', title)).strip(' .,:')
        if not title or len(title) > 90:
            continue
        age = good_age(age_in(ctx))
        if age == (None, None) and re.search(r'baby|krabbel', title, re.I):
            age = (0, 18)
        for wd in sorted(set(days)):
            ref = f'{venue}:{re.sub(r"[^a-z0-9]+", "-", title.lower())[:40]}:{wd}:{tf}'
            if any(o['source_ref'] == ref for o in out):
                continue
            out.append(group(ref, title, url, provider, weekday=wd, schedule=f'{WEEKDAYS[wd]} {tf}{"–" + tt if tt else ""}, wöchentlich',
                             venue=venue, address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, price='kostenlos' if ekiz else None, free=1 if ekiz else None,
                             age=age, registration='nötig' if re.search(r'anmeld', ctx, re.I) and not re.search(r'ohne anmeldung', ctx, re.I) else 'offen',
                             description=None))
    return out


def main():
    offers = []
    for centre in CENTRES:
        got = []
        for url in centre[4]:
            try:
                got += parse(lines_of(page(url)), url, centre)
            except Exception as e:  # one broken site must not stop the others
                print(f'  {url}: {type(e).__name__} {str(e)[:60]}')
        print(f'  {centre[1]:45} {len(got)} groups')
        offers += got
    return finish(SOURCE_ID, 'Diakonie Hamburg: Eltern-Kind-Zentren und Familienzentren (Wochenangebote)', LIST,
                  'jeweiliges Eltern-Kind-Zentrum (siehe provider)', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
