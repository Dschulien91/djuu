"""Import the weekly children's swimming groups (Seepferdchen, Bronze, Silber, Gold, Juniorretter) of the Hamburg DLRG districts.

Sources are the districts' own 'Trainingszeiten' pages (TYPO3 sites <bezirk>.dlrg.de; robots.txt only blocks /typo3/ and two
named crawlers). Each page lists weekday, pool and time slots in free text; slots for adults (Rettungsschwimmen, Wassergymnastik,
Aktiven-/Mitgliederschwimmen, Erwachsene) are dropped. All groups need a prior registration or waiting list entry, mostly with
DLRG membership. Bezirk Oberelbe only trains members in the Geesthacht open-air pool in summer and is left out. No names are stored.

Course database: the districts' course lists come from the DLRG course database (dlrg.net seminar system), embedded as a
JSON table (data-data of 'DlrgSeminarPublicSeminarList') on the district pages in COURSE_PAGES. Its children's entries are
mostly the same weekly groups as season runs ('Bronze 26/27', 'Seesterne'), waiting lists per pool and level, and interest
lists without dates. They are merged, not added: an entry whose level (Seepferdchen, Bronze, Silber, Gold, Juniorretter,
Wassergewöhnung) and pool match a weekly group of the same district only sets that group's registration state
('Warteliste' when a waiting or interest list is open, 'geschlossen' when every matching run has 'Meldeschluss erreicht'
or 'ausgebucht'). Only a dated, bookable children's course that matches no weekly group becomes an offer of its own
(kind 'kurs', link to its course page). Adult courses (Erwachsenenschwimmen, Rettungsschwimmen, Erste Hilfe) are skipped.
"""
import json
import re
import sys
from datetime import date
from html import unescape

from offers_util import WEEKDAYS, clean, finish, get, group
from import_offers_sportvereine import place

SOURCE_ID = 'dlrg_hamburg_schwimmen'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6,
        'mo': 0, 'di': 1, 'mi': 2, 'do': 3, 'fr': 4, 'sa': 5, 'so': 6}
# district: (page, provider, [(marker in page text, venue, address)])
DISTRICTS = {
    'alster': ('https://alster.dlrg.de/kurse-und-sicherheit/trainingszeiten/', 'DLRG Bezirk Alster', [
        (r'Schwimmbad Wandsbek', 'Bäderland Wandsbek', 'Wendemuthstraße 14, 22041 Hamburg'),
        (r'Schwimmbad Ohlsdorf', 'Familienbad Ohlsdorf', 'Im Grünen Grunde 1, 22337 Hamburg')]),
    'altona': ('https://altona.dlrg.de/kurse-und-sicherheit/trainingszeiten/', 'DLRG Bezirk Altona', [
        (r'Schwimmhalle Blankenese', 'Hallenbad Blankenese', 'Simrockstraße 45, 22589 Hamburg'),
        (r'Schwimmhalle Festland', 'Bäderland Festland', 'Holstenstraße 30, 22767 Hamburg'),
        (r'Schwimmhalle St\. Pauli', 'Hallenbad St. Pauli', 'Budapester Straße 29, 20359 Hamburg'),
        (r'Schwimmhalle Swattenweg', 'Schwimmhalle Swattenweg', 'Swattenweg, Hamburg'),
        (r'Schwimmhalle Eidelstedt', 'Schwimmhalle Eidelstedt', 'Elbgaustraße, Hamburg')]),
    'bergedorf': ('https://bergedorf.dlrg.de/kurse-und-sicherheit/schwimmausbildung/trainingszeiten/', 'DLRG Bezirk Bergedorf', [
        (r'Bille-Bad', 'Bille-Bad', 'Reetwerder 25, 21029 Hamburg')]),
    'nord-ost': ('https://hh-no.dlrg.de/ausbildung/trainingszeiten/', 'DLRG Bezirk Hamburg Nord-Ost', [
        (r'Bartholomäus Therme', 'Bartholomäus-Therme', 'Bartholomäusstraße 95, 22083 Hamburg'),
        (r'Bäderland Wandsbek', 'Bäderland Wandsbek', 'Wendemuthstraße 14, 22041 Hamburg'),
        (r'Bäderland Rahlstedt', 'Bäderland Rahlstedt', 'Rahlstedter Bahnhofstraße 52, 22143 Hamburg')]),
    'harburg': ('https://harburg.dlrg.de/ausbildung/hallenzeiten/', 'DLRG Bezirk Harburg', [
        (r'Inselpark', 'Schwimmhalle Inselpark', 'Kurt-Emmerich-Platz 12, 21109 Hamburg')]),
    'wandsbek': ('https://wandsbek.dlrg.de/kurse-und-sicherheit/schwimmausbildung/', 'DLRG Bezirk Wandsbek', [
        (r'\bBillstedt\b', 'Bäderland Billstedt', 'Archenholzstraße 50a, 22117 Hamburg'),
        (r'\bBramfeld\b', 'Hallenbad Bramfeld', 'Fabriciusstraße 223, 22177 Hamburg'),
        (r'Wandsbek \(Wendemuthstraße\)', 'Bäderland Wandsbek', 'Wendemuthstraße 14, 22041 Hamburg')]),
}
SLOT = re.compile(r'(?:\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|MONTAG|DIENSTAG|MITTWOCH|DONNERSTAG|FREITAG|SAMSTAG|SONNTAG|'
                  r'Mo|Di|Mi|Do|Fr|Sa|So):?\s+)?(\d{1,2}:\d\d)\s*-\s*(\d{1,2}:\d\d)\s*(?:Uhr)?')
