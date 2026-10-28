# DISABLED (2026-10-28): elbphilharmonie.de robots.txt explicitly disallows ClaudeBot ("User-agent: ClaudeBot / Disallow: /").
# Djuu respects explicit opt-outs of Claude-operated crawlers: request a data partnership instead of running this importer.
import sys
if __name__ == '__main__':
    sys.exit('Disabled: Elbphilharmonie opts out of ClaudeBot. Ask for a feed instead.')
"""Import family and children's concerts of Elbphilharmonie / Laeiszhalle as offers.

robots.txt disallows every URL with a query ('/*?*') and the date/calendar pages, so the event list
cannot be used. Allowed route: /sitemap-events.xml (its second page '?p=2' is disallowed and skipped),
whose detail URLs /de/programm/<slug>/<id> are allowed. The sitemap has no dates, so we pre-filter by
slug keywords that indicate children's / family formats and read the MusicEvent JSON-LD plus the
subtitle (age) and price box of at most MAX_DETAILS detail pages. Only events in the next 8 weeks with a
family / children indication are kept.
"""
import json
import re
import sys
from datetime import date, datetime, timedelta
from html import unescape

from common import connect, register_source, save_raw
from offers import age_range, replace_offers
from robots_glob import allowed_glob, polite_fetch

SOURCE_ID = 'elbphilharmonie_familie'
SITE = 'https://www.elbphilharmonie.de'
SITEMAP = SITE + '/sitemap-events.xml'
WINDOW_DAYS = 56
MAX_DETAILS = 400

SLUG_HINT = re.compile(r'famil|kind|baby|hasi|funkel|kita|schul|workshop|marchen|maerchen|jung|kids|klangzeit|mini|'
                       r'entdeck|ohrwurm|elfi|krabbel|eltern|weihnacht')
FAMILY = re.compile(r'famil|kinder|\bkind\b|kids|baby|babys|krabbel|kuscheltier|eltern|\bab \d+ (jahr|monat)|'
                    r'\d+\s*[–-]\s*\d+ (jahr|monat)')
INSTITUTION = re.compile(r'schulklasse|kita-gruppe|kitagruppe|kita-kinder|für schulen|klassenstufe|jahrgangsstufe|'
                         r'konzert statt schule|\bklassen? \d|schulkonzert|kitakonzert')

VENUES = {  # coordinates of the two houses (all other venues stay without coordinates)
    'elbphilharmonie': (53.54132, 9.98418, 'Platz der Deutschen Einheit 1, 20457 Hamburg'),
    'laeiszhalle': (53.55590, 9.98086, 'Johannes-Brahms-Platz, 20355 Hamburg'),
}


def clean(s):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<[^>]+>', ' ', s or ''))).strip()


