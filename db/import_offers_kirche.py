"""Family events of the Protestant parishes in Hamburg (source 'kirche'): Krabbelgruppen, Eltern-Kind-Treffs, Kinderkirche /
Kindergottesdienst, Familiengottesdienste, Krippenspiele, Kinderbasare and similar, from the public pages only (no Nordkirche API,
no key, no login).

Sources
  1. https://www.kirche-hamburg.de (Ev.-Luth. Kirchenkreise Hamburg-Ost and Hamburg-West/Südholstein): the events sitemap
     (/sitemap.xml?sitemap=events, explicitly allowed in robots.txt) lists every event page /veranstaltungen/veranstaltung/<id>-<slug>.
     robots.txt: 'Disallow: /*?' (so no category or search pages), event pages are allowed.
  2. Parish websites on the common parish CMS ('/termine/<id>-<slug>' pages with schema.org Event JSON-LD). Their addresses come
     from the parish pages of kirche-hamburg.de (/gemeinden/ansicht/<id>-...-kirchengemeinde-..., 'Website besuchen'). Each
     parish site's own sitemap.xml lists its event pages; robots.txt of each site is honoured (get()). Parish sites also show
     events that are not on kirche-hamburg.de (e.g. parishes that manage events in ChurchTools).
  The same event (same id) on a parish site and on kirche-hamburg.de is taken once, with the parish's own page as link.
Kept: events whose title (slug) and then page text name a family offer (FAMILY + church terms), in Hamburg (address with
'Hamburg'), not for teens/adults only. Weekly repeats (e.g. a Krabbelgruppe entered as single dates) fold into one 'gruppe'.
Facts: title, date, time, venue, address, organiser, age if stated, link. No person names (the 'Leitung' field is not read;
titles that name a pastor are cut before 'mit Pastor/Pastorin').
Cost: requests are capped at MAX_REQUESTS per run (default 350). State in data/raw/kirche_state.json: parish websites are looked up
once and refreshed after 60 days, parish sitemaps are read in rotation (PARISH_SITEMAPS_PER_RUN oldest first), event pages are
read once and kept (re-read after 21 days). A first run discovers the parishes (about 160 + 2 per parish site); later runs
need about 3 + 2 x 40 + new event pages, i.e. 100-200 requests. Run weekly (events are entered weeks ahead).

Run: cd db && python import_offers_kirche.py
"""
import html
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

from common import DB_PATH, RAW_DIR
from offers_util import FAMILY, age_of, clean, finish, fold_weekly, get, termin

SOURCE_ID = 'kirche'
KH = 'https://www.kirche-hamburg.de'
STATE = RAW_DIR / 'kirche_state.json'
ADDR_INDEX = DB_PATH.parent / 'raw' / 'addresses.json'  # offline OSM address index (built by tools/redaktion_build.py)
REDAKTION = DB_PATH.parent / 'redaktion' / 'termine.json'
MAX_REQUESTS = 350
PARISH_SITEMAPS_PER_RUN = 40
PARISH_TTL, EVENT_TTL = 60, 21  # days
HORIZON = 120  # days ahead
# Slug pre-filter (cheap, decides which event pages are read).
SLUG = re.compile(r'krabbel|eltern-kind|kinderkirche|kinder-kirche|kindergottesdienst|kinder-gottesdienst|kigo|kiki|mini-?gottesdienst|'
                  r'baby|krippenspiel|krippenmusical|famili|kinderchristvesper|christvesper-fuer-kinder|fuer-kinder|mit-kindern|'
                  r'kleine-und-grosse|gross-und-klein|grosse-und-kleine|kinderbasar|kinderflohmarkt|kindersachen|spielzeug|'
                  r'kindergruppe|kindermorgen|kindertreff|kinderchor|gartenkinder|kunterbunt|kinderferien|kinderbibel|laterne|'
                  r'martinsumzug|martinsfest|spielgruppe|spielkreis|purzel|zwerg|kasper|puppen|elterncafe|eltern-cafe|kinder\b|kinder-',
                  re.I)
CHURCH_FAMILY = re.compile(r'krippenspiel|krippenmusical|groß und klein|gross und klein|kleine und große|kleine und grosse|'
                           r'große und kleine|kindergottesdienst|kinderkirche|kigo\b|kiki\b|minigottesdienst|kirche kunterbunt|'
                           r'gartenkinder|spielkreis|spielgruppe|zwerge', re.I)
