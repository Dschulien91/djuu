"""Test helper on the server (not used by the app). python3 tool.py <cmd> ...
  mkuser <name>                -> creates a throwaway user, prints its id and a 1-hour token as JSON
  call <token> <METHOD> <path> [json]  -> calls the API as that user, prints the JSON answer
  rmuser <id>                  -> deletes a user (as superuser)
Reads the superuser login from /opt/djuu/.admin; talks to the API on 172.18.0.1:8090."""
import json
import secrets
import sys
import urllib.error
import urllib.request

BASE = 'http://172.18.0.1:8090'


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            t = r.read().decode(); return r.status, json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t


def su():
    email, pw = open('/opt/djuu/.admin').read().split()[:2]
    return call('POST', '/api/collections/_superusers/auth-with-password', body={'identity': email, 'password': pw})[1]['token']


cmd = sys.argv[1]
if cmd == 'mkuser':
    t = su(); pw = secrets.token_urlsafe(16)
    s, u = call('POST', '/api/collections/users/records', t, {'email': f'test-{sys.argv[2]}-{secrets.token_hex(3)}@example.invalid', 'password': pw, 'passwordConfirm': pw})
    s, tok = call('POST', f"/api/collections/users/impersonate/{u['id']}", t, {'duration': 3600})
    print(json.dumps({'id': u['id'], 'email': u['email'], 'token': tok['token']}))
elif cmd == 'call':
    body = json.loads(sys.argv[5]) if len(sys.argv) > 5 else None
    s, r = call(sys.argv[3], sys.argv[4], sys.argv[2], body)
    print(json.dumps({'status': s, 'body': r}, ensure_ascii=False))
elif cmd == 'rmuser':
    print(call('DELETE', f'/api/collections/users/records/{sys.argv[2]}', su())[0])
elif cmd == 'rmfamily':
    print(call('DELETE', f'/api/collections/families/records/{sys.argv[2]}', su())[0])
