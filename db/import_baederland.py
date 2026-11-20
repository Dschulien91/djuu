"""Facts for the public pools of Bäderland Hamburg from the operator's own pool pages (source 'baederland').

Source: https://www.baederland.de/baeder/alle-baeder/ and one page per pool (/baeder/alle-baeder/<slug>/).
baederland.de is in PERMITTED_HOSTS (db/common.py): the operator agreed to be read and shown, so robots.txt is not
applied; Crawl-delay and the per-host pause still are.

Kept per pool (facts only, the app links the pool page):
  opening_hours  OSM syntax. The site publishes one week at a time (?location_detail[date]=YYYY-MM-DD shows the week of
                 that date) and the times change from week to week, so the current week and the next WEEKS-1 weeks are
                 read and the most frequent pattern is kept (ties: the earliest week). 'off' when every sampled week
                 says "geschlossen" (Sanierung, Modernisierung). None when no week has times (Freibad out of season).
  fee, fee_text  prices at the pool desk (Erwachsene / Jugendliche 12-15 / Kinder unter 12; weekday and weekend tabs).
                 Bäderland publishes no family ticket and no free age for small children (19 Nov 2026).
  water_play     'yes' for a Wasserspielplatz / Sprayground.
  kids_pool      'yes' for a Planschbecken, Baby-, Kinder- or Kleinkindbecken, Babypool, Minipool, Spiel- und Spaßbecken
                 (pool pages plus the 'Spiel & Action' pages of Dinoland, Bondiland, Lillebille, Taka Tuka, Wellenbad).
  water_slide    'yes' for a Rutsche / Wasserrutsche.
  wave_pool      'yes' for a Wellenbad.
  baby_swimming  course names of the Bäderland baby/toddler courses (Aqua Baby, Aqua Kita) at this pool, from /kurse/babykurse/ and its
                 course pages (the courses themselves stay in import_offers_elbkinder.py as 'baederland_kurse').
  for_baby       'yes' for a baby pool or Aqua Baby courses; for_toddler 'yes' for a kids pool or water playground.
  type, indoor, season (Sommerfreibad / Naturbad), services (family-relevant parts of "Bad-Angebot"; sauna, massage,
  fitness left out), wheelchair (yes: "Eingang und Zugang barrierefrei", limited: "Zugang ... nicht barrierefrei"),
  address, website, operator, description (built by us from the facts above, <= 200 characters).
Not published on the pool pages: changing rooms (Wickelraum), family times, family tickets, phone numbers.

Records: one per pool page, category 'baden', with the name and coordinates of the existing place it describes (TARGET,
checked by hand against the places table on 20 Nov 2026), so merge.py joins it to that place. Two pages describing the
same place (Hallenbad and Sommerfreibad Finkenwerder) become one record. A new pool page without a TARGET falls back to
the nearest 'baden' place within 150 m of a similar name, else it is skipped and printed.
Priority 65: the operator's current times beat OSM (60), below the city's open data (70).

Run: cd db && python import_baederland.py      (about 95 requests to baederland.de, ~3 min)
     --cached reuses data/raw/baederland.json instead of fetching again.
"""
import html
import json
import re
import sqlite3
import sys
from collections import Counter
from datetime import date, timedelta
from urllib.parse import urljoin

from common import RAW_DIR, connect, register_source, replace_records
from offers_util import get

SOURCE_ID = 'baederland'
BASE = 'https://www.baederland.de'
LIST = BASE + '/baeder/alle-baeder/'
BABY = BASE + '/kurse/babykurse/'
CACHE = RAW_DIR / 'baederland.json'
WEEKS = 3
# Bäderland's 'Spiel & Action' pages (/familie/spiel-action/<page>/) describe the play areas of these pools in more detail.
SPIEL = {'dinoland': ('festland', 'Dinoland'), 'bondiland': ('bondenwald', 'Bondiland'), 'lillebille': ('billebad', 'Lillebille'),
         'taka-tuka': ('parkbad', 'Taka Tuka'), 'wellenbad': ('holthusenbad', None)}

