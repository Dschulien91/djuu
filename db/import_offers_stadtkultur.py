"""Import children's and family offers of neighbourhood culture centres (members of STADTKULTUR HAMBURG) that the
'events_veranstalter' source (import_offers_flohmaerkte.py) cannot read, because they publish no Events Calendar REST
API or iCal feed. One combined source id; every offer keeps its centre in `provider` and links to the centre's OWN page.

Candidates: member list https://www.stadtkultur-hh.de/dachverband/mitglieder/ (robots.txt allows it).
Small parsers, one per centre, each reading one to a few public pages (robots.txt checked by get() on every request):

  SerrahnEINS Bergedorf       serrahneins.de             EventON list on the home page (Kinderkino, Musik für Minis)
  Kulturladen Hamm            hh-hamm.de/kinderprogramm  weekly children's groups (dated events come via events_veranstalter)
  Kulturzentrum BiM Meiendorf bim-hamburg.de             /calendar/ agenda, Kindertheater page, children's courses
  Begegnungsstätte Bergstedt  kultberg.de                Kindertheater dates
  Backstube Fuhlsbüttel       backstube.hamburg          /veranstaltungen (Weihnachtsmärchen)
  B*Treff Altona-Nord         btreff.altonanord.de       category 'Kinder und Familien' via wp/v2 REST + dates from the list page
  KulturA Neuallermöhe, Haus brügge (sprungbrett e.V.)   programme pages with 'DD.MM. | Weekday, HH:MM Uhr' lines
  Kunstklinik Eppendorf       kunstklinik.hamburg        /kinder-jugend/ dated shows and weekly courses
  Stadtteiltreff AGDAZ        agdaz.de                   event list and courses
  IGL Langenhorn              igl-hamburg.de             /termine/ and family / children pages
  Alles wird schön Harburg    alles-wird-schoen-e-v.de   Kinderatelier
  LUKULULE                    lukulule.de                weekly courses with age
  Stadtteilhaus Lurup         unser-lurup.de             Weihnachtsmärchen of the Stadtteilbühne
  KIKU Kinderkulturhaus       kiku-hh.de                 Mitspieltheater dates
  Kinderbuchhaus              kinderbuchhaus.de          dated workshops / readings on the home page
  Kulturschloss Wandsbek      kulturschloss-wandsbek.de  weekday course pages, children's courses only
  Kulturpunkt Basch           kulturpunkt-basch.de       event list (family entries only)

Only family / children content is kept (offers_util.FAMILY or the site's own Kinder/Familie category). Titles are
stored without course leaders' names; descriptions are read only to find age, price and registration.

robots.txt: all sites above allow the pages read (BiM forbids its iCal exporter and calendar sub-views, which are
not used; only the default /calendar/ agenda is read).
Terms: standard copyright notices (copying of texts/graphics needs consent) on BiM, B*Treff, sprungbrett, Kunstklinik
('jegliche Vervielfältigung ... bedarf der vorherigen schriftlichen Genehmigung'), unser-lurup, KIKU, Kinderbuchhaus,
Kulturpunkt Basch -> only facts are stored; Julian asks.
"""
import re
import sys
from datetime import date, timedelta
from html import unescape

from offers_util import FAMILY, MONTHS, MONTHS_SHORT, WEEKDAYS, age_of, clean, finish, get, group, osm_coords, termin

SOURCE_ID = 'stadtkultur'
MEMBERS = 'https://www.stadtkultur-hh.de/dachverband/mitglieder/'
TODAY = date.today()
WD_FULL = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']
WD_RX = r'(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)s?'
NOT_FOR_KIDS = re.compile(r'kinderbetreuung|senior|ü50|ü 50|\bab 1[4-9] (jahren|j\.)|für schulklassen|kita-gruppen|pausiert|'
                          r'stadtteileltern|abgesagt|ausverkauft', re.I)


# ---------------------------------------------------------------- helpers

def page(url):
    r = get(url)
    try:
        return r.content.decode('utf-8')
    except UnicodeDecodeError:
        return r.text


def lines_of(html):
    """Visible text as a list of non-empty lines (block tags start a new line)."""
    h = re.sub(r'(?is)<(script|style|svg|noscript|template)[^>]*>.*?</\1>', ' ', html)
    h = re.sub(r'(?is)<(br|p|div|li|h\d|tr|td|article|section|dt|dd)\b', r'\n<\1', h)
    t = unescape(re.sub(r'<[^>]+>', ' ', h)).replace('\xa0', ' ').replace('\xad', '').replace('\u2068', '').replace('\u2069', '')
    return [x for x in (re.sub(r'\s+', ' ', l).strip() for l in t.splitlines()) if x]


def wd_index(word):
    w = (word or '').lower().strip('. ')
    for i, full in enumerate(WD_FULL):
        if w.startswith(full[:2]) and (len(w) <= 3 or w.startswith(full[:len(w.rstrip('s'))])):
            return i
    return None


def hhmm(h, m=None):
    return f'{int(h):02d}:{int(m or 0):02d}'


def times(text):
    """First 'HH:MM – HH:MM' (or 'HH.MM', 'HH Uhr') pair in a text -> (from, to)."""
    t = text or ''
    m = re.search(r'(\d{1,2})[:.](\d\d)\s*(?:uhr)?\s*(?:bis|[-–])\s*(\d{1,2})(?:[:.](\d\d))?\s*(?:uhr)?', t, re.I)
    if m and int(m.group(1)) < 24 and int(m.group(3)) < 24:
        return hhmm(m.group(1), m.group(2)), hhmm(m.group(3), m.group(4))
    m = re.search(r'\b(\d{1,2})\s*(?:bis|[-–])\s*(\d{1,2})(?:[:.](\d\d))?\s*uhr', t, re.I)
    if m and int(m.group(1)) < 24 and int(m.group(2)) < 24:
        return hhmm(m.group(1)), hhmm(m.group(2), m.group(3))
    m = re.search(r'(\d{1,2})[:.](\d\d)(?!\d)', t) or re.search(r'\b(\d{1,2})\s*uhr', t, re.I)
    if m and int(m.group(1)) < 24:
        return hhmm(m.group(1), m.group(2) if m.lastindex > 1 else None), None
    return None, None


