"""Import children's and family nature and knowledge events: NABU Hamburg, Loki Schmidt Stiftung, Kinder-Uni Hamburg.

One file, one source per provider (run all, or name source ids as arguments). Facts only: title, date, time, meeting point,
age, price, registration, link to the provider's own page. Names of guides and contact persons are never stored.

- nabu_hamburg: monthly programme pages https://hamburg.nabu.de/natur-entdecken/termine/<monat>-termine-<jahr>
  (robots.txt 'User-agent: * / Allow: /'). Kept: entries for children or families (title or short text names Kinder,
  Familien, NAJU-Kindergruppe, or an 'ab N Jahre' age up to 10); work parties, talks and trainings are left out.
  Earlier skipped for robots/terms; robots.txt now allows everything. Terms (AGB for participants) not about reuse.
- loki_schmidt: event list https://loki-schmidt-stiftung.de/veranstaltungen (robots.txt 'Disallow:' empty) plus each
  kept event's detail page for the meeting point and age. Kept: target group 'Kinder' or 'Familien'.
- kinderuni_hamburg: lectures on https://www.uni-hamburg.de/wissen-fuer-alle/kinder-uni.html (robots.txt only blocks
  admin/login paths), Audimax, 8-12 years, free, no registration.
"""
import re
import sys
from datetime import date, datetime
from urllib.parse import urljoin

from offers_util import MONTHS, MONTHS_SHORT, age_of, clean, finish, get, osm_coords, price_of, termin

MONTH_SLUGS = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
KIDS = re.compile(r'kinder|familie|naju|eltern|kids|ferien|für (?:groß und klein|jung und alt)', re.I)
NOT_FOR_KIDS = re.compile(r'fortbildung|arbeitseinsatz|pflegeeinsatz|vortrag|tagung|mitgliederversammlung|seminar|motorsäge|'
                          r'kinder nur in begleitung|ab 1[2-9] jahre|aktive mitglieder|kinder dürfen nur|helfende hand', re.I)


def hm(h, m=None):
    return f'{int(h):02d}:{m or "00"}'


def times(text):
    """'18:00 Uhr', '9-17 Uhr', '10:00-12:30 Uhr' -> (from, to)."""
    m = re.search(r'(\d{1,2})(?::(\d\d))?\s*(?:Uhr)?\s*[-–]\s*(\d{1,2})(?::(\d\d))?\s*Uhr', text)
    if m:
        return hm(m.group(1), m.group(2)), hm(m.group(3), m.group(4))
    m = re.search(r'(\d{1,2})(?::(\d\d))?\s*Uhr', text)
    return (hm(m.group(1), m.group(2)), None) if m else (None, None)


# ---------------------------------------------------------------- NABU Hamburg
def nabu():
    provider = 'NABU Hamburg'
    today = date.today()
    offers = []
    for k in range(5):
        month = (today.month - 1 + k) % 12 + 1
        year = today.year + (today.month - 1 + k) // 12
        url = f'https://hamburg.nabu.de/natur-entdecken/termine/{MONTH_SLUGS[month - 1]}-termine-{year}'
        try:
            html = get(url).text
        except Exception as e:  # later months are often not online yet
            print(f'  {url}: {type(e).__name__}')
            continue
        for head, body in re.findall(r'(?s)<p class="nabu-text"><strong>(.*?)</strong>(.*?)</p>', html):
            head, text = clean(head), clean(body)
            m = re.match(r'\w+,\s*(\d{1,2})\.(\d{1,2})\.(?:\s*(\d{4}))?,?\s*(\d{1,2}(?::\d\d)?(?:\s*[-–]\s*\d{1,2}(?::\d\d)?)?\s*Uhr)?\s*:?\s*(.+)$', head)
            if not m:
                continue
            title = m.group(5).strip()
            parts = [p.strip() for p in text.split(' / ')]
            short = ' '.join(parts[:2])
            age = age_of(text)
            young = age[0] is not None and age[0] <= 10 * 12
            if NOT_FOR_KIDS.search(title + ' ' + parts[0]) or not (KIDS.search(title + ' ' + short) or young):
                continue
            if age[0] is not None and age[0] >= 12 * 12:
                continue
            day = date(int(m.group(3) or year), int(m.group(2)), int(m.group(1)))
            tf, tt = times(m.group(4) or head)
            where = next((re.sub(r'^(Treffpunkt|Ort):\s*', '', p) for p in parts if re.match(r'(Treffpunkt|Ort):', p)), None)
            if where and re.search(r'nach Anmeldung|wird .* bekannt', where):
                where = None
            venue = where.split(',')[0].strip()[:80] if where else provider
            address = where if where and re.search(r'\d{5}|straße|weg \d|str\. \d', where, re.I) else None
            cost = next((p for p in parts if re.search(r'€|kostenlos|kostenfrei|spende', p, re.I)), None)
            price, free = price_of(cost) if cost else (None, None)
            lat, lon = osm_coords(venue) if where else (None, None)
            offers.append(termin(f'{day}:{title[:40]}', title, day, url, provider, venue=venue, address=address, lat=lat, lon=lon,
                                 time_from=tf, time_to=tt, price=price, free=free, age=age,
                                 registration='nötig' if re.search(r'anmeld', text, re.I) else None, description=parts[0][:150]))
    return finish('nabu_hamburg', 'NABU Hamburg: Naturerlebnisse für Kinder und Familien', 'https://hamburg.nabu.de/natur-entdecken/veranstaltungen-des-nabu-hamburg',
                  provider, offers)