NOT_FAMILY = re.compile(r'jugendgottesdienst|jugendtreff|jugendandacht|jugendchristvesper|christnacht|teens|konfirmation\b|senior|'
                        r'familie bach|ü ?60|60 ?plus|abgesagt|fällt aus|entfällt|kinderlos|probe\b|kita-team|elternabend der kita', re.I)
TOPIC = [(r'krabbel|eltern-kind|spielkreis|spielgruppe|kindermorgen|zwerge|gartenkinder|baby', 'krabbelgruppe'),
         (r'basar|flohmarkt|kindersachen|spielzeug', 'flohmarkt'), (r'krippenspiel|krippenmusical|laterne|martin|nikolaus|christvesper', 'feste'),
         (r'kinderchor|singschule|musical', 'musik')]
MONTHS = {m: i + 1 for i, m in enumerate(['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober',
                                          'november', 'dezember'])}
_count = [0]
_idx = {}


_hosts = set()


def fetch(url, **kw):
    """get() with a request budget; the first request to a host also costs its robots.txt."""
    host = urlparse(url).netloc
    if _count[0] + (host not in _hosts) >= MAX_REQUESTS:
        raise RuntimeError('request budget used up')
    _count[0] += 1 + (host not in _hosts)
    _hosts.add(host)
    kw.setdefault('retries', 1)  # parish servers with broken TLS or timeouts are skipped, not retried
    return get(url, **kw)


def norm_street(s):
    s = unicodedata.normalize('NFKC', s or '').lower().replace('ß', 'ss')
    s = re.sub(r'(str\.|strasse)(?=\W|$)', 'strasse', s)
    return re.sub(r'[^a-z0-9äöü]', '', s)


def coords(street):
    if not _idx:
        try:
            _idx.update(json.loads(ADDR_INDEX.read_text(encoding='utf8')))
        except (OSError, ValueError):
            _idx['-'] = None
    m = re.match(r'\s*([^,\d]+?)\s+(\d+(?:\s?[a-zA-Z](?![a-zA-Z]))?)', street or '')
    if not m:
        return None, None
    hit = _idx.get(f'{norm_street(m.group(1))}|{m.group(2).lower().replace(" ", "")}')
    return tuple(hit) if hit else (None, None)


def load_state():
    try:
        return json.loads(STATE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {'parishes': {}, 'events': {}}


def save_state(st):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=0), encoding='utf-8')


def sitemap_locs(url):
    return [html.unescape(u) for u in re.findall(r'<loc>([^<]+)</loc>', fetch(url).text)]


def kh_sitemaps():
    """-> (events {id: url}, Kirchengemeinde pages [url])."""
    events, institutions = {}, []
    for sm in sitemap_locs(KH + '/sitemap.xml'):
        if 'sitemap=events' in sm:
            for u in sitemap_locs(sm):
                m = re.search(r'/veranstaltung/(\d{6,})-', u)
                if m:
                    events[m.group(1)] = u
        elif 'sitemap=institutions' in sm:
            institutions = [u for u in sitemap_locs(sm) if 'kirchengemeinde' in u.rsplit('/', 1)[-1]]
    return events, institutions


def parish_info(url):
    p = fetch(url).text
    name = re.search(r'm-mediumStage__title">(.*?)</h2>', p, re.S)
    web = re.search(r'<a class="c-cta c-cta--secondary" href="(https?://[^"]+)"[^>]*>\s*<span class="c-cta__label">Website besuchen', p)
    addr = re.search(r'location_filled</div>\s*</div>\s*<div class="m-info__info">(.*?)</div>', p, re.S)
    addr = clean(addr.group(1)).replace(' ,', ',') if addr else ''
    site = web.group(1).rstrip('/') if web else None
    if site and urlparse(site).netloc.endswith('kirche-hamburg.de'):
        site = None  # parish without own site: its events are on kirche-hamburg.de anyway
    return {'name': clean(name.group(1)) if name else None, 'website': site, 'address': addr,
            'hamburg': bool(re.search(r'\b2[0-2]\d{3} Hamburg', addr)), 'checked': date.today().isoformat()}


