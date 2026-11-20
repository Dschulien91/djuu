"""Market days and times for the weekly markets of the open-data register (source hh_wochenmarkt has no times).

Sources (all hamburg.de, the city's own market pages; robots.txt '*' allows /freizeit/ and /politik-und-verwaltung/,
no AI crawler is named there, no reuse clause found on the pages):
  - market portal https://www.hamburg.de/freizeit/maerkte-und-messen/wochenmaerkte plus its seven weekday pages
    (".../wochenmaerkte/montag-340016" ...) and the trader page ".../wochenmaerkte/informationen-fuer-haendler":
    together they link one profile page per market. Each profile has a block "Öffnungszeiten und Anfahrt"
    with lines such as "Dienstag: 12:30 Uhr bis 17 Uhr".
  - Bezirk Hamburg-Mitte's own list https://www.hamburg.de/politik-und-verwaltung/bezirke/mitte/themen/freizeit/wochenmarkt-67140
    and the trader page (one block per market, "Dienstags von 9 Uhr bis 13 Uhr und freitags ..."). All three kinds of
    pages are candidates; the best name match wins, profile pages win ties. Fischmarkt and St. Pauli Nachtmarkt have
    seasonal times, set by hand in FIXED from the named pages.
Markets without any page (18 of 80 on 19 Nov 2026, probably ended or private without a city page) get no record.
The pages say "Alle Angaben unter Vorbehalt"; the app shows the link.

Records: one per hh_wochenmarkt market with times, category 'wochenmarkt', name and lat/lon copied from the
hh_wochenmarkt record (read at run time), so merge.py joins it to that market's place. Facts: opening_hours (OSM syntax),
website (the page the times come from), note (seasonal or partial markets, <= 200 characters).
Matching profile -> register record: distinctive street/place words of both names (see MATCH_HINTS for the odd ones).

Run: cd db && python import_wochenmarkt_zeiten.py   (about 75 requests to hamburg.de, honours robots.txt, ~2 min)
     --cached reuses data/raw/wochenmarkt_zeiten.json instead of fetching again.
"""
import json
import re
import sys
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from common import RAW_DIR, connect, register_source, replace_records
from offers_util import get

SOURCE_ID = 'hh_wochenmarkt_zeiten'
BASE = 'https://www.hamburg.de'
PORTAL = BASE + '/freizeit/maerkte-und-messen/wochenmaerkte'
TRADERS = PORTAL + '/informationen-fuer-haendler'
MITTE = BASE + '/politik-und-verwaltung/bezirke/mitte/themen/freizeit/wochenmarkt-67140'
CACHE = RAW_DIR / 'wochenmarkt_zeiten.json'
NOT_PROFILES = re.compile(r'/(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|bummel|saisonkalender|fruehe-marktzeiten|'
                          r'ausfaelle-und-verschiebungen|informationen-fuer-haendler)[-/]|/informationen-fuer-haendler$')

DAYS = {'montag': 'Mo', 'dienstag': 'Tu', 'mittwoch': 'We', 'donnerstag': 'Th', 'freitag': 'Fr', 'samstag': 'Sa',
        'sonnabend': 'Sa', 'sonntag': 'Su'}
ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
DAY = r'(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)s?'
TIME = r'\d{1,2}(?:[:.]\d{2})?'
SLOT = re.compile(rf'({DAY}(?:\s*(?:,|und|bis|-|–|/)\s*{DAY})*)\s*(?:\([^)]*\))?\s*(?:von)?\s*[:|,]?\s*(?:von)?\s*:?\s*({TIME})\s*(?:uhr)?\s*(?:-|–|bis)\s*(?:uhr\s*)?({TIME})\s*(?:uhr)?', re.I)

