"""Djuu push sender (container `push`, see docker-compose.yml).

Every 30 seconds: POST /api/djuu/push/claim on the API inside djuu_net (secret header), send each message as Web Push to
the subscriptions it lists, then report back through /api/djuu/push/done (sent, failed, and subscriptions the push
service no longer knows: 404/410). The API runs the calendar alarm scan before handing out messages.

Environment:
  DJUU_API            http://djuu-api:8090 (default)
  DJUU_PUSH_SECRET    shared secret (same value as in the api container; from /opt/djuu/push/push.env)
  VAPID_PRIVATE_KEY   path of the VAPID private key (PEM), default /keys/vapid_private.pem
  VAPID_SUBJECT       contact claim for the push services, default https://djuu.de
  PUSH_INTERVAL       seconds between polls, default 30
  PUSH_EXTRA_HOSTS    local tests only: extra allowed endpoint hosts (comma separated, may include a port)

Only https endpoints of the known push services are contacted (the API checks this too), without following redirects.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

import requests
from pywebpush import WebPushException, webpush

API = os.environ.get('DJUU_API', 'http://djuu-api:8090').rstrip('/')
SECRET = os.environ.get('DJUU_PUSH_SECRET', '')
KEY = os.environ.get('VAPID_PRIVATE_KEY', '/keys/vapid_private.pem')
SUBJECT = os.environ.get('VAPID_SUBJECT', 'https://djuu.de')
INTERVAL = max(5, int(os.environ.get('PUSH_INTERVAL', '30')))
EXTRA = {h.strip().lower() for h in os.environ.get('PUSH_EXTRA_HOSTS', '').split(',') if h.strip()}
HOSTS = re.compile(r'^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com'
                   r'|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$')


def log(*a):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), *a, flush=True)


def api(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'X-Djuu-Push': SECRET})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def allowed(endpoint):
    u = urlparse(endpoint)
    if u.username or u.password:
        return False
    if u.scheme == 'https' and u.port in (None, 443) and HOSTS.match(u.hostname or ''):
        return True
    return u.netloc.lower() in EXTRA  # local tests only


def session():
    s = requests.Session()
    s.max_redirects = 0   # a redirect is an error, never followed
    s.trust_env = False   # no proxies from the environment
    return s


def send_all(items, sess):
    sent, failed, gone = [], [], []
    for it in items:
        payload = json.dumps({'title': it.get('title') or 'Djuu', 'body': it.get('body') or '', 'url': it.get('url') or './',
                              'tag': f"djuu-{it.get('topic', '')}-{it['id']}"}, ensure_ascii=False)
        ok, err = 0, ''
        for sub in it.get('subs', []):
            if not allowed(sub.get('endpoint', '')):
                err = 'endpoint not allowed'
                continue
            try:
                webpush({'endpoint': sub['endpoint'], 'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}}, data=payload,
                        vapid_private_key=KEY, vapid_claims={'sub': SUBJECT}, ttl=6 * 3600, timeout=15, requests_session=sess)
                ok += 1
            except WebPushException as e:
                code = getattr(e.response, 'status_code', 0) if e.response is not None else 0
                if code in (404, 410):
                    gone.append(sub['id'])  # the browser dropped this subscription
                err = f'push service {code or "error"}'
            except requests.RequestException as e:
                err = type(e).__name__
            except Exception as e:  # a broken key must not stop the others
                err = type(e).__name__
        if ok or not it.get('subs'):
            sent.append(it['id'])
        else:
            failed.append({'id': it['id'], 'error': err[:200]})
    return sent, failed, gone


def once(sess):
    items = api('/api/djuu/push/claim', {}).get('items', [])
    if not items:
        return 0
    sent, failed, gone = send_all(items, sess)
    api('/api/djuu/push/done', {'sent': sent, 'failed': failed, 'gone': gone})
    log(f'{len(sent)} sent, {len(failed)} failed, {len(gone)} subscriptions gone')
    return len(items)


def main():
    if len(SECRET) < 32 or not os.path.isfile(KEY):
        log('missing DJUU_PUSH_SECRET or VAPID key, not starting')
        sys.exit(2)
    sess = session()
    log(f'push sender started, polling every {INTERVAL} s')
    while True:
        try:
            once(sess)
        except urllib.error.HTTPError as e:
            log(f'api answered {e.code}')
        except Exception as e:
            log(f'poll failed: {type(e).__name__}')
        if os.environ.get('PUSH_ONCE'):
            return
        time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
