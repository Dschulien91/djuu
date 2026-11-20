"""Import the children's courses of SC Alstertal-Langenhorn (SCALA) from the yolawo booking widgets on its sport pages.

Source: https://scala-sportclub.de/ (the club's own site; scala-hamburg.de / sc-alstertal-langenhorn.de redirect there).
The children's sport pages (Kinderturnen, Eltern-Kind-Turnen, Pampersturnen, Kindertanz, Psychomotorik, Schwimmen,
Akrobatik, Parkour, Einrad ...) embed yolawo widgets; for each widget the course list the widget itself loads
(https://api.yolawo.de/widgets/<id>/offers?view=default) is read as JSON, same reader as import_offers_tsg_bergedorf.
Course series become one 'kurs' per weekday slot with time, place and date range; camps and one-day offers a 'termin'.
On children's pages every offer that is not for adults is kept; on mixed pages only titles naming a child age or a
children's word. Titles are stripped of course leaders' first names and of the place suffix (the place is stored).
robots.txt: 'Disallow:' empty (everything allowed); scala-sportclub.de and yolawo.de are in PERMITTED_HOSTS.
The site answers 429 when read quickly, so the pages are read with a longer pause.
"""
import re
import sys
import time

from import_offers_sportvereine import ages, place
from import_offers_tsg_bergedorf import NOT_KIDS, kids as kids_title, widget_offers
from offers_util import age_of, finish, get

SOURCE_ID = 'scala'
BASE = 'https://scala-sportclub.de'
PROVIDER = 'SC Alstertal-Langenhorn (SCALA)'
# Children's pages first (they give the most specific link), the all-in-one children's list last.
KIDS_PAGES = ['/eltern-kind-turnen/', '/kinderturnen/', '/sportangebot/pampersturnen/', '/sportangebot/familienturnen/',
              '/sportangebot/kindertanz/', '/psychomotorik/', '/schwimmen/', '/geraeteturnen-fuer-kinder/', '/akrobatik/',
              '/parkour/', '/einrad/', '/rope-skipping/', '/skaten/', '/ballett/', '/sportangebot/fussball/', '/judo/',
              '/sport-kita/', '/turnen-freizeit-fuer-kinder-und-jugendliche/']
MIXED_PAGES = ['/inklusion/', '/capoeira/', '/karate/', '/taekwondo/', '/kung-fu/', '/leichtathletik/', '/tanzen/', '/cheerleading/']
SPORT = {'/judo/': 'Judo', '/capoeira/': 'Capoeira', '/karate/': 'Karate', '/taekwondo/': 'Taekwondo', '/kung-fu/': 'Kung Fu',
         '/leichtathletik/': 'Leichtathletik', '/einrad/': 'Einrad', '/ballett/': 'Ballett', '/parkour/': 'Parkour',
         '/akrobatik/': 'Akrobatik', '/cheerleading/': 'Cheerleading', '/skaten/': 'Skaten'}
NOUNS = {'eltern', 'kind', 'kindern', 'mama', 'papa', 'musik', 'spaß', 'begleitung', 'ball', 'bällen'}
NAME = r'[A-ZÄÖÜ][a-zäöüß]+'


def tidy(raw):
    """'Kinderturnen (3-5 Jahre) mit Kyra und Kirsten - Foorthkamp 42' -> 'Kinderturnen (3-5 Jahre)'."""
    t = re.sub(rf'\s+(?:mit|bei)\s+({NAME})(?:\s*(?:,|/|und|&)\s*{NAME})*',
               lambda m: m.group(0) if m.group(1).lower() in NOUNS else '', raw)
    t = re.sub(r'^[A-Z]-\d+\s+\w\w\.\s*\d?\s+', '', t)                 # swim course codes 'E-103 Mo.3 '
    t = re.sub(r'\s+(Eberhofweg|Sasel)\s+\d+/\d+$', r' (\1)', t)       # swim term suffix 'Eberhofweg 26/3'
    t = re.sub(r'\(\s+', '(', re.sub(r'\s+\)', ')', t)).replace('))', ')')
    # split off place and notes ('... - Foorthkamp 42', '...)- Schluchtweg 1', '... 40- der Kurs'), never inside brackets
    masked = re.sub(r'\([^)]*\)', lambda m: m.group(0).replace('-', '~'), t)
    parts = [p.replace('~', '-').strip() for p in re.split(r'\s+-\s*|(?<=\S)-\s+(?=[A-ZÄÖÜ])|(?<=\d)-\s+', masked) if p.strip()]
    title = parts[0] if parts else t
    if re.fullmatch(r'20\d\d', title) and len(parts) > 1:
        title, parts = parts[1], parts[1:]
    if re.fullmatch(r'(?i)(sommer|herbst|oster|frühjahrs|winter|weihnachts)ferien|20\d\d', title) and len(parts) > 1:
        title = f'{title}: {parts[1]}'
    if age_of(title)[0] is None:  # age only in a later part ('Skaten für Anfänger - 6-8 Jahre - Grellkamp 40')
        extra = next((p for p in parts[1:] if age_of(p)[0] is not None and len(p) < 20), None)
        if extra:
            title = f'{title} ({extra})'
    return re.sub(r'\s+', ' ', title).strip(' -–,')


def kids_page(raw):
    if NOT_KIDS.search(raw) or re.search(r'jugendliche ab 1[3-9]|ab 1[3-9] jahr', raw, re.I):
        return False
    a = age_of(raw)
    return a[0] is None or a[0] < 13 * 12


def main():
    offers = []
    for paths, keep in ((KIDS_PAGES, kids_page), (MIXED_PAGES, kids_title)):
        widgets = {}
        for path in paths:
            try:
                html = get(BASE + path).text
            except Exception as e:
                print(f'  {path}: {type(e).__name__} {str(e)[:60]}')
                continue
            for wid in re.findall(r'widgets\.yolawo\.de/w/([0-9a-f]{24})', html):
                widgets.setdefault(wid, BASE + path)
            time.sleep(3)
        offers += widget_offers(widgets, PROVIDER, kids=keep, venues={}, tidy=tidy)
    for o in offers:
        path = o['url'][len(BASE):]
        if path in SPORT and SPORT[path].lower() not in o['title'].lower():
            o['title'] = f'{SPORT[path]}: {o["title"]}'
        if o['age_min_m'] is None:
            if re.search(r'ab laufalter', o['title'], re.I):  # walking age, about one year
                hi = re.search(r'bis (\d+) jahr', o['title'], re.I)
                a = (12, int(hi.group(1)) * 12 + 12 if hi else None)
            else:
                a = ages(o['title'])
            o['age_min_m'], o['age_max_m'] = a
        if not o.get('lat'):  # widget slot without coordinates: street of the venue name in the city's facility records
            lat, lon, address = place(o['venue'], o.get('address'))
            o.update(lat=lat, lon=lon, address=o.get('address') or address)
    return finish(SOURCE_ID, 'SC Alstertal-Langenhorn: Kinderkurse (Turnen, Tanz, Schwimmen, Camps)', BASE + KIDS_PAGES[0], PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
