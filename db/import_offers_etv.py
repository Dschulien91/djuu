"""Import the weekly children's sports groups of the Eimsbütteler TV (ETV) from its public course plan PDF.

robots.txt allows the download path, imprint has no reuse restriction. The plan is a grid of weekday blocks, so words are
walked column by column: a weekday header sets the day, a 'HH:MM - HH:MM title' line starts a course, and a following age
line belongs to that course. Blocks without a weekday header are skipped. The venue stays generic because the room codes
are only explained on the plan itself, which the link opens. No names are in the plan and nothing else is stored.
"""
import io
import re
import sys

import pdfplumber

from offers_util import WEEKDAYS, age_of, finish, get, group

SOURCE_ID = 'etv_kindersport'
BASE = 'https://www.etv-hamburg.de'
PDF = BASE + '/_cache/downloads/5875-fde3fa2514/cms/Abteilungen/Kindersport/Downloads/Kursplan-Kindersport.pdf'
PROVIDER = 'Eimsbütteler TV'
DAYS = {'Montag': 0, 'Dienstag': 1, 'Mittwoch': 2, 'Donnerstag': 3, 'Freitag': 4, 'Samstag': 5, 'Sonntag': 6}
ENTRY = re.compile(r'^(\d\d:\d\d)\s*-\s*(\d\d:\d\d)\s+(.+)$')
ROOMS = re.compile(r'\s+(SH|HHL|Gym|ISE|EG|KR ?\d?|L|UH|GH|LÖW|LUT|KH|HW|II|III|Sport ?\d)(?=\s|$)')
AGE_LINE = re.compile(r'^\(?\d[\d\s,-]*(J\.|Jahre|Monate)')
NOISE = re.compile(r'FÜR AKTUELLE|FOLGT UNS|KINDERSPORT|INSTAGRAM|^Stand|Änderung', re.I)
COL_WIDTH = 128


def column_starts(words):
    """x positions of the columns, from the start times of course lines."""
    xs = sorted(w['x0'] for i, w in enumerate(words) if re.fullmatch(r'\d\d:\d\d', w['text']) and i + 1 < len(words) and words[i + 1]['text'] == '-')
    cols = []
    for x in xs:
        if not cols or x - cols[-1] > 20:
            cols.append(x)
    return cols


def main():
    offers = []
    with pdfplumber.open(io.BytesIO(get(PDF, timeout=90).content)) as pdf:
        for pn, page in enumerate(pdf.pages):
            words = page.extract_words()
            for x in column_starts(words):
                rows = {}
                for w in words:
                    if x - 8 <= w['x0'] < x + COL_WIDTH:
                        rows.setdefault(round(w['top'] / 4), []).append(w)
                wd, last = None, None
                for _, row in sorted(rows.items()):
                    line = ' '.join(w['text'] for w in sorted(row, key=lambda z: z['x0'])).strip()
                    head = next((DAYS[w['text']] for w in row if w['text'] in DAYS), None)
                    if head is not None:
                        wd, last = head, None
                        continue
                    if NOISE.search(line):
                        last = None
                        continue
                    m = ENTRY.match(line)
                    if m and wd is not None:
                        title = ROOMS.sub(' ', m.group(3)).strip()
                        last = group(f'{pn}:{wd}:{m.group(1)}:{title[:30]}', title, PDF, PROVIDER, weekday=wd, time_from=m.group(1), time_to=m.group(2),
                                     schedule=f'{WEEKDAYS[wd]} {m.group(1)}–{m.group(2)}, wöchentlich', registration='nötig', age=age_of(title))
                        offers.append(last)
                    elif last is not None and AGE_LINE.match(line):
                        last['title'] = f'{last["title"]} {ROOMS.sub(" ", line).strip()}'[:120]
                        last['age_min_m'], last['age_max_m'] = age_of(last['title'])
                        last = None
    offers = [o for o in offers if len(o['title']) > 3 and not re.fullmatch(r'KR ?\d?', o['title'])]
    return finish(SOURCE_ID, 'ETV Hamburg: Kindersport', PDF, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
