"""Pharmacy emergency duty (Apotheken-Notdienst) for today and tomorrow as facts on our pharmacies (source 'notdienst').

Source: the official emergency pharmacy search of the German pharmacists, https://www.aponet.de/notdienstsuche, which the
Apothekerkammer Hamburg links as its nationwide finder. The Kammer's own Hamburg finder (notdienst.apothekerkammer-hamburg.de)
is a widget that loads its data from notdienst.sberg.net, whose robots.txt says 'Disallow: /' for all crawlers, so it is not
used. aponet.de robots.txt only disallows /typo3*. The search form is sent like a visitor does: place '20095' (Hamburg-Altstadt),
radius 25 km (covers all of Hamburg), one date each for today and tomorrow (the search lists duties that START on that day).
Per run: 1 GET (form tokens) + 2 POST to aponet.de. Run daily at about 09:00 (Hamburg duties change at 09:00).

Kept per duty (facts only): notdienst_from, notdienst_to (ISO 8601 with offset, Hamburg time), notdienst_source_url.
No names of persons; phone and address stay with the existing place (OSM / website records).

Matching (correctness first): candidates are our 'apotheke' places within 400 m of aponet's coordinates. Evidence per
candidate: similar name (without the word 'Apotheke'), same street + house number, same phone number, distance < 60 m.
A candidate is taken when it has 2+ kinds of evidence and no other candidate has as many. A duty pharmacy in Hamburg with no
'apotheke' place within 400 m and a Hamburg address becomes a new record (category 'apotheke', aponet's name and
coordinates). Everything else (a nearby pharmacy with a different name, two equally good candidates) is skipped and printed.
Duties outside Hamburg are only kept when they match one of our places.
Records of matched pharmacies carry the place's own name and coordinates, so merge.py joins them at distance 0; the place
link is also written directly (source_records.place_id) so the daily run needs no merge.py run.

Run: cd db && python import_notdienst.py      (3 requests to aponet.de)
"""
import html
import math
import re
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher

from common import connect, fetch, register_source, replace_records
from offers_util import clean, get

SOURCE_ID = 'notdienst'
PAGE = 'https://www.aponet.de/notdienstsuche'
BASE = 'https://www.aponet.de'
PLACE, RADIUS = '20095', 25
WINDOW = re.compile(r'Notdienst vom (\d\d)\.(\d\d)\.(\d{4}) um (\d\d):(\d\d) Uhr bis (\d\d)\.(\d\d)\.(\d{4}) um (\d\d):(\d\d) Uhr')
STOP = {'apotheke', 'apotheken', 'am', 'an', 'im', 'in', 'der', 'die', 'das', 'den', 'zur', 'zum', 'hamburg', 'easyapotheke', 'easy',
        'e', 'k', 'ohg', 'mediservice', 'filiale', 'und', 'bei', 'vor', 'dem'}


def berlin_offset(dt):
    """UTC offset of Hamburg local time (CET/CEST; last Sunday of March / October at 02:00/03:00)."""
    def last_sunday(y, m):
        d = date(y, m, 31)
        return d - timedelta(days=(d.weekday() + 1) % 7)
    start = datetime.combine(last_sunday(dt.year, 3), datetime.min.time()).replace(hour=2)
    end = datetime.combine(last_sunday(dt.year, 10), datetime.min.time()).replace(hour=3)
    return '+02:00' if start <= dt < end else '+01:00'


def iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:00') + berlin_offset(dt)


def fold(s):
    s = (s or '').lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        s = s.replace(a, b)
    return s


def name_key(s):
    s = re.sub(r'apotheke\b|apotheke(?=[a-z])', ' apotheke ', fold(s))
    return [t for t in re.findall(r'[a-z0-9]+', s) if t not in STOP]


def same_name(a, b):
    ta, tb = name_key(a), name_key(b)
    if not ta or not tb:
        return False
    sa, sb = ' '.join(ta), ' '.join(tb)
    return sa == sb or set(ta) <= set(tb) or set(tb) <= set(ta) or SequenceMatcher(None, sa, sb).ratio() >= 0.85