def infer_date(day, month, weekday=None, year=None):
    """Date for a day and month; the year is the published one or the next occurrence from today on.
    A published weekday wins over a mistyped year (e.g. 'Sa, 02.01.2026' in a 2026/27 season list)."""
    years = [year, year + 1] if year else [TODAY.year, TODAY.year + 1]
    cands = []
    for y in years:
        try:
            cands.append(date(y, month, day))
        except ValueError:
            pass
    if weekday is not None:
        match = [d for d in cands if d.weekday() == weekday]
        if match:
            return match[0]
    if year:
        return cands[0] if cands else None
    future = [d for d in cands if d >= TODAY - timedelta(days=3)]
    return future[0] if future else (cands[-1] if cands else None)


def price_text(text):
    """Price as published after 'Eintritt'/'Kosten'/'Preis', normalised; (price, free)."""
    t = text or ''
    if re.search(r'eintritt\s*(ist\s*)?frei|kostenlos|kostenfrei|teilnahme frei|eintritt: ?frei|free\b', t, re.I):
        return 'kostenlos', 1
    m = re.search(r'(?:eintritt|kosten|preise?|kursgebühr|teilnahmegebühr)\s*:?\s*([^|·\n]{1,60})', t, re.I)
    if not m or not re.search(r'\d', m.group(1)):
        m = re.search(r'(\d+(?:,\d\d)?\s*(?:,-)?\s*(?:€|euro))', t, re.I)
        if not m:
            return None, None
    p = m.group(1)
    p = re.sub(r'(\d),-\s*€?', r'\1 €', p)
    p = re.sub(r'(\d)\s*(EUR|Euro)\b', r'\1 €', p)
    p = re.sub(r'€\s*(\d+(?:,\d\d)?)', r'\1 €', p)
    p = re.split(r'\s*\(|\s+(?:vorbestell|tickets?|hier|anmeld|kurse|tageskasse)\b', p, flags=re.I)[0]
    if '€' in p:
        p = p[:p.rfind('€') + 1]
    p = re.sub(r'\s+', ' ', p).strip(' ,;.:/')
    return (p[:40], 0) if re.search(r'\d', p) else (None, None)


def registration_of(text):
    t = (text or '').lower()
    if re.search(r'ohne anmeldung|anmeldung:? nicht (nötig|erforderlich)|einfach vorbei|offenes angebot', t):
        return 'offen'
    if re.search(r'warteliste', t):
        return 'Warteliste'
    if re.search(r'anmeld|reservier|tickets?\b', t):
        return 'nötig'
    return None


def strip_names(title):
    """Drop 'mit <Name>' tails (course leaders are private persons) and decoration."""
    t = re.sub(r'\s+(mit|con|bei)\s+[A-ZÄÖÜ][\w.-]+(\s+[A-ZÄÖÜ][\w.-]+)?(?=\s*(\(|$))', '', title.strip())
    t = re.sub(r'\s*·\s*STIM-a(p)?proved!?', '', t, flags=re.I)
    return re.sub(r'^(Wieder ab [^!]*!|NEU!?|– NEU –)\s*', '', t).strip(' –-:|')


def age_in(text):
    """age_of plus phrases it misses: 'bis 5 Jahren', 'unter 3 Jahren', '2,5 – 5 Jahre', 'für alle ab 4', '2-4 Jährige'."""
    t = re.sub(r'(\d),5\b', r'\1', text or '')
    t = re.sub(r'jährige', 'Jahre', t, flags=re.I)
    m = re.search(r'\b(bis|unter)\s+(\d{1,2})\s*(jahr|j\.)', t, re.I)
    if m and not re.search(r'\d\s*(bis|[-–])\s*' + m.group(2) + r'\b', t):
        n = int(m.group(2))
        return 0, (n + 1) * 12 if m.group(1).lower() == 'bis' else n * 12
    a = age_of(t)
    if a == (None, None):
        m = re.search(r'für (?:alle|kinder|die ganze familie) ab (\d{1,2})\b(?!\s*(?:uhr|€|:|\.\d))', t, re.I)
        if m:
            return int(m.group(1)) * 12, None
    return a


def good_age(age):
    lo, hi = age
    if hi is not None and hi > 18 * 12:
        hi = None
    return lo, hi


class Place:
    def __init__(self, provider, venue, address, *osm):
        self.provider, self.venue, self.address = provider, venue, address
        self.lat, self.lon = osm_coords(*osm) if osm else (None, None)

    def termin(self, ref, title, day, url, ctx='', time_from=None, time_to=None, end=None, venue=None, address=None, latlon=None,
               age=None, price=None, registration=None, description=None):
        p, free = price if price else price_text(ctx)
        lat, lon = latlon if latlon else ((self.lat, self.lon) if not venue else (None, None))
        return termin(f'{self.provider}:{ref}:{day}', title, day, url, self.provider, venue=venue or self.venue,
                      address=address or self.address, lat=lat, lon=lon, time_from=time_from, time_to=time_to, price=p, free=free,
                      age=good_age(age or age_in(f'{title} {ctx}')), end=end, registration=registration or registration_of(ctx),
                      description=description)

    def weekly(self, ref, title, weekday, url, ctx='', time_from=None, time_to=None, schedule=None, kind='gruppe', venue=None,
               address=None, age=None, price=None, start=None, end=None, description=None):
        p, free = price if price else price_text(ctx)
        sched = schedule or (f'{WEEKDAYS[weekday]} {time_from}{"–" + time_to if time_to else ""}, wöchentlich' if time_from
                             else f'{WEEKDAYS[weekday]}, wöchentlich')
        return group(f'{self.provider}:{ref}:{weekday}:{time_from}', title, url, self.provider, kind=kind, weekday=weekday, schedule=sched,
                     venue=venue or self.venue, address=address or self.address, lat=None if venue else self.lat,
                     lon=None if venue else self.lon, time_from=time_from, time_to=time_to, price=p, free=free,
                     age=good_age(age or age_in(f'{title} {ctx}')), start=start, end=end, registration=registration_of(ctx),
                     description=description)


