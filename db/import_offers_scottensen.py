"""Import the children's sport groups of SC Ottensen (Turnen & Freizeit, youth basketball) with weekday and time.

Source: https://www.scottensen.de/turnen (sections per sport: weekday, time and group in the h4 lines, hall below) and
https://www.scottensen.de/basketball (one card per team: birth years, training days, halls). Kept: groups for children
(Eltern-Kind-Turnen, Kinderturnen, Spiel-Sport-Turnen, children's Einrad groups) and youth basketball teams whose birth
years reach age 11 or younger and that take new players ('keine neuen Spieler' teams are left out). Adult groups are left
out. Coaches' names, phone numbers and e-mails are on the pages but never stored. Fees: SC Ottensen membership
(published on /sco): children 10 € a month, Kind-Eltern-Turnen 15 € a month.
robots.txt: Squarespace default (blocks AI crawlers by name, '*' only cart/config paths); scottensen.de is in PERMITTED_HOSTS.
"""
import re
import sys
from datetime import date

from import_offers_sportvereine import place
from offers_util import WEEKDAYS, clean, finish, get, group

SOURCE_ID = 'sc_ottensen'
BASE = 'https://www.scottensen.de'
PROVIDER = 'SC Ottensen von 1893 e.V.'
DAYS = {'montag': 0, 'dienstag': 1, 'mittwoch': 2, 'donnerstag': 3, 'freitag': 4, 'samstag': 5, 'sonntag': 6}
SPAN = r'(\d{1,2})[.:](\d\d)\s*[–-]\s*(\d{1,2})[.:](\d\d)'
KIDS = re.compile(r'kind|klasse|krabbel|jährige', re.I)
HALLS = {'Max-Brauer-Schule': ('Max-Brauer-Schule', None), 'Bülowstraße': ('Sporthalle Bülowstraße', 'Bülowstraße'),
         'Gymnasium Altona': ('Gymnasium Altona', None)}


def hm(h, m):
    return f'{int(h):02d}:{m}'


def hall(text):
    m = re.search(r'Sporthalle\s+([A-ZÄÖÜ][\wäöüß-]+(?:straße|str\.|weg)\s*\d+)', text)
    if m:
        lat, lon, address = place(m.group(1), f'{m.group(1)}, 22761 Hamburg')
        return f'Sporthalle {m.group(1)}', address, lat, lon
    return None, None, None, None


def section_age(text):
    t = text.lower()
    if 'krabbelalter' in t:
        m = re.search(r'bis einschließlich (\d+) jahr', t)
        return 9, (int(m.group(1)) + 1) * 12 if m else 48
    m = re.search(r'(\d+)-?\s*bis\s*(\d+)-jährige', t)
    if m:
        return int(m.group(1)) * 12, (int(m.group(2)) + 1) * 12
    m = re.search(r'ab (\d+)\. klasse', t)
    if m:  # school year n -> about n + 5 years old
        return (int(m.group(1)) + 5) * 12, None
    return None, None


def turnen():
    html = get(BASE + '/turnen').text
    offers = []
    for sec in re.split(r'<h2[^>]*>', html)[1:]:
        name = clean(sec.split('</h2>', 1)[0])
        text = clean(sec)
        venue, address, lat, lon = hall(text)
        if not KIDS.search(name + ' ' + text[:600]) or not venue:
            continue
        sec_age = section_age(text)
        full = re.search(r'zurzeit voll|keine freien', text, re.I)
        for h4 in re.findall(r'(?s)<h4[^>]*>(.*?)</h4>', sec):
            lines = [clean(x) for x in re.split(r'<br\s*/?>', h4) if clean(x)]
            label = next((x for x in lines if not re.match(r'(\w+)\s+\d', x) or re.match(r'(\w+)', x).group(1).lower() not in DAYS), '')
            if re.search(r'erwachsen', label, re.I) or (label and not KIDS.search(label + ' ' + name) and not sec_age[0]):
                continue
            for line in lines:
                m = re.match(r'(\w+)\s+' + SPAN, line)
                if not m or m.group(1).lower() not in DAYS:
                    continue
                wd, tf, tt = DAYS[m.group(1).lower()], hm(m.group(2), m.group(3)), hm(m.group(4), m.group(5))
                age = section_age(label) if section_age(label)[0] is not None else sec_age
                title = f'{name}: {label}' if label else name
                price = '15 € pro Monat (Kind und Elternteil, Mitgliedsbeitrag)' if 'eltern' in name.lower() else '10 € pro Monat (Mitgliedsbeitrag Kinder)'
                offers.append(group(f'turnen:{name[:20]}:{wd}:{tf}', title, BASE + '/turnen', PROVIDER, weekday=wd, venue=venue,
                                    address=address, lat=lat, lon=lon, time_from=tf, time_to=tt, age=age, price=price,
                                    registration='zurzeit voll (Warteliste)' if full else 'Mitgliedschaft im Verein',
                                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich', topic='sport'))
    return offers


def basketball():
    html = get(BASE + '/basketball').text
    year = date.today().year
    offers = []
    for card in re.split(r'<h2[^>]*>', html)[1:]:
        team = clean(card.split('</h2>', 1)[0])
        text = clean(re.sub(r'<br\s*/?>', ' | ', card))
        years = [int(y) if len(y) == 4 else 2000 + int(y) for y in re.findall(r'Jahrgang\s*(\d{4})(?:/(\d{2,4}))?', text)[0] if y] \
            if re.search(r'Jahrgang\s*\d{4}', text) else []
        if not years or max(years) < year - 11 or re.search(r'keine neuen Spieler', text):
            continue
        younger = re.search(r'Jahrgang\s*\d{4}\s*und jünger', text)
        age = (None if younger else (year - max(years) - 1) * 12, (year - min(years) + 1) * 12)
        for day, h1, m1, h2, m2, where in re.findall(r'(\w+),\s*(\d{1,2})[.:](\d\d)\s*[–-]\s*(\d{1,2})[.:](\d\d)(?:\s*Uhr)?,\s*([^|]+)', text):
            if day.lower() not in DAYS:
                continue
            wd, tf, tt = DAYS[day.lower()], hm(h1, m1), hm(h2, m2)
            key = next((k for k in HALLS if k in where), None)
            venue = HALLS[key][0] if key else clean(where).split('(')[0].strip()
            lat, lon, address = place(venue, HALLS[key][1] if key and HALLS[key][1] else None)
            offers.append(group(f'basketball:{team}:{wd}:{tf}', f'Basketball {team} (Jahrgang {"/".join(map(str, sorted(set(years))))}{" und jünger" if younger else ""})',
                                BASE + '/basketball', PROVIDER, weekday=wd, venue=venue, address=address, lat=lat, lon=lon,
                                time_from=tf, time_to=tt, age=age, price='10 € pro Monat + Abteilungszulage (Mitgliedsbeitrag)',
                                registration='Probetraining nach Absprache', schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, Training', topic='sport'))
    return offers


def main():
    offers = turnen() + basketball()
    return finish(SOURCE_ID, 'SC Ottensen: Kinderturnen, Eltern-Kind-Turnen, Einrad, Jugend-Basketball', BASE + '/turnen', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
