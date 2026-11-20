"""Import the weekly programme of the DRK Eltern-Kind-Zentren in Harburg and St. Pauli (DRK-Kreisverband Hamburg-Harburg).

Source: https://www.drk-harburg.hamburg/angebote/kinder-jugend-familie/eltern-kind-zentren.html (the Kreisverband's current
site; the old domain drk-harburg.de fails at the TLS handshake and answers 404 over http). One block per EKiZ
('EKiZ Angebote & Zeiten'): weekday, opening hours and the offers of that day. Offers with their own time
('11.15-12 Uhr: Babymassage') become one weekly 'gruppe' each; untimed offers of a day (Spielkreis, Bewegungsangebote ...)
become one 'Offener Treff' with the day's opening hours. Counselling by appointment, lunch and closed days are left out.
EKiZ Storchennest (Neugraben) publishes its times only on a Padlet board, so it is not imported. Staff names are not stored.
Addresses: the city's Eltern-Kind-Zentren records (hh_ekiz) of the DRK sites the EKiZ belong to.
robots.txt: only /typo3/ paths are blocked.
"""
import json
import re
import sqlite3
import sys

from common import DB_PATH
from offers_util import WEEKDAYS, age_of, clean, finish, get, group

SOURCE_ID = 'drk_harburg_ekiz'
PAGE = 'https://www.drk-harburg.hamburg/angebote/kinder-jugend-familie/eltern-kind-zentren.html'
PROVIDER = 'DRK-Kreisverband Hamburg-Harburg (Eltern-Kind-Zentren)'
# EKiZ name on the page -> (venue, name of the DRK site in the city's hh_ekiz records)
SITES = {'Neuenfelde': ('DRK-EKiZ Neuenfelde', 'Kinderzentrum Neuenfelde'),
         'St. Pauli': ('DRK-EKiZ St. Pauli-Süd', 'Kita Lelka Birnbaum'),
         'Stubbennest': ('DRK-EKiZ Stubbennest (Neuwiedenthal)', 'Kita Grüne Insel/Dr. Ernst-Hinze-Haus')}
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
SKIP = re.compile(r'geschlossen|nach absprache|nur mit termin|^beratungsangebot$|beratungsmöglichkeit|mittagessen', re.I)
SPAN = r'(\d{1,2})(?:[.:](\d\d))?\s*(?:-|–|bis)\s*(\d{1,2})(?:[.:](\d\d))?\s*Uhr'


def hm(h, m):
    return f'{int(h):02d}:{m or "00"}'


def site(name):
    con = sqlite3.connect(DB_PATH, timeout=60)
    try:
        row = con.execute("SELECT lat, lon, raw FROM source_records WHERE source_id='hh_ekiz' AND name=? LIMIT 1", (name,)).fetchone()
    finally:
        con.close()
    if not row:
        return None, None, None
    d = json.loads(row[2])
    return row[0], row[1], f'{d.get("adresse")}, {d.get("ort")}'


def no_names(t):
    return re.sub(r'\s+mit\s+(?!\w*betreuung)[A-ZÄÖÜ][a-zäöüß]+\b(?!-)', '', t).strip(' –-:,')  # 'Spielgruppe mit Tanja'


def main():
    html = get(PAGE).text
    offers = []
    for summary, body in re.findall(r'(?s)<summary>\s*(EKiZ[^<]+)</summary>(.*?)</details>', html):
        key = next((k for k in SITES if k in summary), None)
        if not key:
            print(f'  {clean(summary)}: no times on the page / unknown site, skipped')
            continue
        venue, record = SITES[key]
        lat, lon, address = site(record)
        body = re.split(r'(?i)<u>\s*(?:Weitere|Ansprech)', body)[0]
        parts = re.split(r'<p><strong>\s*(\w+):', body)
        for day, rest in zip(parts[1::2], parts[2::2]):
            wd = DAYS.get(day.lower())
            if wd is None:
                continue
            hours, _, block = rest.partition('</p>')
            block = block[:block.rfind('</ul>')] if '</ul>' in block else ''  # notes after the list are not offers
            open_hours = re.search(SPAN, clean(hours))
            lines = [clean(x) for x in re.split(r'<li>', block or '')]
            lines = [x for x in lines if x]
            untimed, last = [], None
            for line in lines:
                if SKIP.search(line):
                    continue
                m = re.match(SPAN + r'\s*:?\s*(.*)$', line)
                inline = re.search(r'\((?:jeder\s+([\d. und]+)\s+\w+)?\s*' + SPAN + r'\)', line)
                if m and re.fullmatch(r'(\(\d\. Kurs\))?', m.group(5).strip(' ,')) and last:  # '10.15-11 Uhr (1. Kurs)' under 'Rückbildung ...'
                    m = re.match(SPAN + r'\s*(.*)$', line)
                    title, rest = last, m.group(5).strip(' ,')
                    title = f'{title} {rest}' if rest else title
                    title = re.sub(r'\s*mit Babybetreuung', '', title) + ', mit Babybetreuung'
                elif m:
                    title = m.group(5)
                elif inline:
                    title = line[:inline.start()].strip()
                    m = re.search(SPAN, inline.group(0))
                else:
                    last = no_names(line)
                    if not SKIP.search(line) and not re.search(r'mit babybetreuung$', line, re.I):
                        untimed.append(re.sub(r'\s*\(wochenweise abwechselnd\)', '', no_names(line)))
                    continue
                title = no_names(re.sub(r'\s*–\s*ohne Altersbeschränkung', '', title))
                if not title or SKIP.search(title):
                    continue
                rhythm = f'jeden {inline.group(1)} {WEEKDAYS[wd]}' if inline and inline.group(1) else 'wöchentlich'
                tf, tt = hm(m.group(1), m.group(2)), hm(m.group(3), m.group(4))
                offers.append(group(f'{key}:{wd}:{tf}:{title[:30]}', title, PAGE, PROVIDER, weekday=wd, venue=venue, address=address,
                                    lat=lat, lon=lon, time_from=tf, time_to=tt, age=age_of(title), free=None,
                                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, {rhythm}'))
            if untimed and open_hours:
                tf, tt = hm(open_hours.group(1), open_hours.group(2)), hm(open_hours.group(3), open_hours.group(4))
                what = ', '.join(dict.fromkeys(untimed))
                offers.append(group(f'{key}:{wd}:open', f'Offener Treff: {what}'[:110], PAGE, PROVIDER, weekday=wd, venue=venue,
                                    address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, age=(0, 72), free=1,
                                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich', description=what[:200], topic='krabbelgruppe'))
    return finish(SOURCE_ID, 'DRK Harburg: Eltern-Kind-Zentren (Wochenprogramm)', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