def parish_events(site):
    """{id: url} of the event pages in a parish site's sitemap (one sitemap file, or an index with an events part)."""
    out, locs = {}, sitemap_locs(site + '/sitemap.xml')
    subs = [u for u in locs if re.search(r'sitemap.*\.xml|sitemap=', u) and re.search(r'termin|event', u, re.I)]
    for u in subs[:2]:
        locs += sitemap_locs(u)
    for u in locs:
        m = re.search(r'/termine/(\d{6,})-[^/]*$', u)
        if m:
            out[m.group(1)] = u
    return out


def kh_event(url, page):
    """Event fields from a kirche-hamburg.de event page."""
    title = re.search(r'm-mediumStage__title">(.*?)</h2>', page, re.S)
    sub = re.search(r'm-mediumStage__subline">(.*?)</h3>', page, re.S)
    infos = [clean(x) for x in re.findall(r'<div class="m-info__info">(.*?)</div>\s*</div>', page, re.S)]
    day = tf = tt = venue = address = organiser = None
    for i in infos:
        if m := re.search(r'(\d{1,2})\. (\w+) (\d{4})', i):
            if m.group(2).lower() in MONTHS and not day:
                day = date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
        elif m := re.match(r'(\d{1,2}:\d\d)(?:\s*-\s*(\d{1,2}:\d\d))?\s*Uhr', i):
            tf, tt = m.group(1).zfill(5), m.group(2) and m.group(2).zfill(5)
        elif i.startswith('Veranstalter:'):
            organiser = i.split(':', 1)[1].strip()
        elif i.startswith('Leitung:'):
            continue  # names of persons are not kept
        elif re.search(r'\d{5}', i) and not address:
            parts = [x.strip() for x in i.split(',') if x.strip()]
            venue = parts[0] if len(parts) > 2 else None
            address = ', '.join(parts[1:] if len(parts) > 2 else parts)
    text = re.search(r'm-text__copy">(.*?)</div>', page, re.S)
    return {'title': clean(title.group(1)) if title else '', 'sub': clean(sub.group(1)) if sub else '', 'day': day and day.isoformat(),
            'time_from': tf, 'time_to': tt, 'venue': venue, 'address': address, 'organiser': organiser,
            'text': clean(text.group(1))[:600] if text else '', 'url': url}


def parish_event(url, page):
    """Event fields from a parish page (schema.org Event JSON-LD)."""
    ev = org = None
    for js in re.findall(r'(?s)<script type="application/ld\+json">(.*?)</script>', page):
        try:
            d = json.loads(js)
        except ValueError:
            continue
        for x in d if isinstance(d, list) else [d]:
            t = x.get('@type')
            t = t if isinstance(t, list) else [t]
            if 'Event' in t and not ev:
                ev = x
            elif ('Church' in t or 'Organization' in t) and not org:
                org = x.get('name')
    if not ev or not ev.get('startDate'):
        return None
    s = datetime.fromisoformat(ev['startDate'][:16])
    e = datetime.fromisoformat(ev['endDate'][:16]) if ev.get('endDate') else None
    loc = ev.get('location') or {}
    a = loc.get('address') or {}
    address = ', '.join(x for x in [a.get('streetAddress'), ' '.join(y for y in [a.get('postalCode'), a.get('addressLocality')] if y)] if x)
    allday = s.strftime('%H:%M') == '00:00'
    return {'title': clean(ev.get('name')), 'sub': '', 'day': s.date().isoformat(), 'time_from': None if allday else s.strftime('%H:%M'),
            'time_to': e.strftime('%H:%M') if e and e.date() == s.date() and not allday and e > s else None,
            'end_day': e.date().isoformat() if e and e.date() > s.date() else None,
            'venue': clean(loc.get('name')) or None, 'address': clean(address) or None, 'organiser': clean(org) or None,
            'text': clean(ev.get('description'))[:600], 'url': url}


PERSON = re.compile(r'[,/]?\s*(?:\bmit\s+|\bund\s+|\bvon\s+)?(?:\bder\s+|\bdem\s+)?\b(?:Pastor(?:in)?|Pröpstin|Propst|Prädikant(?:in)?|'
                    r'Diakon(?:in)?|Kantor(?:in)?|Vikar(?:in)?|Bischöfin|Bischof|Gemeindepädagog(?:e|in)|Dr\.)\b.*$')
NAMED = re.compile(r',?\s*\bmit\s+[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+(?:[\s,].*)?$')  # ', mit Vorname Nachname ...'
SENTENCE = re.compile(r'[.!?…]$|^(wir|herzlich\w*|die|der|das|haben|mit|für|ein|eine|im|in|am|zum|zur|an|bei|auch|jeden|jede|liebe\w*)\b', re.I)


