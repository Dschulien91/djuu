"""Import the half-year course programmes of Hamburg's public Elternschulen (run by the Bezirksämter).

The programmes are published as PDF brochures on the Bezirk pages of hamburg.de (and a few partner sites).
Every brochure lists entries as a title, the course leader(s) in capitals, a short description and one or
more schedule lines such as

    J2 Babymassage
    NADIN HUTH
    ...
     Do.  10.09. – 26.11.  10.00 – 11.00 Uhr  10,50 Euro

The parser anchors on schedule lines (weekday abbreviation + dates/time), takes the title from the course
code line or from the lines just above the leader names and keeps only facts: title, schedule, age, price,
venue and link. Leader names and descriptions are never stored.

Run from the db/ folder:  python import_offers_elternschulen.py
"""
import io
import json
import re
import sys
from datetime import date

import pdfplumber

from common import connect, fetch, register_source, save_raw
from offers import age_range, parse_price, replace_offers

SOURCE_ID = 'hh_elternschulen_programme'
TODAY = date.today()

HH = 'https://www.hamburg.de/politik-und-verwaltung/bezirke'
DOK = 'https://dokumente.hamburg.de/resource/blob'

# One entry per programme PDF. 'db_name' / 'db_street' match the 'hh_elternschule' source records for the
# address and coordinates. 'year' = 'h2' means a second-half-year brochure (Jan–Jun dates belong to 2027).
PROGRAMMES = [
    dict(slug='harburg', name='Harburg', bezirk='Harburg', db_street='Maretstraße 50', year='h2',
         page=f'{HH}/harburg/themen/familie-jugend-senior-innen/eltern/elternschule-harburg-kurse-63958',
         pdf='https://www.hamburg.de/resource/blob/1066168/52e923f1970696ea91223701ef16ad5e/d-programm-elternschule-harburg-2-halbjahr-2026-data.pdf'),
    dict(slug='suederelbe', name='Süderelbe', bezirk='Harburg', db_name='Elternschule Süderelbe', year='h2',
         page=f'{HH}/harburg/themen/familie-jugend-senior-innen/eltern/elternschule-suederelbe-kurse-63962',
         pdf='https://www.hamburg.de/resource/blob/1186708/ef75278c97d694cbf02bfeadbd128099/programm-elternschule-suederelbe-2026-2-halbjahr-data.pdf'),
    dict(slug='farmsen-berne', name='Farmsen-Berne', bezirk='Wandsbek', db_name='Elternschule Farmsen-Berne', year='h2',
         page=f'{HH}/wandsbek/themen/familie-und-senioren/familien/elternschulen-wandsbek-36526',
         pdf=f'{DOK}/77122/60df4f457a9551e20e2dc5173f19a63c/es-farmsen-berne-programm-2026-2-halbjahr-barrierefrei-data.pdf'),
    dict(slug='hohenhorst-rahlstedt', name='Hohenhorst-Rahlstedt', bezirk='Wandsbek', db_name='Elternschule Hohenhorst-Rahlstedt', year='h2',
         page=f'{HH}/wandsbek/themen/familie-und-senioren/familien/elternschulen-wandsbek-36526',
         pdf=f'{DOK}/77124/c7a672810885ad7572bee27413a4f242/es-hohenhorst-rahlstedt-programm-2026-2-halbjahr-barrierefrei-data.pdf'),
    dict(slug='jenfeld', name='Jenfeld', bezirk='Wandsbek', db_name='Elternschule Jenfeld', year='h2',
         page=f'{HH}/wandsbek/themen/familie-und-senioren/familien/elternschulen-wandsbek-36526',
         pdf=f'{DOK}/77126/791fc8fea86db7bf8ff297c829f26fff/es-jenfeld-programm-2026-2-halbjahr-barrierefrei-data.pdf'),
    dict(slug='steilshoop', name='Steilshoop', bezirk='Wandsbek', db_name='Elternschule Steilshoop', year='h2',
         page=f'{HH}/wandsbek/themen/familie-und-senioren/familien/elternschulen-wandsbek-36526',
         pdf=f'{DOK}/77128/bcc0c0cafc85fbadf043f66925b24205/es-steilshoop-programm-2026-2-halbjahr-barrierefrei-data.pdf'),
    dict(slug='bergedorf', name='Bergedorf', bezirk='Bergedorf', db_name='Elternschule Bergedorf', year='h2',
         page=f'{HH}/bergedorf/themen/familie-senioren/elternschule-56326',
         pdf='https://www.hamburg.de/resource/blob/1186404/0a954ac43faeaeb3a69968434e0a8bbb/programm-elternschule-2-halbjahr-2026-data.pdf'),
    dict(slug='dulsberg', name='Dulsberg', bezirk='Hamburg-Nord', db_name='Elternschule Dulsberg', year='h2',
         page=f'{HH}/hamburg-nord/elternschulen-in-hamburg-nord-37696',
         pdf=f'{DOK}/1162804/58561ccdead971e4b540cc3d5632d4ec/elternschule-dulsberg-2-2026-data.pdf'),
    dict(slug='langenhorn', name='Langenhorn', bezirk='Hamburg-Nord', db_name='Elternschule Langenhorn', year='h2',
         page=f'{HH}/hamburg-nord/elternschulen-in-hamburg-nord-37696',
         pdf=f'{DOK}/1175906/a0d3db061921c50e4d4ca8f7af0324e4/elternschule-langenhorn-2-2026-data.pdf'),
    dict(slug='horner-geest', name='Horner Geest', bezirk='Hamburg-Mitte', db_name='Elternschule Horner Geest', year='h2',
         page=f'{HH}/mitte/themen/familie-senioren/eltern/elternschule-horner-geest-67222',
         pdf=f'{DOK}/1076276/0d52601dd417207feb771446bee723e7/programm-es-horner-geest-august-bis-dezember-2026-data.pdf'),
    dict(slug='kirchdorf-sued', name='Kirchdorf-Süd', bezirk='Hamburg-Mitte', db_name='Elternschule Kirchdorf-Süd', year='h2',
         page=f'{HH}/mitte/themen/familie-senioren/eltern/elternschule-kirchdorf-sued-67224',
         pdf=f'{DOK}/1057904/fbc9e3a232dbbac3ec4a362aa31b879e/es-kirchdorf-2026-2-barrierefrei-data.pdf'),
    dict(slug='rothenburgsort', name='Rothenburgsort', bezirk='Hamburg-Mitte', db_name='Elternschule Rothenburgsort', year='h2',
         page=f'{HH}/mitte/themen/familie-senioren/eltern/elternschule-rothenburgsort-67228',
         pdf=f'{DOK}/1199330/e5e9c5ed944679244bef3606612eb025/es-rothenburgsort-2-2026-data.pdf'),
    # One brochure for Wilhelmsburg and Tor zur Welt (Veddel); entries name their 'Standort'.
    dict(slug='wilhelmsburg', name='Wilhelmsburg', bezirk='Hamburg-Mitte', db_name='Elternschule Wilhelmsburg', year='h2',
         page=f'{HH}/mitte/themen/familie-senioren/eltern/elternschule-wilhelmsburg-veddel-67230',
         pdf='https://tzw.hamburg.de/wp-content/uploads/sites/10/2026/06/ES_Wilhelmsburg_2026_2_Barrierefrei.pdf',
         alt_venue=(r'Standort\s+Tor zur Welt|Krieterstr', 'Tor zur Welt', 'Krieterstraße 2 D, 21109 Hamburg')),
    # Whole-year 2026 brochure; only entries that are still running are kept.
    dict(slug='am-grindel', name='Am Grindel', bezirk='Eimsbüttel', db_name='Elternschule Am Grindel', year='2026',
         page='https://elternschulen-eimsbuettel.de/elternschule-am-grindel/',
         pdf='https://elternschulen-eimsbuettel.de/wp-content/uploads/2026/03/ES_Grindel_2026_barrierfrei-2.pdf'),
]

