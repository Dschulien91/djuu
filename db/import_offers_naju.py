"""Import the NAJU Hamburg children's nature groups (Kindergruppen, 6 to 12 years) with weekday, time and meeting point.

Source: https://www.naju-hh.de/mach-mit/kinder/c3-bcbersicht-kindergruppen/ (the NAJU Hamburg site that hamburg.nabu.de links
to; the old domain naju-hamburg.de fails at the TLS handshake and answers 403/409 over http) and each group page linked
there ('Mehr Infos zur Gruppe hier'). From the 'Gruppeninfo' block: age, meeting rhythm (14-täglich), weekday, time and
meeting point. Leaders' first names on the pages are never stored. The yearly group fee is published by NABU Hamburg
(hamburg.nabu.de, NAJU-Kindergruppe page). NAJU's dated events (termin-übersicht) are for 16-27 year olds or trainings,
so none are imported; NABU Hamburg's own family events come from import_offers_natur (nabu_hamburg).
robots.txt: '*' may read everything except /app/ and /j/; Crawl-delay 5 is honoured by get().
"""
import re
import sys
from urllib.parse import unquote, urljoin

from import_offers_sportvereine import place
from offers_util import WEEKDAYS, age_of, clean, finish, get, group, osm_coords

SOURCE_ID = 'naju_hamburg'
BASE = 'https://www.naju-hh.de'
LIST = BASE + '/mach-mit/kinder/c3-bcbersicht-kindergruppen/'
PROVIDER = 'NAJU Hamburg (Naturschutzjugend im NABU)'
PRICE = '150 € pro Jahr (inkl. Kindermitgliedschaft)'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
# Meeting points named on the pages -> OSM names for the map pin
OSM = {'HausDrei': 'Haus Drei', 'Brookhus': 'BrookHus', 'Raakmoor': 'Raakmoor', 'Krupunder See': 'Krupunder See',
       'Klein Flottbek': 'Klein Flottbek', 'Stadtpark': 'Planetarium', 'Wasserturm': 'Vereinshaus Wasserturm e.V.',
       'Sülldorf': 'Sülldorf'}


def main():
    html = get(LIST).text
    links = re.findall(r'href="([^"#]*/mach-mit/kinder-jugendliche/[^"#]+)"', html)
    names = re.findall(r'Gruppe ([A-ZÄÖÜ][\wäöüß-]+): (Die [\wäöüß-]+)', clean(html))  # 'Gruppe Altona: Die Stadtfüchse'
    offers = []
    for href in dict.fromkeys(links):
        url = urljoin(BASE, href)
        text = clean(get(url).text)
        slug = unquote(url.rstrip('/').rsplit('/', 1)[1])
        district = next(((d, n) for d, n in names if slug.startswith(d.lower())), None)
        if district:
            title = f'NAJU-Kindergruppe {district[0]} „{district[1]}“'
        else:  # 'west-klein-flottbek' -> 'NAJU-Kindergruppe West (Klein Flottbek)'
            head, _, rest = slug.partition('-')
            title = f'NAJU-Kindergruppe {head.title()}' + (f' ({rest.replace("-", " ").title()})' if rest else '')
        info = text[text.find('Gruppeninfo'):]
        if 'Gruppeninfo' not in text:
            continue
        info = re.split(r'\s(?:Leitung|Kontakt)\s?:', info)[0]
        m = re.search(r'(?:Treffen|Termin):\s*(.*?)\s(?:Ort|Treffpunkt)', info)
        when = m.group(1) if m else ''
        wd = next((d for k, d in DAYS.items() if k in when.lower()), None)
        t = re.search(r'(\d{1,2})(?::(\d\d))?\s*(?:Uhr)?\s*(?:-|bis|–)\s*(\d{1,2})(?::(\d\d))?\s*Uhr', when)
        if wd is None or not t:
            print(f'  {slug}: no weekday/time in {when[:60]!r}')
            continue
        tf, tt = f'{int(t.group(1)):02d}:{t.group(2) or "00"}', f'{int(t.group(3)):02d}:{t.group(4) or "00"}'
        a = re.search(r'Alter:\s*(?:ca\.\s*)?([^A-Z]*?Jahren?)', info)
        age = age_of(a.group(1)) if a else (None, None)
        if age[0] is None and a and re.match(r'\d+ Jahre', a.group(1)):  # 'ca. 8 Jahre'
            n = int(a.group(1).split()[0])
            age = ((n - 1) * 12, (n + 2) * 12)
        if age[0] is None:
            age = (72, 156)  # the overview page: NAJU-Kindergruppen are for 6 to 12 years
        o = re.search(r'(?:Ort(?:/Treffpunkt)?|Treffpunkt):\s*(.*)', info)
        where = re.sub(r'\s*\d+\.\d+°.*$', '', o.group(1)).strip() if o else ''
        venue = re.split(r'\s*[(,/;]\s*|\s+-\s+|\s+oder\s+', where)[0].strip() or 'NAJU Hamburg'
        if re.match(r'(?i)unterschiedlich', venue):  # changing meeting points: name the area
            venue = f'{district[0] if district else slug.split("-")[0].title()} (wechselnde Treffpunkte)'
        address = None
        am = re.search(r'([A-ZÄÖÜ][\w\-äöüß. ]+?\s\d+[a-z]?,\s*\d{5}\s*Hamburg)', where) or re.search(r'\(([^()]*\d+[^()]*)\)', where)
        if am:
            address = am.group(1).strip()
        lat = lon = None
        for key, osm in OSM.items():
            if key in where:
                lat, lon = osm_coords(osm)
                break
        if lat is None:
            lat, lon, address = place(venue, address)
        rhythm = 'alle 14 Tage' if re.search(r'14.?tägig|jeden 2\.|alle (?:2|zwei) wochen', when + text[:3000], re.I) else \
                 ('1. und 3. im Monat' if re.search(r'1\..*3\.', when) else 'regelmäßig')
        offers.append(group(slug, title, url, PROVIDER, weekday=wd, venue=venue, address=address, lat=lat, lon=lon,
                            time_from=tf, time_to=tt, age=age, price=PRICE, registration='nötig (Schnuppern nach Absprache)',
                            schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, {rhythm}, nicht in den Schulferien', topic='wissen',
                            description=where[:200]))
    return finish(SOURCE_ID, 'NAJU Hamburg: Kindergruppen (Naturschutz für 6- bis 12-Jährige)', LIST, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