def jsonld_event(html):
    for block in re.findall(r'(?s)<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html):
        try:
            d = json.loads(block, strict=False)  # descriptions contain raw newlines
        except ValueError:
            continue
        for e in (d if isinstance(d, list) else [d]):
            if isinstance(e, dict) and 'Event' in str(e.get('@type', '')):
                return e
    return None


def age_text(s):
    t = re.sub(r'(\d+)\s*bis\s*(\d+)', r'\1-\2', s)
    return re.sub(r'(\d+)-?\s*jährige', r'\1 jahre', t, flags=re.I)


def main():
    today = date.today()
    until = today + timedelta(days=WINDOW_DAYS)
    con = connect()
    register_source(con, SOURCE_ID, 'Elbphilharmonie – Familien- und Kinderkonzerte', SITE + '/de/',
                    'Fakten mit Link, keine Lizenz angegeben', 'Elbphilharmonie Hamburg / HamburgMusik gGmbH', priority=60)

    xml = polite_fetch(SITEMAP).text
    save_raw('elbphilharmonie_sitemap_events.xml', xml)
    urls = re.findall(r'<loc>(https://www\.elbphilharmonie\.de/de/programm/([^/<]+)/(\d+))</loc>', xml)
    print(f'sitemap: {len(urls)} German event URLs; second sitemap page allowed: {allowed_glob(SITEMAP + "?p=2")}')
    cands = sorted({(int(i), u, slug) for u, slug, i in urls if SLUG_HINT.search(slug)}, reverse=True)
    print(f'slug pre-filter: {len(cands)} candidates (full crawl would be {len(urls)} requests)')

    seen = set()
    offers, n_req, skipped = [], 0, {'robots': 0, 'outside_window': 0, 'not_family': 0, 'institution': 0, 'no_jsonld': 0}
    for _, url, slug in cands[:MAX_DETAILS]:
        if not allowed_glob(url):
            skipped['robots'] += 1
            continue
        try:
            r = polite_fetch(url)
        except Exception as e:
            print(f'  failed {url}: {e}')
            continue
        n_req += 1
        url = r.url.split('?')[0]  # old event ids redirect to the current one
        if url in seen:
            continue
        seen.add(url)
        html = r.text
        ev = jsonld_event(html)
        if not ev or not ev.get('startDate'):
            skipped['no_jsonld'] += 1
            continue
        start = datetime.fromisoformat(ev['startDate'])
        if not (today <= start.date() <= until):
            skipped['outside_window'] += 1
            continue
        name = clean(ev.get('name'))
        sub = re.search(r'(?s)<p class="event-subtitle[^"]*"[^>]*>(.*?)</p>', html)
        sub = clean(sub.group(1)) if sub else ''
        desc = clean(ev.get('description'))
        text = f'{name} {sub} {desc}'.lower()
        if not FAMILY.search(text):
            skipped['not_family'] += 1
            continue
        if INSTITUTION.search(f'{slug} {name} {sub}'.lower() + ' ' + desc.lower()[:400]) and 'famil' not in f'{name} {sub}'.lower():
            skipped['institution'] += 1
            continue
        amin, amax = age_range(age_text(sub)) if re.search(r'\d', sub) else (None, None)
        if amin is None:
            amin, amax = age_range(age_text(desc))
        end = datetime.fromisoformat(ev['endDate']) if ev.get('endDate') else None
        loc = ev.get('location') or {}
        venue = clean(loc.get('name')) or None
        coords = next((v for k, v in VENUES.items() if k in (venue or '').lower()), None)
        price = re.search(r'(?s)<span class="prices">(.*?)</span>\s*</span>', html)
        nums = re.findall(r'\d+(?:,\d+)?', clean(price.group(1))) if price else []
        title = name
        part = sub.split(' / ')[0].strip() if sub else ''
        if part and not re.search(r'\d+\s*(jahr|monat)', part, re.I) and len(name) + len(part) < 110:
            title = f'{name} – {part}'
        offers.append({
            'source_ref': url.rsplit('/', 1)[1],
            'title': title[:120],
            'kind': 'termin',
            'topic': 'musik',
            'age_min_m': amin, 'age_max_m': amax,
            'weekday': start.weekday(),
            'time_from': start.strftime('%H:%M'),
            'time_to': end.strftime('%H:%M') if end else None,
            'start_date': start.date().isoformat(),
            'price': f'ab {nums[0]} €' if nums else None,
            'free': 0 if nums else None,
            'registration': 'Ticket',
            'venue': venue,
            'address': coords[2] if coords else (clean(loc.get('address')) or None),
            'lat': coords[0] if coords else None, 'lon': coords[1] if coords else None,
            'url': url,
            'provider': 'Elbphilharmonie',
        })
    print(f'detail requests: {n_req}, skipped: {skipped}')
    offers.sort(key=lambda o: (o['start_date'], o['time_from'] or ''))
    n = replace_offers(con, SOURCE_ID, offers)
    print(f'{SOURCE_ID}: {n} offers')
    for o in offers[:10]:
        print(' ', o['start_date'], o['time_from'], o['title'][:60], '|', o['venue'], '|', o['age_min_m'], o['age_max_m'], o['price'])


if __name__ == '__main__':
    sys.exit(main())