# Programmes looked for but not imported (reported by the run, see NOT_IMPORTED in the report).
NOT_IMPORTED = {
    'Altona, Osdorf': 'run by Ev. Familienbildung; courses only in the fbs-hamburg.de web portal, no PDF',
    'Eidelstedt, Niendorf': 'only the 1st-half-year 2026 PDF is online',
    'Eimsbüttel': 'no current programme PDF (flyer from 2023)',
    'Billstedt': 'only the 2025 PDF is online',
    'Mümmelmannsberg': 'no programme PDF on the Bezirk page',
    'Finkenwerder': 'no programme PDF found',
}

WEEKDAYS = {'Mo': 0, 'Di': 1, 'Mi': 2, 'Do': 3, 'Fr': 4, 'Sa': 5, 'So': 6}
WD_LONG = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

CODE = r'[A-Z][A-Za-z]{0,2}\s?\d{1,3}(?:\.[a-z])?'
NOT_CODES = {'Ab', 'Am', 'Im', 'In', 'Um', 'An', 'Bis', 'Ca', 'Für', 'Mit', 'Zu', 'Ob', 'Bei', 'Von', 'Vom', 'Je', 'Nr', 'Tel'}
SCHED_RX = re.compile(r'^\W*(?:(?P<code>' + CODE + r')\s+)?(?:(?P<pre>[^|]{1,30}?)\s*\|\s*)?'
                      r'(?P<wd>Mo|Di|Mi|Do|Fr|Sa|So)\.(?P<rest>.*)$')
