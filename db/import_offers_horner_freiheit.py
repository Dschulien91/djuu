"""Import children's theatre, children's cinema and children's flea markets of the Stadtteilhaus Horner Freiheit (Horn).

Source: the category lists of the house's own calendar (TYPO3): https://www.hornerfreiheit.de/veranstaltungen/kindertheater,
/kinderkino and /flohmarkt. Each list item carries the start time (data-start), title, time span, teaser and a link to the
event page; the event page ('Das Wichtigste im Überblick') gives room and price ('Kosten'). Kindertheater and Kinderkino
are kept as they are; from the Flohmarkt category only children's / family markets are kept (the weekly Kleiderkammer and
the monthly neighbourhood craft market HORNER.MARKT.FREIHEIT are left out). The categories are often empty between
seasons; then finish() reports 'no current offers'. Library events in the house come from import_offers_buecherhallen.
robots.txt: 'User-agent: * / Disallow:' (everything allowed).
"""
import re
import sys
from datetime import datetime

from offers_util import age_of, clean, finish, get, osm_coords, price_of, termin

SOURCE_ID = 'horner_freiheit'
BASE = 'https://www.hornerfreiheit.de'
PROVIDER = 'Horner Freiheit – Das Stadtteilhaus'
ADDRESS = 'Am Gojenboom 46, 22111 Hamburg'
CATEGORIES = {'kindertheater': 'theater', 'kinderkino': 'theater', 'flohmarkt': 'flohmarkt'}
KIDS_MARKET = re.compile(r'kinder|baby|famil|spielzeug|kleidung für kinder|kids', re.I)
ITEM = re.compile(r'(?s)<div class="event".*?data-start="([^"]+)".*?<h4 class="event-title">(.*?)</h4>.*?event-time">(.*?)</p>'
                  r'.*?event-teaser">(.*?)</p>.*?href="([^"]+)"')


def main():
    lat, lon = osm_coords('Horner Freiheit')
    offers, details = [], {}
    for cat, topic in CATEGORIES.items():
        for start, title, span, teaser, href in ITEM.findall(get(f'{BASE}/veranstaltungen/{cat}').text):
            title, teaser = clean(title), clean(teaser)
            if cat == 'flohmarkt' and not KIDS_MARKET.search(f'{title} {teaser}'):
                continue
            url = BASE + href if href.startswith('/') else href
            if url not in details:
                page = clean(get(url).text)
                details[url] = page[page.find('Das Wichtigste im Überblick'):][:600]
            info = details[url]
            room = re.search(r'Veranstaltungsort:\s*(.*?)\s*Horner Freiheit', info)
            cost = re.search(r'Kosten:\s*(.*?)\s*(?:Kategorie|Weitere|$)', info)
            price, free = price_of(cost.group(1)) if cost else (None, None)
            t = datetime.fromisoformat(start)
            end = re.search(r'-\s*(\d{1,2}:\d\d)', clean(span))
            offers.append(termin(f'{href.rsplit("/", 1)[-1]}', title, t.date(), url, PROVIDER,
                                 venue='Horner Freiheit' + (f' ({room.group(1).strip()})' if room and room.group(1).strip() else ''),
                                 address=ADDRESS, lat=lat, lon=lon, time_from=t.strftime('%H:%M') if t.hour or t.minute else None,
                                 time_to=end.group(1).zfill(5) if end else None, price=price, free=free,
                                 age=age_of(f'{title} {teaser}'), topic=topic, description=teaser[:200] or None))
    return finish(SOURCE_ID, 'Horner Freiheit: Kindertheater, Kinderkino, Kinderflohmärkte', f'{BASE}/veranstaltungen/kindertheater', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