def street_key(street):
    s = fold(street).replace('str.', 'strasse').replace('strasse', 'str')
    m = re.match(r'(.*?)\s*(\d+)\s*([a-z]?)\b', s)
    if not m:
        return None
    return re.sub(r'[^a-z]', '', m.group(1)), m.group(2) + m.group(3)


def phone_key(p):
    d = re.sub(r'\D', '', p or '')
    d = re.sub(r'^(0049|49)', '0', d)
    return d[-7:] if len(d) >= 7 else None


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    return 6371000 * math.hypot((lo2 - lo1) * k * math.cos((la1 + la2) * k / 2), (la2 - la1) * k)


_form = []


def search(day):
    """Duties starting on `day` within RADIUS km of PLACE, as dicts."""
    if not _form:
        _form.append(get(PAGE).text)
    page = _form[0]
    form = re.search(r'(?s)<form role="search".*?</form>', page).group(0)
    action = html.unescape(re.search(r'action="([^"]+)"', form).group(1))
    data = {html.unescape(n): html.unescape(v) for n, v in re.findall(r'<input type="hidden" name="([^"]+)" value="([^"]*)"', form)}
    data.update({'tx_aponetpharmacy_search[search][plzort]': PLACE, 'tx_aponetpharmacy_search[search][date]': day.isoformat(),
                 'tx_aponetpharmacy_search[search][street]': '', 'tx_aponetpharmacy_search[search][radius]': str(RADIUS)})
    t = fetch(BASE + action, method='POST', data=data, check_robots=True, timeout=40, retries=2).text
    out = []
    for li in re.findall(r'(?s)<li class="list-group-item"\s+data-id="\d+".*?</li>', t):
        g = lambda rx: (m := re.search(rx, li, re.S)) and clean(m.group(1))
        w = WINDOW.search(clean(li))
        if not w:
            continue
        v = [int(x) for x in w.groups()]
        out.append({'id': g(r'data-id="(\d+)"'), 'name': g(r'<h2 class="name">(.*?)</h2>'),
                    'lat': float(g(r'data-latitude="([\d.]+)"')), 'lon': float(g(r'data-longitude="([\d.]+)"')),
                    'street': g(r'<span class="strasse">(.*?)</span>'), 'plz': g(r'<span class="plz">(.*?)</span>'),
                    'ort': g(r'<span class="ort">(.*?)</span>'), 'phone': g(r'href="tel:([^"]+)"'),
                    'from': datetime(v[2], v[1], v[0], v[3], v[4]), 'to': datetime(v[7], v[6], v[5], v[8], v[9])})
    count = re.search(r'(\d+) Apotheken im Umkreis', t)
    if count and int(count.group(1)) != len(out):
        print(f'  {day}: page says {count.group(1)} pharmacies, parsed {len(out)}')
    return out


def pharmacies(con):
    """Our pharmacy places with name, coordinates, street key and phone keys."""
    rows = {}
    for pid, name, la, lo in con.execute("SELECT id, name, lat, lon FROM places WHERE category='apotheke'"):
        rows[pid] = {'id': pid, 'name': name, 'lat': la, 'lon': lo, 'streets': set(), 'phones': set(), 'names': {name} if name else set()}
    for pid, key, value in con.execute("""SELECT sr.place_id, f.key, f.value FROM facts f JOIN source_records sr
                                          ON sr.source_id=f.source_id AND sr.source_ref=f.source_ref
                                          WHERE sr.place_id IN (SELECT id FROM places WHERE category='apotheke')
                                          AND f.key IN ('street', 'housenumber', 'address', 'phone', 'name') AND sr.source_id != ?""", (SOURCE_ID,)):
        p = rows[pid]
        if key == 'phone':
            p['phones'].update(k for k in (phone_key(x) for x in re.split(r'[;,/]', value)) if k)
        elif key == 'address':
            k = street_key(value.split(',')[0])
            if k: p['streets'].add(k)
        elif key == 'name':
            p['names'].add(value)
        else:
            p.setdefault('_' + key, set()).add(value)
    for p in rows.values():
        for s in p.pop('_street', set()):
            for h in p.get('_housenumber', set()):
                k = street_key(f'{s} {h}')
                if k: p['streets'].add(k)
        p.pop('_housenumber', None)
    return list(rows.values())