JEDEN_RX = re.compile(r'^\W*(?:(?P<code>' + CODE + r')\s+)?(?P<rest>(?:[Ff]ast\s+)?[Jj]ede[ns]?\s.*?(?P<day>Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag).*Uhr.*)$')
CODE_LINE_RX = re.compile(r'^\W*(?P<code>' + CODE + r')\s+(?P<title>[A-ZÄÖÜ„"»].*)$')
DATE_RX = re.compile(r'(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2}(?!\d|[.:]\d))?')
TIME_RANGE_RX = re.compile(r'(\d{1,2})(?:[.:](\d{2}))?\s*[–-]\s*(\d{1,2})(?:[.:](\d{2}))?\s*Uhr')
TIME_ONE_RX = re.compile(r'(\d{1,2})(?:[.:](\d{2}))?\s*Uhr')
PRICE_RX = re.compile(r'\d+(?:,\d{1,2})?\s*(?:€|Euro\b|EUR\b)[^|]{0,25}|kostenlos|kostenfrei|gebührenfrei', re.I)
SESSIONS_RX = re.compile(r'(\d{1,2})\s*(?:x|×|Termine|Terminen|Treffen)\b')
CONT_RX = re.compile(r'^\W*(\d{1,2}\.\d{1,2}\.|\d{1,2}([.:]\d{2})?\s*[–-]\s*\d|\d+(,\d+)?\s*(€|Euro)|\d+\s*(x|×|Termine)|.*Materialumlage|.*Uhr\b|(An|Je)\s+(je\s+)?\d+\s+Termin)')
OFFICE_RX = re.compile(r'Bürozeit|Büro-Sprech|Sprechzeit|Öffnungszeit|erreichen Sie|erreicht Ihr|für Sie da|für euch da|Wir sind für|Telefonzeit|Telefonisch erreich', re.I)
SKIP_TITLE_RX = re.compile(r'^\W*(Anmeldung|In Kooperation|In Zusammenarbeit|Kursgebühr|Gebühr|Tel\b|Tel\.|Leitung|Mit Anmeldung|Ohne Anmeldung|Kostenfrei|Kostenlos|Standort|Für alle|Alle\s|Kooperationsangebote|Infos? unter|Informationen unter|Auskunft|Mit Unterstützung|Gefördert|Eine Kooperation)', re.I)
DAY_HEADER_RX = re.compile(r'^(?:.{0,30}?\b)?(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)s?\s*:\s*|^\W*(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)s?\s*$', re.I)
GROUP_RX = re.compile(r'offen|treff|café|cafe|frühstück|club|spielkreis|krabbelgruppe|sprechstunde|beratung', re.I)
GROUP_BODY_RX = re.compile(r'offene[srn]? (angebot|treff|gruppe|kurs)|ohne anmeldung|einfach vorbei', re.I)
FREE_SECTION_RX = re.compile(r'(alle|sämtliche|sofern nicht anders angegeben)[^.]{0,80}(kostenlos|kostenfrei|gebührenfrei)', re.I)


def is_caps_line(s):
    """Leader-name lines and section headers: the first two words are written in capitals."""
    s = re.sub(r'^\W+', '', s).strip()
    if s.upper().startswith('MIT ') and len(s) > 4:
        s = s[4:]
    words = [w for w in re.split(r'[\s/,]+', s) if re.search(r'[A-Za-zÄÖÜäöüß]', w)]
    if not words:
        return False
    caps = lambda w: len(re.sub(r'[^A-Za-zÄÖÜäöüß]', '', w)) >= 2 and re.sub(r'[^A-Za-zÄÖÜäöü]', '', w).isupper()
    if len(words) == 1:
        return caps(words[0])
    return caps(words[0]) and caps(words[1])


def clean(s):
    s = re.sub(r'[\x00-\x1f­●•-]', ' ', s)  # soft hyphens, bullets, icon glyphs
    s = s.replace(' ', ' ')
    s = re.sub(r'(?<![A-Za-zÄÖÜäöü])(M|D|F|S)\s(o|i|r|a)\.', lambda m: m.group(1) + m.group(2) + '.'
               if m.group(1) + m.group(2) in WEEKDAYS else m.group(0), s)  # letter-spaced 'S o.' -> 'So.'
    return re.sub(r'\s+', ' ', s).strip(' |')


def pdf_lines(content):
    out = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            for line in (page.extract_text() or '').splitlines():
                out.append((pno, line))
    return out


def to_iso(d, m, y, mode):
    d, m = int(d), int(m)
    if not (1 <= d <= 31 and 1 <= m <= 12):
        return None
    if y:
        y = int(y) + (2000 if len(y) == 2 else 0)
    else:
        y = 2027 if (mode == 'h2' and m <= 6) else 2026
    try:
        return date(y, m, d)
    except ValueError:
        return None


