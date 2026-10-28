"""robots.txt check that understands Google-style wildcards ('*' and '$') and Crawl-delay.

Python's urllib.robotparser only does prefix matching, so rules such as 'Disallow: /*?*' are silently
ignored there. Importers that hit sites with wildcard rules call polite_fetch() instead of fetch():
it checks these rules first, waits for the site's Crawl-delay and then uses common.fetch(check_robots=True).
"""
import re
import time
from urllib.parse import urlparse

import requests

from common import USER_AGENT, fetch

UA_TOKEN = USER_AGENT.split('/')[0].lower()  # 'djuu-bot'
_cache = {}      # base url -> (rules, crawl_delay)
_last = {}       # host -> time of our last request (for Crawl-delay)


def _parse(text):
    """Return (rules, delay) of the group for our user agent, falling back to '*'."""
    groups, agents, rules, delay, in_rules = [], [], [], None, False
    for line in text.splitlines():
        line = line.split('#', 1)[0].strip()
        if ':' not in line:
            continue
        key, val = [p.strip() for p in line.split(':', 1)]
        key = key.lower()
        if key == 'user-agent':
            if in_rules:
                groups.append((agents, rules, delay))
                agents, rules, delay, in_rules = [], [], None, False
            agents.append(val.lower())
        elif key in ('allow', 'disallow'):
            in_rules = True
            if val:
                rules.append((key == 'allow', val))
        elif key == 'crawl-delay':
            in_rules = True
            try:
                delay = float(val)
            except ValueError:
                pass
    if agents:
        groups.append((agents, rules, delay))
    own = [g for g in groups if any(a != '*' and a in UA_TOKEN for a in g[0])]
    star = [g for g in groups if '*' in g[0]]
    chosen = own or star
    if not chosen:
        return [], None
    all_rules = [r for g in chosen for r in g[1]]
    delays = [g[2] for g in chosen if g[2] is not None]
    return all_rules, (max(delays) if delays else None)


def _matches(pattern, path):
    rx = re.escape(pattern).replace(r'\*', '.*')
    if rx.endswith(r'\$'):
        rx = rx[:-2] + '$'
    return re.match(rx, path) is not None


def _rules(url):
    p = urlparse(url)
    base = f'{p.scheme}://{p.netloc}'
    if base not in _cache:
        try:
            r = requests.get(base + '/robots.txt', headers={'User-Agent': USER_AGENT}, timeout=20)
            _cache[base] = _parse(r.text) if r.ok else ([], None)
        except requests.RequestException:
            _cache[base] = ([], None)
    return _cache[base]


def allowed_glob(url):
    """Longest matching rule wins; on a tie Allow wins (RFC 9309)."""
    p = urlparse(url)
    path = (p.path or '/') + (('?' + p.query) if p.query else '')
    best = None
    for allow, pattern in _rules(url)[0]:
        if _matches(pattern, path):
            if best is None or len(pattern) > len(best[1]) or (len(pattern) == len(best[1]) and allow):
                best = (allow, pattern)
    return best is None or best[0]


def crawl_delay(url):
    return _rules(url)[1]


def polite_fetch(url, **kw):
    if not allowed_glob(url):
        raise PermissionError(f'robots.txt disallows {url}')
    host = urlparse(url).netloc
    delay = crawl_delay(url)
    if delay:
        wait = delay - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
    try:
        return fetch(url, check_robots=True, **kw)
    finally:
        _last[host] = time.time()