def match(d, places):
    """-> (place, evidence) | ('new', None) | (None, reason)."""
    cands = []
    for p in places:
        m = dist(d['lat'], d['lon'], p['lat'], p['lon'])
        if m > 400:
            continue
        ev = set()
        if any(same_name(d['name'], n) for n in p['names']): ev.add('name')
        if street_key(d['street']) in p['streets']: ev.add('address')
        if phone_key(d['phone']) and phone_key(d['phone']) in p['phones']: ev.add('phone')
        if m < 60: ev.add('near')
        cands.append((len(ev), -m, p, ev))
    if not cands:
        return ('new', None) if d['ort'] == 'Hamburg' else (None, 'outside Hamburg, no pharmacy place')
    cands.sort(key=lambda c: (c[0], c[1]), reverse=True)
    best = cands[0]
    unique = len(cands) == 1 or cands[1][0] < best[0]
    if best[0] >= 2 and unique and {'name', 'phone'} & best[3]:  # same address + near alone could be another shop in the building
        return best[2], best[3]
    return None, 'uncertain: ' + '; '.join(f"{c[2]['name']} ({-c[1]:.0f} m, {','.join(sorted(c[3])) or '-'})" for c in cands[:3])


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    today = date.today()
    duties = []
    for day in (today, today + timedelta(days=1)):
        duties += search(day)
    if not duties:
        print(f'{SOURCE_ID}: no duties parsed; keeping existing data')
        return 0
    con = connect()
    register_source(con, SOURCE_ID, 'Apotheken-Notdienst (aponet.de, heute und morgen)', PAGE, 'Fakten mit Link',
                    'aponet.de – Offizielles Gesundheitsportal der deutschen Apothekerinnen und Apotheker', 70)
    places = pharmacies(con)
    now = datetime.now()
    by_ref, skipped = {}, []
    for d in sorted(duties, key=lambda x: x['from']):
        if d['to'] <= now:
            continue
        p, ev = match(d, places)
        if p is None:
            skipped.append(f"{d['name']}, {d['street']}, {d['plz']} {d['ort']} ({d['from']:%d.%m. %H:%M}): {ev}")
            continue
        if p == 'new':
            ref, name, la, lo, pid = f"aponet:{d['id']}", d['name'], d['lat'], d['lon'], None
        else:
            ref, name, la, lo, pid = f"place:{p['id']}", p['name'], p['lat'], p['lon'], p['id']
        if ref in by_ref:  # second duty of the same pharmacy in the window: keep the earlier one
            continue
        by_ref[ref] = {'ref': ref, 'category': 'apotheke', 'name': name, 'lat': la, 'lon': lo, 'url': PAGE, '_pid': pid,
                       'facts': {'notdienst_from': iso(d['from']), 'notdienst_to': iso(d['to']), 'notdienst_source_url': PAGE},
                       'raw': {'aponet_id': d['id'], 'name': d['name'], 'address': f"{d['street']}, {d['plz']} {d['ort']}",
                               'evidence': sorted(ev) if ev else 'new'}}
    records = list(by_ref.values())
    if not records:
        print(f'{SOURCE_ID}: nothing matched; keeping existing data')
        return 0
    for attempt in range(6):
        try:
            n = replace_records(con, SOURCE_ID, records)
            con.executemany('UPDATE source_records SET place_id=? WHERE source_id=? AND source_ref=? AND place_id IS NULL',
                            [(r['_pid'], SOURCE_ID, r['ref']) for r in records if r['_pid']])
            con.commit()
            break
        except sqlite3.OperationalError as ex:
            if 'locked' not in str(ex) or attempt == 5:
                raise
            con.rollback()
            print(f'  database locked, retry {attempt + 1}')
            time.sleep(10 * (attempt + 1))
    new = sum(1 for r in records if not r['_pid'])
    print(f'{SOURCE_ID}: {len(duties)} duties read, {n} records ({n - new} on existing pharmacies, {new} new), {len(skipped)} skipped')
    for r in records:
        f = r['facts']
        print(f"  {f['notdienst_from'][5:16]} - {f['notdienst_to'][5:16]}  {r['name']}  <- {r['raw']['name']}, {r['raw']['address']}  [{r['raw']['evidence']}]")
    for s in skipped:
        print('  skipped:', s)
    return n


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