def hhmm(h, m):
    h = int(h)
    return f'{h:02d}:{int(m or 0):02d}' if h < 24 else None


def parse_schedule(text, mode):
    """Dates, times, sessions and price from a schedule line (plus its continuation)."""
    text = re.sub(r'\([A-ZÄÖÜ]\.\s*[A-ZÄÖÜ][a-zäöüß-]+\)', '', text)  # '(M. Schorsch)' style leader hints
    dates = [x for x in (to_iso(*m.groups(), mode) for m in DATE_RX.finditer(text)) if x]
    rest = DATE_RX.sub(' ', text)
    t_from = t_to = None
    m = TIME_RANGE_RX.search(rest)
    if m:
        t_from, t_to = hhmm(m.group(1), m.group(2)), hhmm(m.group(3), m.group(4))
    else:
        m = TIME_ONE_RX.search(rest)
        if m:
            t_from = hhmm(m.group(1), m.group(2))
    ses = SESSIONS_RX.search(rest)
    is_range = bool(re.search(r'\d\.\s*[–-]\s*\d{1,2}\.\d', text))
    price = PRICE_RX.search(rest)
    return dict(dates=dates, time_from=t_from, time_to=t_to, is_range=is_range,
                sessions=int(ses.group(1)) if ses else None, price=price.group(0).strip() if price else None)


ORG_RX = re.compile(r'e\.\s?V\.|gGmbH|GmbH|Arbeitsgemeinschaft|börse\b|Job Coach|Gesundheitsamt|Landesarbeits|Stiftung|Sozialdienst|Verein\b|Beratungsstelle\b.*\b(Hamburg|Harburg)$')


NOTE_RX = re.compile(r'^\W*((An|Je)\s+(je\s+)?\d+\s+Termin|Ort:|Im Kursraum|Raum\s|Im Bewegungsraum|\d+(,\d+)?\s*(EUR|€|Euro)\b|\(|Termin)'
                     r'|(straße|str\.|weg|stieg|bek|allee|damm|platz|ring|chaussee)\s+\d+|\b\d{5}\s+Hamburg', re.I)
# titles that are really notes, cross-references or broken sentences
BAD_TITLE_RX = re.compile(r'^(Je\s|Dann\s|Bitte\s|Angebote?\s|Alle\s|Termine?\s|Kursort|Treffen auf|Ort:|Infos?\b|Hier\s|Wir\s)'
                          r'|\s(mit|und|für|der|die|das|von|zum|zur)$|^\W*\d|^(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s'
                          r'|[a-zäöü]{3,}\.\s+[A-ZÄÖÜ]', re.I)
BAD_TITLE_CS_RX = re.compile(r'\b[A-Z]{1,2}\s?\d{2,3}\s*[–-]\s*\d|\b(?!(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Apr|Sept|Okt|Nov|Dez)\b)[A-ZÄÖÜ][a-zäöü]+(-[A-ZÄÖÜ][a-zäöü]+)?\s\d{1,3}[a-z]?\b(?!\s*(Monat|Jahr|J\.|Wochen))')
LOWER_START_RX = re.compile(r'^[a-zäöü]')  # a title never starts in lower case -> fragment of a sentence
# quote attributions like 'Astrid Lindgren' above a title (some brochures print a motto per page)
QUOTE_AUTHOR_RX = re.compile(r'^[A-ZÄÖÜ][a-zäöüéè]+(\s(de|von|van|der|da))*(\s[A-ZÄÖÜ][a-zäöüéè-]+){1,2}$')


def is_skip(s):
    return bool(SKIP_TITLE_RX.match(s) or ORG_RX.search(s) or NOTE_RX.search(s)
                or re.search(r'www\.|@|\bTel\b|Tel\.|siehe Seite|Anmeld', s))


def is_boundary(lines, j, i0):
    """True if a title may start right after line j (block start, page number, header, note, sentence end)."""
    if j < i0:
        return True
    s = lines[j]
    return (not s or is_caps_line(s) or bool(re.fullmatch(r'\W*\d{1,3}\W*', s)) or is_skip(s)
            or s.rstrip().endswith(('.', '!', '?', ':', ')')))


def skip_continuation(lines, j):
    """Line j continues a note such as 'In Kooperation mit der Sammlung Falckenberg/' -> 'Deichtorhallen Hamburg'."""
    if j < 1 or not is_skip(lines[j - 1]):
        return False
    prev, cur = lines[j - 1].rstrip(), lines[j]
    if prev.endswith(('.', '!', '?', ':')):
        return False
    return prev.endswith(('/', '-', ',')) or bool(re.match(r'[a-zäöü„"]', cur)) or \
        bool(re.search(r'\b(mit|der|dem|des|und|von)$', prev))