def is_family(text):
    return bool(FAMILY.search(text or '')) and not NOT_FOR_KIDS.search(text or '')


def weekly_lines(lines, place, url, family_only=True, skip=None):
    """Weekly offers written as '<Weekday>(s) ... HH:MM – HH:MM Uhr' with the title on an earlier line."""
    out = []
    for i, line in enumerate(lines):
        m = re.match(r'(?:wann\??:?\s*)?(?:jeden\s+|immer\s+)?' + WD_RX + r'\b[\s,:.]*(?:von\s+|ab\s+|um\s+)?(.*)$', line, re.I)
        if not m:
            continue
        rest = m.group(2)
        tf, tt = times(rest)
        if not tf and i + 1 < len(lines):
            if re.match(WD_RX, lines[i + 1], re.I):  # 'Jeden Samstag bieten wir ...' followed by the real schedule lines
                continue
            tf, tt = times(lines[i + 1])
        if not tf:
            continue
        title, quoted, start = None, None, i
        for j in range(i - 1, max(-1, i - 6), -1):
            cand = lines[j]
            q = re.search(r'„([^“]{3,40})“', cand)
            if q and len(cand) > 80 and not quoted:  # name quoted in a description line ('Zeichenwerkstatt „Klub Zeichenstift“ ...')
                quoted = q.group(1)
            if re.match(r'(-|•|anmeld|kosten|wo\b|wann|ort\b|eintritt|mit\s|termine|zeiten|kursleit|leitung|info|ab \d|jetzt)', cand, re.I):
                continue
            if (times(cand)[0] or len(cand) > 80 or len(cand.split()) > 9 or cand.endswith(('.', ':', '!'))
                    or re.match(WD_RX, cand, re.I)):
                continue
            title, start = cand, j
            break
        if quoted and (not title or lines.count(title) > 1):  # a page or menu heading is not the offer's name
            title = quoted
        if not title:
            continue
        paren = re.search(r'\(\s*([^)]{3,40}?)\s*\)', rest)
        if paren and paren.group(1).lower() not in title.lower() and re.search(r'klasse|jahr|kinder|alter|eltern', paren.group(1), re.I):
            title = f'{title} ({paren.group(1)})'
        ctx = ' | '.join(lines[start:i + 4])
        if skip and re.search(skip, title + ' ' + ctx, re.I):
            continue
        if family_only and not is_family(title + ' ' + ' '.join(lines[start:i + 3])):
            continue
        out.append(place.weekly(re.sub(r'\W+', '-', title.lower())[:40], strip_names(title), wd_index(m.group(1)), url, ctx, tf, tt))
    return out


def dated_blocks(lines, rx):
    """Yield (match, index) for lines matching rx."""
    for i, line in enumerate(lines):
        m = re.match(rx, line, re.I)
        if m:
            yield m, i


# ---------------------------------------------------------------- centres

def serrahn():
    url = 'https://serrahneins.de/'
    pl = Place('SerrahnEINS Bergedorf', 'SerrahnEINS – Zentrum für Kultur und Gesellschaft', 'Serrahnstraße 1, 21029 Hamburg', 'Kulturforum Serrahn')
    html = page(url)
    out, seen = [], set()
    parts = re.split(r'<div id="event_(\d+)_\d+" class="eventon_list_event', html)[1:]
    for eid, b in zip(parts[::2], parts[1::2]):
        top = b.split("class='event_description", 1)[0]
        title = clean((re.search(r"(?s)evcal_event_title[^>]*>(.*?)</span>", top) or [0, ''])[1])
        sub = clean((re.search(r"(?s)evcal_event_subtitle[^>]*>(.*?)</span>", top) or [0, ''])[1])
        types = ' '.join(re.findall(r'data-filter="event_type[^"]*" data-v="([^"]+)"', top))
        sd = re.search(r"itemprop='startDate' content=\"(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d\d)", b)
        ed = re.search(r"itemprop='endDate' content=\"(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d\d)", b)
        link = (re.search(r"itemprop='url'\s+href='([^']+)'", b) or [0, url])[1]
        if not (title and sd) or (eid, sd.group(0)) in seen:
            continue
        seen.add((eid, sd.group(0)))
        if not re.search(r'kinder|famil|\bminis\b', f'{title} {sub} {types}', re.I) and not is_family(f'{title} {sub}'):
            continue
        desc = clean((re.search(r'(?s)eventon_desc_in[^>]*>(.*?)</div>', b) or [0, ''])[1])
        day = date(int(sd.group(1)), int(sd.group(2)), int(sd.group(3)))
        tt = hhmm(ed.group(4), ed.group(5)) if ed and ed.group(4) != '23' else None
        out.append(pl.termin(eid, title, day, link, f'{sub} {desc}', time_from=hhmm(sd.group(4), sd.group(5)), time_to=tt,
                             description=sub[:150] or None))
    return out


def hamm():
    url = 'https://hh-hamm.de/kinderprogramm/'
    pl = Place('Kulturladen Hamm', 'Kulturladen Hamm', 'Sievekingdamm 3, 20535 Hamburg', 'Kulturladen Hamm')
    return weekly_lines(lines_of(page(url)), pl, url, skip=r'warteliste|keine folgekurs')


