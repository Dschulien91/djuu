"""Import public family performances of the FUNDUS THEATER (Hamburg-Eilbek) from the JSON API behind its website.

Source: https://www.fundus-theater.de/programm/aktueller-spielplan (a React app); the data comes from the TYPO3 headless
API https://api.fundus-theater.de/programm/aktueller-spielplan[/page-N] (one news item per performance, with weekday,
date and time). Read with plain get(), no browser needed.
Kept: performances in the 'Wochenende' category or on weekends / afternoons. Dropped: weekday-morning dates for Kita
groups and school classes. Age: the lowest 'N Jahre' category, or 'ab N Jahre' from the production page.
robots.txt (www and api): 'Disallow:' (empty), everything allowed.
"""
import re
import sys
from datetime import date

from offers_util import age_of, clean, finish, get, osm_coords, termin

SOURCE_ID = 'fundus_theater'
BASE = 'https://www.fundus-theater.de'
API = 'https://api.fundus-theater.de'
PAGE = BASE + '/programm/aktueller-spielplan'
PROVIDER = 'FUNDUS THEATER'
ADDRESS = 'Hasselbrookstraße 25, 22089 Hamburg'
PRICE = 'Kind 9 €, Erwachsene 11 €'


def news_lists(data):
    for col in (data.get('content') or {}).values():
        for el in col:
            d = (el.get('content') or {}).get('data') or {}
            if el.get('type') == 'news_pi1' and 'pagination' in d:
                yield d


def production_age(slug, cache={}):
    """'ab 5 Jahre' from the production page (teaser of the first block)."""
    if slug not in cache:
        cache[slug] = (None, None)
        try:
            d = get(API + slug).json()
            for el in d['content'].get('colPos0', [])[:3]:
                a = age_of(clean(el['content'].get('teaser')))
                if a[0] is not None:
                    cache[slug] = a
                    break
        except Exception as e:
            print('  no production page', slug, type(e).__name__)
    return cache[slug]


def main():
    lat, lon = osm_coords('Fundus-Theater', 'Fundus Theater')
    items, n_pages, page = [], 1, 1
    while page <= min(n_pages, 12):
        d = get(API + '/programm/aktueller-spielplan' + (f'/page-{page}' if page > 1 else '')).json()
        for lst in news_lists(d):
            n_pages = int(lst['pagination'].get('numberOfPages') or 1)
            items += lst.get('list') or []
        page += 1
    offers = []
    for it in items:
        m = re.search(r'(\d\d)\.(\d\d)\.(\d{4})(?:\s*-\s*(\d\d:\d\d))?', it.get('datetime') or '')
        if not m:
            continue
        day = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        tf = m.group(4)
        cats = {c['slug'] for c in it.get('categories') or []}
        public = 'wochenende' in cats or day.weekday() >= 5 or (tf and tf >= '14:00')
        if not public:
            continue  # weekday-morning dates for Kita groups / school classes
        ages = sorted(int(c.split('-')[0]) for c in cats if re.fullmatch(r'\d+-jahre', c))
        age = (ages[0] * 12, None) if ages else production_age(it['slug'])
        if age[0] is None:
            age = production_age(it['slug'])
        title = clean(it['title'])
        ensemble = clean(it.get('teaser'))
        if ensemble and 'premiere' in ensemble.lower():
            title += ' (Premiere)'
        offers.append(termin(f'{it["uid"]}:{day}', title, day, BASE + it['slug'], PROVIDER, venue=PROVIDER, address=ADDRESS,
                             lat=lat, lon=lon, time_from=tf, price=PRICE, free=0, age=age, topic='theater',
                             description=re.sub(r'\s*-\s*Premiere', '', ensemble)[:120] or None))
    return finish(SOURCE_ID, 'FUNDUS THEATER: Familienvorstellungen', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
