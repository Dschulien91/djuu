"""Import the holiday road-safety courses of the Hamburg police traffic teachers: Verkehrsfuchs and Fahrradfuchs.

Source: the info pages https://www.polizei.hamburg/verkehrsfuchs-2023-793244 and https://www.polizei.hamburg/fahrradfuchs-a-793306
link to a registration page each ('Hier geht es zur Anmeldung ...'). That page renders its course list with JavaScript,
but the list itself is a plain array in the page source ('const SCHEDULE = [{ venue, district, street, postal, dateRange,
times, unit, phone }, ...]'), so it is read with get() and no browser. Each school, week and time slot becomes one
multi-day 'termin' (the course runs every day of the week at the same time). Verkehrsfuchs: children of at least 5 who
start school after the summer holidays; Fahrradfuchs: pupils of the 3rd and 4th grade with their own bike and helmet.
Both are free; registration through the police form. Phone numbers of the police stations are not stored.
When the year's dates are over and the next year's are not yet published, finish() reports 'no current offers'.
robots.txt: polizei.hamburg publishes only a sitemap line (no rules).
"""
import re
import sys
from datetime import date

from import_offers_sportvereine import place
from offers_util import finish, get, termin

SOURCE_ID = 'polizei_verkehrsfuchs'
PROVIDER = 'Polizei Hamburg (Polizeiverkehrslehrer)'
COURSES = [  # info page, title, age in months, description
    ('https://www.polizei.hamburg/verkehrsfuchs-2023-793244', 'Verkehrsfuchs: Schulwegtraining für Vorschulkinder', (60, 84),
     'Wochenkurs in den Ferien, täglich eine Stunde: sicheres Überqueren der Fahrbahn; für Kinder ab 5, die nach den Sommerferien eingeschult werden'),
    ('https://www.polizei.hamburg/fahrradfuchs-a-793306', 'Fahrradfuchs: Fahrradtraining für die 3. und 4. Klasse', (96, 132),
     'Wochenkurs in den Ferien auf dem Schulhof und im Straßenverkehr; eigenes Fahrrad und Helm mitbringen, Haftpflichtversicherung nötig'),
]


def field(obj, key):
    m = re.search(rf'\b{key}\s*:\s*"([^"]*)"', obj)
    return m.group(1).strip() if m else None


def main():
    offers = []
    for info, title, age, desc in COURSES:
        page = get(info).text
        link = next((m.group(1) for m in re.finditer(r'(?s)<a[^>]+href="([^"]+)"[^>]*>(?:(?!</a>).)*?Anmeldung', page)), None)
        if not link:
            print(f'  {info}: no registration link')
            continue
        url = link if link.startswith('http') else 'https://www.polizei.hamburg' + link
        src = get(url).text
        block = re.search(r'(?s)const SCHEDULE\s*=\s*\[(.*?)\];', src)
        if not block:
            print(f'  {url}: no SCHEDULE array')
            continue
        for obj in re.findall(r'\{([^{}]*)\}', block.group(1)):
            venue, street, postal, district = (field(obj, k) for k in ('venue', 'street', 'postal', 'district'))
            rng = re.search(r'(\d\d)\.(\d\d)\.(?:(\d{4}))?\s*bis\s*(\d\d)\.(\d\d)\.(\d{4})', field(obj, 'dateRange') or '')
            if not venue or not rng:
                continue
            end = date(int(rng.group(6)), int(rng.group(5)), int(rng.group(4)))
            start = date(int(rng.group(3) or rng.group(6)), int(rng.group(2)), int(rng.group(1)))
            address = ', '.join(x for x in (street, postal) if x) or None
            lat, lon, _ = place(venue, address)
            times = re.findall(r'"(\d{1,2})[.:](\d\d)\s*bis\s*(\d{1,2})[.:](\d\d)\s*Uhr"', re.search(r'times\s*:\s*\[([^\]]*)\]', obj).group(1)) \
                if re.search(r'times\s*:\s*\[', obj) else []
            for h1, m1, h2, m2 in times or [(None,) * 4]:
                tf = f'{int(h1):02d}:{m1}' if h1 else None
                tt = f'{int(h2):02d}:{m2}' if h2 else None
                offers.append(termin(f'{title.split(":")[0]}:{venue}:{start}:{tf}', title, start, url, PROVIDER,
                                     venue=f'{venue} ({district})' if district and district not in venue else venue, address=address,
                                     lat=lat, lon=lon, time_from=tf, time_to=tt, end=end, free=1, price='kostenlos', age=age,
                                     registration='nötig (Online-Anmeldung der Polizei)', topic='sport', description=desc))
    return finish(SOURCE_ID, 'Polizei Hamburg: Verkehrsfuchs und Fahrradfuchs (Ferienkurse)', COURSES[0][0], PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
