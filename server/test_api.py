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
    s, u = call('POST', '/api/collections/users/records', SU, {'email': email, 'password': pw, 'passwordConfirm': pw, 'name': 'Test ' + k, 'verified': True})
    check(f'create user {k}', s == 200, u)
    s, t = call('POST', f"/api/collections/users/impersonate/{u['id']}", SU, {'duration': 3600})
    check(f'token for {k}', s == 200, t)
    users[k] = {'id': u['id'], 'token': t.get('token'), 'email': email, 'pw': pw}
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

# ---------- Wir: admin, groups, access per area, end date, places ----------
s, me_a = call('GET', f"/api/collections/members/records/{MA}", A)
check('A is admin with full access', s == 200 and me_a.get('is_admin') and me_a.get('perm_shop') == 'edit' and me_a.get('grp') == 'family', me_a)
s, me_b = call('GET', f"/api/collections/members/records/{MB}", B)
check('B joined as family with full access', s == 200 and not me_b.get('is_admin') and me_b.get('perm_errands') == 'edit', me_b)
s, x = call('POST', '/api/djuu/invite', B)
check('only the admin can invite', s == 403, (s, x))
s, x = call('PATCH', f"/api/collections/members/records/{MB}", B, {'perm_shop': 'edit', 'is_admin': True})
check('nobody sets their own access through the API', s in (400, 403, 404), (s, x))
s, x = call('PATCH', f"/api/collections/members/records/{MB}", B, {'name': 'Benny', 'role': 'Papa'})
check('B changes own name and role', s == 200 and x.get('name') == 'Benny', x)
s, x = call('POST', '/api/djuu/member', B, {'id': MB, 'perms': {'perm_shop': 'edit'}})
check('only the admin changes access', s == 403, (s, x))
s, x = call('POST', '/api/djuu/member', A, {'id': MA, 'admin': False})
check('the last admin cannot step down', s == 400, (s, x))

s, inv = call('POST', '/api/djuu/invite', A, {'grp': 'helper', 'role': 'Babysitter:in'})
check('A invites a helper', s == 200 and inv.get('token'), inv)
s, j = call('POST', '/api/djuu/join', C, {'token': inv['token'], 'myName': 'Lena'})
check('C joins as helper', s == 200, j)
MC = j.get('member')
s, mc = call('GET', f"/api/collections/members/records/{MC}", C)
check('helper defaults: view, view, view, none', s == 200 and (mc.get('perm_shop'), mc.get('perm_errands'), mc.get('perm_cal'), mc.get('perm_saved')) == ('view', 'view', 'view', 'none') and mc.get('grp') == 'helper', mc)
s, l = call('GET', '/api/collections/shop_items/records', C)
check('helper sees the shopping list', s == 200 and l['totalItems'] == 1, l)
s, x = call('POST', '/api/collections/shop_items/records', C, {'family': FAM, 'name': 'Brot'})
check('helper with "Ansehen" cannot add', s in (400, 403), (s, x))
s, l = call('GET', '/api/collections/saved_offers/records', C)
check('helper without access sees nothing saved', s == 200 and l['totalItems'] == 0, l)
s, l = call('GET', '/api/collections/members/records', C)
check('helper sees no children', s == 200 and all(r['kind'] == 'adult' for r in l['items']) and l['totalItems'] == 3, [r['name'] for r in l.get('items', [])])
s, x = call('POST', '/api/djuu/calendar', C)
check('helper with calendar access gets the address', s == 200, (s, x))
s, x = call('POST', '/api/djuu/member', A, {'id': MC, 'perms': {'perm_shop': 'edit', 'perm_errands': 'view', 'perm_cal': 'none', 'perm_saved': 'none'}})
check('admin gives the helper "Mitbearbeiten" for Einkauf', s == 200, x)
s, x = call('POST', '/api/collections/shop_items/records', C, {'family': FAM, 'name': 'Brot', 'added_by': MC})
check('now the helper can add', s == 200, x)
s, x = call('POST', '/api/djuu/calendar', C)
check('calendar closed after access removed', s == 403, (s, x))
s, x = call('POST', '/api/djuu/member', A, {'id': MC, 'until': '2020-01-01'})
check('admin sets an end date in the past', s == 200, x)
s, l = call('GET', '/api/collections/shop_items/records', C)
check('expired access: helper sees nothing', s == 200 and l['totalItems'] == 0, l)
s, x = call('POST', '/api/djuu/member', A, {'id': MC, 'until': ''})
check('admin removes the end date', s == 200, x)
s, l = call('GET', '/api/collections/shop_items/records', C)
check('access is back', s == 200 and l['totalItems'] == 2, l)