# Register name (without "Wochenmarkt ") -> words that identify its profile or block when the names differ.
MATCH_HINTS = {
    'Altonaer Fischmarkt': ['fischmarkt-sonntag'],
    'Große Elbstraße': ['grosse-elbstrasse'],
    'Große Bergstraße': ['neue-grosse-bergstrasse'],
    'Chrysanderallee': ['chrysander'],
    'Alte Elbgauallee': ['alte-elbgaustrasse'],
    'Wiesendamm / Bert-Kaempfert-Platz': ['bert-kaempfert'],
    'Eppendorfer Landstraße / Marie-Jonas-Platz': ['marie-jonas'],
    'Gustav-Falk-Straße': ['schlump', 'gustav-falke'],
    'Museum für Völkerkunde': ['markk'],
    'Volksdorfer Wochenmarkt': ['volksdorf'],
    'Rolfinckstraße': ['wellingsbuettel', 'rolfinck'],
    'Herthastraße': ['bramfeld', 'hertha'],
    'Berner Heerweg': ['farmsen-berne', 'berner-heerweg'],
    'Brunskrogweg': ['wohldorf-ohlstedt', 'brunskrog'],
    'Eckhoffplatz': ['lurup', 'eckhoff'],
    'Osdorfer Landstraße': ['gross-flottbek', 'osdorfer-landstrasse'],
    'Spritzenplatz': ['ottensen', 'spritzenplatz'],
    'Blankeneser Bahnhofstraße': ['altona-blankenese', 'blankeneser-bahnhof'],
    'Nienstedter Marktplatz': ['nienstedten'],
    'Neugrabener Markt / Marktpassage': ['neugrabener'],
    'Sand / Schlossmühlendamm': ['harburg-sand'],
    'Isemarkt': ['isestrasse', 'isemarkt'],
    'Hammerbrook Schwabenplatz': ['schwabenplatz'],
    'St. Pauli Spielbudenplatz': ['nachtmarkt'],
    'Altstadt Burchardplatz': ['burchardplatz'],
    'Lohbrügger Markt': ['lohbruegge'],
    'Fleetplatz': ['fleetplatz', 'allermoehe'],
    'Werner-Neben-Platz': ['werner-neben', 'bergedorf-west'],
    # Second register point on the Isemarkt (Bezirk given as Altona, 500 m along the same street): same market.
    'Isestraße': ['isestrasse', 'isemarkt'],
    # Not the Eidelstedt market "Alte Elbgaustraße" (1.1 km away, own register point); no page found.
    'Elbgaustraße': [],
}
GENERIC_WORDS = {'markt', 'wochenmarkt', 'billstedt', 'wilhelmsburg', 'pauli', 'hamburg', 'platz', 'strasse', 'alte', 'ring',
                 'allee', 'damm', 'chaussee', 'landstrasse', 'stra', 'neue', 'grosse'}
ALTONA = BASE + '/politik-und-verwaltung/bezirke/altona/themen/freizeit-kultur/wochenmaerkte'
# Seasonal times that the generic parser cannot express; checked by hand on the named page (19 Nov 2026).
FIXED = {
    'Altonaer Fischmarkt': (ALTONA, 'Mar 15-Nov 15 Su 05:00-09:30; Nov 16-Mar 14 Su 07:00-09:30',
                            'Hamburger Fischmarkt, nur sonntags; im Winter ab 7 Uhr.'),
    'St. Pauli Spielbudenplatz': (PORTAL + '/st-pauli-nachtmarkt-314978', 'Jan-Feb,Oct We 16:00-21:00; Mar-Sep We 16:00-22:00',
                                  'St. Pauli Nachtmarkt; für November und Dezember nennt die Seite keine Zeiten.'),
}
PRIVATE = re.compile(r'food lovers|privat', re.I)


def fold(s):
    s = (s or '').lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def text_of(html):
    s = BeautifulSoup(html, 'html.parser')
    m = s.find('main') or s.body
    for x in m(['script', 'style', 'noscript', 'svg']):
        x.decompose()
    return [l.strip() for l in m.get_text('\n').splitlines() if l.strip()], m


