"""Import children's and family dates of Tierpark Hagenbeck / Tropen-Aquarium from its public event overview.

Source: https://www.hagenbeck.de/de/tierpark/veranstaltungen/event_uebersicht.php (event cards with 'Alle Termine').
Kept: holiday programmes of the LI-Zooschule (Ferienaktion ..., ages from the card, booking via the Hagenbeck shop),
Zooschul-Aktionstage (dates and themes from the event page) and family evenings (Dschungel-Nächte). Dropped: photo
and botanical tours for adults, senior tours, talks.
robots.txt: none (404 page), so nothing is disallowed. Terms: earlier skipped because of the 'AGB &
Nutzungsbedingungen' page; no reuse clause found in the HTML imprint/AGB -> Julian asks.
"""
import re
import sys
from datetime import date, timedelta

from offers_util import MONTHS, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'hagenbeck'
BASE = 'https://www.hagenbeck.de'
PAGE = BASE + '/de/tierpark/veranstaltungen/event_uebersicht.php'
PROVIDER = 'Tierpark Hagenbeck'
ADDRESS = 'Lokstedter Grenzstraße 2, 22527 Hamburg'
KEEP = re.compile(r'ferien|kinder|famil|zooschule hautnah|dschungel-n', re.I)
DROP = re.compile(r'senior|fortgeschritten|foto|botanisch|vortrag', re.I)


def days_of(text):
    """'01.03. + 03.03. + 11.10. bis 13.10.2027', '05.07. - 09.07.2027 Mo - Fr', '05. + 12. + 19. Juni 2027' -> dates."""
    ys = list(re.finditer(r'(20\d\d)', text))
    if not ys:
        return []
    y = ys[-1]
    year = int(y.group(1))
    month_name = re.search(r'\b(' + '|'.join(MONTHS) + r')\b', text, re.I)
    head = text[:y.end()]
    if month_name:  # '05. + 12. + 19. Juni 2027'
        mo = MONTHS[month_name.group(1).lower()]
        return [date(year, mo, int(d)) for d in re.findall(r'(\d{1,2})\.', head[:month_name.start()])]
    out = []
    for part in re.split(r'\s*\+\s*', head):
        ds = [(int(d), int(m), int(yy) if yy else year) for d, m, yy in re.findall(r'(\d{1,2})\.(\d{1,2})\.(\d{4})?', part)]
        if len(ds) == 2 and re.search(r'bis|[-–]', part):
            a, b = date(ds[0][2], ds[0][1], ds[0][0]), date(ds[1][2], ds[1][1], ds[1][0])
            if (b - a).days > 31:  # long season range, not single days
                return []
            out += [a + timedelta(n) for n in range((b - a).days + 1) if (a + timedelta(n)).weekday() < 5]
        else:
            out += [date(yy, m, d) for d, m, yy in ds]
    return out


def main():
    lat, lon = osm_coords('Tierpark Hagenbeck', 'Hagenbecks Tierpark')
    html = get(PAGE).text
    offers = []
    for card in re.split(r'<div class="cell event-container">', html)[1:]:
        title = clean((re.search(r'(?s)<h3>(.*?)</h3>', card) or [0, ''])[1])
        if not title or DROP.search(title) or not KEEP.search(title):
            continue
        intro = clean((re.search(r'(?s)</h3>(.*?)<h4>Alle Termine', card) or [0, ''])[1])
        when = re.search(r'(?s)<h4>Alle Termine</h4>.*?full-date">(.*?)<span class="full-time">(.*?)</span>', card)
        link = re.search(r'href="(/de/_events/[^"]+)"', card)
        url = BASE + link.group(1) if link else PAGE
        if not when:
            continue
        times = re.findall(r'(\d{1,2})(?:[.:](\d\d))?\s*Uhr', clean(when.group(2)) + ' ' + intro)
        tf = f'{int(times[0][0]):02d}:{times[0][1] or "00"}' if times else None
        tt = None
        rng = re.search(r'(\d{1,2})[.:](\d\d)\s*bis\s*(\d{1,2})[.:](\d\d)\s*Uhr', clean(when.group(2)))
        if rng:
            tf, tt = f'{int(rng.group(1)):02d}:{rng.group(2)}', f'{int(rng.group(3)):02d}:{rng.group(4)}'
        dn = re.search(r'(?i)von (\d{1,2}) bis (\d{1,2}) Uhr', intro)
        if dn and 'dschungel' in title.lower():
            tf, tt = f'{int(dn.group(1)):02d}:00', f'{int(dn.group(2)):02d}:00'
        themes = {}
        days = days_of(clean(when.group(1)))
        if not days and link:  # Aktionstage: dates with themes on the event page
            page = clean(get(url).text)
            for d, m, y, theme in re.findall(r'(\d\d)\.(\d\d)\.(\d{4})\s*[–-]\s*([A-ZÄÖÜ][\wäöüß, ]{2,60}?)(?=\s+\d\d\.\d\d\.\d{4}|\s+Veranstaltungs)', page):
                day = date(int(y), int(m), int(d))
                days.append(day)
                themes[day] = theme.strip()
        age = age_of(intro)
        ferien = title.lower().startswith('ferienaktion')
        reg = 'nötig' if ferien or re.search(r'anmeld', intro, re.I) else None
        venue = 'Tropen-Aquarium Hagenbeck' if re.search(r'tropen-aquarium', intro, re.I) or re.search(r'_bilder/(ta|zooschule_ta)/', card) else PROVIDER
        slug = (link.group(1).rsplit('/', 1)[-1].replace('.php', '') if link else title).lower()
        for day in sorted(set(days)):
            t = f'{title.rstrip()}: {themes[day]}' if day in themes else title
            offers.append(termin(f'{slug}:{day}', t, day, url, PROVIDER, venue=venue, address=ADDRESS, lat=lat, lon=lon,
                                 time_from=tf, time_to=tt, age=age, registration=reg,
                                 price='Zooeintritt' if not ferien else None, free=0 if not ferien else None,
                                 topic='wissen' if ferien or 'zooschule' in title.lower() else 'feste'))
    return finish(SOURCE_ID, 'Tierpark Hagenbeck: Ferienaktionen und Familientermine', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