# Pool page slug -> place id of the existing place it describes (OSM-backed place where there is one).
TARGET = {
    'alsterschwimmhalle': 'dj_dbcfe1d1aeea', 'bartholomaeustherme': 'dj_1be31c9aa537', 'billebad': 'dj_4f804a6ae92c',
    'bondenwald': 'dj_06878adca485', 'familienbad-ohlsdorf': 'dj_f3ccb8391f94', 'familienbad-rahlstedt': 'dj_877c11226df2',
    'festland': 'dj_f27a92072969', 'holthusenbad': 'dj_7c55900d4436', 'kaifubad': 'dj_e1ed1ce67de8',
    'midsommerland': 'dj_c4bf98d71164', 'naturbad-stadtparksee': 'dj_6b1c2c36b3c9', 'parkbad': 'dj_7e6d15acd6eb',
    'schwimmbad-billstedt': 'dj_1a55fd529ba4', 'schwimmbad-blankenese': 'dj_ac269fd9af81', 'schwimmbad-bramfeld': 'dj_64917baa109e',
    'schwimmbad-elbgaustrasse': 'dj_88d1fb3b994f', 'schwimmbad-finkenwerder': 'dj_0e9906ce0387',
    'schwimmbad-st-pauli': 'dj_c656debee939', 'schwimmbad-suederelbe': 'dj_57a14a7cde03', 'schwimmbad-wandsbek': 'dj_2d654c7d1e45',
    'schwimmhalle-inselpark': 'dj_33bd6a1d17e8', 'sommerfreibad-billstedt': 'dj_a9296a09ed4d',
    'sommerfreibad-bondenwald': 'dj_035f6543242c', 'sommerfreibad-finkenwerder': 'dj_0e9906ce0387',
    'sommerfreibad-kaifubad': 'dj_5077a5c51313', 'sommerfreibad-marienhoehe': 'dj_c3c4cdb037a3',
    'sommerfreibad-neugraben': 'dj_ec624c6e4be7', 'sommerfreibad-osdorfer-born': 'dj_7a267823b19e',
}
DAYS = {'Mo': 'Mo', 'Di': 'Tu', 'Mi': 'We', 'Do': 'Th', 'Fr': 'Fr', 'Sa': 'Sa', 'So': 'Su'}
ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
KIDS_POOL = re.compile(r'planschbecken|babybecken|baby-becken|kinderbecken|kleinkindbecken|babypool|minipool|kinderschwimmbereich|'
                       r'spiel- und spa(?:ß|ss)becken|bis zu \d+ cm tiefe[sn]? becken|°c warme becken|babys planschen', re.I)
BABY_POOL = re.compile(r'babybecken|babypool|minipool', re.I)
SLIDE = re.compile(r'rutsche', re.I)
WATER_PLAY = re.compile(r'wasserspielplatz|wasserspiellandschaft|sprayground', re.I)
WAVE = re.compile(r'wellenbad', re.I)
SERVICES = ['Hallenbad', 'Ganzjahresfreibad', 'Sommerfreibad', 'Therme', '50-M-Becken', 'Lehrschwimmbecken', 'Wasserspielplatz',
            'Wasserrutsche', 'Rutsche', 'Wellenbad', 'Sprungturm', 'Kletterwand', 'Schwimmkurse', 'Liegewiese', 'Gastronomie', 'Kiosk']


def clean(s):
    s = re.sub(r'(?s)<(script|style|svg).*?</\1>', ' ', s or '')
    s = re.sub(r'<br\s*/?>|</p>', '\n', s)
    s = html.unescape(html.unescape(re.sub(r'<[^>]+>', ' ', s))).replace('\xad', '').replace('\xa0', ' ')
    return '\n'.join(l for l in (re.sub(r'[ \t\r\f\v]+', ' ', x).strip() for x in s.split('\n')) if l)


