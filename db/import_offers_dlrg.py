"""Import the weekly children's swimming groups (Seepferdchen, Bronze, Silber, Gold, Juniorretter) of the Hamburg DLRG districts.

Sources are the districts' own 'Trainingszeiten' pages (TYPO3 sites <bezirk>.dlrg.de; robots.txt only blocks /typo3/ and two
named crawlers). Each page lists weekday, pool and time slots in free text; slots for adults (Rettungsschwimmen, Wassergymnastik,
Aktiven-/Mitgliederschwimmen, Erwachsene) are dropped. All groups need a prior registration or waiting list entry, mostly with
DLRG membership; the districts' course database and the Landesverband course search run on dlrg.net, whose robots.txt says
'Disallow: /' -> not used, the link goes to the district page instead. Bezirk Oberelbe only trains members in the Geesthacht
open-air pool in summer and is left out. No names are stored.
"""
import re
import sys

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


def main():
    offers = []
    for key in DISTRICTS:
        try:
            got = district(key)
            print(f'  {key}: {len(got)}')
            offers += got
        except Exception as e:  # one district failing must not drop the others
            print(f'  {key}: {type(e).__name__}: {e}')
    return finish(SOURCE_ID, 'DLRG Hamburg: Schwimmausbildung für Kinder', 'https://hamburg.dlrg.de/informieren/schwimmausbildung/',
                  'DLRG Landesverband Hamburg', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
