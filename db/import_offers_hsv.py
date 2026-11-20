"""Import children's sport of the Hamburger SV: HSV e.V. 'Sport für Kinder' groups and the HSV-Fußballschule holiday camps.

One file, two sources (run both, or name source ids as arguments). Facts only; coaches' names are never stored.

- hsv_kindersport: HSV e.V. athletics department (HSV-Leichtathletik), pages 'Sport für Kinder' per site
  (https://leichtathletik.hsv.de/sport-fuer-kinder = Stadtpark/Jahnkampfbahn, /dulsberg/..., /norderstedt/..., /volkspark/...)
  and the U10 / U12 training groups (/u10, /u12). Each section has a 'Trainingszeiten' table (Wochentag, Gruppe, Uhrzeit,
  Ort); one weekly 'gruppe' per row. Most groups only take children from a waiting list (noted as registration).
  robots.txt: the subdomain serves no robots.txt (HTML page instead) = no rules.
- hsv_fussballschule: HSV-Fußballschule (HSV Fußball AG) holiday camps, table on
  https://www.hsv.de/fans/familie/fussballschule/trainingscamps-2027 (date range with times, camp, address, price, status),
  linked to each camp's own booking page. Kept: camps in Hamburg and the nearby towns (postcodes below); fully booked camps
  ('Ausgebucht') are left out, waiting-list camps are kept as such. Ages 6 to 13 as stated on the page.
  robots.txt of www.hsv.de: only /api/ and /styleguide are blocked.
Checked, nothing with weekday + time: HSV e.V. sportangebote.hsv.de (course booking: currently only youth tennis and
inclusion courses, no children's holiday offers), HSV Barmbek-Uhlenhorst (hsv-bu.de, Wix: Kleinkinderturnen with an
intake stop and no times, youth football teams without training times, BU-Camp 2027 not yet dated).
"""
import re
import sys
from datetime import date

from import_offers_sportvereine import ages, place
from offers_util import WEEKDAYS, age_of, clean, finish, get, group, termin

LA = 'https://leichtathletik.hsv.de'
LA_PAGES = {'/sport-fuer-kinder': 'Stadtpark', '/dulsberg/sport-fuer-kinder': 'Dulsberg', '/norderstedt/sport-fuer-kinder': 'Norderstedt',
            '/volkspark/sport-fuer-kinder': 'Volkspark', '/u10': 'Leichtathletik U10', '/u12': 'Leichtathletik U12'}
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
# Venues named in the tables -> (address, OSM name) where the table gives no full address
VENUES = {'Jahnkampfbahn': ('Linnering 5, 22299 Hamburg', 'Jahnkampfbahn'), 'HSV-Zentrum am Volkspark': (None, 'HSV-Zentrum'),
          'Königshütter': ('Königshütter Straße, 22049 Hamburg', None), 'Carl-Cohn': ('Carl-Cohn-Straße 2, 22297 Hamburg', None)}
CAMPS = 'https://www.hsv.de/fans/familie/fussballschule/trainingscamps-2027'
# Hamburg postcodes plus the nearby towns (about 25 km): Norderstedt, Schenefeld, Wedel, Halstenbek, Rellingen, Appen,
# Barsbüttel, Stapelfeld, Ahrensburg, Ammersbek, Tangstedt, Siek, Wentorf/Reinbek, Seevetal, Neu Wulmstorf, Rosengarten.
NEAR = re.compile(r'^(20\d\d\d|210[2-9]\d|211[0-4]\d|22[0-7]\d\d|2284[4-9]|2285[01]|22869|22880|22885|22889|22926|22949|22962|'
                  r'25469|25462|25482|21465|2121[78]|21224|21629)$')


def hm(s):
    return s.replace('.', ':').zfill(5)


def birth_years(text, year):
    ys = sorted({int(y) for y in re.findall(r'\b(20[012]\d)\b', text)})
    if not ys:
        return None, None
    return (year - ys[-1] - 1) * 12, (year - ys[0] + 1) * 12


