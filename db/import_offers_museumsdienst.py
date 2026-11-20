"""Import family and children's dates from the Museumsdienst Hamburg event calendar, for the museums that have no
importer of their own.

Source: https://museumsdienst-hamburg.de/veranstaltungskalender/ - the calendar form posts back to the same page
(?nonce=true) with the museum filter (hht_museum_id_cms[]) and a page number; each result links to a detail page with
the description, the duration and a 'Zum Veranstalter' link to the museum's own page (used as the offer link).

Left out, because their own importers already read them: the SHMH houses (Altonaer Museum, Museum der Arbeit,
Museum für Hamburgische Geschichte, Jenisch Haus, Deutsches Hafenmuseum, Kultur Kontor, Kramer-Witwen-Wohnung),
MKG, Hamburger Kunsthalle, Archäologisches Museum, Deichtorhallen, Museum der Natur, Bergedorf Museum / Rieck Haus
and the Internationales Maritimes Museum (import_offers_imm.py). Kept from the rest (MARKK, Bucerius Kunst Forum,
Mahnmal St. Nikolai, memorial sites, Sternwarte, ...): dates the site tags 'Familien & Kinder' / 'Ferienprogramm' and
dates whose title or description names children, families or parents with babies. Senior and dementia formats,
adult-only formats and school / Kita formats are dropped. Age groups are kept as published (age_of).

robots.txt: museumsdienst-hamburg.de is in PERMITTED_HOSTS (the provider agreed), so it is not applied; the per-host
pause still is. The museums' own pages are only linked, not read.
"""
import re
import sys
from datetime import date

from offers_util import FAMILY, MONTHS, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'museumsdienst_hamburg'
BASE = 'https://museumsdienst-hamburg.de'
PAGE = BASE + '/veranstaltungskalender/'
PROVIDER = 'Museumsdienst Hamburg'
OWN_IMPORTER = re.compile(r'altonaer museum|museum der arbeit|hamburgische geschichte|jenisch|hafenmuseum|kultur kontor|kramer-witwen|'
                          r'kunst und gewerbe|kunsthalle|archäologisches|deichtorhallen|museum der natur|bergedorf|rieck haus|'
                          r'maritimes museum|barlach|planetarium|kl!ck', re.I)
FAMILY_TAGS = {'135': 'Familien & Kinder', '125': 'Ferienprogramm'}
KIDS = re.compile(r'familie|kinder|\bkind\b|kids|eltern|baby|babys|enkel|krabbel|märchen|kamishibai|taschenlampe|'
                  r'kunstspion|schatzsuche|basteln|\bab \d{1,2} jahren|\d+\s*[-–]\s*\d+ jahre', re.I)  # titles
DESC_KIDS = re.compile(r'für (die ganze )?(kinder|familie|klein und groß|groß und klein)|kinder (ab|von|zwischen|im alter|und)|'
                       r'familie|eltern mit|babys?\b|krabbl|enkel|\bab \d{1,2} jahren|\d+\s*[-–]\s*\d+ jahre', re.I)  # descriptions
NOT_FOR_KIDS = re.compile(r'senior|demenz|erwachsene|für schulklassen|kita-gruppen|lehrkräfte|ab 1[4-9] jahren|jugendliche ab 1[4-9]', re.I)
ADDRESSES = {  # museum label start -> address, OSM names
    'Museum am Rothenbaum': ('Rothenbaumchaussee 64, 20148 Hamburg', ['MARKK', 'Museum am Rothenbaum']),
    'Bucerius Kunst Forum': ('Alter Wall 12, 20457 Hamburg', ['Bucerius Kunst Forum']),
    'Mahnmal St. Nikolai': ('Willy-Brandt-Straße 60, 20457 Hamburg', ['Mahnmal St. Nikolai', 'St. Nikolai']),
    'Hamburger Sternwarte': ('Gojenbergsweg 112, 21029 Hamburg', ['Hamburger Sternwarte']),
    'Medizinhistorisches Museum': ('Martinistraße 52, 20246 Hamburg', ['Medizinhistorisches Museum Hamburg']),
    'KZ-Gedenkstätte Neuengamme': ('Jean-Dolidier-Weg 75, 21039 Hamburg', ['KZ-Gedenkstätte Neuengamme']),
    'Gedenkstätte Kinder vom Bullenhuser Damm': ('Bullenhuser Damm 92, 20539 Hamburg', ['Gedenkstätte Bullenhuser Damm']),
    'Bismarck-Denkmal': ('Seewartenstraße, 20459 Hamburg', ['Bismarck-Denkmal']),
}


