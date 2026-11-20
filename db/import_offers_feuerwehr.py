"""Import family events of Hamburg's volunteer fire brigades (Laternenumzüge, Tag der offenen Tür, summer and spring fests,
Osterfeuer, children's carnival) from the event pages of the Freiwillige Feuerwehr Hamburg.

Source: https://www.feuerwehr-hamburg.de/veranstaltungskategorie/<category>/ (lists sorted by event date, newest first;
the event sitemap veranstaltung-sitemap*.xml has the same pages) and each event page ('Am DD.MM.YYYY um HH:MM Uhr.
Ort: ... Veranstalter: FF ...'). Only upcoming events are read (page 1, more pages only while they are still upcoming).
Always kept: Laternenumzug, Tag der offenen Tür, Sommerfest, Frühlingsfest, Osterfeuer. Other categories (Weihnachten,
Fasching, Stadtteilfest, Jugendfeuerwehr, Veranstaltung) only when the event names children or families;
Christmas-tree sales, concerts, marathons and training dates are not kept.
robots.txt: only /wp-admin/ is disallowed.
"""
import re
import sys
from datetime import date

from offers_util import FAMILY, clean, finish, get, termin

SOURCE_ID = 'feuerwehr_hamburg'
BASE = 'https://www.feuerwehr-hamburg.de'
PROVIDER = 'Freiwillige Feuerwehr Hamburg'
ALWAYS = ['laternenumzug', 'tag-der-offenen-tuer', 'sommerfest', 'fruehlingsfest', 'osterfeuer']
IF_FAMILY = ['weihnachtsveranstaltung', 'fasching', 'stadtteil-strassenfest', 'jugendfeuerwehr', 'veranstaltung', 'erntedank-fest-umzug']
NOT_FAMILY = re.compile(r'baumverkauf|tannenbaum|weihnachtsbaum|konzert|marathon|fortbildung|blutspende|tanz in den mai|ü\s?18|ab 18', re.I)
TODAY = date.today()


def listing(cat):
    """(date, title, url) of the upcoming events in one category."""
    out = []
    for page in range(1, 4):
        url = f'{BASE}/veranstaltungskategorie/{cat}/' + (f'page/{page}/' if page > 1 else '')
        html = get(url).text
        boxes = re.findall(r'(?s)<h6 class="date">(\d\d)\.(\d\d)\.(\d{4})</h6>.*?<h4><a class="grey" href="([^"]+)">(.*?)</a>', html)
        upcoming = [(date(int(y), int(m), int(d)), clean(t), u) for d, m, y, u, t in boxes]
        out += [x for x in upcoming if x[0] >= TODAY]
        if not upcoming or upcoming[-1][0] < TODAY or 'nextpostslink' not in html:
            break
    return out


def main():
    offers, seen = [], set()
    for cat in ALWAYS + IF_FAMILY:
        try:
            items = listing(cat)
        except Exception as e:
            print(f'  {cat}: {type(e).__name__} {str(e)[:60]}')
            continue
        for day, title, url in items:
            if url in seen or NOT_FAMILY.search(title):
                continue
            seen.add(url)
            html = get(url).text
            body = clean((re.search(r'(?s)(<h6 class="date">.*?)(?:Filmprojekte|<footer)', html) or [0, ''])[1])
            if cat in IF_FAMILY and not FAMILY.search(f'{title} {body}') or NOT_FAMILY.search(body[:300]):
                continue
            when = re.search(r'Am (\d\d)\.(\d\d)\.(\d{4}) um (?:ab )?(\d{1,2})[:.](\d\d)', body)
            if when:
                day = date(int(when.group(3)), int(when.group(2)), int(when.group(1)))
            tf = f'{int(when.group(4)):02d}:{when.group(5)}' if when else None
            if cat != 'laternenumzug' and (tf or '') >= '19:00' and not FAMILY.search(f'{title} {body}'):
                continue  # evening fire-station party
            until = re.search(r'bis (?:zum )?(\d\d)\.(\d\d)\.(\d{4})', body[body.find('Am '):] if 'Am ' in body else '')
            place = clean((re.search(r'Ort:\s*(.*?)\s*(?:Link im WWW:|Veranstalter:|$)', body) or [0, ''])[1]).strip(' ,')
            host = clean((re.search(r'Veranstalter:\s*(.{3,60}?)\s*$', body) or [0, ''])[1])
            org = re.sub(r'^FF\b', 'Freiwillige Feuerwehr', host) if host else PROVIDER
            if place and re.match(r'.*\d{5}\s+Hamburg$', place):
                place = re.sub(r'\s+(\d{5}\s+Hamburg)$', r', \1', place)
            elif place and re.search(r'\d', place) and 'Hamburg' not in place:
                zip_ = re.search(r'\b(2\d{4})\s+Hamburg', body)
                place = f'{place}, {zip_.group(1)} Hamburg' if zip_ else f'{place}, Hamburg'
            end = date(int(until.group(3)), int(until.group(2)), int(until.group(1))) if until else None
            offers.append(termin(f'{url.rstrip("/").rsplit("/", 1)[-1]}:{day}', title, day, url, org, venue=org,
                                 address=place or None, time_from=tf, end=end, free=None,
                                 topic='feste' if cat in ('laternenumzug', 'weihnachtsveranstaltung', 'osterfeuer', 'fasching') else None,
                                 description=None))
    return finish(SOURCE_ID, 'Freiwillige Feuerwehr Hamburg: Laternenumzüge, Tage der offenen Tür, Feste', BASE + '/veranstaltungskategorie/laternenumzug/',
                  'jeweilige Freiwillige Feuerwehr (siehe provider)', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