def bim():
    base = 'https://bim-hamburg.de'
    pl = Place('Kulturzentrum BiM Meiendorf', 'Kulturzentrum BiM', 'Saseler Straße 21, 22145 Hamburg', 'Bürgerhaus in Meiendorf e.V.')
    out = []
    # weekly children's groups
    url = base + '/kurse-und-gruppen-fuer-kinder-und-jugendliche/'
    lines = lines_of(page(url))
    for i, line in enumerate(lines):  # 'Musikalische Früherziehung , mittwochs 15.00-15.45 Uhr (1-4 Jahre)'
        m = re.match(r'(.{3,60}?)\s*,\s*' + WD_RX + r'\s+(\d{1,2}[.:]\d\d)\s*[-–]\s*(\d{1,2}[.:]\d\d)\s*Uhr\s*(?:\(([^)]*)\))?', line, re.I)
        if m:
            age = good_age(age_in(m.group(5) or ''))
            if age[0] is not None and age[0] >= 14 * 12:
                continue
            blk = lines[max(0, i - 3):i + 6]
            out.append(pl.weekly(m.group(1)[:30], strip_names(m.group(1)), wd_index(m.group(2)), url, ' | '.join(blk),
                                 hhmm(*re.split('[.:]', m.group(3))), hhmm(*re.split('[.:]', m.group(4))), age=age,
                                 price=price_text(' | '.join(l for l in blk if l.startswith('Kosten')))))
    out += weekly_lines(lines, pl, url)
    groups = {o['title'].lower() for o in out}
    # Kindertheater page: 'Im Dezember: Der Weihnachtsdieb' ... 'Wann : Dienstag, den 15. Dezember 2026, um 16.00 Uhr'
    url = base + '/kindertheater-im-bim/'
    lines = lines_of(page(url))
    for m, i in dated_blocks(lines, r'wann\s*:\s*' + WD_RX + r',?\s*(?:den\s*)?(\d{1,2})\.\s*(\w+)\s*(\d{4})?,?\s*(?:um\s*)?(\d{1,2})[.:](\d\d)'):
        head = next((j for j in range(i - 1, max(-1, i - 8), -1) if re.match(r'im \w+:', lines[j], re.I)), None)
        if head is None or m.group(3).lower() not in MONTHS:
            continue
        title = lines[head].split(':', 1)[1].strip()
        ctx = ' | '.join(lines[head:i + 1])
        day = infer_date(int(m.group(2)), MONTHS[m.group(3).lower()], wd_index(m.group(1)), int(m.group(4)) if m.group(4) else None)
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], f'Kindertheater: {title}', day, url, ctx,
                             time_from=hhmm(m.group(5), m.group(6)), age=age_in(lines[head + 1] if head + 1 < len(lines) else ''),
                             price=price_text(next((l for l in lines[head:i] if l.lower().startswith('eintritt')), ''))))
    taken = {(o['start_date'], o.get('time_from')) for o in out if o['kind'] == 'termin'}
    # agenda (first page of /calendar/, about ten days)
    url = base + '/calendar/'
    html = page(url)
    for blk in re.split(r'<div class="ai1ec-date\s', html)[1:]:
        d = re.search(r'exact_date&#x7E;(\d{1,2})\.(\d{1,2})\.(\d{4})', blk)
        if not d:
            continue
        day = date(int(d.group(3)), int(d.group(1)), int(d.group(2)))
        for ev in re.split(r'<div class="ai1ec-event\s', blk)[1:]:
            title = clean((re.search(r'(?s)ai1ec-event-title">(.*?)</span>', ev) or [0, ''])[1])
            desc = clean((re.search(r'(?s)ai1ec-event-description">(.*?)<div class="ai1ec-event-summary-footer', ev) or [0, ''])[1])
            tm = clean((re.search(r'(?s)ai1ec-event-time">(.*?)</div>', ev) or [0, ''])[1])
            link = unescape((re.search(r'class="ai1ec-load-event"\s+href="([^"]+)"', ev) or [0, url])[1]).split('?')[0]
            tf, tt = times(tm.split(' um ', 1)[-1])
            if not title or title.lower() in groups or (day.isoformat(), tf) in taken or not is_family(f'{title} {desc[:300]}'):
                continue
            out.append(pl.termin(link.rstrip('/').rsplit('/', 1)[-1], title, day, link, desc[:600], time_from=tf, time_to=tt))
    return out


def kultberg():
    url = 'https://kultberg.de/kinder-und-jugend/'
    pl = Place('Begegnungsstätte Bergstedt', 'Begegnungsstätte Bergstedt', 'Bergstedter Chaussee 203, 22395 Hamburg')
    lines = lines_of(page(url))
    out = []
    for m, i in dated_blocks(lines, r'(\d{1,2})\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)$'):
        wd = wd_index(lines[i - 1]) if i else None
        tm = re.match(r'(\d{1,2})[.:](\d\d)\s*Uhr', lines[i + 1]) if i + 1 < len(lines) else None
        if not tm or i + 2 >= len(lines):
            continue
        title = lines[i + 2]
        ctx = ' | '.join(lines[i:i + 8])
        day = infer_date(int(m.group(1)), MONTHS[m.group(2).lower()], wd)
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], f'Kindertheater: {title}', day, url, ctx, time_from=hhmm(*tm.groups())))
    return out


def backstube():
    url = 'https://backstube.hamburg/veranstaltungen'
    pl = Place('Backstube Fuhlsbüttel', 'Vereinshaus Backstube Fuhlsbüttel', 'Am Hasenberge 48, 22335 Hamburg')
    lines = lines_of(page(url))
    stop = next((i for i, l in enumerate(lines) if l.startswith('Vergangene Veranstaltungen')), len(lines))
    out = []
    for m, i in dated_blocks(lines[:stop], r'(\d\d)\.(\d\d)\.(\d{4}),\s*(\d\d):(\d\d)\s*Uhr'):
        title = lines[i - 1]
        if title.lower().startswith('kartenvorverkauf') or not is_family(title):
            continue
        tt = re.match(r'(\d\d):(\d\d)\s*Uhr', lines[i + 1]) if i + 1 < stop else None
        blk = lines[i:min(stop, i + 14)]
        ctx = ' | '.join(blk)
        k = next((j for j, l in enumerate(blk) if re.match(r'\d{5}$', l)), None)
        venue = address = None
        if k and k >= 2:
            venue, street = blk[k - 2], blk[k - 1].rstrip(' ,')
            address = f'{street}, {blk[k]} Hamburg'
            if 'backstube' in venue.lower():
                venue = address = None
        day = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], title, day, url, ctx, time_from=hhmm(m.group(4), m.group(5)),
                             time_to=hhmm(*tt.groups()) if tt else None, venue=venue, address=address))
    return out