def hours(text):
    """German market times -> OSM opening_hours, e.g. 'Dienstags und freitags von 8 bis 13 Uhr' -> 'Tu,Fr 08:00-13:00'."""
    def hm(t):
        h, _, m = t.replace('.', ':').partition(':')
        return f'{int(h):02d}:{m or "00"}'
    slots = {}
    for days, t1, t2 in SLOT.findall(text):
        found = [DAYS[re.sub(r's$', '', d.lower())] for d in re.findall(DAY, days, re.I)]
        if re.search(r'\bbis\b|[-–]', days) and len(found) == 2:  # 'Montags bis samstags'
            a, b = ORDER.index(found[0]), ORDER.index(found[1])
            found = ORDER[a:b + 1]
        rng = f'{hm(t1)}-{hm(t2)}'
        for d in found:
            if rng not in slots.setdefault(d, []):
                slots[d].append(rng)
    groups = {}
    for d in ORDER:
        if d in slots:
            groups.setdefault(','.join(slots[d]), []).append(d)
    parts = []
    for rng, ds in sorted(groups.items(), key=lambda g: ORDER.index(g[1][0])):
        idx = [ORDER.index(d) for d in ds]
        if len(ds) >= 3 and idx == list(range(idx[0], idx[-1] + 1)):
            parts.append(f'{ds[0]}-{ds[-1]} {rng}')
        else:
            parts.append(f'{",".join(ds)} {rng}')
    return '; '.join(parts)


def profile(title, lines):
    """Title, hours block and address of a market profile page (lines of visible text)."""
    block = ''
    for i, l in enumerate(lines):
        if not re.match(r'(Öffnungszeiten|Markttage?|Marktzeiten)(\s|:|$)', l):
            continue
        if not re.search(DAY, ' '.join(lines[i + 1:i + 3]), re.I):
            continue  # table of contents
        j = next((k for k in range(i + 1, min(len(lines), i + 14)) if re.match(r'Adresse|Hier finden Sie|Haltestelle|Anzahl der Stände|Wochenmärkte$|Kontakt$|Ansprechpartner', lines[k])), min(len(lines), i + 8))
        cand = ' | '.join(lines[i + 1:j])
        if SLOT.search(cand):
            block = cand
            break
    addr = next((lines[k + 1] for k, l in enumerate(lines[:-1]) if l.startswith('Adresse')), None)
    return {'title': title, 'times': block, 'address': addr}


def crawl():
    """Profile pages {url: {'h1', 'lines'}} and the text lines of the two list pages; kept in CACHE for reruns."""
    links = set()
    portal = get(PORTAL).text
    hubs = [PORTAL] + sorted({urljoin(BASE, h) for h in re.findall(r'href="(/freizeit/maerkte-und-messen/wochenmaerkte/(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)-\d+)"', portal)}) + [TRADERS]
    pages = {PORTAL: portal}
    for h in hubs[1:]:
        pages[h] = get(h).text
    for h, html in pages.items():
        for href in re.findall(r'href="([^"]*/freizeit/maerkte-und-messen/(?:wochenmaerkte|foodmaerkte)/[a-z0-9-]+-\d+)"', html):
            u = urljoin(BASE, href)
            if not NOT_PROFILES.search(u):
                links.add(u)
    profiles = {}
    for u in sorted(links):
        try:
            html = get(u).text
        except Exception as e:
            print(f'  {u}: {type(e).__name__} {e}')
            continue
        lines, main = text_of(html)
        h1 = main.find('h1')
        profiles[u] = {'h1': h1.get_text(' ', strip=True) if h1 else '', 'lines': lines}
    lists = {'traders': text_of(pages[TRADERS])[0], 'mitte': text_of(get(MITTE).text)[0]}
    CACHE.write_text(json.dumps({'profiles': profiles, 'lists': lists}, ensure_ascii=False, indent=1), encoding='utf-8')
    return profiles, lists


def list_blocks(lines):
    """Bezirk/trader list pages: (heading, text up to the next 'Marktzeiten' heading)."""
    out = []
    starts = [k for k, l in enumerate(lines) if re.match(r'Mark?t?zeiten|Markttage', l) and k > 0]
    for n, k in enumerate(starts):
        end = starts[n + 1] - 1 if n + 1 < len(starts) else len(lines)
        body = ' '.join(lines[k + 1:end])
        body = re.split(r'Kontakt|Marktmeister|Ansprechpartner|Die Standgebühren|Alle Angaben', body)[0]
        out.append((lines[k - 1], body))
    return out


