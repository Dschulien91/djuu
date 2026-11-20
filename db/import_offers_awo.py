"""Import the open family groups of AWO Hamburg (Arbeiterwohlfahrt Landesverband Hamburg e.V.).

Sources (robots.txt: Yoast default, nothing disallowed):
- https://www.awo-hamburg.de/kinder-jugend-familie/kinder-jugend-und-familienhilfezentren/kifaz/ links the current
  'Wochenprogramm' PDF of the KiFaZ Farmsen-Berne; its table (weekday columns) gives title, age and time of each group.
- https://www.awo-hamburg.de/kinder-jugend-familie/eltern-kind-zentren/ gives the opening hours of the two AWO
  Eltern-Kind-Zentren (open drop-in for families with children 0-6, free, no registration).
Kept: groups for babies, children and parents (PEKiP-like, Frühstück, Spielgruppe, Babytreff, Hebammensprechstunde ...);
dropped: Kleiderkammer, social/language counselling for adults. Leaders' names on the pages are never stored.
The AWO Sola flyers (Billstedt) are images without text, so Sola is not imported.
Terms: impressum has no reuse clause.
"""
import io
import json
import re
import sys
import unicodedata

import pdfplumber

from common import DB_PATH
from offers_util import WEEKDAYS, age_of, clean, finish, get, group

SOURCE_ID = 'awo_hamburg'
BASE = 'https://www.awo-hamburg.de'
PROVIDER = 'AWO Hamburg'
KIFAZ_PAGE = BASE + '/kinder-jugend-familie/kinder-jugend-und-familienhilfezentren/kifaz/'
EKIZ_PAGE = BASE + '/kinder-jugend-familie/eltern-kind-zentren/'
KIFAZ = ('AWO KiFaZ Farmsen-Berne', 'Marie-Bautz-Weg 11, 22159 Hamburg')
EKIZ = [  # (marker on the page, venue, address)
    ('Tegelsbarg 2h', 'AWO Eltern-Kind-Zentrum Löwenzahn', 'Tegelsbarg 2h, 22399 Hamburg'),
    ('Fanny-Lewald-Ring 130', 'AWO Eltern-Kind-Zentrum Johanna-Kirchner-Haus', 'Fanny-Lewald-Ring 130a, 21035 Hamburg'),
]
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
SKIP = re.compile(r'kleiderkammer|sozialberatung|sprechen deutsch|entwicklungs|termin nach', re.I)
TIME = re.compile(r'(\d{1,2}[:.]\d\d)\s*[–-]\s*(\d{1,2}[:.]\d\d)')


ADDR_INDEX = DB_PATH.parent / 'raw' / 'addresses.json'  # offline OSM address index (built by tools/redaktion_build.py)
_idx = {}


def norm_street(s):
    s = unicodedata.normalize('NFKC', s or '').lower().replace('ß', 'ss')
    s = re.sub(r'(str\.|strasse)(?=\W|$)', 'strasse', s)
    return re.sub(r'[^a-z0-9äöü]', '', s)


def coords(address):
    """'Musterstraße 12a, 22000 Hamburg' -> (lat, lon) of the house number from the local OSM address index."""
    if not _idx:
        try:
            _idx.update(json.loads(ADDR_INDEX.read_text(encoding='utf8')))
        except (OSError, ValueError):
            _idx['-'] = None
    m = re.match(r'\s*([^,\d]+?)\s+(\d+(?:\s?[a-zA-Z](?![a-zA-Z]))?)', address or '')
    if not m:
        return None, None
    hit = _idx.get(f'{norm_street(m.group(1))}|{m.group(2).lower().replace(" ", "")}')
    return tuple(hit) if hit else (None, None)


def hhmm(t):
    h, m = re.split(r'[:.]', t)
    return f'{int(h):02d}:{m}'