def btreff():
    base = 'https://btreff.altonanord.de'
    pl = Place('B*Treff Altona-Nord', 'B*Treff Altona-Nord', 'Gefionstraße 3, 22769 Hamburg')
    cats = {c['id'] for c in get(base + '/wp-json/wp/v2/categories?per_page=100').json() if re.search(r'kinder|famil', c['name'], re.I)}
    out = []
    listing = page(base + '/veranstaltungen/')
    for e in get(base + '/wp-json/wp/v2/veranstaltung?per_page=100').json():
        if not cats & set(e.get('categories') or []):
            continue
        link, title = e['link'], clean(e['title']['rendered'])
        m = re.search(re.escape(f'href="{link}"') + r'.*?card_content__datum">([^<]+)<', listing, re.S)
        if not m:
            continue
        d = re.search(WD_RX + r',\s*(\d{1,2})\.\s*(\w+)\s*(\d{4})?', m.group(1), re.I)
        if not d or d.group(3).lower() not in MONTHS:
            continue
        day = infer_date(int(d.group(2)), MONTHS[d.group(3).lower()], wd_index(d.group(1)), int(d.group(4)) if d.group(4) else None)
        if day < TODAY:
            continue
        tf, tt = times(m.group(1).split(',', 1)[1] if d.group(4) is None else m.group(1).split(d.group(4), 1)[1])
        detail = ' | '.join(lines_of(page(link)))
        k = detail.find(title[:15])
        k = detail.find(title[:15], k + 1) if detail.count(title[:15]) > 1 else k  # skip the <title> occurrence
        ctx = detail[k:k + 1500] if k >= 0 else ''
        out.append(pl.termin(e['slug'], title, day, link, ctx, time_from=tf, time_to=tt))
    # weekly groups in a family category, schedule from the 'Kurse und Gruppen' page
    url = base + '/kurse-und-gruppen/'
    lines = lines_of(page(url))
    for g in get(base + '/wp-json/wp/v2/kurs-und-gruppe?per_page=100').json():
        if not cats & set(g.get('categories') or []):
            continue
        title = clean(g['title']['rendered'])
        idx = [i for i, l in enumerate(lines) if l == title]
        if not idx:
            continue
        i = idx[-1]
        blk = lines[i:i + 30]
        end = next((j for j, l in enumerate(blk) if j > 2 and l.startswith('Kosten')), len(blk) - 1)
        blk = blk[:end + 1]
        ctx = ' | '.join(blk)
        for line in blk:
            m = re.match(WD_RX + r',\s*(\d{1,2}[:.]\d\d)\s*[-–]\s*(\d{1,2}[:.]\d\d)\s*Uhr', line, re.I)
            if m:
                full = f'{title} – {blk[1]}' if len(blk) > 1 and len(blk[1]) < 50 and not times(blk[1])[0] else title
                out.append(pl.weekly(g['slug'], full, wd_index(m.group(1)), g['link'], ctx, hhmm(*re.split('[:.]', m.group(2))),
                                     hhmm(*re.split('[:.]', m.group(3)))))
    return out


def sprungbrett():
    out = []
    for url, pl in [('https://www.sprungbrett-bergedorf.de/6-1-kultura',
                     Place('KulturA Neuallermöhe', 'KulturA – Kulturzentrum Neuallermöhe', 'Otto-Grot-Straße 90, 21035 Hamburg', 'KulturA')),
                    ('https://www.sprungbrett-bergedorf.de/11-1-bruegge-ein-haus-fuer-alle',
                     Place('Haus brügge Lohbrügge', 'Haus brügge – ein Haus für Alle', 'Leuschnerstraße 86, 21031 Hamburg'))]:
        lines = lines_of(page(url))
        heads = [i for i, l in enumerate(lines) if re.match(r'\d{1,2}\.\d{1,2}\.\s*\|', l)]
        for n, i in enumerate(heads):
            m = re.match(r'(\d{1,2})\.(\d{1,2})\.\s*\|\s*' + WD_RX + r',?\s*(\d{1,2})[:.](\d\d)', lines[i], re.I)
            if not m or i + 1 >= len(lines):
                continue
            nxt = heads[n + 1] if n + 1 < len(heads) else min(len(lines), i + 8)
            blk = lines[i + 1:min(nxt, i + 8)]
            head = blk[0]
            cat, title = (head.split('|', 1) + [''])[:2] if '|' in head else ('', head)
            title = title.strip() or cat.strip()
            ctx = ' | '.join(blk)
            if not (is_family(f'{head} {" ".join(blk[1:3])}') or re.search(r'kleine|familien|ferienkino', cat, re.I)):
                continue
            if re.search(r'senior|mediensprech|lesung und gespräch', ctx, re.I):
                continue
            day = infer_date(int(m.group(1)), int(m.group(2)), wd_index(m.group(3)))
            label = f'{cat.strip()}: {title}' if cat.strip() and re.search(r'kino|disco|kreativ', cat, re.I) and cat.strip() not in title else title
            out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], strip_names(label), day, url, ctx, time_from=hhmm(m.group(4), m.group(5))))
        # KulturA children's courses ('Ballett / Kindertanz' / 'Donnerstags, 16.45 Uhr' / '15 Termine, Beginn 27.08.2026 | 90,-€')
        k = next((i for i, l in enumerate(lines) if l.startswith('Kurse Kinder')), None)
        if k is not None:
            sec = lines[k + 1:k + 80]
            for j, l in enumerate(sec):
                m = re.match(WD_RX + r',\s*(\d{1,2})[.:](\d\d)(?:\s*[-–]\s*(\d{1,2})[.:](\d\d))?', l, re.I)
                if not m or j == 0:
                    continue
                title = sec[j - 1]
                if len(title) > 60 or times(title)[0]:
                    continue
                ctx = ' | '.join(sec[j:j + 3])
                st = re.search(r'Beginn\s*(\d\d)\.(\d\d)\.(\d{4})', ctx)
                start = date(int(st.group(3)), int(st.group(2)), int(st.group(1))) if st else None
                n_ = re.search(r'(\d+)\s*Termine', ctx)
                tf, tt = hhmm(m.group(2), m.group(3)), hhmm(m.group(4), m.group(5)) if m.group(4) else None
                sched = (f'{WEEKDAYS[wd_index(m.group(1))]} {tf}{"–" + tt if tt else ""}'
                         + (f', {n_.group(1)} Termine' if n_ else '') + (f' ab {start.strftime("%d.%m.%Y")}' if start else ''))
                # a running course (start in the past) stays listed without dates, finish() would drop it otherwise
                out.append(pl.weekly(re.sub(r'\W+', '-', title.lower())[:40], title, wd_index(m.group(1)), url, ctx, tf, tt,
                                     kind='kurs' if start else 'gruppe', schedule=sched, start=start if start and start >= TODAY else None,
                                     price=price_text(ctx.split('|', 1)[1] if '|' in ctx else ctx), age=age_in(ctx)))
        # Haus brügge weekly list: weekday heading, then '• Name | ... | 16:00–18:30 Uhr | ...'
        wd = None
        for l in lines:
            if wd_index(l) is not None and re.fullmatch(r'(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)', l):
                wd = wd_index(l)
                continue
            if wd is None or not l.startswith('•') or not is_family(l):
                continue
            body = l.lstrip('• ').strip()
            title = re.split(r'\s*\|\s*|\s+jeden\s+|\s+von\s+\d', body)[0].strip()
            tf, tt = times(body)
            nth = re.search(r'jeden ([\d. und]+)\s*(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)', body)
            sched = f'{WEEKDAYS[wd]} {tf}{"–" + tt if tt else ""}, jeden {nth.group(1).strip()} {nth.group(2)} im Monat' if nth else None
            out.append(pl.weekly(re.sub(r'\W+', '-', title.lower())[:40], title, wd, url, body, tf, tt, schedule=sched))
    return out


