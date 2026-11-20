"""Shared helpers for Djuu importers: database access and polite HTTP.

Every request is anonymous (common browser User-Agent, no project name, no personal data),
waits between requests per host and honours robots.txt for normal web pages.
"""
import json
import sqlite3
import time
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'data' / 'djuu.db'
RAW_DIR = ROOT / 'data' / 'raw'
# Requests stay anonymous: a common browser string, no project name anywhere (decided 19 Nov 2026).
# Anonymity never widens access: robots.txt is read with the rules that apply to all crawlers (ROBOTS_AGENT).
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
ROBOTS_AGENT = '*'
MIN_DELAY = 1.5  # seconds between requests to the same host
# Providers that agreed to be read and shown (non-commercial use); for these hosts and their subdomains robots.txt
# is not applied. Crawl-delay and the per-host pause still are. Everyone else: robots.txt for all crawlers applies.
PERMITTED_HOSTS = {
    'baederland.de', 'elbphilharmonie.de', 'asklepios.com', 'imm-hamburg.de', 'ndr.de', 'museumsdienst-hamburg.de',
    'fbs-hamburg.de', 'albertinen.de', 'immanuelalbertinen.de', 'amalie.de', 'dlrg.net', 'kurabu.com', 'fcstpauli.com',
    'gwa-stpauli.de', 'koelibri.de', 'buntekuh-hamburg.de', 'bunte-kuh.de', 'ella-kulturhaus.de', 'ella-langenhorn.de',
    'hamburgercamerata.de',
    'diemotte.de', 'kulturklinker-barmbek.de', 'kulturwerk-rahlstedt.de', 'schroedingers.hamburg', 'monsuntheater.de',
    'monsun.theater', 'firststagehamburg.de', 'lapiazza.show', 'speicherstadtmuseum.de', 'buceriuskunstforum.de',
    'garten-der-schmetterlinge.de', 'arche-warder.de', 'harderhof.de', 'miniandmecafe.de', 'wandsbekerwinterzauber.info',
    'naju-hamburg.de', 'hamburger-sternwarte.de', 'helios-gesundheit.de',
    'yolawo.de', 'tsg-bergedorf.de', 'scala-hamburg.de', 'sc-alstertal-langenhorn.de', 'scottensen.de', 'scala-sportclub.de',
    'tivoli.de',
}
# Sites whose HTTPS setup is broken (outdated TLS, wrong or incomplete certificate). We only read public pages there and send
# nothing, so certificate checks are skipped and old ciphers are allowed for exactly these hosts.
LEGACY_TLS_HOSTS = {'drk-harburg.de', 'eintracht-norderstedt.de', 'naju-hamburg.de', 'notdienst.apothekerkammer-hamburg.de'}


def permitted(url):
    return _host_in(url, PERMITTED_HOSTS)

_session = requests.Session()
_session.headers['User-Agent'] = USER_AGENT
_legacy = None


def _host_in(url, hosts):
    host = urlparse(url).netloc.lower().split(':')[0]
    return any(host == h or host.endswith('.' + h) for h in hosts)


def _legacy_session():
    """A session for LEGACY_TLS_HOSTS: no certificate check, old TLS versions and ciphers allowed."""
    global _legacy
    if _legacy is None:
        import ssl
        import urllib3
        from requests.adapters import HTTPAdapter
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        class Legacy(HTTPAdapter):
            def init_poolmanager(self, *a, **kw):
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                ctx.minimum_version = ssl.TLSVersion.TLSv1
                ctx.set_ciphers('DEFAULT:@SECLEVEL=0')
                kw['ssl_context'] = ctx
                return super().init_poolmanager(*a, **kw)
        _legacy = requests.Session()
        _legacy.headers['User-Agent'] = USER_AGENT
        _legacy.verify = False
        _legacy.mount('https://', Legacy())
    return _legacy
_last_hit = {}
_robots = {}


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=60)
    con.execute('PRAGMA foreign_keys = ON')
    con.executescript((Path(__file__).parent / 'schema.sql').read_text(encoding='utf-8'))
    return con


