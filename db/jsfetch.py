"""Read pages that only show their content after JavaScript runs (single-page apps, booking widgets, lazy lists).

Uses Playwright with a headless Chromium. Same rules as common.fetch():
  * anonymous: the common browser User-Agent from common.py, German locale, nothing that names Djuu;
  * robots.txt ('*' group, wildcards, Crawl-delay) is honoured, except for hosts in common.PERMITTED_HOSTS;
  * a pause between requests to the same host; images, fonts and media are not loaded.
No stealth plugins: a site that blocks automated browsers and is not in PERMITTED_HOSTS stays blocked.

Usage in an importer:
    from jsfetch import js_get
    html = js_get(url)                                   # rendered HTML
    html, data = js_get(url, capture_json=True)          # plus every JSON response the page loaded
    html = js_get(url, wait_for='.event-list', scroll=3) # wait for a selector, scroll to load more
"""
import atexit
import json
import time
from urllib.parse import urlparse

from common import MIN_DELAY, USER_AGENT, permitted
from robots_glob import allowed_glob, crawl_delay

_pw = _browser = None
_last = {}


def _start():
    global _pw, _browser
    if _browser is None:
        from playwright.sync_api import sync_playwright  # imported here so importers without JS pages need no Playwright
        _pw = sync_playwright().start()
        _browser = _pw.chromium.launch(headless=True, args=['--disable-dev-shm-usage', '--no-sandbox'])
        atexit.register(close)
    return _browser


def close():
    global _pw, _browser
    try:
        if _browser: _browser.close()
        if _pw: _pw.stop()
    except Exception:
        pass
    _pw = _browser = None


def _polite(url):
    if not permitted(url) and not allowed_glob(url):
        raise PermissionError(f'robots.txt disallows {url}')
    host = urlparse(url).netloc
    wait = max(MIN_DELAY, crawl_delay(url) or 0) - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()


def js_get(url, wait_for=None, wait_ms=1500, scroll=0, capture_json=False, timeout=45000, retries=2):
    """Rendered HTML of url (and the JSON responses it loaded, if capture_json)."""
    last_error = None
    for attempt in range(retries + 1):
        _polite(url)
        ctx = _start().new_context(user_agent=USER_AGENT, locale='de-DE', timezone_id='Europe/Berlin',
                                   viewport={'width': 1280, 'height': 900})
        page = ctx.new_page()
        page.route('**/*', lambda r: r.abort() if r.request.resource_type in ('image', 'media', 'font') else r.continue_())
        found = []
        if capture_json:
            def on_response(resp):
                if 'json' in (resp.headers.get('content-type') or ''):
                    try:
                        found.append((resp.url, resp.json()))
                    except Exception:
                        pass
            page.on('response', on_response)
        try:
            resp = page.goto(url, wait_until='domcontentloaded', timeout=timeout)
            if resp and resp.status >= 400:
                raise RuntimeError(f'HTTP {resp.status} for {url}')
            try:
                page.wait_for_load_state('networkidle', timeout=15000)
            except Exception:
                pass  # some pages keep polling; what is there after 15 s is enough
            if wait_for:
                page.wait_for_selector(wait_for, timeout=timeout)
            for _ in range(scroll):
                page.mouse.wheel(0, 4000)
                page.wait_for_timeout(800)
            page.wait_for_timeout(wait_ms)
            html = page.content()
            return (html, found) if capture_json else html
        except Exception as e:
            last_error = e
            if 'HTTP 4' in str(e):
                break
            time.sleep(5 * (attempt + 1))
        finally:
            ctx.close()
    raise RuntimeError(f'could not read {url}: {last_error}')


if __name__ == '__main__':
    import sys
    html, data = js_get(sys.argv[1], capture_json=True)
    print(len(html), 'chars;', len(data), 'JSON responses:', [u for u, _ in data][:10])
    print(json.dumps(data[0][1], ensure_ascii=False)[:500] if data else html[:500])