def kifaz():
    page = get(KIFAZ_PAGE).text
    pdf = re.search(r'href="([^"]+Wochenprogramm[^"]+\.pdf)"', page, re.I)
    if not pdf:
        print('  KiFaZ: no Wochenprogramm PDF linked')
        return []
    url = pdf.group(1)
    lat, lon = coords(KIFAZ[1])
    out = []
    with pdfplumber.open(io.BytesIO(get(url).content)) as doc:
        for table in doc.pages[0].extract_tables():
            if not table or not table[0] or 'montag' not in (table[0][0] or '').lower():
                continue
            days = [DAYS.get((c or '').strip().lower()) for c in table[0]]
            for row in table[1:]:
                for col, cell in enumerate(row):
                    if not cell or col >= len(days) or days[col] is None:
                        continue
                    text = re.sub(r'-\n(und|oder)\b', r'- \1', cell)  # 'Schwangeren-\nund Babytreff'
                    text = re.sub(r'-\n(?=[a-zäöü])', '', text)  # 'Hebammen-\nsprechstunde'
                    text = re.sub(r'\s*-\n', '-', text)  # 'Eltern-\nKind', 'Eltern-Kind\n-Frühstück'
                    text = re.sub(r'\s*\n\s*', ' ', text)
                    tm = TIME.search(text)
                    if not tm or SKIP.search(text):
                        continue
                    title = clean(text[:tm.start()])
                    note = clean(text[tm.end():].replace('Uhr', ''))
                    title = re.sub(r'\s*\d+\s*[–-]\s*\d+\s*(Jahre|J)\b.*$', '', title).replace(' -Frühstück', '-Frühstück').strip(' ,')
                    title = re.sub(r'\s*für Kinder von$', '', title)
                    am = re.search(r'(\d+)\s*[–-]\s*(\d+)\s*(Jahre|J)\b', text)
                    age = (int(am.group(1)) * 12, int(am.group(2)) * 12 + 12) if am else age_of(text)
                    if age == (None, None) and re.search(r'baby', text, re.I):
                        age = (0, 12)
                    wd = days[col]
                    tf, tt = hhmm(tm.group(1)), hhmm(tm.group(2))
                    sched = f'{WEEKDAYS[wd]} {tf}–{tt}'
                    m = re.search(r'\(([^)]*monat[^)]*)\)|14-tägig[^\d]*', text, re.I)
                    if m:
                        sched += ', ' + clean(m.group(0)).strip('() ,')
                    if re.search(r'anmeldung', text + note, re.I):
                        reg = 'nötig'
                    else:
                        reg = 'offen'
                    title = re.sub(r'\s*\((jeden|letzten)[^)]*\)?', '', title).replace('14-tägig, ungr. KW', '').strip(' ,')
                    out.append(group(f'kifaz:{wd}:{tf}:{title.lower()}', title, KIFAZ_PAGE, PROVIDER, weekday=wd, schedule=sched,
                                     venue=KIFAZ[0], address=KIFAZ[1], lat=lat, lon=lon, time_from=tf, time_to=tt,
                                     price='kostenlos', free=1, age=age, registration=reg))
    return out


def ekiz():
    text = clean(get(EKIZ_PAGE).text)
    out = []
    for marker, venue, address in EKIZ:
        i = text.find(marker)
        m = i >= 0 and re.search(r'Öffnungszeiten:?\s*(\w+)\s*[–-]\s*(\w+):?\s*(\d{1,2}[:.]\d\d)\s*[–-]\s*(\d{1,2}[:.]\d\d)', text[i:i + 400])
        if not m or m.group(1).lower() not in DAYS or m.group(2).lower() not in DAYS:
            print(f'  {venue}: opening hours not found')
            continue
        d1, d2 = DAYS[m.group(1).lower()], DAYS[m.group(2).lower()]
        tf, tt = hhmm(m.group(3)), hhmm(m.group(4))
        lat, lon = coords(address)
        out.append(group(f'ekiz:{marker}', 'Offener Treff im Eltern-Kind-Zentrum', EKIZ_PAGE, PROVIDER, weekday=d1,
                         schedule=f'{WEEKDAYS[d1]}–{WEEKDAYS[d2]} {tf}–{tt}', venue=venue, address=address, lat=lat, lon=lon,
                         time_from=tf, time_to=tt, price='kostenlos', free=1, age=(0, 72), registration='offen', topic='krabbelgruppe'))
    return out


def main():
    return finish(SOURCE_ID, 'AWO Hamburg: Eltern-Kind-Zentren und KiFaZ-Gruppen', EKIZ_PAGE, PROVIDER, kifaz() + ekiz())


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