def join_parts(parts):
    out = ''
    for p in parts:
        p = p.strip()
        if out.endswith('-') and re.match(r'[a-zäöü]', p):
            out = out.rstrip('-') + p
        else:
            out = (out + ' ' + p).strip()
    return out


def title_from(lines, i0, i1, codes):
    """Find the title of the entry whose schedule line follows lines[i0:i1].

    Returns (title, code, first_index, rule) or (None, None, None, None).
    """
    block = list(range(i0, i1))
    found = []
    # 1. a course-code line such as 'J16 Laterne basteln' (last one in the block)
    for k in reversed(block):
        m = CODE_LINE_RX.match(lines[k])
        if m and code_prefix(m.group('code')) in codes and re.search(r'[a-zäöü]', m.group('title')) \
                and not SCHED_RX.match(lines[k]) and not is_skip(m.group('title')):
            parts = [m.group('title')]
            nxt = [j for j in block if j > k]
            caps_at = next((j for j in nxt if is_caps_line(lines[j])), None)
            if caps_at is not None and caps_at - k <= 4:
                parts += [lines[j] for j in range(k + 1, caps_at) if not is_skip(lines[j]) and not skip_continuation(lines, j)]
            else:
                caps_at = None
            found.append((k, join_parts(parts), norm_code(m.group('code')), 'code', caps_at))
            break
    # 2. the lines just above the last run of leader names
    caps = [k for k in block if is_caps_line(lines[k])]
    if caps:
        k = caps[-1]
        while k - 1 >= i0 and is_caps_line(lines[k - 1]):
            k -= 1
        parts, j = [], k - 1
        while j >= i0 and len(parts) < 3:
            s = lines[j]
            if not s or is_caps_line(s) or re.fullmatch(r'\W*\d{1,3}\W*', s):
                break
            if is_skip(s) or skip_continuation(lines, j):
                if parts:
                    break
                j -= 1
                continue
            if parts and (s.rstrip().endswith(('.', '!', ':', '?', ')')) or len(s) > 60):
                break
            parts.insert(0, (j, s))
            j -= 1
        while parts and not re.match(r'\W*[A-ZÄÖÜ0-9„"»]', parts[0][1]):  # drop trailing note of the previous entry
            parts.pop(0)
        authors = [n for n, (_, p) in enumerate(parts[:-1]) if QUOTE_AUTHOR_RX.match(p.strip())]
        if authors:  # a motto and its author printed above the title
            parts = parts[authors[-1] + 1:]
        if parts:
            title = join_parts([p for _, p in parts])
            last = parts[-1][1].rstrip()
            abbrev = re.search(r'\b(J|ca|bzw|Co|Std|Min|Mon)\.$', last)
            sentence = (last.endswith('.') and not abbrev) or (last.endswith('!') and len(title.split()) > 6)
            if not sentence and len(title) <= 90:
                found.append((parts[0][0], title, None, 'names', k))
    if found:
        # the candidate closest to the schedule line wins (a code line may belong to an earlier header entry),
        # unless both point at the same leader names: then the code line is the start of this title
        if len(found) == 2 and found[0][4] is not None and found[0][4] == found[1][4]:
            k, title, code, rule, _ = found[0]
        else:
            k, title, code, rule, _ = max(found, key=lambda f: f[0])
        return title, code, k, rule
    # 3. no leader names: the last short heading-like line that starts after a boundary
    cand = None
    for k in block:
        s = lines[k]
        if s and re.match(r'\W*[A-ZÄÖÜ„"»]', s) and re.search(r'[a-zäöü]', s) and len(s) <= 45 \
                and not is_skip(s) and not skip_continuation(lines, k) and not CONT_RX.match(s) \
                and not s.rstrip().endswith(('.', ',', ';')) and not is_caps_line(s) and is_boundary(lines, k - 1, i0):
            cand = k
    if cand is not None:
        parts = [lines[cand]]
        nxt = lines[cand + 1] if cand + 1 < i1 else ''
        if nxt and len(nxt) <= 40 and re.match(r'[a-zäöü(]', nxt) and not is_skip(nxt):
            parts.append(nxt)
        return join_parts(parts), None, cand, 'heading'
    return None, None, None, None


def code_prefix(code):
    return re.match(r'[A-Za-z]+', code).group(0)


def norm_code(code):
    return re.sub(r'\s+', '', code)


def tidy_title(t, names=()):
    for n in names:
        t = re.sub(r'\s+(mit|bei|von)\s+' + re.escape(n) + r'\b', '', t, flags=re.I)
    t = DAY_HEADER_RX.sub('', t)
    t = re.sub(r'^NEU\s*[:!]?\s*', '', t)
    t = re.sub(r'(\w)-+ (\w)', r'\1-\2', t)  # line-break hyphen kept as compound hyphen
    t = re.sub(r'\s*\((s\.|siehe)[^)]*\)', '', t)
    t = re.sub(r'\s+(und|&)\s+\S+[-/]$', '', t)
    t = re.sub(r'\s+\*\s*((?:älter|jünger) als .*)$', r' (\1)', t)
    t = re.sub(r'\s+\*\s*([A-ZÄÖÜ].*)$', r' (geboren \1)', t)  # 'Babys * April bis Juni 26'
    t = re.sub(r'\s+Mit Kinderbetreuung$', '', t)
    t = re.sub(r'\s+', ' ', t).strip(' –-:|')
    return t


