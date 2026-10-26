"""Shared helpers for Djuu importers: database access and polite HTTP.

Every request identifies itself only with the neutral project name (no personal data),
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
USER_AGENT = 'Djuu-Bot/0.1 (Familienkarte Hamburg, Open-Data-Import)'
MIN_DELAY = 1.5  # seconds between requests to the same host

_session = requests.Session()
_session.headers['User-Agent'] = USER_AGENT
_last_hit = {}
_robots = {}


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute('PRAGMA foreign_keys = ON')
    con.executescript((Path(__file__).parent / 'schema.sql').read_text(encoding='utf-8'))
    return con


def allowed(url):
    """robots.txt check for web pages (APIs and open-data services are called directly)."""
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
    return _robots[base].can_fetch(USER_AGENT, url)


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
            r = _session.request(method, url, data=data, params=params, timeout=timeout, **kw)
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