def kunstklinik():
    url = 'https://kunstklinik.hamburg/kinder-jugend/'
    pl = Place('Kunstklinik Eppendorf', 'Kunstklinik – Kulturzentrum Eppendorf', 'Martinistraße 44a, 20251 Hamburg', 'Kunstklinik')
    lines = lines_of(page(url))
    a = next((i for i, l in enumerate(lines) if l.startswith('Es gibt viel zu erleben')), 0)
    b = next((i for i, l in enumerate(lines) if l.lower().startswith('regelmäßige kurse und gruppen')), len(lines))
    out = []
    mon = '(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)'
    for i in range(a, b - 2):
        l = lines[i]
        if not re.match(r'(mo|di|mi|do|fr|sa|so)\w*\.?,', l, re.I):
            continue
        info, title = lines[i + 1], lines[i + 2]
        if re.search(r'pause', title, re.I):
            continue
        days = []
        m = re.match(r'(\w+)\.?,\s*(\d{1,2})\.\s*und\s*(\w+)\.?,\s*(\d{1,2})\.(\d{1,2})\.(\d{4})', l)  # 'Sa, 28. und So, 29.11.2026'
        if m:
            y, mo = int(m.group(6)), int(m.group(5))
            days = [infer_date(int(m.group(2)), mo, wd_index(m.group(1)), y), infer_date(int(m.group(4)), mo, wd_index(m.group(3)), y)]
            end = None
        else:
            ds = re.findall(r'(\w+)\.?,\s*(\d{1,2})\.\s*(' + mon + r'|\d{1,2}\.)\s*(\d{4})', l, re.I)
            if not ds:
                continue
            parsed = []
            for wdw, dd, mm, yy in ds:
                month = MONTHS.get(mm.lower()) or int(mm.rstrip('.'))
                parsed.append(infer_date(int(dd), month, wd_index(wdw), int(yy)))
            days, end = [parsed[0]], parsed[1] if len(parsed) > 1 else None
        tf, tt = times(info)
        if tf and tf >= '18:00' and not is_family(title):
            continue
        org = re.search(r'Veranstalter:\s*([^,]+)', info)
        for day in days:
            out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], title, day, url, f'{title} {info}', time_from=tf,
                                 time_to=tt if not re.search(r'jeweils um', info, re.I) else None, end=end,
                                 description=f'Veranstalter: {org.group(1).strip()}' if org else None))
    for l in lines[b:b + 30]:  # 'Kindertheater-Kurse, Montag, 16:00 – 17:30'
        m = re.match(r'(.{3,70}?),\s*((?:' + WD_RX + r').*)$', l, re.I)
        if not m or l.startswith('Kinder und Jugendliche können'):
            continue
        title = m.group(1)
        for wm in re.finditer(WD_RX + r'\s*(?:ab\s*|nachmittag)?([^A-Za-zÄÖÜäöü]*)', m.group(2), re.I):
            tf, tt = times(wm.group(2) + ' Uhr') if re.search(r'\d', wm.group(2)) else (None, None)
            if tt and '+' in wm.group(2):
                tt = None
            out.append(pl.weekly(re.sub(r'\W+', '-', title.lower())[:40], strip_names(title), wd_index(wm.group(1)), url, title, tf, tt))
    return out


def agdaz():
    pl = Place('Stadtteiltreff AGDAZ Steilshoop', 'Stadtteiltreff AGDAZ', 'Gropiusring 43A, 22309 Hamburg', 'Stadtteiltreff AGDAZ')
    url = 'https://www.agdaz.de/veranstaltungsprogramm/'
    joined = '|' + '|'.join(lines_of(page(url))) + '|'
    out = []
    for m in re.finditer(r'\|(Mo|Di|Mi|Do|Fr|Sa|So)\|(\d\d)\.(\d\d)\.\|(\d\d:\d\d) - (\d\d:\d\d|--:--)\|(.*?)\|Eintritt:\|(.*?)(?=\|)', joined):
        text = m.group(6).replace('|', ' – ')
        if not is_family(text):
            continue
        day = infer_date(int(m.group(2)), int(m.group(3)), wd_index(m.group(1)))
        title = m.group(6).split('|')[0]
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], title, day, url, f'{text} Eintritt: {m.group(7)}',
                             time_from=m.group(4), time_to=None if '-' in m.group(5)[:1] else m.group(5),
                             description=m.group(6).split('|')[1][:150] if '|' in m.group(6) else None))
    url = 'https://www.agdaz.de/kurse-und-gruppen/'
    return out + weekly_lines(lines_of(page(url)), pl, url)


