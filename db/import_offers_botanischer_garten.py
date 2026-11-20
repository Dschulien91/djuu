"""Import the children's programme of the Loki-Schmidt-Garten (Botanischer Garten der Universität Hamburg, Klein Flottbek).

Source: the 'Für Kinder' pages of https://www.botanischer-garten.uni-hamburg.de/veranstaltungen/fuer-kinder.html:
- Marionettentheater (summer guest plays in the tent in the garden): per play a date range with weekdays and times
  ('Sa. 26.06. bis So. 11.07. Mi.-So. um 15.00 Uhr', '... Mi., Do., Fr., Sa., So. um 15.00 Uhr und Fr., Sa. um 19.00 Uhr')
  or a list of single dates, plus age and price; days the page names as 'keine Vorstellung' are left out.
- Ernte wie vor 100 Jahren (one autumn date, children from 5, 8 €, reservation from the date named on the page).
- Mitmachprogramm bei den Norddeutschen Apfeltagen (weekend in September).
Each show or day becomes one 'termin'. The site's Atom feed (/veranstaltungen/veranstaltungen.atom) carries no dates and
currently only lectures; the annual programme PDF (bg-programm-<year>.pdf) lists guided tours, workshops and lectures for
adults, so neither is used. The Zirkus Zartinka shows link to the circus' own site and are not imported here.
Names of artists and guides are not stored. The Loki Schmidt Stiftung (source loki_schmidt) is a different provider.
robots.txt: none published (the URL returns the HTML start page) = no rules.
"""
import re
import sys
from datetime import date, timedelta

from offers_util import MONTHS, age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'botanischer_garten'
BASE = 'https://www.botanischer-garten.uni-hamburg.de/veranstaltungen/fuer-kinder/'
PROVIDER = 'Loki-Schmidt-Garten (Botanischer Garten der Universität Hamburg)'
VENUE, ADDRESS = 'Loki-Schmidt-Garten', 'Ohnhorststraße, 22609 Hamburg'  # as on the garden's event pages
WD = {'mo': 0, 'di': 1, 'mi': 2, 'do': 3, 'fr': 4, 'sa': 5, 'so': 6}
D = r'(\d{1,2})\.\s?(\d{1,2})\.'


def text_of(page):
    html = get(BASE + page).text
    m = re.search(r'(?s)<main.*?</main>', html)
    return clean(m.group(0) if m else html)