def kindersport():
    year = date.today().year
    offers = []
    for path, site in LA_PAGES.items():
        html = get(LA + path).text
        for sec in re.split(r'<section', html)[1:]:
            heads = [clean(x) for x in re.findall(r'(?s)<h3[^>]*>(.*?)</h3>', sec)]
            name = next((h for h in heads if not re.match(r'(?i)trainingszeiten|wichtige hinweise', h)), '')
            header = [clean(x).lower() for x in re.findall(r'(?s)<th[^>]*>(.*?)</th>', sec)]
            rows = [[clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', r)] for r in re.findall(r'(?s)<tr[^>]*>(.*?)</tr>', sec)]
            rows = [r for r in rows if r]
            if not rows:
                continue
            waiting = bool(re.search(r'warteliste', sec, re.I))
            for r in rows:
                cols = dict(zip(header, r)) if len(header) == len(r) else dict(zip(['wochentag', 'uhrzeit', 'ort'] if len(r) == 3 else
                                                                                    ['wochentag', 'gruppe', 'uhrzeit', 'ort'], r))
                wd = DAYS.get((cols.get('wochentag') or '').lower())
                t = re.search(r'(\d{1,2}[.:]\d\d)\s*[–-]\s*(\d{1,2}[.:]\d\d)', cols.get('uhrzeit', ''))
                if wd is None or not t:
                    continue
                tf, tt = hm(t.group(1)), hm(t.group(2))
                grp = re.sub(r'\*', '', cols.get('gruppe', '')).strip()
                where = re.sub(r'\*', '', cols.get('ort', '')).strip()
                jg = re.match(r'(\d+)\s*(?:Jahre)?\s*[–-]\s*Jahrgang (20\d\d)', grp)
                if jg:  # '4 Jahre – Jahrgang 2019': from age 4 up to the children born in 2019
                    age = (int(jg.group(1)) * 12, (year - int(jg.group(2)) + 1) * 12)
                else:
                    age = ages(grp.replace('ca. ', '')) if grp else (None, None)
                if age[0] is None:
                    age = birth_years(f'{grp} {name}', year)
                if age[0] is None and re.search(r'\d', grp):
                    m = re.match(r'(\d+)\s*[–-]', grp)
                    age = (int(m.group(1)) * 12, None) if m else age
                label = name if site.startswith('Leichtathletik') else f'Sport für Kinder {site}: {name}' if name and name != 'Sport für Kinder' else f'Sport für Kinder {site}'
                if site.startswith('Leichtathletik'):
                    label = f'{site} ({name})' if name else site
                title = f'{label} – {grp}' if grp and grp not in label else label
                first = re.split(r'\s*/\s*', where)[0]
                key = next((k for k in VENUES if k in where), None)
                if re.search(r'\d{5}', where):
                    address = where
                elif re.search(r'\d', first):  # 'Knauerstraße 22 / Jahnkampfbahn': the school hall named first
                    address, key = f'{first}, Hamburg', None
                else:
                    address = VENUES[key][0] if key else None
                lat = lon = None
                if key and VENUES[key][1]:
                    from offers_util import osm_coords
                    lat, lon = osm_coords(VENUES[key][1])
                if lat is None:
                    lat, lon, addr2 = place(first, address)
                    address = address or addr2
                offers.append(group(f'{path}:{name[:20]}:{wd}:{tf}:{grp[:12]}', title, LA + path, 'HSV e.V. (Leichtathletik, Sport für Kinder)',
                                    weekday=wd, venue=where.split(',')[0] or site, address=address, lat=lat, lon=lon, time_from=tf, time_to=tt,
                                    age=age, registration='Warteliste' if waiting else 'Mitgliedschaft im HSV e.V.',
                                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich', topic='sport'))
    return finish('hsv_kindersport', 'HSV e.V.: Sport für Kinder und Leichtathletik U10/U12', LA + '/sport-fuer-kinder',
                  'HSV e.V. (Leichtathletik, Sport für Kinder)', offers)


def fussballschule():
    html = get(CAMPS).text
    text = clean(html)
    m = re.search(r'Alter von (\w+) .*? bis (\d+) Jahren', text)
    words = {'fünf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8}
    age = ((words.get(m.group(1), 6)) * 12, (int(m.group(2)) + 1) * 12) if m else (72, 168)
    offers = []
    for row in re.findall(r'(?s)<tr[^>]*>(.*?)</tr>', html):
        cells = [clean(c) for c in re.findall(r'(?s)<td[^>]*>(.*?)</td>', row)]
        if len(cells) < 5:
            continue
        when, camp, address, price, status = cells[:5]
        d = re.match(r'(\d\d)\.(\d\d)\.(\d{4}),\s*(\d\d[.:]\d\d)\s*[–-]\s*(\d\d)\.(\d\d)\.(\d{4}),\s*(\d\d[.:]\d\d)', when)
        plz = re.search(r'\b(\d{5})\b', address)
        if not d or not plz or not NEAR.match(plz.group(1)) or re.search(r'ausgebucht', status, re.I):
            continue
        start = date(int(d.group(3)), int(d.group(2)), int(d.group(1)))
        end = date(int(d.group(7)), int(d.group(6)), int(d.group(5)))
        link = re.search(r'href="(https://fussballschule\.hsv\.de/[^"]+)"', row)
        addr = re.sub(r',\s*(\d{5}),\s*', r', \1 ', address)
        lat, lon, _ = place(camp, addr)
        title = re.sub(r'^Trainingscamp', 'HSV-Fußballschule: Feriencamp', camp)
        title = title if title.startswith('HSV') else f'HSV-Fußballschule: {title}'
        offers.append(termin(f'camp:{start}:{camp[:30]}', title, start, link.group(1) if link else CAMPS, 'HSV-Fußballschule',
                             venue=re.sub(r'^Indoor-Camp \((.*)\)$|^(?:Trainings|Leistungs|Mädchen)camp\s*(?:in|beim|am|auf)?\s*', lambda m: m.group(1) or '', camp).strip() or camp,
                             address=addr, lat=lat, lon=lon,
                             time_from=hm(d.group(4)), time_to=hm(d.group(8)), end=end, price=price.replace('€', ' €'), age=age,
                             registration='Warteliste' if re.search(r'warteliste', status, re.I) else 'nötig (Online-Anmeldung)', topic='sport'))
    return finish('hsv_fussballschule', 'HSV-Fußballschule: Feriencamps in Hamburg und Umgebung', CAMPS, 'HSV-Fußballschule', offers)


SOURCES = {'hsv_kindersport': kindersport, 'hsv_fussballschule': fussballschule}


def main(names=None):
    ok = False
    for sid in names or SOURCES:
        try:
            ok = bool(SOURCES[sid]()) or ok
        except SystemExit as e:
            print(e)
        except Exception as e:  # one source failing must not stop the other
            print(f'{sid}: {type(e).__name__}: {e}')
    return ok


if __name__ == '__main__':
    sys.exit(0 if main(sys.argv[1:]) else 1)