def week_hours(page):
    """Opening hours block of a pool page -> (week label, OSM string or 'off' or None)."""
    m = re.search(r'location-info--openinghours-datetime[^>]*>(.*?)</div>', page, re.S)
    if not m:
        return None, None
    block = m.group(1)
    week = re.search(r'openinghours-date">\s*(.*?)\s*</p>', block, re.S)
    week = clean(week.group(1)).replace('–', '-') if week else None
    slots, closed = {}, set()
    for slot in block.split('<span class="opening-hours--timeslot">')[1:]:
        dm = re.search(r'opening-hours--days">(.*?)<span class="opening-hours--time">(.*)', slot, re.S)
        if not dm:
            continue
        days_txt, times_txt = clean(dm.group(1)), clean(dm.group(2))
        ids = [int(x) for x in re.findall(r'data-weekday-id="(\d)"', dm.group(1))]
        days = []
        if len(ids) == 2 and re.search(r'[–-]', days_txt) and '+' not in days_txt:
            days = ORDER[ids[0] - 1:ids[1]]
        else:  # 'Sa + So', 'Mo + Mi - Fr'
            parts = re.split(r'\s*\+\s*', days_txt)
            for p in parts:
                ab = [DAYS[d] for d in re.findall(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\b', p)]
                if len(ab) == 2 and re.search(r'[–-]', p):
                    days += ORDER[ORDER.index(ab[0]):ORDER.index(ab[1]) + 1]
                else:
                    days += ab
        ranges = [f'{a}-{b}' for a, b in re.findall(r'(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})', times_txt)]
        for d in days:
            if ranges:
                slots.setdefault(d, [])
                slots[d] += [r for r in ranges if r not in slots[d]]
            elif 'geschlossen' in times_txt.lower():
                closed.add(d)
    if not slots:
        return week, ('off' if closed else None)
    groups = {}
    for d in ORDER:
        if d in slots:
            groups.setdefault(','.join(slots[d]), []).append(d)
    parts = []
    for rng, ds in sorted(groups.items(), key=lambda g: ORDER.index(g[1][0])):
        idx = [ORDER.index(d) for d in ds]
        if len(ds) >= 3 and idx == list(range(idx[0], idx[-1] + 1)):
            parts.append(f'{ds[0]}-{ds[-1]} {rng}')
        else:
            runs, run = [], [ds[0]]
            for a, b in zip(ds, ds[1:]):
                if ORDER.index(b) == ORDER.index(a) + 1:
                    run.append(b)
                else:
                    runs.append(run); run = [b]
            runs.append(run)
            parts.append(','.join(f'{r[0]}-{r[-1]}' if len(r) >= 3 else ','.join(r) for r in runs) + ' ' + rng)
    return week, '; '.join(parts)


def fees(page):
    """Price tabs -> 'Mo-Fr: Erwachsene 11,30 € (3 Std. 9,30 €) ...; Sa, So, Feiertag: ...'."""
    m = re.search(r'class="location-info--fees u-tile-item-gap"(.*?)location-info--address-group', page, re.S)
    if not m:
        return None
    seg = m.group(1)
    labels = dict(re.findall(r'aria-controls="(tabpanel-[a-z]+)"\s*>([^<]+)</button>', seg))
    panels = re.findall(r'id="(tabpanel-[a-z]+)"[^>]*>(.*?)</div>', seg, re.S) or [('', seg)]
    out = []
    for pid, body in panels:
        groups, cur = [], None  # [who, age, [tariffs]]
        for l in clean(body).split('\n'):
            if re.match(r'(Erwachsene|Jugendliche|Kinder|Familie|Ermäßigt)', l):
                cur = [l.strip(), None, []]; groups.append(cur)
            elif cur and l.startswith('(') and not cur[2]:
                cur[1] = l.strip('() ')
            elif cur and '€' in l:
                cur[2].append(re.sub(r'\s+', ' ', l))
        cats = []
        for who, age, tariffs in groups:
            if not tariffs:
                continue
            if age:
                age = age.replace('12 bis unter 16 Jahren', '12-15 J.').replace('12 bis unter 16 Jahre', '12-15 J.').replace('unter 12 Jahren', 'unter 12 J.')
            main, rest = tariffs[0].replace('Tageskarte ', ''), tariffs[1:]
            cats.append(f"{who}{' ' + age if age else ''} {main}" + (f" ({', '.join(rest)})" if rest else ''))
        if cats:
            label = html.unescape(labels.get(pid, '')).replace('–', '-').replace('Sa + So, Feiert.', 'Sa, So, Feiertag').strip()
            out.append((label + ': ' if label and len(panels) > 1 else '') + ', '.join(cats))
    s = '; '.join(out)
    if len(s) > 240:  # keep the day tickets only
        s = re.sub(r' \([^)]*\)', '', s)
    return s or None


def parse(slug, page):
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    name = clean(h1.group(1)) if h1 else slug
    closed_now = 'Dieses Bad ist zurzeit geschlossen' in page
    items = [clean(x) for x in re.findall(r'location-categories--item-text" aria-label="([^"]*)"', page)]
    items = [re.sub(r'\s+', '', i) if '-\n' in i else i for i in items]
    heads = [clean(x) for x in re.findall(r'slideshow--item-headline">([^<]*)<', page)]
    desc = ' '.join(clean(x) for x in re.findall(r'location-categories--text">(.*?)</div>', page, re.S))
    meta = re.search(r'<meta name="description" content="([^"]*)"', page)
    desc += ' ' + (html.unescape(meta.group(1)) if meta else '')
    addr = re.search(r'<p class="location-info--address">(.*?)</p>', page, re.S)
    address = None
    if addr:
        spans = [clean(s) for s in re.findall(r'<span class="u-block u-font-size-small">(.*?)</span>', addr.group(1), re.S)]
        if spans:
            address = ', '.join(spans[0].split('\n'))
    cash = re.search(r'Kassenschluss</span><br>([^<]+)', page)
    return {'name': name, 'closed_now': closed_now, 'items': items, 'heads': heads, 'desc': desc.strip(), 'address': address,
            'fees': fees(page), 'cash': clean(cash.group(1)) if cash else None,
            'season_over': bool(re.search(r'saison ist beendet', page, re.I)),
            'barrierefrei': 'Der Eingang und der Zugang sind barrierefrei' in page,
            'not_barrierefrei': bool(re.search(r'Zugang zum Bad ist nicht barrierefrei', page))}


def crawl():
    listing = get(LIST).text
    slugs = sorted(set(re.findall(r'href="/baeder/alle-baeder/([^"/#?]+)/"', listing)))
    pools = {}
    today = date.today()
    for s in slugs:
        url = f'{LIST}{s}/'
        try:
            page = get(url).text
        except Exception as e:
            print(f'  {s}: {type(e).__name__} {e}')
            continue
        weeks = [week_hours(page)]
        if weeks[0][1] is not None and 'Dieses Bad ist zurzeit geschlossen' not in page:
            for k in range(1, WEEKS):
                d = (today + timedelta(days=7 * k)).isoformat()
                try:
                    weeks.append(week_hours(get(url, params={'location_detail[date]': d}).text))
                except Exception as e:
                    print(f'  {s} {d}: {type(e).__name__}')
        pools[s] = {'url': url, 'page': page, 'weeks': weeks}
        print(f'  {s}: ' + ' | '.join(f'{w}: {h}' for w, h in weeks))
    baby = {}
    try:
        overview = get(BABY).text
        for href in dict.fromkeys(re.findall(r'href="((?:https://www\.baederland\.de)?/kurse/alle-kurse/kurs-detail/[^"#?]+)"', overview)):
            page = get(urljoin(BASE, href)).text
            h1 = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
            title = clean(h1.group(1)).replace('\n', ' ') if h1 else href
            locs = [clean(re.search(r'<span>(.*?)</span>', li, re.S).group(1))
                    for li in re.findall(r'<li class="course-content--location">(.*?)</li>', page, re.S)]
            baby[title] = locs
    except Exception as e:
        print(f'  baby courses: {type(e).__name__} {e}')
    for page, (slug, _) in SPIEL.items():
        try:
            t = get(f'{BASE}/familie/spiel-action/{page}/').text
            m = re.search(r'<main.*?</main>', t, re.S)
            if slug in pools:
                pools[slug]['play_text'] = clean(m.group(0) if m else t)[:3000]
        except Exception as e:
            print(f'  spiel-action {page}: {type(e).__name__}')
    CACHE.write_text(json.dumps({'pools': pools, 'baby': baby}, ensure_ascii=False), encoding='utf-8')
    return pools, baby


def fold(s):
    s = (s or '').lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def pick_hours(weeks):
    known = [h for _, h in weeks if h]
    if not known:
        return None
    count = Counter(known)
    best = max(count.values())
    return next(h for h in known if count[h] == best)


def facts_of(slug, p, oh, baby_courses, play_text=''):
    play = [l for l in (play_text or '').splitlines() if len(l) > 30]  # drop the links to the other play pages
    feats = ' | '.join(p['items'] + p['heads'] + play) + ' | ' + p['desc']
    baby_only = [c for c in (baby_courses or []) if re.search(r'aqua baby', c, re.I)]
    summer = slug.startswith('sommerfreibad-') or slug.startswith('naturbad-')
    f = {'website': f'{LIST}{slug}/', 'address': p['address'], 'operator': 'Bäderland Hamburg GmbH', 'opening_hours': oh}
    if p['fees']:
        f['fee'] = 'yes'
        f['fee_text'] = p['fees'][:300]
    kinds = [k for k in ('Hallenbad', 'Ganzjahresfreibad', 'Therme') if k in p['items']]
    f['type'] = 'Naturbad (Sommer)' if slug.startswith('naturbad-') else 'Sommerfreibad' if summer else ' + '.join(kinds) or None
    f['indoor'] = 'no' if summer else ('yes' if kinds else None)
    if summer:
        f['season'] = 'Freibadsaison im Sommer' + (' (Saison 2026 beendet)' if p['season_over'] else '')
    elif 'Ganzjahresfreibad' in p['items']:
        f['season'] = 'ganzjährig (mit Ganzjahresfreibad)'
    yes = lambda b: 'yes' if b else None
    f['water_play'] = yes(WATER_PLAY.search(feats))
    f['kids_pool'] = yes(KIDS_POOL.search(feats))
    f['water_slide'] = yes(SLIDE.search(feats))
    f['wave_pool'] = yes(WAVE.search(feats))
    if baby_courses:
        f['baby_swimming'] = ', '.join(baby_courses)
    f['for_baby'] = yes(BABY_POOL.search(feats) or baby_only)
    f['for_toddler'] = yes(f['kids_pool'] or f['water_play'])
    services = [s for s in SERVICES if s in p['items']]
    if f['wave_pool'] and 'Wellenbad' not in services: services.append('Wellenbad')
    play_name = next((n for s2, n in SPIEL.values() if s2 == slug and n), None)
    if play_name: services.append(f'Wasserspielplatz {play_name}')
    if f['kids_pool']: services.append('Kinderbecken')
    if baby_courses: services.append('Babyschwimmen (Kurse)')
    f['services'] = ', '.join(dict.fromkeys(services)) or None
    f['wheelchair'] = 'limited' if p['not_barrierefrei'] else ('yes' if p['barrierefrei'] else None)
    return f


def describe(name, f, p, oh):
    """Short label in our own words from the facts (<= 200 characters)."""
    extras = [x for x, k in (('Kinderbecken', 'kids_pool'), ('Wasserspielplatz', 'water_play'), ('Rutsche', 'water_slide'),
                              ('Wellenbad', 'wave_pool'), ('Babyschwimmen', 'baby_swimming')) if f.get(k)]
    kind = f.get('type') or 'Bad'
    s = f'{kind} von Bäderland' + (' mit ' + ', '.join(extras[:-1]) + (' und ' if len(extras) > 1 else '') + extras[-1] if extras else '') + '.'
    if p['closed_now'] or oh == 'off':
        s = 'Zurzeit geschlossen (laut Bäderland). ' + s
    elif oh:
        s += ' Zeiten wechseln wöchentlich, siehe Bad-Seite.'
    return s[:200]


def target_place(con, slug, name):
    pid = TARGET.get(slug)
    if pid:
        row = con.execute('SELECT id, name, lat, lon FROM places WHERE id=?', (pid,)).fetchone()
        if row: return row
        print(f'  warning: {slug}: place {pid} not found')
    return None


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    con = connect()
    register_source(con, SOURCE_ID, 'Bäderland Hamburg: Bäder (Zeiten, Preise, Ausstattung)', LIST, 'Fakten mit Link',
                    'Bäderland Hamburg GmbH, baederland.de', 65)
    if '--cached' in sys.argv and CACHE.exists():
        d = json.loads(CACHE.read_text(encoding='utf-8')); pools, baby = d['pools'], d['baby']
    else:
        pools, baby = crawl()
    baby_at = {}
    for title, locs in baby.items():
        if re.search(r'aqua baby|aqua kita', title, re.I):
            for l in locs:
                baby_at.setdefault(fold(l), []).append(title)
    from merge import similar
    by_place, skipped = {}, []
    for slug, d in sorted(pools.items()):
        p = parse(slug, d['page'])
        oh = 'off' if p['closed_now'] else pick_hours([tuple(w) for w in d['weeks']])
        f = facts_of(slug, p, oh, baby_at.get(slug) or baby_at.get(fold(p['name'])), d.get('play_text'))
        tgt = target_place(con, slug, p['name'])
        if not tgt:
            skipped.append(slug); continue
        pid, pname, lat, lon = tgt
        if pid in by_place:  # Hallenbad + Sommerfreibad on one place: add the summer pool's features
            r = by_place[pid]
            for k, v in f.items():
                if not v: continue
                if k == 'services':
                    r['facts'][k] = ', '.join(dict.fromkeys((r['facts'].get(k) or '').split(', ') + v.split(', '))).strip(', ')
                elif k == 'season' and r['facts'].get('opening_hours'):
                    r['facts'][k] = 'Hallenbad ganzjährig, Freibad im Sommer' + (' (Saison 2026 beendet)' if p['season_over'] else '')
                elif not r['facts'].get(k):
                    r['facts'][k] = v
            r['raw']['pages'].append(slug)
            r['facts']['description'] = describe(r['name'], r['facts'], p, r['facts'].get('opening_hours'))
            continue
        f['description'] = describe(p['name'], f, p, oh)
        rec_name = p['name'] if similar(p['name'], pname) else pname
        by_place[pid] = {'ref': slug, 'category': 'baden', 'name': rec_name, 'lat': lat, 'lon': lon, 'url': d['url'],
                         'raw': {'pages': [slug], 'bl_name': p['name'], 'weeks': d['weeks'], 'cash_close': p['cash'], 'place': pid},
                         'facts': {k: v for k, v in f.items() if v}}
    records = list(by_place.values())
    for _ in range(5):
        try:
            n = replace_records(con, SOURCE_ID, records)
            break
        except sqlite3.OperationalError as e:
            print('  database busy:', e)
    else:
        return 0
    print(f'{SOURCE_ID}: {n} records' + (f', skipped (no place): {skipped}' if skipped else ''))
    for r in records:
        f = r['facts']
        print(f"  {r['ref']:28} {f.get('opening_hours') or '-':48} kids_pool={f.get('kids_pool') or '-'} play={f.get('water_play') or '-'} "
              f"slide={f.get('water_slide') or '-'} wave={f.get('wave_pool') or '-'} baby={'yes' if f.get('baby_swimming') else '-'}")
        print(f"  {'':28} {f.get('fee_text') or '-'}")
    merge_check(con, records)
    return n


def merge_check(con, records):
    """Dry run of merge.py's rule (read-only): nearest place within MATCH_M, compatible category, similar name."""
    from merge import MATCH_M, compatible, dist, similar
    attach = new = 0
    for r in records:
        best, bd = None, MATCH_M
        for pid, name, cat, la, lo in con.execute('SELECT id, name, category, lat, lon FROM places WHERE abs(lat-?)<0.002 AND abs(lon-?)<0.003',
                                                  (r['lat'], r['lon'])):
            if not compatible(r['category'], cat) or not similar(r['name'], name): continue
            d = dist(r['lat'], r['lon'], la, lo)
            if d < bd: best, bd = (pid, name, cat), d
        if best: verdict = f'-> {best[0]} {best[1]} [{best[2]}, {bd:.0f} m]'; attach += 1
        else: verdict = 'NEW'; new += 1
        flag = '' if best and best[0] == r['raw']['place'] else f"   !! meant for {r['raw']['place']}"
        print(f"  {r['ref']:28} {verdict}{flag}")
    print(f'merge check: {attach} attach to existing places, {new} new')
    return attach, new


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