def days(spec):
    """'Mi.-So.' / 'Mi., Do., Fr.' / 'Fr., Sa.' -> set of weekdays."""
    out = set()
    for a, b in re.findall(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s*(?:-|–|bis)\s*(Mo|Di|Mi|Do|Fr|Sa|So)\b', spec):
        i, j = WD[a.lower()], WD[b.lower()]
        out |= set(range(i, j + 1)) if i <= j else set(range(i, 7)) | set(range(0, j + 1))
    spec = re.sub(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s*(?:-|–|bis)\s*(Mo|Di|Mi|Do|Fr|Sa|So)\b', '', spec)
    out |= {WD[d.lower()] for d in re.findall(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\b', spec)}
    return out


def marionetten(offers):
    page = 'marionetten-theater.html'
    text = text_of(page)
    y = re.search(r'Spielzeit:.*?(20\d\d)', text)
    year = int(y.group(1)) if y else date.today().year
    skip = set()
    for d, mon in re.findall(r'Am (\d{1,2})\. (\w+)[^.]*?keine Vorstellung', text):
        if mon.lower() in MONTHS:
            skip.add(date(year, MONTHS[mon.lower()], int(d)))
    # one block per play: CAPITALISED TITLE ... up to the next title or the reservation note
    for title, body in re.findall(r'([A-ZÄÖÜ][A-ZÄÖÜ ]{5,})\s+(.*?)(?=\s[A-ZÄÖÜ][A-ZÄÖÜ ]{5,}\s|Information und Reservierung|$)', text):
        sched = body.split(' Spieldauer')[0]
        age = age_of(body)
        price = re.search(r'Eintritt:\s*([\d,]+\s*€\s*/\s*[\d,]+\s*€(?:\s*ermäßigt)?)', body)
        shows = []
        rng = re.search(r'\w\w\.\s*' + D + r'\s*bis\s*\w\w\.\s*' + D + r'(.*)', sched)
        if rng:
            start, end = date(year, int(rng.group(2)), int(rng.group(1))), date(year, int(rng.group(4)), int(rng.group(3)))
            for spec, hh, mm in re.findall(r'((?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\.?[\s,\-–]*)+)um (\d{1,2})[.:](\d\d)', rng.group(5)):
                wds = days(spec)
                d = start
                while d <= end:
                    if d.weekday() in wds:
                        shows.append((d, f'{int(hh):02d}:{mm}'))
                    d += timedelta(days=1)
        else:
            t = re.search(r'um (\d{1,2})[.:](\d\d)', sched)
            for dd, mo in re.findall(D, sched):
                shows.append((date(year, int(mo), int(dd)), f'{int(t.group(1)):02d}:{t.group(2)}' if t else None))
        name = title.title().replace(' Und ', ' und ').replace(' Die ', ' die ')
        for day, tf in shows:
            if day in skip:
                continue
            offers.append(termin(f'marionetten:{name}:{day}:{tf}', f'Marionettentheater: {name}', day, BASE + page, PROVIDER,
                                 venue=f'{VENUE} (Theaterzelt)', address=ADDRESS, time_from=tf, age=age,
                                 price=price.group(1) if price else None, registration='Reservierung empfohlen', topic='theater'))


def ernte(offers):
    page = 'ernte-wie-vor-100-jahren.html'
    text = text_of(page)
    m = re.search(r'Termin:\s*\w+,\s*(\d{1,2})\.\s*(\w+)\s*(20\d\d)', text)
    if not m or m.group(2).lower() not in MONTHS:
        return
    day = date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
    book = re.search(r'Buchbar ab:\s*([^T]+?\d{4})', text)
    price = re.search(r'Karten:\s*([\d,]+\s*€[^.]*?Kind)', text)
    offers.append(termin(f'ernte:{day}', 'Ernte wie vor 100 Jahren (Mitmachangebot für Kinder ab 5)', day, BASE + page, PROVIDER,
                         venue=f'{VENUE} (Nutzpflanzengarten)', address=ADDRESS, age=age_of(text) if age_of(text)[0] else (60, None),
                         price=price.group(1) if price else None,
                         registration=f'Reservierung nötig (ab {book.group(1).strip()})' if book else 'Reservierung nötig', topic='wissen'))


def apfeltage(offers):
    page = 'apfeltage-fuer-kinder.html'
    text = text_of(page)
    m = re.search(r'vom (\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*(\w+)\s*(20\d\d)', text)
    if not m or m.group(3).lower() not in MONTHS:
        return
    month, year = MONTHS[m.group(3).lower()], int(m.group(4))
    start, end = date(year, month, int(m.group(1))), date(year, month, int(m.group(2)))
    offers.append(termin(f'apfeltage:{start}', 'Mitmachprogramm für Kinder bei den Norddeutschen Apfeltagen', start, BASE + page, PROVIDER,
                         venue=VENUE, address=ADDRESS, end=end, topic='kreativ'))


def main():
    offers = []
    for part in (marionetten, ernte, apfeltage):
        try:
            part(offers)
        except Exception as e:  # one page failing must not drop the others
            print(f'  {part.__name__}: {type(e).__name__} {e}')
    lat, lon = osm_coords('Loki-Schmidt-Garten')
    for o in offers:
        o.update(lat=lat, lon=lon)
    return finish(SOURCE_ID, 'Loki-Schmidt-Garten: Kinderprogramm (Marionettentheater, Ernte, Apfeltage)',
                  'https://www.botanischer-garten.uni-hamburg.de/veranstaltungen/fuer-kinder.html', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