def allowed(url):
    """robots.txt check for web pages (APIs and open-data services are called directly)."""
    if permitted(url):
        return True
    host = urlparse(url)
    base = f'{host.scheme}://{host.netloc}'
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = _session.get(base + '/robots.txt', timeout=20)
            rp.parse(r.text.splitlines() if r.ok else [])
        except requests.RequestException:
            rp.parse([])
        _robots[base] = rp
    return _robots[base].can_fetch(ROBOTS_AGENT, url)


def fetch(url, *, method='GET', data=None, params=None, check_robots=False, timeout=120, retries=6, backoff=10, **kw):
    """HTTP request with per-host delay and exponential backoff on 429/5xx."""
    if check_robots and not allowed(url):
        raise PermissionError(f'robots.txt disallows {url}')
    host = urlparse(url).netloc
    wait = backoff
    for attempt in range(retries):
        delta = time.time() - _last_hit.get(host, 0)
        if delta < MIN_DELAY:
            time.sleep(MIN_DELAY - delta)
        _last_hit[host] = time.time()
        try:
            r = (_legacy_session() if _host_in(url, LEGACY_TLS_HOSTS) else _session).request(method, url, data=data, params=params, timeout=timeout, **kw)
            if r.status_code == 200:
                return r
            if r.status_code not in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f'HTTP {r.status_code}', response=r)
            print(f'  {host}: HTTP {r.status_code}, retry in {wait}s')
        except requests.HTTPError:
            raise
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            print(f'  {host}: {type(e).__name__}, retry in {wait}s')
        time.sleep(wait)
        wait *= 2
    raise RuntimeError(f'giving up on {url}')


def save_raw(name, content):
    """Keep the original download so imports can be rerun and audited."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / name
    mode = 'wb' if isinstance(content, bytes) else 'w'
    with open(path, mode, **({} if mode == 'wb' else {'encoding': 'utf-8'})) as f:
        f.write(content)
    return path


def register_source(con, id, name, url, license, attribution, priority=50):
    con.execute("""INSERT INTO sources(id, name, url, license, attribution, priority) VALUES (?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, license=excluded.license,
                   attribution=excluded.attribution, priority=excluded.priority""",
                (id, name, url, license, attribution, priority))
    con.commit()  # never hold the write lock during long downloads


def replace_records(con, source_id, records):
    """Replace all records and facts of one source.

    records: iterable of dicts with keys ref, category, name, lat, lon, url, raw, facts (dict key->value or
    key->(value, method, confidence)). Existing place links are kept for refs that survive.
    """
    ts = now()
    old_links = dict(con.execute('SELECT source_ref, place_id FROM source_records WHERE source_id=?', (source_id,)))
    con.execute('DELETE FROM facts WHERE source_id=?', (source_id,))
    con.execute('DELETE FROM source_records WHERE source_id=?', (source_id,))
    n = 0
    for r in records:
        con.execute("""INSERT OR REPLACE INTO source_records(source_id, source_ref, place_id, category, name, lat, lon, url, raw, fetched_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (source_id, r['ref'], old_links.get(r['ref']), r.get('category'), r.get('name'), r.get('lat'), r.get('lon'),
                     r.get('url'), json.dumps(r.get('raw'), ensure_ascii=False) if r.get('raw') is not None else None, ts))
        for k, v in (r.get('facts') or {}).items():
            if v is None or v == '':
                continue
            value, method, conf = (v if isinstance(v, tuple) else (v, 'source', 1.0))
            con.execute('INSERT OR REPLACE INTO facts(source_id, source_ref, key, value, method, confidence, observed_at) VALUES (?,?,?,?,?,?,?)',
                        (source_id, r['ref'], k, str(value), method, conf, r.get('observed_at') or ts))
        n += 1
    con.execute('UPDATE sources SET fetched_at=?, record_count=? WHERE id=?', (ts, n, source_id))
    con.commit()
    return n
