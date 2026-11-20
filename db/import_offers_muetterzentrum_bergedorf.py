"""Import the weekly open groups of the Mütterzentrum Bergedorf (MüZe) and its Vätertreff dates.

Sources: the weekly programme PDF linked on https://www.muetterzentrumbergedorf.de/programm/ (one page, a table with one
column per weekday: time, title, a short note) and the WordPress posts 'Vätertreff Termine ...' (list of Saturday dates,
read through /wp-json/wp/v2/posts). Kept: Krabbel-/Spielgruppen, Frühstück and Café for families, the Vätertreff dates.
Dropped: 'Platz für dein Angebot', room rental, groups without a family focus (e.g. the Bible group) and entries with
'wechselnde Termine' that publish no dates. Names of group leaders in the PDF are never stored.
robots.txt: only /wp-admin/ is disallowed.
"""
import io
import re
import sys
from datetime import date

import pdfplumber

from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'muetterzentrum_bergedorf'
BASE = 'https://www.muetterzentrumbergedorf.de'
PAGE = BASE + '/programm/'
PDF = BASE + '/wp-content/uploads/Programm_MueZe_web.pdf'
PROVIDER = 'Mütterzentrum Bergedorf e.V.'
VENUE = 'Mütterzentrum Bergedorf (MüZe)'
ADDRESS = 'Reetwerder 11, 21029 Hamburg'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag/': 5, 'samstag': 5}
TIME = re.compile(r'^(\d{1,2})(?::(\d\d))?\s*[–-]\s*(\d{1,2})(?::(\d\d))?\s*Uhr')
SKIP = re.compile(r'Platz für|Vermietung|Biblia|Bibel|wechselnde Termine', re.I)
NOTES = {'Spielzimmeraufsicht': 'mit Spielzimmeraufsicht', 'Stillen & Tragen': 'oft mit Beratung zu Stillen & Tragen'}
KEEP = re.compile(r'krabbel|spielgruppe|baby|famili|frühstück|café|cafe|eltern|väter|stillen|tragen', re.I)


def hm(h, m):
    return f'{int(h):02d}:{m or "00"}'


def pdf_slots(content):
    """(weekday, from, to, title, note) per programme cell, columns found by the weekday headers."""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        words = pdf.pages[0].extract_words()
    heads = sorted(((w['x0'] + w['x1']) / 2, DAYS[w['text'].lower()], w['top']) for w in words if w['text'].lower() in DAYS)
    if len(heads) < 5:
        raise ValueError('weekday header not found in the programme PDF')
    top = max(h[2] for h in heads) + 15
    bottom = min([w['top'] for w in words if w['text'].startswith(('Exklusiver', 'Unkostenbeitrag'))] or [10 ** 6])
    cols = {}
    for w in words:
        if not top < w['top'] < bottom:
            continue
        mid = (w['x0'] + w['x1']) / 2  # nearest weekday header centre
        cols.setdefault(min(heads, key=lambda h: abs(h[0] - mid))[1], []).append(w)
    slots = []
    for wd, ws in cols.items():
        lines = {}
        for w in sorted(ws, key=lambda w: (round(w['top']), w['x0'])):
            lines.setdefault(round(w['top'] / 4), []).append(w['text'])
        cell = None
        for _, parts in sorted(lines.items()):
            line = ' '.join(parts)
            m = TIME.match(line)
            if m:
                cell = [wd, hm(m.group(1), m.group(2)), hm(m.group(3), m.group(4)), []]
                slots.append(cell)
            elif line.startswith('Platz für'):  # empty slot ('Platz für dein Angebot') ends the cell above
                cell = None
            elif cell is not None:
                cell[3].append(line)
    out = []
    for wd, tf, tt, text in slots:
        text = [t for t in text if t]
        if not text:
            continue
        title, note = text[0], ' '.join(text[1:])
        if title.endswith('-') and len(text) > 1:  # 'Alleinerziehenden-' / 'Treff'
            title, note = title + text[1], ' '.join(text[2:])
        out.append((wd, tf, tt, title, note))
    return out


def main():
    lat, lon = osm_coords('Mütterzentrum Bergedorf')
    html = get(PAGE).text
    pdf_url = (re.search(r'(https?://[^"\']+Programm_MueZe[^"\']*\.pdf)', html) or [None, PDF])[1]
    content = get(pdf_url).content
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        text = pdf.pages[0].extract_text() or ''
    fee_group = re.search(r'Krabbel-\s*&\s*Spielgruppen\s*(\d+)\s*€', text)
    fee_cafe = re.search(r'Frühstück\s*&\s*Café\s*(\d+)\s*€', text)
    offers = []
    for wd, tf, tt, title, note in pdf_slots(content):
        whole = f'{title} {note}'
        if SKIP.search(whole) or not KEEP.search(whole):
            continue
        # notes name group leaders ('mit <first name>'): keep only known factual phrases
        note = '; '.join(NOTES[k] for k in NOTES if k in whole)
        label = title if 'famili' in title.lower() or 'famili' not in whole.lower() else f'{title} für alle Familien'
        if 'Babytreff' in whole and 'Babytreff' not in title:
            label = f'{title} / Babytreff'
        is_group = re.search(r'krabbel|spiel', title, re.I)
        fee = fee_group if is_group else fee_cafe
        price = f'{fee.group(1)} € (Mitglieder 1 €)' if fee else None
        offers.append(group(f'{wd}:{tf}:{title[:20]}', label, PAGE, PROVIDER, weekday=wd, venue=VENUE, address=ADDRESS, lat=lat, lon=lon,
                            time_from=tf, time_to=tt, price=price, free=0 if price else None, registration='nicht nötig',
                            schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich', description=note[:150] or None))
    # Vätertreff: dates published as a news post per quarter
    posts = get(f'{BASE}/wp-json/wp/v2/posts?search=V%C3%A4tertreff&per_page=4&_fields=id,link,title,content,date').json()
    for p in posts:
        body = clean(p['content']['rendered'])
        tm = re.search(r'(\d{1,2})(?::(\d\d))?\s*-\s*(\d{1,2})(?::(\d\d))?\s*Uhr', body)
        posted = date.fromisoformat(p['date'][:10])
        for d, m, y in re.findall(r'[–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})?', body):
            year = int(y) + (2000 if y and len(y) == 2 else 0) if y else posted.year + (1 if int(m) < posted.month - 2 else 0)
            try:
                day = date(year, int(m), int(d))
            except ValueError:
                continue
            offers.append(termin(f'vaetertreff:{day}', 'Vätertreff: Papas mit Kindern', day, p['link'], PROVIDER, venue=VENUE, address=ADDRESS,
                                 lat=lat, lon=lon, time_from=hm(tm.group(1), tm.group(2)) if tm else None,
                                 time_to=hm(tm.group(3), tm.group(4)) if tm else None, registration='nicht nötig'))
    return finish(SOURCE_ID, 'Mütterzentrum Bergedorf: offene Gruppen und Vätertreff', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
