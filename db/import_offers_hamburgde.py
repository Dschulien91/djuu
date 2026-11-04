"""Import lantern parades (Laternenumzüge) from the editorial overview on hamburg.de.

Search, /iason event widgets and similar paths are disallowed by robots.txt and are not used. The
page lists parades as paragraphs (place, 'Termin:', 'Treffpunkt:'/'Ort:', description). Only place, date,
time, meeting point and a published fee are stored; descriptions are not. Past dates are dropped.
"""
import re
import sys
from datetime import date
from html import unescape

from common import connect, register_source
from offers import replace_offers
from robots_glob import polite_fetch

SOURCE_ID = 'hamburgde_laternenumzuege'
PAGE = 'https://www.hamburg.de/freizeit/jahreszeiten/herbst/laternenumzug-hamburg-22840'
MONTHS = {m: i + 1 for i, m in enumerate(['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'])}


def lines_of(par):
    par = re.sub(r'(?i)<br\s*/?>', '\n', par)
    par = re.sub(r'(?s)<svg.*?</svg>', ' ', par)
    text = unescape(re.sub(r'<[^>]+>', ' ', par)).replace('\xad', '')
    return [re.sub(r'\s+', ' ', x).strip() for x in text.split('\n') if x.strip()]


def parse_time(s):
    m = re.search(r'(\d{1,2})(?::(\d{2}))?\s*Uhr', s)
    return f'{int(m.group(1)):02d}:{m.group(2) or "00"}' if m else None


def parse_parade(lines, today):
    idx = next((i for i, x in enumerate(lines) if x.startswith('Termin:')), None)
    if not idx:
        return None
    name, when = lines[idx - 1], lines[idx][len('Termin:'):].strip()
    d = re.search(r'(\d{1,2})\.\s*(\w+)\s+(\d{4})', when)
    if not d or d.group(2) not in MONTHS:
        return None
    day = date(int(d.group(3)), MONTHS[d.group(2)], int(d.group(1)))
    if day < today:
        return None
    rest = lines[idx + 1:]
    meet, desc = [], rest
    for i, x in enumerate(rest):
        m = re.match(r'(?:Treffpunkte?|Ort):\s*(.*)', x)
        if m:
            meet = [m.group(1)] if m.group(1) else []
            j = i + 1
            while j < len(rest) and len(rest[j]) < 60 and not rest[j].endswith('.'):  # further meeting points
                meet.append(rest[j])
                j += 1
            desc = rest[j:]
            break
    fee = re.search(r'Kosten\s+(\d+\s*€[^.,]*)', ' '.join(desc))
    schedule = when[d.end():].lstrip(' ,')
    return {
        'source_ref': f'{day}:{name.lower()}', 'title': f'Laternenumzug {name}'[:120], 'kind': 'termin', 'topic': 'sonstiges',
        'weekday': day.weekday(), 'time_from': parse_time(schedule), 'start_date': day.isoformat(), 'schedule': schedule[:80] or None,
        'price': fee.group(1).strip()[:40] if fee else None, 'free': 0 if fee else None,
        'venue': ' / '.join(meet)[:160] or name, 'address': meet[0][:120] if len(meet) == 1 else None, 'url': PAGE, 'provider': 'hamburg.de',
    }


def main():
    today = date.today()
    html = polite_fetch(PAGE, retries=2).text
    start = max(html.find('km1-richtext'), 0)
    offers = []
    # several meeting points are published as a list right after the paragraph
    for par, items in re.findall(r'(?s)<p\b[^>]*>(.*?)</p>\s*(?:<ul\b[^>]*>(.*?)</ul>)?', html[start:]):
        extra = [' '.join(lines_of(li)) for li in re.findall(r'(?s)<li\b[^>]*>(.*?)</li>', items)]
        o = parse_parade(lines_of(par) + extra, today)
        if o:
            offers.append(o)
    if not offers:
        sys.exit('no future parades parsed; keeping existing data')
    con = connect()
    register_source(con, SOURCE_ID, 'hamburg.de: Laternenumzüge', PAGE, 'Fakten mit Link, keine Lizenz angegeben', 'hamburg.de', priority=60)
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers')
    for o in offers:
        print(' ', o['start_date'], o['time_from'], o['title'], '|', o['venue'], '|', o['schedule'], '|', o['price'])


if __name__ == '__main__':
    sys.exit(main())
