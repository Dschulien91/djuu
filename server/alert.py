#!/usr/bin/env python3
"""Failure alerts for the nightly jobs, as a mail to the PocketBase superuser address (route /api/djuu/alert).

  alert.py unit <unit>             systemd OnFailure= (djuu-alert@.service): <unit> failed – mail with its status and log tail
  alert.py count <dir>             prints {"offers": n, "places": n} of the published files in <dir> (refresh.sh, before copying)
  alert.py compare '<json>' <dir>  mail when <dir> now holds fewer than 80 % of the offers or places counted before
  alert.py test                    a test mail (deploy check)

Reads the superuser login from /opt/djuu/.admin itself (never printed, never on a command line) and talks to the API on
the host address inside the server network. The same alert goes out at most every 6 hours (state in pipeline/data/)."""
import json
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.environ.get('DJUU_ROOT', '/opt/djuu')
API = os.environ.get('DJUU_ALERT_API', 'http://172.18.0.1:8090')
ADMIN = os.environ.get('DJUU_ALERT_ADMIN', os.path.join(ROOT, '.admin'))
STATE = os.path.join(ROOT, 'pipeline', 'data', 'alert_state.json')
LOGS = {'djuu-refresh': 'pipeline/data/cron.log', 'djuu-live': 'pipeline/data/live.log', 'djuu-notdienst': 'pipeline/data/live.log'}
QUIET = 6 * 3600


def call(path, body, token=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', **({'Authorization': token} if token else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def send(key, subject, text):
    """Mails once per key and quiet period. Returns True when sent (or deliberately skipped)."""
    state = {}
    try:
        with open(STATE, encoding='utf-8') as f:
            state = json.load(f)
    except Exception:
        pass
    now = time.time()
    if now - state.get(key, 0) < QUIET:
        print(f'alert {key}: already sent within 6 hours')
        return True
    lines = open(ADMIN, encoding='utf-8').read().splitlines()
    token = call('/api/collections/_superusers/auth-with-password', {'identity': lines[0], 'password': lines[1]})['token']
    call('/api/djuu/alert', {'subject': subject, 'text': text}, token)
    state[key] = now
    try:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE + '.tmp', 'w', encoding='utf-8') as f:
            json.dump(state, f)
        os.replace(STATE + '.tmp', STATE)
    except Exception:
        pass
    print(f'alert {key}: sent')
    return True


def tail(path, n=40):
    try:
        with open(os.path.join(ROOT, path), encoding='utf-8', errors='replace') as f:
            return ''.join(f.readlines()[-n:])
    except Exception as e:
        return f'(log not readable: {type(e).__name__})'


def count(d):
    out = {}
    for name, key in (('offers.json', 'offers'), ('places.json', 'places')):
        try:
            with open(os.path.join(d, name), encoding='utf-8') as f:
                out[key] = len(json.load(f).get(key) or [])
        except Exception:
            pass
    return out


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ''
    if cmd == 'unit' and len(argv) > 2:
        unit = argv[2]
        base = unit.split('.')[0]
        try:
            status = subprocess.run(['systemctl', 'show', unit, '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'ExecMainExitTimestamp'],
                                    capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception as e:
            status = f'(systemctl not available: {type(e).__name__})'
        text = (f'{unit} ist fehlgeschlagen ({time.strftime("%Y-%m-%d %H:%M %Z")}).\n\n{status}\n\n'
                f'Letzte Zeilen von {LOGS.get(base, "-")}:\n{tail(LOGS[base]) if base in LOGS else "-"}\n'
                f'Mehr: journalctl -u {unit} -n 100')
        return send('unit:' + base, f'{base} fehlgeschlagen', text)
    if cmd == 'count' and len(argv) > 2:
        print(json.dumps(count(argv[2])))
        return True
    if cmd == 'compare' and len(argv) > 3:
        try:
            before = json.loads(argv[2] or '{}')
        except Exception:
            before = {}
        now = count(argv[3])
        low = [f'{k}: {now.get(k, 0)} statt {n} am Vortag' for k, n in before.items() if n and now.get(k, 0) < 0.8 * n]
        if not low:
            print('published counts ok: ' + json.dumps(now))
            return True
        text = ('Die nächtliche Aktualisierung hat deutlich weniger veröffentlicht als am Vortag (unter 80 %):\n  ' + '\n  '.join(low)
                + f'\n\nLetzte Zeilen von pipeline/data/cron.log:\n{tail("pipeline/data/cron.log", 60)}')
        return send('counts:' + time.strftime('%Y-%m-%d'), 'Weniger Termine/Orte veröffentlicht', text)
    if cmd == 'test':
        return send(f'test:{time.time()}', 'Testmail', 'Die Warnung bei Fehlern der nächtlichen Jobs funktioniert.')
    print(__doc__)
    return False


if __name__ == '__main__':
    try:
        sys.exit(0 if main(sys.argv) else 2)
    except Exception as e:  # never print the login or a token
        print(f'alert failed: {type(e).__name__}', file=sys.stderr)
        sys.exit(1)