def short_title(t):
    """Title without names of persons ('... mit Pastorin X', ', mit Vorname Nachname und ...')."""
    t = PERSON.sub('', t)
    t = NAMED.sub('', t) if not re.search(r'\bmit\s+(?:Kindern|Familien|Kinderchor|Kita|Konfis)', t[:t.find(' mit ') + 20] if ' mit ' in t else '') else t
    return re.sub(r'\s+', ' ', t).strip(' -–,:/')


def short_sub(sub, title):
    """Subline worth adding to the title: short, not a sentence, not a repeat, no person names."""
    sub = (sub or '').strip()
    first = title.split()[0].lower() if title.split() else ''
    if not sub or len(sub) > 70 or SENTENCE.search(sub) or PERSON.search(sub) or sub.lower() in title.lower() or title.lower() in sub.lower() \
            or sub.lower().startswith(first):
        return None
    return sub


def same_event(a, b):
    from difflib import SequenceMatcher
    ta, tb = (re.sub(r'[^a-zäöüß]+', ' ', x['title'].lower()).strip() for x in (a, b))
    street = lambda o: norm_street((o.get('address') or '').split(',')[0])
    return (a['start_date'] == b['start_date'] and a.get('time_from') == b.get('time_from')
            and (street(a) == street(b) if street(a) and street(b) else a.get('provider') == b.get('provider'))
            and (ta in tb or tb in ta or SequenceMatcher(None, ta, tb).ratio() >= 0.6))


