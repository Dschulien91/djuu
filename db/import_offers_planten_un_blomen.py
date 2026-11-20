"""Import the children's and family part of the Planten un Blomen summer programme (Programmheft, May to September).

Source: https://plantenunblomen.hamburg.de/veranstaltungen links the season's programme PDF
('programmheft-<year>-barrierefrei-data.pdf', the accessible version is preferred; text read with pypdf). Kept:
- Kindertheater on the small open-air stage (Große Wallanlagen): per week a date range, show times, company and play;
  each day and time becomes one 'termin' (free, ab 4 Jahre); the circus guest run at the end becomes one multi-day termin.
- Calendar entries under 'Musik und Feste' for children or families (e.g. Fest der kleinen Wichte, laut und luise,
  MINT-Woche, Spielmobil-Abschlussfest), guided walks naming a child age, the Fahrradparcours dates (Verkehrswacht),
  the Töpferstube for children (weekly Tue-Fri groups over the summer) and the Eltern-&-Kind model regatta.
Concerts, readings, tours, Teehaus workshops and senior/yoga courses are left out. Names of artists and guides are not stored.
The programme is published each spring: outside the season (or before the new PDF is online) finish() reports
'no current offers' and the existing data stays.
robots.txt: only a sitemap line (no rules). The page is the park's own (Bezirksamt Hamburg-Mitte), not the hamburg.de calendar.
"""
import io
import logging
import re
import sys
from datetime import date, timedelta

from offers_util import MONTHS_SHORT, age_of, finish, get, group, osm_coords, termin

SOURCE_ID = 'planten_un_blomen'
BASE = 'https://plantenunblomen.hamburg.de'
PAGE = BASE + '/veranstaltungen'
PROVIDER = 'Planten un Blomen (Bezirksamt Hamburg-Mitte)'
WD = {'mo': 0, 'di': 1, 'mi': 2, 'do': 3, 'fr': 4, 'sa': 5, 'so': 6}
FAMILY = re.compile(r'kinder(?!schutz|- und jugendchor)|famili|eltern|wichte|spielmobil', re.I)
_coords = None


def month(name):
    return MONTHS_SHORT.get(name.strip('. ').lower()[:3].replace('mae', 'mär'))


def hm(t):
    h, _, m = t.replace('.', ':').partition(':')
    return f'{int(h):02d}:{m or "00"}'


def place(where):
    global _coords
    if _coords is None:
        _coords = osm_coords('Planten un Blomen')
    where = re.sub(r'\s+', ' ', where or '').strip(' /')
    return dict(venue=f'Planten un Blomen ({where})' if where else 'Planten un Blomen', address='Planten un Blomen, 20355 Hamburg',
                lat=_coords[0], lon=_coords[1])


def pdf_text():
    html = get(PAGE).text
    pdfs = re.findall(r'href="([^"]*programmheft-(20\d\d)(-barrierefrei)?-data\.pdf)"', html)
    if not pdfs:
        return None, None
    href, year, _ = sorted(pdfs, key=lambda x: (x[1], bool(x[2])))[-1]
    import pypdf
    logging.getLogger('pypdf').setLevel(logging.ERROR)
    reader = pypdf.PdfReader(io.BytesIO(get(href if href.startswith('http') else BASE + href, timeout=120).content))
    return int(year), '\n'.join(p.extract_text() or '' for p in reader.pages)


def section(text, start, end):
    i = text.find(start)
    if i < 0:
        return ''
    j = text.find(end, i + len(start)) if end else -1
    return text[i:j if j > 0 else None]