def parse_programme(prog, content):
    raw = pdf_lines(content)
    lines = [clean(l) for _, l in raw]
    pages = [p for p, _ in raw]
    mode = prog['year']
    full = '\n'.join(lines)

    # course-code prefixes used by this brochure (e.g. 'J', 'Ha', 'WI'); single letters only if frequent
    counts = {}
    for l in lines:
        m = SCHED_RX.match(l) or JEDEN_RX.match(l)
        if m and m.group('code'):
            p = code_prefix(m.group('code'))
            counts[p] = counts.get(p, 0) + 1
    codes = {p for p, n in counts.items() if n >= 2 and p not in NOT_CODES}
    if not codes:  # some brochures print the code only on the title line ('HO9 Offenes Elterncafé')
        tcounts = {}
        for l in lines:
            m = CODE_LINE_RX.match(l)
            if m and not SCHED_RX.match(l):
                p = code_prefix(m.group('code'))
                tcounts[p] = tcounts.get(p, 0) + 1
        codes = {p for p, n in tcounts.items() if n >= 3 and p not in NOT_CODES}

    # section headers that state 'all offers are free'
    free_pages, free_sections, section_of = set(), set(), {}
    current = None
    for idx, l in enumerate(lines):
        if idx == 0 or pages[idx] != pages[idx - 1]:
            current = None
        if current is None and is_caps_line(l) and len(l) > 5:
            current = l
        section_of[idx] = current
        if FREE_SECTION_RX.search(l):
            if current:
                free_sections.add(current)
            free_pages.add(pages[idx])
    all_free = bool(re.search(r'sofern nicht anders angegeben[^.]{0,40}(kostenlos|kostenfrei)', full, re.I))

    # leader names (capital lines right below a title line) -> words to strip from titles
    names = set()
    for k in range(1, len(lines)):
        if is_caps_line(lines[k]) and re.search(r'[a-zäöü]', lines[k - 1]) and not SCHED_RX.match(lines[k - 1]):
            for w in re.split(r'[\s/,&]+', re.sub(r'^MIT\s+', '', lines[k])):
                w = re.sub(r'[^A-Za-zÄÖÜäöüß-]', '', w)
                if len(w) >= 3 and w.isupper() and w not in ('UND', 'TEAM', 'HEBAMME', 'DIPL'):
                    names.add(w.capitalize())
    entries, skipped, prev_end, prev_title, prev_first, prev_coded = [], [], 0, None, 0, False
    i = 0
    while i < len(lines):
        l = lines[i]
        m = SCHED_RX.match(l)
        wd = None
        if m:
            wd = WEEKDAYS[m.group('wd')]
        else:
            m = JEDEN_RX.match(l)
            if m:
                wd = WD_LONG[m.group('day').lower()]
        if not m:
            i += 1
            continue
        sched = l
        end = i
        while end + 1 < len(lines) and end - i < 2 and not SCHED_RX.match(lines[end + 1]) \
                and CONT_RX.match(lines[end + 1]) and not CODE_LINE_RX.match(lines[end + 1]):
            sched += ' ' + lines[end + 1]
            end += 1
        context = ' '.join(lines[max(0, i - 3):i + 1])
        info = parse_schedule(sched, mode)
        office = bool(re.search(r'\bTel\b|Tel\.|erreich|Fax|E-Mail', sched)) or bool(OFFICE_RX.search(context))
        if office or not (info['time_from'] or info['dates']):
            prev_title = None
            prev_end = end + 1
            i = end + 1
            continue
        title, tcode, first, rule = title_from(lines, prev_end, i, codes)
        slot, pre = False, (m.groupdict().get('pre') or '')
        if title is None and prev_title and i - prev_end <= 2:  # same course, another date/time slot
            pre = ' '.join(lines[prev_end:i]) + ' ' + pre  # e.g. 'Für alle Kinder von 2 ½ bis 3 ½ Jahren'
            title, first, slot = prev_title, prev_first, True
        code = norm_code(m.group('code')) if m.group('code') and code_prefix(m.group('code')) in codes else tcode
        # Brochures with course codes: entries without a code are partner offers, office hours or cross-references
        # whose title and venue cannot be read reliably -> only keep them as extra slots of a coded course.
        reliable = bool(code) or (slot and prev_coded) or not codes
        if title and tidy_title(title, names) and reliable and not BAD_TITLE_RX.search(tidy_title(title, names)) \
                and not LOWER_START_RX.match(tidy_title(title, names)) and not BAD_TITLE_CS_RX.search(tidy_title(title, names)):
            body = ' '.join(lines[first:end + 1])
            section = section_of.get(i) or ''
            entries.append(dict(title=tidy_title(title, names), code=code, weekday=wd, sched=sched, info=info,
                                body=body, pre=pre, page=pages[i],
                                section=section, after=' '.join(lines[end + 1:end + 5]),
                                free_default=all_free or section in free_sections))
            prev_title, prev_first, prev_coded = title, first, bool(code) or (slot and prev_coded)
        else:
            prev_title = None
            if title:
                skipped.append(f'p{pages[i]}: {tidy_title(title)[:50]}')
        prev_end = end + 1
        i = end + 1
    return entries, skipped


