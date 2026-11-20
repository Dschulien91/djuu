"""Import children's and family events (readings, book presentations for children) of the Heymann bookshops.

Source: https://www.heymann-buecher.de/shop/magazine/102830/veranstaltungen.html, a shop web app (Libri). The page source
already carries the app's start data (window.LibriInitialWsApiData): the event tree 'Veranstaltungen' -> branch ('Zentral',
'Blankenese', ...) -> one node per event named 'DD.MM. – Title'. Each event page (/shop/magazine/<id>/<slug>.html) carries
its text modules the same way; the time ('16 Uhr'), place and price are read from that text. Branch addresses and coordinates
come from the shop's own branch list (/wsapi/rest/v1/affiliate/findpointofsale), which answers after the page visit has set
the anonymous session cookie the app itself uses. No browser is needed.
Kept: events whose title or text names children, families, Kinderbuch or an age up to 12; adult readings and evenings are
left out. Branches more than about 25 km from Hamburg (Elmshorn, Itzehoe, Buchholz) are left out. Events of the 'Zentral'
branch take place at partner venues (cinema, theatre): the venue is taken from the text, without a guessed address.
robots.txt: '*' blocks /shop/article/, search, basket and account paths; /shop/magazine/ and /wsapi/ are allowed.
"""
import json
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'heymann'
BASE = 'https://www.heymann-buecher.de'
PAGE = BASE + '/shop/magazine/102830/veranstaltungen.html'
PROVIDER = 'Buchhandlung Heymann'
FAR = {'Elmshorn', 'Itzehoe', 'Buchholz'}
KIDS = re.compile(r'kinderbuch|bilderbuch|vorlesetag|für kinder|kinder (?:und|&) jugendliche|kinder (?:von|ab|zwischen) \d|'
                  r'für die ganze familie|familienlesung|kleinen? (?:bücherfans|zuhörer|leser)|ab \d{1,2} jahren', re.I)
ADULT = re.compile(r'mädelsabend|girls only|speed dating|blind date|krimi-abend|lieblingskrimi|weinprobe|für erwachsene', re.I)


def start_data(html, var='LibriInitialWsApiData'):
    i = html.find(f'window.{var}=')
    return json.JSONDecoder().raw_decode(html[i + len(var) + 8:])[0] if i >= 0 else {}


def module_text(page):
    parts = []
    for m in (page or {}).get('modules') or []:
        try:
            attrs = json.loads(m.get('content') or '{}').get('attributes') or {}
        except ValueError:
            continue
        for key in ('headlineText', 'text', 'textWithVariables'):
            v = (attrs.get(key) or {}).get('value')
            if isinstance(v, str):
                parts.append(clean(v))
    return ' '.join(p for p in parts if p)


def event_day(name, today):
    m = re.match(r'\s*(\d{1,2})\.(\d{1,2})\.', name)
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    d = date(today.year, month, day)
    return d if (today - d).days < 60 else date(today.year + 1, month, day)


def main():
    today = date.today()
    html = get(PAGE).text
    nodes = {n['id']: n for n in start_data(html).get('relationalNavigationNodeSet', {}).get('relatedNodes', [])}
    shops = {}
    for p in get(BASE + '/wsapi/rest/v1/affiliate/findpointofsale?urlNumber=90000595').json().get('result', {}).get('items', []):
        branch = re.sub(r'^Buchhandlung Heymann\s*(?:in|am)?\s*', '', p.get('posName') or '').strip()
        shops[branch] = (f'Heymann {branch}', f'{p.get("posStreet")} {p.get("posStreetNo")}, {p.get("posZip")} {p.get("posCity")}',
                         p.get('latitude'), p.get('longitude'))
    offers = []
    for bid in (nodes.get(102830) or {}).get('CIds', []):
        branch = (nodes.get(bid) or {}).get('PN', '')
        if branch in FAR or not branch:
            continue
        for eid in nodes[bid].get('CIds', []):
            node = nodes.get(eid) or {}
            name = clean(node.get('PN'))
            day = event_day(name, today)
            if not day or day < today:
                continue
            title = re.sub(r'^\s*\d{1,2}\.\d{1,2}\.\s*(?:oder\s*\d{1,2}\.\d{1,2}\.\s*)?[–-]\s*', '', name)
            if ADULT.search(title):
                continue
            url = f'{BASE}/shop/magazine/{eid}/event.html'
            src = get(url).text
            canon = re.search(r'rel="canonical" href="([^"]+)"', src)
            url = canon.group(1) if canon and f'/{eid}/' in canon.group(1) else url
            page = start_data(src).get('shopPage') or {}
            text = module_text(page) + ' ' + clean(node.get('MD'))
            if not KIDS.search(f'{title} {text}'):  # not FAMILY: 'Familie' in novel blurbs, 'Kinder-Hospiz' benefit readings
                continue
            t = re.search(r'(\d{1,2})(?:[.:](\d\d))?\s*Uhr', text)
            venue, address, lat, lon = shops.get(branch, (None, None, None, None))
            if branch == 'Zentral' or not venue:
                v = re.search(r'\b(?:im|in der|ins|auf dem)\s+((?:[A-ZÄÖÜ][\wäöüß\-]+\s){0,2}[A-ZÄÖÜ]?[\wäöüß\-]*(?:Kino|Theater|Saal|Halle|Kirche|Haus))\b', text)
                venue = v.group(1).strip() if v else 'Buchhandlung Heymann (Ort siehe Link)'
                address = None
                lat, lon = osm_coords(venue) if v else (None, None)
            free = 1 if re.search(r'kostenlos|eintritt frei|freier eintritt', text, re.I) else None
            price = re.search(r'(\d+(?:,\d\d)?)\s*(?:€|Euro)', text)
            offers.append(termin(f'{eid}:{day}', title, day, url, PROVIDER, venue=venue, address=address, lat=lat, lon=lon,
                                 time_from=f'{int(t.group(1)):02d}:{t.group(2) or "00"}' if t else None,
                                 price='kostenlos (Eintrittskarte)' if free else (f'{price.group(1)} €' if price else None), free=free,
                                 age=age_of(f'{title} {text}'), topic='lesen',
                                 registration='Eintrittskarte nötig' if re.search(r'karte|ticket|anmeld', text, re.I) else None,
                                 description=text[:200]))
    return finish(SOURCE_ID, 'Buchhandlung Heymann: Lesungen und Buchvorstellungen für Kinder', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