def parse_list(html):
    out = []
    for blk in re.split(r'<a href="(?=https://museumsdienst-hamburg\.de/veranstaltungskalender/[^"]+" title="Veranstaltung ansehen")', html)[1:]:
        url = blk.split('"')[0]
        d = re.search(r'class="date[^"]*">\s*\w+\.,\s*(\d{1,2})\.\s*(\w+)\s+(\d{4})', blk)
        tm = re.search(r'class="ff_regular f5 dib time">\s*(\d{1,2}):(\d\d)', blk)
        h4 = re.search(r'(?s)<h4[^>]*>(.*?)</h4>', blk)
        if not (d and h4) or d.group(2).lower() not in MONTHS:
            continue
        spans = [clean(s) for s in re.findall(r'(?s)<span[^>]*>(.*?)</span>', h4.group(1))]
        out.append({'url': url, 'day': date(int(d.group(3)), MONTHS[d.group(2).lower()], int(d.group(1))),
                    'time': f'{int(tm.group(1)):02d}:{tm.group(2)}' if tm else None, 'museum': spans[0] if spans else '',
                    'cat': spans[1] if len(spans) > 1 else '', 'title': clean(re.sub(r'(?s)<span.*?</span>', '', h4.group(1)))})
    return out


def search(ssid, fields):
    """All result pages of one calendar search."""
    out = []
    for p in range(1, 60):
        data = [('hht_event_date', ''), ('hht_event_date_end', ''), ('paged', p), ('md_ssid', ssid)] + fields
        items = parse_list(get(PAGE + '?nonce=true', method='POST', data=data).text)
        if not items:
            break
        out += items
    return out


def main():
    html = get(PAGE).text
    ssid = re.search(r'name="md_ssid" value="([^"]+)"', html).group(1)
    museums = {v: clean(n) for v, n in re.findall(r'value="(\d+)" name="hht_museum_id_cms\[\]">\s*<label[^>]*>(.*?)</label>', html, re.S)}
    keep = [v for v, n in museums.items() if not OWN_IMPORTER.search(n)]
    print(f'  {len(museums)} museums in the filter, {len(keep)} without an own importer: {", ".join(museums[v] for v in keep)}')
    tagged = set()
    for crit in FAMILY_TAGS:
        tagged |= {i['url'] for i in search(ssid, [('hht_event_criterion[]', crit)])}
    items = search(ssid, [('hht_museum_id_cms[]', v) for v in keep])
    print(f'  {len(items)} dates of these museums, {len(tagged)} family-tagged pages in the whole calendar')
    details, coords, offers = {}, {}, []
    for it in items:
        if OWN_IMPORTER.search(it['museum']) or it['day'] < date.today():
            continue
        if it['url'] not in details:
            d = get(it['url']).text
            desc = clean((re.search(r'(?s)<div class="f4s">(.*?)</div>', d) or [0, ''])[1])
            own = re.search(r'id="booking_button"[^>]*href="([^"]+)"', d) or re.search(r'href="([^"]+)"[^>]*id="booking_button"', d)
            dur = re.search(r'(?s)<strong>Dauer</strong><br\s*/?>\s*(\d+)\s*Minuten', d)
            more = [(date(int(y), MONTHS[m.lower()], int(dd)), f'{int(h):02d}:{mi}') for dd, m, y, h, mi in
                    re.findall(r'(?s)<li>\s*(\d{1,2})\.\s*(\w+)\s+(\d{4})\W{1,8}(\d{1,2}):(\d\d) Uhr\s*</li>', d) if m.lower() in MONTHS]
            details[it['url']] = (desc, own.group(1) if own else None, int(dur.group(1)) if dur else None, more)
        desc, own, dur, more = details[it['url']]
        text = f'{it["title"]} {desc}'
        if NOT_FOR_KIDS.search(text):
            continue
        if it['url'] not in tagged and not (KIDS.search(it['title']) or DESC_KIDS.search(desc)):
            continue
        museum = it['museum']
        key = next((k for k in ADDRESSES if museum.startswith(k)), None)
        address, osm = ADDRESSES[key] if key else (None, [museum])
        if museum not in coords:
            coords[museum] = osm_coords(*osm)
        lat, lon = coords[museum]
        age = age_of(text)
        slug = it['url'].rstrip('/').rsplit('/', 1)[-1]
        for day, tf in [(it['day'], it['time'])] + more:  # the list shows the next date of a series, the page all others
            tt = None
            if tf and dur and dur <= 300:
                mins = int(tf[:2]) * 60 + int(tf[3:]) + dur
                tt = f'{mins // 60:02d}:{mins % 60:02d}' if mins < 24 * 60 else None
            link = own if own and (day == it['day'] or not re.search(r'\d{4}-\d\d-\d\d', own)) else it['url']  # own link is per date
            offers.append(termin(f'{slug}:{day}:{tf}', it['title'], day, link, museum, venue=museum, address=address, lat=lat, lon=lon,
                                 time_from=tf, time_to=tt, age=age))  # descriptions may name guides: only read, never stored
    return finish(SOURCE_ID, 'Museumsdienst Hamburg: Familien- und Kindertermine (Museen ohne eigenen Import)', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