AGE_SNIPPET_RX = re.compile(r'(?:\b(?:ab|bis|von)\s+(?:zu\s+)?)?(?:ca\.\s*)?\d+(?:,5)?\s*(?:½|1/2)?\s*(?:Monat\w*\s*)?'
                            r'(?:(?:-|–|bis)\s*(?:ca\.\s*)?\d+(?:,5)?\s*(?:½|1/2)?\s*)?(?:Monat|Jahr|J\.)', re.I)


def ages(text):
    """age_range() with 'X bis Y' / 'von X bis ca. Y' normalised to 'X-Y'."""
    t = re.sub(r'(\d)\s*(?:bis|und)\s*(?:ca\.\s*)?(\d)', r'\1-\2', text or '')
    t = re.sub(r'(\d+)\s*(1/2|½)', r'\1', t)
    t = re.sub(r'\bbis\s+zu\s+', 'bis ', t)
    m = re.search(r'(\d+)\s*Monat\w*\s*(?:-|–|bis)\s*(\d+)(?:,5)?\s*Jahr', t, re.I)
    if m:
        return int(m.group(1)), int(m.group(2)) * 12 + 12
    if re.search(r'schwangerschaftswoche|\bSSW\b', t, re.I) and not re.search(r'monat|jahr', t, re.I):
        return None, None
    return age_range(t)


def build_offer(prog, e, addr, idx):
    info = e['info']
    dates = sorted(info['dates'])
    title = e['title']
    body = e['body']
    euro = lambda x: re.sub(r'\s*\b(Euro|EUR)\b', ' €', x)
    price, free = parse_price(euro(info['price'])) if info['price'] else (None, None)
    if price is None:
        m = re.search(r'(Kursgebühr|Gebühr|Kosten)[^|]{0,40}?(\d+(?:,\d{1,2})?\s*(?:€|Euro))', body)
        if m:
            price, free = parse_price(euro(m.group(2)))
        elif re.search(r'kostenlos|kostenfrei|gebührenfrei', body, re.I):
            price, free = 'kostenlos', 1
        elif e['free_default']:
            price, free = 'kostenlos', 1
    # explicit ages ('3 bis 7 Monate') in title, then in the entry text; words like 'Baby' only as a last resort
    a_min = a_max = None
    for text in (e['pre'] + ' ' + title, body):
        m = AGE_SNIPPET_RX.search(text)
        if m:
            a_min, a_max = ages(m.group(0))
            break
    if a_min is None and a_max is None:
        a_min, a_max = ages(title)
    if re.search(r'schwanger|geburtsvorbereit|werdende', title, re.I):  # ages there are pregnancy months
        a_min = a_max = None
    open_end = bool(re.search(r'\bab\s*\d{1,2}\.\d', e['sched'])) or bool(re.search(r'jede[ns]?\s', e['sched'], re.I))
    if len(dates) == 1 and not info['is_range'] and not (info['sessions'] or 0) > 1 and not open_end:
        kind = 'termin'
    elif GROUP_RX.search(title + ' ' + e['section']) or GROUP_BODY_RX.search(body) or not dates:
        kind = 'gruppe'
    else:
        kind = 'kurs'
    sessions = info['sessions'] or (len(dates) if len(dates) > 2 and not info['is_range'] else None)
    if re.search(r'ohne anmeldung|offenes angebot|offener treff|einfach vorbei', body, re.I):
        registration = 'offen'
    elif re.search(r'mit anmeldung|anmeldung (erforderlich|nötig|unter|erbeten|bis)|bitte (vorher )?anmelden|melden sie sich', body, re.I):
        registration = 'nötig'
    else:
        registration = None

    venue, address, lat, lon = f'Elternschule {prog["name"]}', addr.get('address'), addr.get('lat'), addr.get('lon')
    alt = prog.get('alt_venue')
    if alt and re.search(alt[0], e['after'] + ' ' + e['sched']):
        venue, address, lat, lon = f'Elternschule {alt[1]}', alt[2], None, None

    parts = []
    if e['weekday'] is not None:
        parts.append(WD_SHORT[e['weekday']])
    if info['time_from']:
        parts.append(info['time_from'] + (f'–{info["time_to"]}' if info['time_to'] else ''))
    sched = ' '.join(parts)
    if dates:
        if info['is_range'] and len(dates) >= 2:
            sched += f', {dates[0]:%d.%m.}–{dates[-1]:%d.%m.}'
        elif len(dates) == 1:
            sched += f', ab {dates[0]:%d.%m.}' if open_end else f', {dates[0]:%d.%m.%Y}'
        else:
            sched += ', ' + ' / '.join(f'{d:%d.%m.}' for d in dates[:6]) + (' …' if len(dates) > 6 else '')
    elif re.search(r'jede[ns]?\s', e['sched'], re.I):
        sched = re.sub(r'^\W*(' + CODE + r'\s+)?', '', e['sched'])[:60]
    else:
        sched += ', wöchentlich'
    if sessions:
        sched += f', {sessions}×'

    return dict(
        source_ref=f'{prog["slug"]}:{e["code"] or "p%d-%d" % (e["page"], idx)}',
        title=title[:120], kind=kind, age_min_m=a_min, age_max_m=a_max, weekday=e['weekday'],
        time_from=info['time_from'], time_to=info['time_to'],
        start_date=dates[0].isoformat() if dates else None,
        end_date=dates[-1].isoformat() if dates and not (open_end and len(dates) == 1) else None,
        sessions=sessions, schedule=sched.strip(', '), price=price, free=free, registration=registration,
        venue=venue, address=address, lat=lat, lon=lon, url=prog['pdf'],
        provider=f'Elternschule {prog["name"]} (Bezirksamt {prog["bezirk"]})',
        raw={'page': e['page'], 'code': e['code'], 'schedule_line': e['sched'][:160]},
    )