uid = lambda k: users[k]['id']
s, pa = call('POST', '/api/collections/places/records', A, {'owner': uid('A'), 'name': 'Arbeit', 'plz': '22765', 'lat': 53.55, 'lon': 9.93})
check('A adds a private place', s == 200, pa)
s, ps = call('POST', '/api/collections/places/records', A, {'owner': uid('A'), 'family': FAM, 'shared': True, 'name': 'Kita Mia', 'plz': '20253', 'lat': 53.58, 'lon': 9.97})
check('A adds a shared place', s == 200, ps)
s, x = call('POST', '/api/collections/places/records', A, {'owner': uid('B'), 'name': 'Fake'})
check('nobody adds a place for someone else', s in (400, 403), (s, x))
s, l = call('GET', '/api/collections/places/records', B)
check('B sees only the shared place', s == 200 and [r['name'] for r in l['items']] == ['Kita Mia'], l)
s, l = call('GET', '/api/collections/places/records', C)
check('helper sees no places', s == 200 and l['totalItems'] == 0, l)
s, x = call('PATCH', f"/api/collections/places/records/{ps['id']}", B, {'name': 'Hack'})
check('B cannot change A\'s place', s in (403, 404), (s, x))

s, x = call('POST', '/api/djuu/member', A, {'id': MB, 'admin': True})
check('A makes B second admin', s == 200, x)
s, x = call('POST', '/api/djuu/member', A, {'id': MA, 'admin': False})
check('with two admins one can step down', s == 200, x)
s, x = call('POST', '/api/djuu/member', B, {'id': MA, 'admin': True})
check('B makes A admin again', s == 200, x)
s, x = call('POST', '/api/djuu/remove', A, {'id': MC})
check('admin removes the helper', s == 200, x)
s, l = call('GET', '/api/collections/shop_items/records', C)
check('removed helper sees nothing', s == 200 and l['totalItems'] == 0, l)
s, cu = call('GET', f"/api/collections/users/records/{uid('C')}", C)
check('removed helper keeps the account, without a Wir', s == 200 and not cu.get('member'), cu)

s, o = call('POST', '/api/collections/users/request-otp', body={'email': 'nobody@example.invalid'})
check('e-mail code login is switched off', s != 200, (s, o))
s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': users['B']['email'], 'password': users['B']['pw']})
check('confirmed account signs in with password', s == 200 and o.get('token'), (s, o))
s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': users['B']['email'], 'password': 'wrong-password'})
check('wrong password is rejected', s in (400, 403), (s, o))
newmail, newpw = f'test-new-{secrets.token_hex(3)}@example.invalid', secrets.token_urlsafe(12)
s, o = call('POST', '/api/collections/users/records', body={'email': newmail, 'password': 'short', 'passwordConfirm': 'short'})
check('password needs at least 8 characters', s == 400, (s, o))
s, nu = call('POST', '/api/collections/users/records', body={'email': newmail, 'password': newpw, 'passwordConfirm': newpw})
check('anyone can register', s == 200 and not nu.get('verified'), (s, nu))
s, o = call('POST', '/api/collections/users/records', body={'email': newmail, 'password': newpw, 'passwordConfirm': newpw, 'member': MB})
check('registration cannot pick a Wir', s == 400, (s, o))
s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': newmail, 'password': newpw})
check('unconfirmed account cannot sign in', s in (400, 403), (s, o))
s, o = call('POST', '/api/collections/users/request-verification', body={'email': newmail})
check('confirmation mail can be requested', s == 204, (s, o))
call('PATCH', f"/api/collections/users/records/{nu.get('id')}", SU, {'verified': True})
s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': newmail, 'password': newpw})
check('after confirming, the account signs in', s == 200, (s, o))
call('DELETE', f"/api/collections/users/records/{nu.get('id')}", SU)
s, inv2 = call('POST', '/api/djuu/invite', A, {'grp': 'family'})
s, info = call('GET', f"/api/djuu/invite-info/{inv2.get('token')}")
check('invite link shows who invites', s == 200 and info.get('inviter') == 'Anna' and info.get('people'), (s, info))
s, info = call('GET', '/api/djuu/invite-info/wrong')
check('wrong invite link shows nothing', s == 404, (s, info))

# clean up: deleting the family removes members, items, offers and pings (cascade); then the users
s, x = call('POST', '/api/djuu/delete-account', A, {'password': 'wrong-password'})
check('deleting needs the password', s == 400, (s, x))
s, x = call('POST', '/api/djuu/delete-account', A, {'password': users['A']['pw']})
check('admin deletes account: the whole Wir is gone', s == 200, x)
s, x = call('GET', f'/api/collections/families/records/{FAM}', SU)
check('family deleted', s == 404, x)
s, x = call('GET', f"/api/collections/users/records/{users['B']['id']}", SU)
check('B keeps the account without a Wir', s == 200 and not x.get('member'), x)
for k in 'ABC':
    call('DELETE', f"/api/collections/users/records/{users[k]['id']}", SU)
print(f'\n{sum(results)} of {len(results)} checks passed')
