"""End-to-end check of the Djuu API rules and routes. Run on the server: python3 test_api.py http://<container-ip>:8090 <admin-email> <admin-password>
Creates three throwaway users (A, B, stranger C), checks what each may see and do, then deletes everything it created."""
import json
import secrets
import sys
import urllib.error
import urllib.request

BASE, ADMIN, PW = sys.argv[1], sys.argv[2], sys.argv[3]
results = []


def call(method, path, token=None, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read().decode()
            return r.status, (data if raw else (json.loads(data) if data else {}))
    except urllib.error.HTTPError as e:
        data = e.read().decode()
        try: return e.code, json.loads(data)
        except Exception: return e.code, data


def check(name, ok, info=''):
    ok = bool(ok)
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if not ok and info else ''))


s, a = call('POST', '/api/collections/_superusers/auth-with-password', body={'identity': ADMIN, 'password': PW})
check('superuser login', s == 200, a)
SU = a['token']
users = {}
for k in 'ABC':
    email = f'test-{k.lower()}-{secrets.token_hex(3)}@example.invalid'
    pw = secrets.token_urlsafe(18)
    s, u = call('POST', '/api/collections/users/records', SU, {'email': email, 'password': pw, 'passwordConfirm': pw, 'name': 'Test ' + k})
    check(f'create user {k}', s == 200, u)
    s, t = call('POST', f"/api/collections/users/impersonate/{u['id']}", SU, {'duration': 3600})
    check(f'token for {k}', s == 200, t)
    users[k] = {'id': u['id'], 'token': t.get('token')}
A, B, C = (users[k]['token'] for k in 'ABC')

s, f = call('POST', '/api/djuu/family', A, {'name': 'Testfamilie', 'myName': 'Anna'})
check('A creates family', s == 200 and f.get('family'), f)
FAM, MA = f.get('family'), f.get('member')
s, _ = call('POST', '/api/djuu/family', A, {'myName': 'Anna'})
check('A cannot create a second family', s == 400)
s, it = call('POST', '/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Milch', 'qty': '2', 'cat': 'kuehl', 'added_by': MA})
check('A adds shop item', s == 200, it)
s, l = call('GET', '/api/collections/shop_items/records', B)
check('B (not yet member) sees no items', s == 200 and l['totalItems'] == 0, l)
s, x = call('POST', '/api/collections/shop_items/records', B, {'family': FAM, 'name': 'Hack'})
check('B cannot add to a foreign family', s in (400, 403), (s, x))
s, fl = call('GET', f'/api/collections/families/records/{FAM}', B)
check('B cannot read the family', s == 404, (s, fl))

s, inv = call('POST', '/api/djuu/invite', A)
check('A creates invite', s == 200 and inv.get('token'), inv)
s, j = call('POST', '/api/djuu/join', B, {'token': 'wrong', 'myName': 'Ben'})
check('wrong invite token rejected', s == 400)
s, j = call('POST', '/api/djuu/join', B, {'token': inv['token'], 'myName': 'Ben'})
check('B joins with invite', s == 200 and j.get('family') == FAM, j)
MB = j.get('member')
s, j2 = call('POST', '/api/djuu/join', C, {'token': inv['token'], 'myName': 'Carl'})
check('invite cannot be used twice', s == 400, j2)
s, l = call('GET', '/api/collections/shop_items/records', B)
check('B now sees the item', s == 200 and l['totalItems'] == 1, l)
s, l = call('GET', '/api/collections/shop_items/records', C)
check('stranger C sees nothing', s == 200 and l['totalItems'] == 0, l)
s, kid = call('POST', '/api/collections/members/records', B, {'family': FAM, 'name': 'Kind', 'kind': 'kid', 'birth_ym': '2022-03'})
check('B adds a child', s == 200, kid)
s, x = call('POST', '/api/collections/members/records', B, {'family': FAM, 'name': 'Fake', 'kind': 'adult', 'user': users['C']['id']})
check('nobody can add another account as member', s in (400, 403), (s, x))
s, l = call('GET', '/api/collections/members/records', C)
check('C sees no members', s == 200 and l['totalItems'] == 0, l)

snap = {'title': 'Krabbelgruppe Test', 'kind': 'gruppe', 'weekday': 2, 'time_from': '10:00', 'time_to': '11:30', 'venue': 'EKiZ', 'url': 'https://example.org/k'}
s, so = call('POST', '/api/collections/saved_offers/records', A, {'family': FAM, 'offer_id': 'of_test', 'snap': snap, 'saved_by': MA})
check('A saves an offer', s == 200, so)
s, cal = call('POST', '/api/djuu/calendar', B)
check('B gets the calendar address', s == 200 and cal.get('token'), cal)
s, ics = call('GET', f"/api/djuu/cal/{cal['token']}.ics", raw=True)
check('calendar feed has the event', s == 200 and 'SUMMARY:Krabbelgruppe Test' in ics and 'RRULE:FREQ=WEEKLY;BYDAY=WE' in ics, str(ics)[:300])
s, _ = call('GET', '/api/djuu/cal/wrongtoken.ics', raw=True)
check('wrong calendar address is not found', s == 404)

s, p = call('POST', '/api/collections/pings/records', A, {'family': FAM, 'from': MA, 'to': MB})
check('A asks B "Wo seid ihr?"', s == 200, p)
s, x = call('POST', '/api/collections/pings/records', A, {'family': FAM, 'from': MB, 'to': MA})
check('A cannot send a ping in B\'s name', s in (400, 403), (s, x))
s, x = call('PATCH', f"/api/collections/pings/records/{p['id']}", A, {'lat': 1, 'lon': 1})
check('A cannot answer for B', s in (400, 403, 404), (s, x))
s, x = call('PATCH', f"/api/collections/pings/records/{p['id']}", B, {'lat': 53.55, 'lon': 9.99, 'accuracy': 20, 'answered': '2026-11-07 12:00:00.000Z'})
check('B answers with a position', s == 200, x)
s, x = call('GET', f"/api/collections/pings/records/{p['id']}", A)
check('A sees the answer', s == 200 and x.get('lat') == 53.55, x)
s, x = call('GET', '/api/collections/pings/records', C)
check('C sees no pings', s == 200 and x['totalItems'] == 0, x)

s, o = call('POST', '/api/collections/users/request-otp', body={'email': 'nobody@example.invalid'})
check('e-mail code login is switched on', s == 200 and 'otpId' in o, o)

# clean up: deleting the family removes members, items, offers and pings (cascade); then the users
s, _ = call('DELETE', f'/api/collections/families/records/{FAM}', SU)
check('cleanup family', s == 204)
for k in 'ABC':
    call('DELETE', f"/api/collections/users/records/{users[k]['id']}", SU)
print(f'\n{sum(results)} of {len(results)} checks passed')