def elternschule_addresses(con):
    out = []
    for name, lat, lon, raw in con.execute("SELECT name, lat, lon, raw FROM source_records WHERE source_id='hh_elternschule'"):
        r = json.loads(raw or '{}')
        out.append(dict(name=r.get('einrichtung') or name, street=r.get('adresse'), lat=lat, lon=lon,
                        address=', '.join(x for x in (r.get('adresse'), r.get('ort')) if x)))
    return out


def find_address(prog, known):
    for k in known:
        if prog.get('db_name') and k['name'] == prog['db_name']:
            return k
        if prog.get('db_street') and k['street'] == prog['db_street']:
            return k
    return {}


def main():
    con = connect()
    register_source(con, SOURCE_ID, 'Programme der Hamburger Elternschulen',
                    'https://www.hamburg.de/politik-und-verwaltung/behoerden/bsfb/familie/familienwegweiser/elternschulen--1126050',
                    'Fakten mit Link, keine offene Lizenz', 'Bezirksämter Hamburg, Elternschulen', priority=70)
    known = elternschule_addresses(con)
    offers, report = [], []
    for prog in PROGRAMMES:
        try:
            r = fetch(prog['pdf'], check_robots=True, retries=3)
        except Exception as ex:  # robots, 404 …: report and go on with the other programmes
            report.append((prog['name'], 'FAILED', str(ex)))
            continue
        save_raw(f'elternschule_{prog["slug"]}.pdf', r.content)
        entries, unreliable = parse_programme(prog, r.content)
        addr = find_address(prog, known)
        refs, seen, kept, past, dup = set(), set(), 0, 0, 0
        for idx, e in enumerate(entries, 1):
            o = build_offer(prog, e, addr, idx)
            key = (o['title'], o['weekday'], o['time_from'], o['start_date'], o['end_date'])
            if (e['code'] and e['code'] in seen) or key in seen:  # repeated in an overview table
                dup += 1
                continue
            seen.update({key, e['code']} - {None})
            last = o['end_date'] or o['start_date']
            if last and last < TODAY.isoformat():
                past += 1
                continue
            ref, n = o['source_ref'], 2
            while o['source_ref'] in refs:
                o['source_ref'] = f'{ref}-{n}'
                n += 1
            refs.add(o['source_ref'])
            offers.append(o)
            kept += 1
        report.append((prog['name'], 'ok', f'{len(entries)} entries, {kept} current, {past} already over, {dup} duplicates, {len(unreliable)} uncoded skipped'))
    n = replace_offers(con, SOURCE_ID, offers)
    for row in report:
        print(' | '.join(row))
    print('not imported:', '; '.join(f'{k}: {v}' for k, v in NOT_IMPORTED.items()))
    print(f'{n} offers imported into {SOURCE_ID}')


if __name__ == '__main__':
    sys.exit(main())
