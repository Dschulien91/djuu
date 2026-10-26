"""Scan the websites of places for family features (changing table, high chair, play corner, dogs, kids menu, pram).

Polite: honours robots.txt, one request per host at a time, neutral user agent, max 4 pages per site.
Every hit is stored as a fact with method 'website' plus an evidence snippet, so it can be checked later.
Keyword matching only; an AI pass can later replace or confirm these values.
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from urllib.parse import urljoin, urlparse

from common import connect, fetch, register_source, replace_records, save_raw

CATS = ('cafe', 'restaurant', 'eis', 'imbiss', 'indoor', 'museum', 'buecherei', 'baden', 'ausflug', 'kultur',
        'familienfreundlich', 'freizeit', 'treffpunkt', 'wickel')
SUBPAGE = re.compile(r'(faq|ueber|über|about|familie|kinder|kids|info|service|anfahrt|barriere|haus|location|räume|raeume|besuch)', re.I)
NEG = re.compile(r'\b(kein|keine|keinen|nicht|leider|ohne)\b[^.!?]{0,30}$', re.I)

PATTERNS = {
    'changing_table': r'wickel(tisch|raum|möglichkeit|moeglichkeit|platz|kommode|station|auflage|bereich)',
    'highchair': r'(hochst(ü|ue)hl|kinderst(ü|ue)hl|kinderhochst(ü|ue)hl|babyst(ü|ue)hl)',
    'kids_area': r'(spielecke|kinderecke|spielbereich|spielzimmer|kinderspielecke|spieleecke|kinderspielplatz|spielplatz direkt)',
    'kids_menu': r'(kinderkarte|kindermen(ü|ue)|kinderteller|kindergerichte|kinderportion)',
    'stroller': r'(kinderwagen(freundlich|gerecht|stellplatz|parkplatz|zugänglich)|platz für kinderwagen|mit dem kinderwagen)',
    'babyccino': r'(babyccino|kinderccino|kindercappuccino|babycino)',
    'baby_feeding': r'(stillraum|stillecke|stillzimmer|stillfreundlich|stillen erwünscht)',
}
DOG_YES = re.compile(r'(hunde (sind )?(bei uns )?(herzlich |gern |gerne |jederzeit )?willkommen|hundefreundlich|hunde (sind )?erlaubt|vierbeiner (sind )?(herzlich |gern |gerne )?willkommen|wassernapf|hund mitbringen)', re.I)
DOG_NO = re.compile(r'(hunde (sind )?(leider )?nicht (erlaubt|gestattet|willkommen)|keine hunde|hundeverbot|hunde müssen draußen|hunde muessen draussen)', re.I)


def text_of(html):
    html = re.sub(r'(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>', ' ', html)
    return re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<[^>]+>', ' ', html)))


def links_of(html, base):
    host = urlparse(base).netloc
    out = []
    for href, label in re.findall(r'(?is)<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', html):
        u = urljoin(base, href)
        if urlparse(u).netloc == host and (SUBPAGE.search(href) or SUBPAGE.search(text_of(label))) and not re.search(r'\.(pdf|jpe?g|png|zip)$', u, re.I):
            out.append(u.split('#')[0])
    return list(dict.fromkeys(out))[:3]


def snippet(text, m):
    return text[max(0, m.start() - 70): m.end() + 70].strip()


def scan(text):
    facts = {}
    low = text.lower()
    for key, pat in PATTERNS.items():
        for m in re.finditer(pat, low):
            neg = bool(NEG.search(low[max(0, m.start() - 40): m.start()]))
            facts[key] = ('no' if neg else 'yes', 'website', 0.6)
            facts['evidence_' + key] = (snippet(text, m), 'website', 0.6)
            if not neg: break
    m = DOG_NO.search(low) or DOG_YES.search(low)
    if m:
        facts['dog'] = ('no' if DOG_NO.search(low) else 'yes', 'website', 0.6)
        facts['evidence_dog'] = (snippet(text, m), 'website', 0.6)
    return facts


def visit(place):
    pid, name, url = place
    if not url.startswith('http'): url = 'https://' + url
    pages, texts = [url], []
    try:
        r = fetch(url, check_robots=True, timeout=25, retries=2, backoff=5)
        if 'html' not in r.headers.get('content-type', 'html'): return pid, url, None, 'not html'
        texts.append(text_of(r.text))
        for sub in links_of(r.text, r.url):
            try:
                rs = fetch(sub, check_robots=True, timeout=25, retries=1)
                texts.append(text_of(rs.text)); pages.append(sub)
            except Exception:
                pass
    except PermissionError:
        return pid, url, None, 'robots'
    except Exception as e:
        return pid, url, None, type(e).__name__
    return pid, url, (scan(' '.join(texts)), pages, sum(map(len, texts))), 'ok'


def run(limit=None):
    con = connect()
    register_source(con, 'website', 'Webseiten der Orte (Stichwortsuche)', None, 'Fakten aus öffentlichen Webseiten',
                    'Angaben laut Webseite des Ortes', priority=45)
    q = f"""SELECT p.id, p.name, f.value, p.lat, p.lon, p.category FROM places p JOIN place_facts f ON f.place_id = p.id AND f.key = 'website'
            WHERE p.category IN ({','.join('?' * len(CATS))})"""
    rows = con.execute(q, CATS).fetchall()[:limit]
    meta = {r[0]: r for r in rows}
    print(f'{len(rows)} websites to scan')
    recs, status = [], {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = [ex.submit(visit, (r[0], r[1], r[2])) for r in rows]
        for i, f in enumerate(as_completed(futs), 1):
            pid, url, res, st = f.result()
            status[st] = status.get(st, 0) + 1
            if res:
                facts, pages, size = res
                _, name, _, la, lo, cat = meta[pid]
                recs.append({'ref': pid, 'category': cat, 'name': name, 'lat': la, 'lon': lo, 'url': url,
                             'raw': {'pages': pages, 'chars': size}, 'facts': facts})
            if i % 200 == 0:
                print(f'  {i}/{len(rows)} {status}', flush=True)
    save_raw('websites_scan.json', json.dumps(recs, ensure_ascii=False))
    print('website records:', replace_records(con, 'website', recs), status)
    hits = {}
    for r in recs:
        for k, v in r['facts'].items():
            if not k.startswith('evidence_'): hits[f'{k}={v[0]}'] = hits.get(f'{k}={v[0]}', 0) + 1
    print(json.dumps(dict(sorted(hits.items())), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    run(int(sys.argv[1]) if len(sys.argv) > 1 else None)