# ---------------------------------------------------------------- Loki Schmidt Stiftung
LOKI = 'https://loki-schmidt-stiftung.de/'
LOKI_PLACES = {  # meeting point word -> venue, address (addresses as published by the foundation's houses)
    'Dünenhaus': ('Boberger Dünenhaus', 'Boberger Furt 50, 21033 Hamburg'),
    'Heidehaus': ('Fischbeker Heidehaus', 'Fischbeker Heideweg 43a, 21149 Hamburg'),
    'NaturRaum': ('NaturRaum HafenCity', None),
}


def loki():
    provider = 'Loki Schmidt Stiftung'
    html = get(LOKI + 'veranstaltungen').text
    offers = []
    for item in re.split(r'<div class="termin-item', html)[1:]:
        group = re.search(r'(?s)Zielgruppe">(.*?)</div>', item)
        targets = re.findall(r'title="([^"]+)"', group.group(1)) if group else []
        if not set(targets) & {'Kinder', 'Familien'}:
            continue
        link = re.search(r'href="(mitmachen-und-erleben/termin-info\.html\?id=(\d+))"', item)
        d = re.search(r'(\d{1,2})\.\s*(\w+)\.?\s*(\d{4})', clean((re.search(r'(?s)lokidatum">(.*?)</div>', item) or [0, ''])[1]))
        if not (link and d):
            continue
        month = MONTHS_SHORT.get(d.group(2).lower()[:3])
        if not month:
            continue
        day = date(int(d.group(3)), month, int(d.group(1)))
        when = clean((re.search(r'(?s)lokidatum">(.*?)</div>', item) or [0, ''])[1])
        tm = re.search(r'(\d\d:\d\d)\s*[–-]\s*(\d\d:\d\d)', when)
        title = clean((re.search(r'(?s)<strong><a [^>]*>(.*?)</a>', item) or [0, ''])[1])
        url = urljoin(LOKI, link.group(1))
        detail = clean(get(url).text)
        detail = detail[detail.find(title):] if title in detail else detail
        meet = clean((re.search(r'Treffpunkt:\s*(.*?)\s*(?:Veranstalter|Leitung|Kontakt|Kosten|Anmeldung|zurück)', detail) or [0, ''])[1])
        venue, address = next(((v, a) for k, (v, a) in LOKI_PLACES.items() if k in meet), (meet or provider, None))
        if re.search(r'\d{5}', meet) or re.search(r'(str\.|straße|weg) \d', meet):  # meeting point given as an address
            venue, address = ('NaturRaum HafenCity' if 'HafenCity' in item else provider), meet
        cost = re.search(r'Kosten:\s*(.*?)\s*(?:Veranstalter|Leitung|Kontakt|Anmeldung|zurück|Ort:)', detail)
        price, free = price_of(cost.group(1)) if cost else (None, None)
        lat, lon = osm_coords(venue)
        target = re.search(r'Zielgruppe:\s*(.*?)\s*Ort:', detail)
        age = age_of((target.group(1) if target else '') + ' ' + detail[:400])
        age = (age[0], age[1] if age[1] and age[1] <= 18 * 12 else None)
        offers.append(termin(link.group(2), title, day, url, provider, venue=venue, address=address, lat=lat, lon=lon,
                             time_from=tm.group(1) if tm else None, time_to=tm.group(2) if tm else None, price=price, free=free, age=age,
                             registration='nötig' if 'Anmeldung erforderlich' in item + detail else None))
    return finish('loki_schmidt', 'Loki Schmidt Stiftung: Naturerlebnisse für Kinder und Familien', LOKI + 'veranstaltungen', provider, offers)


# ---------------------------------------------------------------- Kinder-Uni Hamburg
KIUNI = 'https://www.uni-hamburg.de/wissen-fuer-alle/kinder-uni.html'


def kinderuni():
    provider = 'Universität Hamburg (Kinder-Uni)'
    html = get(KIUNI).text
    lat, lon = osm_coords('Audimax', 'Audimax I')
    offers = []
    for href, text in re.findall(r'(?s)<a[^>]+href="([^"]*kinder-uni/\d{8}-[^"]+\.html)"[^>]*>(.*?)</a>', html):
        ymd = re.search(r'/(\d{8})-', href).group(1)
        day = datetime.strptime(ymd, '%Y%m%d').date()
        title = re.sub(r'^Foto:\s*\S+(?:/\S+)?\s*', '', clean(text))
        title = re.split(r'\s+(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),', title)[0].strip()
        offers.append(termin(ymd, f'Kinder-Uni: {title}', day, urljoin(KIUNI, href), provider, venue='Audimax der Universität Hamburg',
                             address='Von-Melle-Park 4, 20146 Hamburg', lat=lat, lon=lon, time_from='17:00', time_to='18:00',
                             price='kostenlos', free=1, age=(96, 156), registration='offen'))
    return finish('kinderuni_hamburg', 'Kinder-Uni Hamburg: Vorlesungen für Kinder', KIUNI, provider, offers)


SOURCES = {'nabu_hamburg': nabu, 'loki_schmidt': loki, 'kinderuni_hamburg': kinderuni}


def main(names=None):
    ok = False
    for sid in names or SOURCES:
        try:
            ok = bool(SOURCES[sid]()) or ok
        except SystemExit as e:
            print(e)
        except Exception as e:  # one provider failing must not stop the others
            print(f'{sid}: {type(e).__name__}: {e}')
    return ok


if __name__ == '__main__':
    sys.exit(0 if main(sys.argv[1:]) else 1)