def igl():
    pl = Place('IGL Langenhorn', 'IGL – Interessengemeinschaft um den Lentersweg', 'Flughafenstraße 91, 22415 Hamburg', 'IGL')
    url = 'https://igl-hamburg.de/termine/'
    out = []
    for m, i in dated_blocks(lines_of(page(url)), r'(\d\d)\.(\d\d)\.(\d{4})\s+(\d\d):(\d\d)\s*Uhr\s+(.+)$'):
        title = m.group(6).replace('„', '').replace('“', '').strip()
        if not is_family(title):
            continue
        day = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], title, day, url, title, time_from=hhmm(m.group(4), m.group(5)),
                             price=('kostenlos', 1) if 'kino' in title.lower() else None))
    for url, fam in [('https://igl-hamburg.de/angebote/angebote-fuer-familien/', True),
                     ('https://igl-hamburg.de/angebote/angebote-fuer-kinder-jugendliche/', False)]:
        lines = lines_of(page(url))
        for o in weekly_lines(lines, pl, url, family_only=fam, skip=r'hausaufgaben|pausiert|zeiten|jugend-bereich'):
            if any(x['kind'] != 'termin' and (x['weekday'], x['time_from']) == (o['weekday'], o['time_from']) for x in out):
                continue  # Sunday 'Turnen' is listed on both pages
            k = next((i for i, l in enumerate(lines) if l == o['title']), None)
            wo = next((l for l in lines[k:k + 6] if l.startswith('Wo?')), None) if k is not None else None
            if wo:
                o.update(venue=wo.split('?', 1)[1].strip()[:80], lat=None, lon=None, address=None)
            out.append(o)
    return out


def alles_wird_schoen():
    url = 'https://alles-wird-schoen-e-v.de/portfolio-items/kinderatelier/'
    pl = Place('Alles wird schön Harburg', 'Alles wird schön e.V.', 'Friedrich-Naumann-Straße 27, 21075 Hamburg', 'Alles wird schön e.V.')
    lines = lines_of(page(url))
    out = []
    for i, l in enumerate(lines):
        m = re.search(r'immer\s+' + WD_RX, l, re.I)
        if m:
            tf, tt = times(l + ' ' + (lines[i + 1] if i + 1 < len(lines) else ''))
            ctx = ' | '.join(lines[i:i + 6])
            out.append(pl.weekly('kinderatelier', 'Kinderatelier', wd_index(m.group(1)), url, ctx, tf, tt))
            break
    return out


def lukulule():
    url = 'https://lukulule.de/kurse-termine/'
    pl = Place('LUKULULE', 'LUKULULE e.V.', 'Stockmeyerstraße 41, Halle 4i, 20457 Hamburg')
    lines = lines_of(page(url))
    heads = [(i, m) for i, l in enumerate(lines)
             for m in [re.match(r'(MO|DI|MI|DO|FR|SA|SO)\s+(\d\d:\d\d)\s*(?:-|bis)\s*(\d\d:\d\d)(?:\s*Uhr)?\s+(?!(?:Uhr\s+)?\(nd\))(?:Uhr\s+)?(.+)$',
                                l, re.I)] if m]
    out = []
    for n, (i, m) in enumerate(heads):
        nxt = heads[n + 1][0] if n + 1 < len(heads) else min(len(lines), i + 15)
        ctx = ' | '.join(lines[i + 1:nxt])
        title = strip_names(m.group(4))
        alter = re.search(r'Alter:\s*([^|]{1,40}?)(?:Kursleitung|$)', ctx)
        age = good_age(age_in(alter.group(1) if alter else ctx))
        if age[0] is None and not is_family(ctx):
            continue
        if age[0] is not None and age[0] >= 13 * 12:
            continue
        out.append(pl.weekly(re.sub(r'\W+', '-', title.lower())[:40], title, wd_index(m.group(1)), url, ctx, m.group(2), m.group(3), age=age,
                             price=(None, None)))
    return out


def lurup():
    url = 'https://unser-lurup.de/'
    pl = Place('Stadtteilhaus Lurup', 'Stadtteilhaus Lurup', 'Luruper Hauptstraße 155, 22547 Hamburg')
    lines = lines_of(page(url))
    out = []
    for i, l in enumerate(lines):
        if not re.search(r'märchen|kindertheater|puppentheater', l, re.I) or i == 0:
            continue
        title = lines[i - 1] if len(lines[i - 1]) < 50 else l
        blk = lines[i:i + 12]
        ctx = ' | '.join(blk)
        wd = next((wd_index(x) for x in blk if re.fullmatch(WD_RX, x, re.I)), None)
        tm = re.search(r'(?:jeweils\s+)?(?:ab|um)\s+(\d{1,2})(?:[:.](\d\d))?\s*Uhr', ctx)
        days = []
        for dm in re.finditer(r'((?:\d{1,2}\.?\s*\+\s*)*\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?', ctx):
            month, year = int(dm.group(2)), int(dm.group(3)) if dm.group(3) else None
            if not 1 <= month <= 12:
                continue
            for dd in re.findall(r'\d{1,2}', dm.group(1)):
                d = infer_date(int(dd), month, wd, year)
                if d:
                    days.append(d)
        for day in sorted(set(days)):
            out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], f'{title} – {l}' if title != l else title, day, url, ctx,
                                 time_from=hhmm(tm.group(1), tm.group(2)) if tm else None))
        if days:
            break
    return out


def kiku():
    url = 'https://www.kiku-hh.de/pf/mitspieltheater-im-kiku/'
    pl = Place('KIKU Kinderkulturhaus Lohbrügge', 'KIKU Kinderkulturhaus Lohbrügge', 'Lohbrügger Markt 5, 21031 Hamburg', 'Kinderkulturhaus Lohbrügge')
    lines = lines_of(page(url))
    out = []
    for m, i in dated_blocks(lines, r'Datum\s+(\w+)\.?\s+(\d{1,2})\.\s*(\w+)\.?'):
        label = next((j for j in range(i - 1, max(-1, i - 25), -1) if lines[j] in ('Mitspieltheater', 'Ferienprogramm', 'Theater')), None)
        mon = m.group(3).lower()[:3]
        if label is None or label == 0 or mon not in MONTHS_SHORT:
            continue
        title = lines[label - 1]
        blk = lines[i:i + 8]
        ctx = ' | '.join(blk)
        tm = re.search(r'Beginn\s+(\d{1,2})[:.](\d\d)', ctx)
        day = infer_date(int(m.group(2)), MONTHS_SHORT[mon], wd_index(m.group(1)))
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], f'{lines[label]}: {title}', day, url, ctx,
                             time_from=hhmm(*tm.groups()) if tm else None, registration='nötig',
                             description='Tickets über das Galli Theater Hamburg' if 'galli' in ' '.join(lines).lower() else None))
    return out