WEEKDAY = re.compile(r'\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\b', re.I)
KIDS = re.compile(r'seepferd|frühschwimm|bronze|silber|gold|kinder|wassergewöhn|wasserbewältig|juniorretter', re.I)
ADULT = re.compile(r'erwachsen|rettungsschwimm-?(grund|weiter)|rettungssport|wassergymnastik|aktivenschwimmen|mitglieder(schwimmen|tauchen)|'
                   r'wachgänger|freies training|wettkampf|drsa|rettungsschwimmkurse|ab 13 jahre', re.I)
STOP = re.compile(r'\s(?:Uhrzeit|Kursdatenbank|zum Kursangebot|Bei Fragen|Diese Website|Frühschwimmer \(Seepferdchen\) Gültig|Dienstag und)', re.I)


def district(key):
    page, provider, venues = DISTRICTS[key]
    text = clean(re.sub(r'(?s)<(script|style|header|footer|nav)\b.*?</\1>', ' ', get(page).text))
    text = text[text.find('Feedback') if 'Feedback' in text else 0:]
    slots = list(SLOT.finditer(text))
    offers, wd, venue = [], None, None
    for i, m in enumerate(slots):
        before = text[slots[i - 1].end() if i else 0:m.start()]
        # the last weekday and pool named before this slot apply to it
        named = [(h.start(), name, addr) for rx, name, addr in venues for h in re.finditer(rx, before)]
        if named:
            venue = max(named)
        days = WEEKDAY.findall(before)
        if days:
            wd = DAYS[days[-1].lower()]
        if m.group(1):
            wd = DAYS[m.group(1).lower()]
        rest = text[m.end():slots[i + 1].start() if i + 1 < len(slots) else len(text)]
        cut = [x.start() for x in [WEEKDAY.search(rest), STOP.search(rest)] if x]
        cut += [x.start() for rx, _, _ in venues for x in [re.search(rx, rest)] if x]
        title = rest[:min(cut)] if cut else rest
        title = re.sub(r'^\W+|\s*(Mindestvoraussetzung.*)$', '', title).strip(' ,;:')[:90]
        if wd is None or not venue or not KIDS.search(title) or ADULT.search(title):
            continue
        tf, tt = m.group(2).zfill(5), m.group(3).zfill(5)
        name, addr = venue[1], venue[2]
        lat, lon, address = place(name, addr)
        label = title if re.search(r'schwimm', title, re.I) else f'Schwimmausbildung {title}'
        offers.append(group(f'{key}:{wd}:{tf}:{title[:30]}', label, page, provider, weekday=wd, venue=name, address=address, lat=lat, lon=lon,
                            time_from=tf, time_to=tt, registration='nötig', topic='schwimmen',
                            schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich (nur nach Anmeldung)'))
    return offers


COURSE_PAGES = {  # district -> pages that embed the course database list
    'alster': ['https://alster.dlrg.de/kurse-und-sicherheit/schwimmausbildung/'],
    'altona': ['https://altona.dlrg.de/kurse-und-sicherheit/lehrgaenge-kurse/'],
    'bergedorf': ['https://bergedorf.dlrg.de/kurse-und-sicherheit/anmeldung/'],
    'nord-ost': ['https://hh-no.dlrg.de/ausbildung/schwimmen/'],
    'harburg': ['https://harburg.dlrg.de/ausbildung/kinderschwimmausbildung/'],
    'wandsbek': ['https://wandsbek.dlrg.de/kurse-und-sicherheit/anmeldung/'],
}
LEVELS = {'seepferdchen': r'seepferd|frühschwimm|wasserbewältig|seesterne|pinguine', 'wasser': r'wassergewöhn',
          'bronze': r'bronze|freischwimm', 'silber': r'silber', 'gold': r'gold', 'junior': r'juniorretter|jugend-rettungsschwimm'}
COURSE_ADULT = re.compile(r'erwachsen|rettungsschwimm(?!-team)|erste.hilfe|sanität|modul|prüfung|auffrischung|intern\b|feier|disco|'
                          r'hyggelig|theorie|einführung', re.I)
LISTS = re.compile(r'warteliste|interessent', re.I)


def levels(text):
    return {k for k, rx in LEVELS.items() if re.search(rx, text, re.I)}


def course_db(key):
    """Children's entries of the district's course database lists: dicts with title, levels, status, dates, link."""
    out, seen = [], set()
    for url in COURSE_PAGES.get(key, []):
        html = get(url).text
        for data in re.findall(r'<table id="DlrgSeminarPublicSeminarList\d+"[^>]*?data-data="([^"]*)"', html, re.S):
            for e in json.loads(unescape(data)):
                title = clean(e.get('titel'))
                if e.get('id') in seen or not (KIDS.search(title) or levels(title)) or COURSE_ADULT.search(title):
                    continue
                seen.add(e.get('id'))
                status = clean(e.get('anmeldungStatusAsText')).lower()
                out.append({'id': e.get('id'), 'title': title, 'levels': levels(title), 'status': status,
                            'list': bool(LISTS.search(title)) or 'warteliste' in status,
                            'closed': 'meldeschluss erreicht' in status or 'ausgebucht' in status,
                            'placeholder': (e.get('ende') or '') >= '2090' or 'infos hier' in title.lower(),
                            'start': e.get('beginn') or None, 'end': e.get('ende') or None, 'link': (e.get('link') or '').split('#')[0],
                            'place': clean(e.get('ort'))})
    return out


def merge_courses(key, groups, courses):
    """Set the registration state of matching weekly groups; return the dated courses that match no group."""
    provider = DISTRICTS[key][1]
    extra = []
    for c in courses:
        if c['placeholder']:
            continue
        pool = re.match(r'(Billstedt|Bramfeld|Wandsbek|Ohlsdorf|Rahlstedt|Barmbek)\b', c['title'])
        hits = [g for g in groups if levels(g['title']) & c['levels'] and (not pool or pool.group(1).lower() in g['venue'].lower())]
        if hits:
            for g in hits:
                state = 'Warteliste' if c['list'] and not c['closed'] else ('geschlossen' if c['closed'] else 'nötig')
                g.setdefault('_states', set()).add(state)
            continue
        if c['list'] or c['closed'] or not c['start']:
            continue
        start = date.fromisoformat(c['start'])
        end = date.fromisoformat(c['end']) if c['end'] else None
        extra.append(group(f'{key}:kurs:{c["id"]}', c['title'], c['link'] or DISTRICTS[key][0], provider, kind='kurs',
                           weekday=start.weekday(), start=start, end=end if end and end > start else None,
                           schedule=f'ab {start:%d.%m.%Y}' + (f' bis {end:%d.%m.%Y}' if end and end > start else ''),
                           venue=c['place'] or provider, registration='nötig', topic='schwimmen'))
    for g in groups:
        states = g.pop('_states', None)
        if states:  # the most open state wins: a free run beats a waiting list beats closed runs
            g['registration'] = next(x for x in ('nötig', 'Warteliste', 'geschlossen') if x in states)
            if g['registration'] != 'nötig':
                g['schedule'] = g['schedule'].replace('(nur nach Anmeldung)', '(Anmeldung: ' + g['registration'] + ')')
    return extra


def main():
    offers = []
    for key in DISTRICTS:
        try:
            got = district(key)
        except Exception as e:  # one district failing must not drop the others
            print(f'  {key}: {type(e).__name__}: {e}')
            continue
        extra = []
        try:
            courses = course_db(key)
            extra = merge_courses(key, got, courses)
            print(f'  {key}: {len(got)} groups, course database: {len(courses)} children\'s entries, {len(extra)} new courses, '
                  f'states {sorted({g["registration"] for g in got})}')
        except Exception as e:  # the course database only adds states and courses
            print(f'  {key}: {len(got)} groups; course database: {type(e).__name__}: {e}')
        offers += got + extra
    return finish(SOURCE_ID, 'DLRG Hamburg: Schwimmausbildung für Kinder', 'https://hamburg.dlrg.de/informieren/schwimmausbildung/',
                  'DLRG Landesverband Hamburg', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