def kindertheater(text, year, offers):
    sec = section(text, 'Kindertheater\nKleine Freiluftbühne', 'Hinweis')
    hdr = re.compile(r'\b(MO|DI|MI|DO|FR|SA|SO)\.\s*(\d{1,2})\.\s*([A-ZÄ]+\.?)?\s*[–-]\s*(MO|DI|MI|DO|FR|SA|SO)\.\s*(\d{1,2})\.\s*([A-ZÄ]+)')
    heads = list(hdr.finditer(sec))
    for k, m in enumerate(heads):
        body = sec[m.end():heads[k + 1].start() if k + 1 < len(heads) else None]
        lines = [l.strip() for l in body.splitlines() if l.strip() and not l.strip().startswith('©') and not re.fullmatch(r'[A-ZÄÖÜ &´`]+', l.strip())]
        times = [l for l in lines if 'Uhr' in l]
        names = [l for l in lines if 'Uhr' not in l]
        if not times or not names:
            continue
        m2 = month(m.group(6))
        m1 = month(m.group(3)) if m.group(3) else m2
        start, end = date(year, m1, int(m.group(2))), date(year, m2, int(m.group(5)))
        company, play = names[0], (names[1] if len(names) > 1 else '')
        if (end - start).days > 7:  # long guest run (circus): one multi-day entry
            offers.append(termin(f'theater:{company}:{start}', company, start, PAGE, PROVIDER, end=end, age=(48, None),
                                 description=('; '.join(times) + ' · ' + play)[:200], topic='theater', **place('Wiese der Großen Wallanlagen')))
            continue
        per_day = dict(re.findall(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\.\s*([^,]+)', play)) if re.match(r'(Mo|Di|Mi|Do|Fr|Sa|So)\.\s', play) else {}
        d = start
        while d <= end:
            title = per_day.get(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][d.weekday()], play) if per_day else play
            for t in re.findall(r'(\d{1,2}[:.]\d\d)', times[0]):
                offers.append(termin(f'theater:{company}:{d}:{hm(t)}', f'Kindertheater: {title} ({company})', d, PAGE, PROVIDER,
                                     time_from=hm(t), free=1, price='frei', age=(48, None), registration='ohne Anmeldung', topic='theater',
                                     **place('Kleine Freiluftbühne, Große Wallanlagen')))
            d += timedelta(days=1)


def feste(text, year, offers):
    sec = section(text, 'Musik und Feste', 'Wortpicknick – Lesungen\nEintritt')
    sec = text[text.find('\nMAI\n'):text.find('Wortpicknick – Lesungen\nEintritt')] if '\nMAI\n' in text else sec
    entry = re.compile(r'(?ms)^(\d{1,2})\.(?:\s*[+–-]\s*(\d{1,2})\.)?\s*([A-ZÄ]+)\s*\n(.*?Uhr)\s*\n(.*?)Planten un Blomen\s*//\s*([^\n]+)(?:(?=\n([^\n]*)))?')  # peek at the next line, do not consume it
    for m in entry.finditer(sec):
        body = m.group(5).strip()
        title = body.splitlines()[0].strip() if body else ''
        if not title or not FAMILY.search(body) or not month(m.group(3)):
            continue
        start = date(year, month(m.group(3)), int(m.group(1)))
        end = date(year, month(m.group(3)), int(m.group(2))) if m.group(2) else None
        t = re.findall(r'(\d{1,2}:\d\d)', m.group(4))
        org = re.search(r'Veranstalter:\s*([^\n]+)', body)
        offers.append(termin(f'fest:{title[:30]}:{start}', title, start, PAGE, PROVIDER, end=end,
                             time_from=hm(t[0]) if t else None, time_to=hm(t[1]) if len(t) > 1 else None, free=1, price='frei',
                             age=age_of(body.replace('–', '-')), registration='ohne Anmeldung',
                             description=f'Veranstalter: {org.group(1).strip()}'[:200] if org else None,
                             **place(m.group(6) + (' ' + m.group(7) if m.group(6).strip().endswith('zwischen') and m.group(7) else ''))))


def fuehrungen(text, year, offers):
    sec = section(text, 'Führungen und Rundgänge\nEntdecken', 'Weitere Termine')
    for chunk in re.split(r'\nWER [^\n]*', sec):
        if 'WANN' not in chunk or not re.search(r'\bab \d Jahr|kinder|famili', chunk, re.I):
            continue
        lines = [l.strip() for l in chunk.split('WANN')[0].splitlines() if l.strip() and not l.strip().startswith(('©', '(', 'WO', 'WIE'))]
        lines = [l for l in lines if not re.fullmatch(r'[A-ZÄÖÜ &\-–]+', l) and '@' not in l]
        title = lines[0] if lines else 'Rundgang'
        wann = chunk.split('WANN', 1)[1].split('\nWO', 1)[0]
        wo = (re.search(r'\nWO\s+([^\n]+)', chunk) or re.search('()', '')).group(1)
        t = re.findall(r'(\d{1,2}:\d\d)', wann)
        for d, mon in re.findall(r'(\d{1,2})\.\s*([A-Za-zäÄ]+)', wann):
            if month(mon):
                day = date(year, month(mon), int(d))
                offers.append(termin(f'walk:{title[:30]}:{day}', title, day, PAGE, PROVIDER, time_from=hm(t[0]) if t else None,
                                     time_to=hm(t[1]) if len(t) > 1 else None, age=age_of(chunk), free=1 if re.search(r'kostenlos|freier eintritt', chunk, re.I) else None,
                                     registration='nötig' if 'Anmeldung unter' in chunk or 'Anmeldung erforderlich' in chunk else None, **place(wo)))


def extras(text, year, offers):
    sec = section(text, 'Fahrradparcours\nWANN', 'VERANSTALTER')
    for d_list, mon, tf, tt in re.findall(r'(?:MO|DI|MI|DO|FR|SA|SO)\.\s*((?:\d{1,2}\.\s*\+?\s*)+)([A-ZÄ]+)\s+(\d{1,2}:\d\d)\s*[–-]\s*(\d{1,2}:\d\d)', sec):
        for d in re.findall(r'\d{1,2}', d_list):
            if month(mon):
                day = date(year, month(mon), int(d))
                offers.append(termin(f'rad:{day}', 'Fahrradparcours (Fahrräder, Roller, Laufräder und Helme werden gestellt)', day, PAGE, PROVIDER,
                                     time_from=hm(tf), time_to=hm(tt), free=1, price='kostenlos', topic='sport',
                                     description='Veranstalter: Verkehrswacht Hamburg e. V.', **place('Rollschuhbahn, Große Wallanlagen')))
    m = re.search(r'Töpferstube[^\n]*\n(\d{1,2})\.\s*(\w+)\s*[–-]\s*(\d{1,2})\.\s*(\w+)\s*·\s*(\w\w)\.\s*bis\s*(\w\w)\.\s*von\s*(\d{1,2}:\d\d)\s*[–-]\s*(\d{1,2}:\d\d)(.*?)\n(?:Minigolf|TÖPFER)', text, re.S)
    if m and month(m.group(2)) and month(m.group(4)):
        start, end = date(year, month(m.group(2)), int(m.group(1))), date(year, month(m.group(4)), int(m.group(3)))
        age = age_of(m.group(9))
        for wd in range(WD[m.group(5).lower()], WD[m.group(6).lower()] + 1):
            offers.append(group(f'toepfer:{year}:{wd}', 'Töpferstube für Kinder (mit Anleitung, Ton und Farbe)', PAGE, PROVIDER, weekday=wd,
                                time_from=hm(m.group(7)), time_to=hm(m.group(8)), start=start, end=end, age=age, free=1, price='frei, Spenden erwünscht',
                                registration='ohne Anmeldung', topic='kreativ',
                                schedule=f'{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][wd]} {hm(m.group(7))}–{hm(m.group(8))}, {start:%d.%m.}–{end:%d.%m.%Y}',
                                **place('Töpferstube, Große Wallanlagen')))
    m = re.search(r'Eltern & Kind Schaufahren\s*\n(.*?)\nWO', text, re.S)
    if m:
        for d, mon, tf, tt in re.findall(r'(\d{1,2})\.\s*([A-ZÄ]+)\.?\s+(\d{1,2}:\d\d)\s*[–-]\s*(\d{1,2}:\d\d)', m.group(1)):
            if month(mon):
                day = date(year, month(mon), int(d))
                offers.append(termin(f'regatta:{day}', 'Modellregatta: Eltern & Kind Schaufahren', day, PAGE, PROVIDER, time_from=hm(tf),
                                     time_to=hm(tt), free=1, price='kostenlos', description='Veranstalter: SMC Hamburg e. V.', **place('Parksee')))


def parse(year, text):
    offers = []
    for part in (kindertheater, feste, fuehrungen, extras):
        try:
            part(text, year, offers)
        except Exception as e:  # one section failing must not drop the others
            print(f'  {part.__name__}: {type(e).__name__} {e}')
    return offers


def main():
    year, text = pdf_text()
    offers = parse(year, text) if text else []
    if year:
        print(f'  programme {year}: {len(offers)} entries parsed')
    return finish(SOURCE_ID, 'Planten un Blomen: Kindertheater, Familienfeste und Kinderangebote (Sommerprogramm)', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