def kinderbuchhaus():
    url = 'https://kinderbuchhaus.de/'
    pl = Place('Kinderbuchhaus im Altonaer Museum', 'Kinderbuchhaus im Altonaer Museum', 'Museumstraße 23, 22765 Hamburg', 'Kinderbuchhaus')
    lines = lines_of(page(url))
    out = []
    for m, i in dated_blocks(lines, WD_RX + r',\s*(\d\d)\.(\d\d)\.(\d{4}),\s*(\d\d):(\d\d)(?:\s*[-–]\s*(\d\d):(\d\d))?\s*Uhr'):
        title = lines[i - 2] if i >= 2 and len(lines[i - 2]) < 90 else lines[i - 1]
        info = next((l for l in lines[i + 1:i + 12] if re.match(r'für ', l, re.I) and '·' in l), '')
        day = date(int(m.group(4)), int(m.group(3)), int(m.group(2)))
        sub = lines[i - 1] if title != lines[i - 1] else ''
        out.append(pl.termin(re.sub(r'\W+', '-', title.lower())[:40], title, day, 'https://kinderbuchhaus.de/veranstaltungen/', info,
                             time_from=hhmm(m.group(5), m.group(6)), time_to=hhmm(m.group(7), m.group(8)) if m.group(7) else None,
                             age=age_in(info), description=re.sub(r'\s+mit\s+.*$', '', sub)[:150] or None))
    return out


def kulturschloss():
    base = 'https://www.kulturschloss-wandsbek.de/?page_id='
    pl = Place('Kulturschloss Wandsbek', 'Kulturschloss Wandsbek', 'Königsreihe 4, 22041 Hamburg', 'Kulturschloss Wandsbek')
    out = []
    for wd, pid in enumerate([847, 1014, 1019, 13228, 1025, 1027, 1031]):
        url = base + str(pid)
        lines = lines_of(page(url))
        a = next((i for i, l in enumerate(lines) if l == 'Suchen nach:'), 0)
        block = []
        for l in lines[a + 1:] + ['+++']:
            if not l.startswith('+++'):
                block.append(l)
                continue
            if block:
                # title / time / audience lines, plus a description line that names the children's age
                head = ' | '.join(block[:3] + [x for x in block[3:8] if re.search(r'für kinder|kinder (von|ab|\d)', x, re.I)][:1])
                if is_family(head) and not re.search(r'erwachsene|migrant', head, re.I):
                    tl = next((x for x in block[:3] if times(x)[0]), '')
                    # 'Dienstags 16:00 – 17:00 Uhr und freitags 15:00 – 16:00 Uhr': take the part for this page's weekday
                    part = next((seg for seg in re.split(r'\bund\b', tl) if wd_index((re.match(r'\s*(\w+)', seg) or [0, ''])[1]) == wd), tl)
                    tf, tt = times(part)
                    m = re.match(r'(?:\w{2}\.\s*)?\d{1,2}[:.]\d\d\s*[-–]\s*\d{1,2}[:.]\d\d(?:\s*Uhr)?\s+(.+)$', tl)
                    title = m.group(1) if m else block[0]
                    nxt = block[block.index(tl) + 1] if tl in block and block.index(tl) + 1 < len(block) else ''
                    if len(title) < 15 and re.match(r'(für )?kinder', nxt, re.I) and 'kind' not in title.lower():
                        title = f'{title} für Kinder'  # 'Theater' / 'Kinder 7-10 Jahre | 50 € monatlich'
                    if tf:
                        out.append(pl.weekly(re.sub(r'\W+', '-', title.lower())[:40], strip_names(title), wd, url, head, tf, tt,
                                             age=age_in(head)))
            block = []
    return out


def basch():
    url = 'https://kulturpunkt-basch.de/veranstaltungen/'
    pl = Place('Kulturpunkt Basch', 'Kulturpunkt im Basch', 'Wohldorfer Straße 30, 22081 Hamburg', 'Kulturpunkt im Basch')
    html = page(url)
    out = []
    for dd, mm, yy, tid, title, rest in re.findall(r'<div class="col-md-3"><h3[^>]*>(\d\d)\.(\d\d)\.(\d{4})</h3></div><div class="col-md-9">'
                                                   r'<h3 class="termindetail-(\d+)"[^>]*>(.*?)</h3>(.*?)(?=<div class="col-md-3">|$)', html, re.S):
        title, text = clean(title), clean(rest)
        if not is_family(f'{title} {text[:200]}'):
            continue
        day = date(int(yy), int(mm), int(dd))
        tm = re.search(rf'{dd}\.{mm}\.{yy}\s*,\s*(\d{{1,2}})[.:](\d\d)\s*Uhr', text)
        out.append(pl.termin(tid, title, day, url, text[:800], time_from=hhmm(*tm.groups()) if tm else None))
    return out


PARSERS = [serrahn, hamm, bim, kultberg, backstube, btreff, sprungbrett, kunstklinik, agdaz, igl, alles_wird_schoen, lukulule, lurup,
           kiku, kinderbuchhaus, kulturschloss, basch]


def main():
    offers = []
    for parser in PARSERS:
        try:
            got = [o for o in parser() if o.get('title')]
            print(f'  {parser.__name__:18} {len(got):3} offers')
            offers += got
        except Exception as e:  # one broken site must not stop the others
            print(f'  {parser.__name__:18} failed: {type(e).__name__}: {str(e)[:80]}')
    return finish(SOURCE_ID, 'Stadtteilkultur: Kinder & Familie (Stadtteilkulturzentren, Bürgerhäuser)', MEMBERS,
                  'jeweiliges Stadtteilkulturzentrum (siehe provider)', offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