def redaktion_ids():
    try:
        data = json.loads(REDAKTION.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return set()
    items = data if isinstance(data, list) else data.get('termine', [])
    return {m.group(1) for e in items for m in [re.search(r'/(\d{6,})-', e.get('url') or '')] if m}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    st = load_state()
    today = date.today()
    stale = lambda d, ttl: not d or (today - date.fromisoformat(d)).days > ttl
    kh_ids, institutions = kh_sitemaps()
    # 1. parish websites (refreshed after PARISH_TTL days)
    for u in institutions:
        p = st['parishes'].get(u)
        if p and not stale(p.get('checked'), PARISH_TTL):
            continue
        try:
            st['parishes'][u] = {**(p or {}), **parish_info(u)}
        except RuntimeError:
            break
        except Exception as e:
            print(f'  parish page {u}: {type(e).__name__} {e}')
    # 2. parish sitemaps, oldest first (one site can serve several parishes)
    sites = {}
    for u, p in st['parishes'].items():
        if p.get('website') and p.get('hamburg') and p.get('cms') is not False:
            sites.setdefault(urlparse(p['website']).netloc.lower(), p['website'])
    st.setdefault('sites', {})
    order = sorted(sites, key=lambda h: st['sites'].get(h, {}).get('checked') or '')
    done = 0
    for host in order:
        if done >= PARISH_SITEMAPS_PER_RUN or _count[0] >= MAX_REQUESTS - 60:
            break
        s = st['sites'].get(host, {})
        if not stale(s.get('checked'), 6):
            continue
        try:
            ev = parish_events(sites[host])
            st['sites'][host] = {'checked': today.isoformat(), 'events': ev, 'cms': bool(ev)}
        except PermissionError as e:
            st['sites'][host] = {'checked': today.isoformat(), 'events': {}, 'cms': False, 'blocked': str(e)}
        except Exception as e:
            if 'HTTP 404' in str(e):  # no sitemap: another CMS, not read again
                st['sites'][host] = {'checked': today.isoformat(), 'events': {}, 'cms': False}
            else:  # TLS errors, timeouts: tried again after 6 days
                st['sites'][host] = {**s, 'checked': today.isoformat(), 'error': f'{type(e).__name__}'}
        done += 1
    for u, p in st['parishes'].items():  # remember sites without the CMS so they are not read again
        h = urlparse(p.get('website') or '').netloc.lower()
        if h in st['sites'] and st['sites'][h].get('cms') is False and not st['sites'][h].get('error'):
            p['cms'] = False
    # 3. candidates: parish page preferred over kirche-hamburg.de for the same id
    cands = {i: u for i, u in kh_ids.items()}
    for h, s in st['sites'].items():
        if h in sites:
            cands.update(s.get('events') or {})
    skip_ids = redaktion_ids()
    cands = {i: u for i, u in cands.items() if SLUG.search(u.rsplit('/', 1)[-1]) and i not in skip_ids}
    # 4. event pages (cached)
    fetched = 0
    for i, u in sorted(cands.items(), key=lambda x: x[0], reverse=True):
        c = st['events'].get(i)
        if c and c.get('url') == u and not stale(c.get('fetched'), EVENT_TTL):
            continue
        if _count[0] >= MAX_REQUESTS:
            break
        try:
            page = fetch(u).text
            e = parish_event(u, page) if '/termine/' in u else kh_event(u, page)
            st['events'][i] = {**(e or {'url': u, 'none': True}), 'fetched': today.isoformat()}
            fetched += 1
        except RuntimeError:
            break
        except Exception as ex:
            print(f'  {u}: {type(ex).__name__} {ex}')
            st['events'][i] = {'url': u, 'none': True, 'error': type(ex).__name__, 'fetched': today.isoformat()}  # not retried for EVENT_TTL days
    # drop cache entries of past events
    st['events'] = {i: e for i, e in st['events'].items() if not e.get('day') or (e.get('end_day') or e['day']) >= today.isoformat()}
    save_state(st)
    # 5. offers
    offers, dropped = [], 0
    for i, u in cands.items():
        e = st['events'].get(i)
        if not e or e.get('none') or not e.get('day'):
            continue
        day = date.fromisoformat(e['day'])
        if day < today or day > today + timedelta(days=HORIZON):
            continue
        text = f"{e['title']} {e.get('sub') or ''} {e.get('text') or ''}"
        head = f"{e['title']} {e.get('sub') or ''}"
        if not (FAMILY.search(head) or CHURCH_FAMILY.search(head)) or NOT_FAMILY.search(head):
            dropped += 1
            continue
        if not re.search(r'\bHamburg\b', e.get('address') or ''):
            dropped += 1
            continue
        street = (e.get('address') or '').split(',')[0]
        lat, lon = coords(street)
        if e.get('time_from') and e['time_from'] >= '21:00':  # Christmette, late services
            dropped += 1
            continue
        title = short_title(e['title'])
        sub = short_sub(e.get('sub'), title)
        if sub and len(title) < 45:
            title = f'{title}: {sub}'[:120]
        provider = re.sub(r'^[©\s]+', '', e.get('organiser') or '') or 'Ev.-Luth. Kirche Hamburg'
        o = termin(f'{i}:{day}', title, day, e['url'], provider, venue=e.get('venue') or provider, address=e.get('address'), lat=lat, lon=lon,
                   time_from=e.get('time_from'), time_to=e.get('time_to'), age=age_of(text),
                   end=date.fromisoformat(e['end_day']) if e.get('end_day') else None, description=sub)
        if re.search(r'kostenlos|eintritt frei|kostenfrei', text, re.I):
            o['price'], o['free'] = 'kostenlos', 1
        for rx, tp in TOPIC:
            if re.search(rx, title, re.I):
                o['topic'] = tp
                break
        offers.append(o)
    # the same event on a parish site (own id, e.g. from ChurchTools) and on kirche-hamburg.de: keep the parish page
    offers.sort(key=lambda o: 'kirche-hamburg.de' in o['url'])
    uniq = []
    for o in offers:
        if any(same_event(o, u) for u in uniq):
            continue
        uniq.append(o)
    dupes = len(offers) - len(uniq)
    by_place = {}  # weekly repeats only at the same address (one parish often has several churches)
    for o in uniq:
        by_place.setdefault(norm_street((o.get('address') or '').split(',')[0]), []).append(o)
    offers = [x for group in by_place.values() for x in fold_weekly(group, kind='gruppe')]
    print(f'{SOURCE_ID}: {_count[0]} requests ({fetched} event pages), {len(kh_ids)} events on kirche-hamburg.de, '
          f"{sum(1 for h in sites if st['sites'].get(h, {}).get('cms'))} parish sites with event pages "
          f"({sum(1 for h in sites if h not in st['sites'])} not read yet), {len(cands)} candidates, {dropped} dropped, {dupes} duplicates")
    return finish(SOURCE_ID, 'Ev.-Luth. Kirchengemeinden Hamburg: Familienangebote', KH + '/veranstaltungen',
                  'Ev.-Luth. Kirchengemeinden in Hamburg', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