def mitte_blocks(lines):
    """Hamburg-Mitte page: 'Billstedt' / 'Möllner Landstraße' / 'Dienstag | 9–13 Uhr' ..."""
    out, cur = [], None
    for l in lines:
        if SLOT.search(l):
            if cur: cur[1].append(l)
        elif cur is None or cur[1]:
            cur = [l, []]; out.append(cur)
        else:
            cur[0] += ' ' + l
    return [(h, ' '.join(b)) for h, b in out if b]


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    con = connect()
    register_source(con, SOURCE_ID, 'Hamburg.de: Marktzeiten der Wochenmärkte', PORTAL, 'Fakten mit Link',
                    'Freie und Hansestadt Hamburg, hamburg.de', 55)
    markets = con.execute("SELECT source_ref, name, lat, lon FROM source_records WHERE source_id='hh_wochenmarkt'").fetchall()
    if '--cached' in sys.argv and CACHE.exists():
        d = json.loads(CACHE.read_text(encoding='utf-8')); profiles, lists = d['profiles'], d['lists']
    else:
        profiles, lists = crawl()
    profiles = {u: profile(p['h1'], p['lines']) for u, p in profiles.items()}
    print(f'{len(profiles)} profile pages')
    candidates = []  # (key text, url, raw times, priority)
    for u, p in profiles.items():
        if p['times']:
            candidates.append((fold(u.rsplit('/', 1)[1] + ' ' + p['title'] + ' ' + (p['address'] or '')), u, p['times'], 0))
    for h, body in mitte_blocks(lists['mitte']):
        candidates.append((fold(h), MITTE, body, 1))
    for h, body in list_blocks(lists['traders']):
        candidates.append((fold(h), TRADERS, body, 2))

    records, missing = [], []
    for ref, name, lat, lon in markets:
        short = re.sub(r'^Wochenmarkt\s+', '', name)
        hints = MATCH_HINTS[short] if short in MATCH_HINTS else [w for w in fold(short).split('-') if len(w) > 3 and w not in GENERIC_WORDS]
        best = None
        for key, url, raw, prio in candidates:
            score = sum(1 for w in hints if w in key)
            if score and (best is None or (score, -prio) > (best[0], -best[3])):
                best = (score, url, raw, prio)
        if short in FIXED:
            url, oh, note = FIXED[short]
            raw = None
        elif best:
            url, raw = best[1], best[2]
            oh = hours(raw)
            note = 'Teils privater Food Lovers Market auf demselben Platz.' if PRIVATE.search(raw) else None
        else:
            oh = ''
        if not oh:
            missing.append(name); continue
        print(f'  {name} <- {url.rsplit("/", 1)[1]}: {oh}')
        records.append({'ref': ref, 'category': 'wochenmarkt', 'name': name, 'lat': lat, 'lon': lon, 'url': url,
                        'raw': {'times': raw[:300]} if raw else None,
                        'facts': {'opening_hours': oh, 'website': url, 'note': note}})
    n = replace_records(con, SOURCE_ID, records)
    print(f'{n} markets with times, {len(missing)} without:')
    for m in sorted(missing):
        print('   -', m)
    merge_check(con, records)
    return n


def merge_check(con, records):
    """Dry run of merge.py's rule for these records (read-only): which place each one would join."""
    from merge import MATCH_M, compatible, dist, similar
    places = con.execute("SELECT id, name, category, lat, lon FROM places WHERE category='wochenmarkt' OR category IN ('laden','imbiss')").fetchall()
    new = 0
    for r in records:
        best, bd = None, MATCH_M
        for pid, pname, cat, la, lo in places:
            if abs(la - r['lat']) > 0.002 or abs(lo - r['lon']) > 0.003: continue
            if not compatible(r['category'], cat) or not similar(r['name'], pname): continue
            d = dist(r['lat'], r['lon'], la, lo)
            if d < bd: best, bd = (pid, pname), d
        if not best: new += 1
        print(f"  {'->' if best else 'NEW'} {r['name']}: {r['facts']['opening_hours']}" + (f'  [{best[0]} {best[1]}, {bd:.0f} m]' if best else ''))
    print(f'merge check: {len(records) - new} attach, {new} new')


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
