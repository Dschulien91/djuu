"""End-to-end check of the Djuu API rules and routes. Run on the server: python3 test_api.py http://<container-ip>:8090 <admin-email> <admin-password>
Creates throwaway users (A, B, stranger C, D with a Wir of their own, E/F for the parallel join, P–Y for the community, A2–X2 for
founder/e-mails/export/push, F1–F6 for the fixes of 21 Nov 2026), checks what each may see and do, including the attacks found in the security reviews, then deletes
everything it created (also when a check crashes). Community items use a place id that does not exist in the app's data.
Optional: DJUU_PUSH_SECRET in the environment runs the push sender route checks too (stop the push container meanwhile, so it
does not fetch the test messages first: docker compose stop push … docker compose start push)."""
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

BASE, ADMIN, PW = sys.argv[1], sys.argv[2], sys.argv[3]
results = []


def call(method, path, token=None, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': token} if token else {})})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                data = r.read().decode()
                return r.status, (data if raw else (json.loads(data) if data else {}))
        except urllib.error.HTTPError as e:
            data = e.read().decode()
            try: return e.code, json.loads(data)
            except Exception: return e.code, data
        except (ConnectionResetError, ConnectionAbortedError, urllib.error.URLError) as e:
            # a connection dropped (e.g. after the rate limit): wait and try again, but never hide a server that is down
            if attempt == 3 or (isinstance(e, urllib.error.URLError) and not isinstance(getattr(e, 'reason', None), (ConnectionResetError, ConnectionAbortedError))): raise
            time.sleep(5.2)


def create(path, token, body):
    """POST that waits out the create rate limit (20 per 5 s per address) instead of failing on it."""
    for _ in range(6):
        s, x = call('POST', path, token, body)
        if s != 429: return s, x
        time.sleep(5.2)
    return s, x


def check(name, ok, info=''):
    ok = bool(ok)
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if not ok and info else ''))


def code(x):
    return x.get('code') if isinstance(x, dict) else None


s, a = call('POST', '/api/collections/_superusers/auth-with-password', body={'identity': ADMIN, 'password': PW})
check('superuser login', s == 200, a)
SU = a['token']
users, families = {}, []


def mkuser(k):
    email = f'test-{k.lower()}-{secrets.token_hex(3)}@example.invalid'
    pw = secrets.token_urlsafe(18)
    s, u = call('POST', '/api/collections/users/records', SU, {'email': email, 'password': pw, 'passwordConfirm': pw, 'name': 'Test ' + k, 'verified': True})
    check(f'create user {k}', s == 200, u)
    s, t = call('POST', f"/api/collections/users/impersonate/{u['id']}", SU, {'duration': 3600})
    check(f'token for {k}', s == 200, t)
    if k in users: users[f'{k}~{secrets.token_hex(2)}'] = users[k]  # a second user under the same letter: keep the first for clean-up
    users[k] = {'id': u['id'], 'token': t.get('token'), 'email': email, 'pw': pw}
    return users[k]['token']


try:
    A, B, C = (mkuser(k) for k in 'ABC')

    s, f = call('POST', '/api/djuu/family', A, {'name': 'Testfamilie', 'myName': 'Anna'})
    check('A creates family', s == 200 and f.get('family'), f)
    FAM, MA = f.get('family'), f.get('member')
    families.append(FAM)
    s, x = call('POST', '/api/djuu/family', A, {'myName': 'Anna'})
    check('A cannot create a second family', s == 400 and code(x) == 'already_member', x)
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
    check('wrong invite token rejected, with a code for the app', s == 400 and code(j) == 'invite_invalid' and j.get('message'), (s, j))
    s, j = call('POST', '/api/djuu/join', B, {'token': inv['token'], 'myName': 'Ben'})
    check('B joins with invite', s == 200 and j.get('family') == FAM, j)
    MB = j.get('member')
    s, j2 = call('POST', '/api/djuu/join', C, {'token': inv['token'], 'myName': 'Carl'})
    check('invite cannot be used twice', s == 400, j2)
    s, l = call('GET', '/api/collections/shop_items/records', B)
    check('B now sees the item', s == 200 and l['totalItems'] == 1, l)
    s, l = call('GET', '/api/collections/shop_items/records', C)
    check('stranger C sees nothing', s == 200 and l['totalItems'] == 0, l)
    s, kid = call('POST', '/api/collections/members/records', B, {'family': FAM, 'name': 'Kind', 'kind': 'kid', 'birth_ym': '2022'})
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
    s, cal_a = call('POST', '/api/djuu/calendar', A)
    check('every person has their own calendar address', s == 200 and cal_a.get('token') and cal_a['token'] != cal['token'], (cal_a, cal))
    s, cal_b2 = call('POST', '/api/djuu/calendar', B, {'renew': True})
    s1, _ = call('GET', f"/api/djuu/cal/{cal['token']}.ics", raw=True)
    s2, _ = call('GET', f"/api/djuu/cal/{cal_a['token']}.ics", raw=True)
    check('renewing ends only my old address', s == 200 and s1 == 404 and s2 == 200, (s, s1, s2))
    s, x = call('PATCH', f"/api/collections/members/records/{MB}", B, {'cal_token': 'x' * 40})
    s1, _ = call('GET', f"/api/djuu/cal/{'x' * 40}.ics", raw=True)
    check('nobody sets a calendar address through the API', s1 == 404, (s, s1))
    LEGACY = secrets.token_urlsafe(30)
    call('PATCH', f'/api/collections/families/records/{FAM}', SU, {'cal_token': LEGACY})
    s, _ = call('GET', f'/api/djuu/cal/{LEGACY}.ics', raw=True)
    check('the old family-wide address still works', s == 200, s)

    s, p = call('POST', '/api/collections/pings/records', A, {'family': FAM, 'from': MA, 'to': MB})
    check('A asks B "Wo seid ihr?"', s == 200, p)
    s, x = call('POST', '/api/collections/pings/records', A, {'family': FAM, 'from': MB, 'to': MA})
    check('A cannot send a ping in B\'s name', s in (400, 403), (s, x))
    s, x = call('PATCH', f"/api/collections/pings/records/{p['id']}", A, {'lat': 1, 'lon': 1})
    check('A cannot answer for B', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/pings/records/{p['id']}", B, {'lat': 53.55, 'lon': 9.99, 'accuracy': 20, 'answered': '2026-11-07 12:00:00.000Z'})
    check('B answers with a position', s == 200, x)
    s, x = call('PATCH', f"/api/collections/pings/records/{p['id']}", B, {'to': MA})
    check('the answer cannot change who was asked', s in (400, 403, 404), (s, x))
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
    check('only the admin can invite', s == 403 and code(x) == 'admin_only', (s, x))
    s, x = call('PATCH', f"/api/collections/members/records/{MB}", B, {'perm_shop': 'edit', 'is_admin': True})
    check('nobody sets their own access through the API', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/members/records/{MB}", B, {'name': 'Benny', 'role': 'Papa'})
    check('B changes own name and role', s == 200 and x.get('name') == 'Benny', x)
    s, x = call('POST', '/api/djuu/member', B, {'id': MB, 'perms': {'perm_shop': 'edit'}})
    check('only the admin changes access', s == 403, (s, x))
    s, x = call('POST', '/api/djuu/member', A, {'id': MA, 'admin': False})
    check('the last admin cannot step down', s == 400 and code(x) == 'last_admin', (s, x))
    s, x = call('POST', '/api/djuu/member', A, {'id': MA, 'grp': 'helper'})
    check('an admin cannot be moved to the helpers', s == 400 and code(x) == 'admin_not_helper', (s, x))

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
    s, x = call('POST', '/api/collections/pings/records', C, {'family': FAM, 'from': MC, 'to': MA})
    check('helpers do not send "Wo seid ihr?"', s in (400, 403), (s, x))
    s, dog = call('POST', '/api/collections/members/records', B, {'family': FAM, 'name': '', 'kind': 'dog'})
    check('family adds a dog without a name', s == 200 and dog.get('kind') == 'dog', (s, dog))
    s, l = call('GET', '/api/collections/members/records', C)
    check('helper does not see the dog', s == 200 and all(m['kind'] == 'adult' for m in l['items']), [m['kind'] for m in l.get('items', [])])
    s, x2 = call('POST', '/api/collections/members/records', C, {'family': FAM, 'name': 'Bello', 'kind': 'dog'})
    check('helper cannot add a dog', s in (400, 403), (s, x2))
    s, x2 = call('PATCH', f"/api/collections/members/records/{dog.get('id')}", B, {'name': 'Bello'})
    check('family names the dog', s == 200 and x2.get('name') == 'Bello', (s, x2))
    PIC = 'data:image/jpeg;base64,' + 'A' * 4000
    s, x2 = call('PATCH', f"/api/collections/members/records/{MB}", A, {'photo': PIC})
    check('admin cannot change another adult\'s photo', s in (400, 403, 404), (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{MB}", B, {'photo': PIC, 'color': '#0E8F84'})
    check('everyone changes their own photo and colour', s == 200 and x2.get('color') == '#0E8F84', (s, str(x2)[:120]))
    for bad in ('javascript:alert(1)', 'https://tracker.example/p.gif', 'x" onerror="alert(1)'):
        s, x2 = call('PATCH', f"/api/collections/members/records/{MB}", B, {'photo': bad})
        check(f'a photo must be a data:image URL ({bad[:14]})', s == 400, (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{MB}", B, {'color': 'red;x'})
    check('a colour must be #RRGGBB', s == 400, (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{kid['id']}", A, {'photo': PIC})
    check('admin changes a child\'s photo', s == 200, (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{kid['id']}", B, {'photo': ''})
    check('other family members do not change a child\'s photo', s in (400, 403, 404), (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{kid['id']}", B, {'school': 'Kita Sonne'})
    check('family still edits other child details', s == 200, (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{kid['id']}", B, {'kind': 'adult'})
    check('a child cannot be turned into an adult (helpers would see it)', s in (400, 403, 404), (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{MC}", A, {'color': '#1F1B4D'})
    check('admin sets a helper\'s colour', s == 200 and x2.get('color') == '#1F1B4D', (s, str(x2)[:120]))
    s, x2 = call('PATCH', f"/api/collections/members/records/{MC}", B, {'color': '#6B4EE6'})
    check('other family members do not set a helper\'s colour', s in (400, 403, 404), (s, str(x2)[:120]))
    s, x2 = call('PATCH', f'/api/collections/families/records/{FAM}', A, {'photo': PIC, 'name': 'Annas Wir'})
    check('admin sets the photo and name of the Wir', s == 200 and x2.get('name') == 'Annas Wir', (s, str(x2)[:120]))
    s, x2 = call('PATCH', f'/api/collections/families/records/{FAM}', B, {'photo': ''})
    check('others cannot change the photo of the Wir', s in (400, 403, 404), (s, str(x2)[:120]))
    s, x2 = call('GET', f'/api/collections/families/records/{FAM}', C)
    check('everyone in the Wir sees its photo', s == 200 and x2.get('photo', '').startswith('data:image'), (s, str(x2)[:80]))
    s, x2 = call('PATCH', f"/api/collections/users/records/{users['B']['id']}", B, {'news_prefs': {'off': ['shop', 'tipp']}})
    check('everyone keeps their own news settings in the account', s == 200 and x2.get('news_prefs', {}).get('off') == ['shop', 'tipp'], (s, x2))
    s, x2 = call('PATCH', f"/api/collections/users/records/{users['B']['id']}", A, {'news_prefs': {'off': []}})
    check('nobody changes another person\'s news settings', s in (403, 404), (s, x2))
    s, kk = call('GET', '/api/djuu/kids', C)
    check('the dog is not one of the children', s == 200 and all(k['name'] != 'Bello' for k in kk['kids']), kk)
    s, x2 = call('DELETE', f"/api/collections/members/records/{dog.get('id')}", B)
    check('family removes the dog', s == 204, (s, x2))
    s, kk = call('GET', '/api/djuu/kids', C)
    check('helper gets the children with age and sizes only, no birth date', s == 200 and kk['kids'] and all(set(k) == {'id', 'name', 'min', 'max', 'size', 'shoe'} for k in kk['kids']), (s, kk))
    s, kk = call('GET', '/api/djuu/kids', B)
    check('year-only birth date gives an age range', s == 200 and kk['kids'][0]['min'] is not None, (s, kk))
    s, l = call('GET', '/api/collections/saved_offers/records', C)
    check('helper without access sees nothing saved', s == 200 and l['totalItems'] == 0, l)
    s, l = call('GET', '/api/collections/members/records', C)
    check('helper sees no children', s == 200 and all(r['kind'] == 'adult' for r in l['items']) and l['totalItems'] == 3, [r['name'] for r in l.get('items', [])])
    s, cal_c = call('POST', '/api/djuu/calendar', C)
    check('helper with calendar access gets the address', s == 200, (s, cal_c))

    # ---- family calendar (cal_entries, 1763800000) and its feed ----
    s, kid2 = call('POST', '/api/collections/members/records', B, {'family': FAM, 'name': 'Mia', 'kind': 'kid', 'birth_ym': '2021-03', 'birth_day': 14})
    check('B adds a child with a full birth date', s == 200, kid2)
    KID2 = kid2.get('id')
    s, ev = call('POST', '/api/collections/cal_entries/records', B, {'family': FAM, 'kind': 'event', 'title': 'Elternabend', 'date': '2026-12-03', 'time_from': '19:30', 'time_to': '21:00', 'repeat': 'weekly', 'until': '2027-01-28', 'alarm': 'PT1H', 'who': [MA, MB], 'added_by': MB})
    check('family member adds a calendar entry', s == 200, ev)
    k0 = time.strftime('%Y-%m-%d')
    s, pu = call('POST', '/api/collections/cal_entries/records', B, {'family': FAM, 'kind': 'pickup', 'date': k0, 'time_from': '15:00', 'repeat': 'weekly', 'who': [MB], 'kids': [KID2], 'place': 'Kita Sonne', 'plan': KID2, 'added_by': MB})
    check('family member adds a weekly pickup', s == 200, pu)
    s, cl = call('POST', '/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'closed', 'date': '2026-12-22', 'end_date': '2027-01-02', 'kids': [KID2], 'added_by': MA})
    check('admin adds Kita closing days', s == 200, cl)
    s, x = call('POST', '/api/collections/cal_entries/records', B, {'family': FAM, 'kind': 'event', 'title': 'x', 'date': 'morgen'})
    check('a calendar date must be YYYY-MM-DD', s == 400, (s, x))
    s, x = call('POST', '/api/collections/cal_entries/records', B, {'family': FAM, 'kind': 'event', 'title': 'x', 'date': '2026-12-01', 'time_from': '25:00'})
    check('a time must be HH:MM', s == 400, (s, x))
    s, x = call('PATCH', f"/api/collections/cal_entries/records/{pu.get('id')}", A, {'overrides': {k0: MA}})
    check('someone takes over one day ("Ich übernehme")', s == 200 and x.get('overrides', {}).get(k0) == MA, (s, x))
    k7 = time.strftime('%Y-%m-%d', time.localtime(time.time() + 7 * 86400))
    s, x = call('POST', '/api/djuu/cal-take', B, {'id': pu.get('id'), 'set': {k7: MB}, 'del': []})
    check('a second take-over (day by day) keeps the first one', s == 200 and x.get('overrides') == {k0: MA, k7: MB}, (s, x))
    s, x = call('POST', '/api/djuu/cal-take', B, {'id': pu.get('id'), 'set': {}, 'del': [k7]})
    check('giving a day back removes only that day', s == 200 and x.get('overrides') == {k0: MA}, (s, x))
    res = []
    def take(tok, day, who): res.append(call('POST', '/api/djuu/cal-take', tok, {'id': pu.get('id'), 'set': {day: who}, 'del': []}))
    days = [time.strftime('%Y-%m-%d', time.localtime(time.time() + (14 + 7 * i) * 86400)) for i in range(6)]
    ts = [threading.Thread(target=take, args=((A, B)[i % 2], days[i], (MA, MB)[i % 2])) for i in range(6)]
    [t.start() for t in ts]; [t.join() for t in ts]
    s, x = call('GET', f"/api/collections/cal_entries/records/{pu.get('id')}", A)
    check('six take-overs at the same moment all stay', s == 200 and all(d in x.get('overrides', {}) for d in days), (x.get('overrides'), [r[0] for r in res]))
    for d in days: call('POST', '/api/djuu/cal-take', A, {'id': pu.get('id'), 'set': {}, 'del': [d]})
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': pu.get('id'), 'set': {k7: 'xxxxxxxxxxxxxxx'}, 'del': []})
    check('a take-over needs a real person', s == 200 and k7 not in x.get('overrides', {}), (s, x))
    s, l = call('GET', '/api/collections/cal_entries/records', C)
    check('helper with "Ansehen" reads the calendar', s == 200 and l['totalItems'] == 3, l)
    s, x = call('POST', '/api/collections/cal_entries/records', C, {'family': FAM, 'kind': 'event', 'title': 'Babysitten', 'date': '2026-12-05'})
    check('helper with "Ansehen" cannot add to the calendar', s in (400, 403), (s, x))
    s, x = call('PATCH', f"/api/collections/cal_entries/records/{pu.get('id')}", C, {'overrides': {k0: MC}})
    check('helper with "Ansehen" cannot take over a pickup', s in (400, 403, 404), (s, x))
    s, x = call('POST', '/api/djuu/cal-take', C, {'id': pu.get('id'), 'set': {k0: MC}, 'del': []})
    check('helper with "Ansehen" cannot take over through the route either', s == 403 and code(x) == 'no_calendar_access', (s, x))
    s, x = call('DELETE', f"/api/collections/cal_entries/records/{ev.get('id')}", C)
    check('helper with "Ansehen" cannot delete', s in (400, 403, 404), (s, x))
    G = mkuser('G')
    s, fg = call('POST', '/api/djuu/family', G, {'myName': 'Gert'})
    families.append(fg.get('family'))
    s, l = call('GET', '/api/collections/cal_entries/records', G)
    check('a stranger sees no calendar entries', s == 200 and l['totalItems'] == 0, l)
    s, x = call('POST', '/api/collections/cal_entries/records', G, {'family': FAM, 'kind': 'event', 'title': 'Spam', 'date': '2026-12-01'})
    check('a stranger cannot add to a foreign calendar', s in (400, 403), (s, x))
    s, x = call('POST', '/api/djuu/cal-take', G, {'id': pu.get('id'), 'set': {k0: fg.get('member')}, 'del': []})
    check('a stranger cannot take over in a foreign calendar', s == 404 and code(x) == 'entry_not_found', (s, x))
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': pu.get('id'), 'set': {k7: fg.get('member')}, 'del': []})
    check('only people of the same Wir can take over', s == 200 and k7 not in x.get('overrides', {}), (s, x))
    s, own = call('POST', '/api/collections/cal_entries/records', G, {'family': fg.get('family'), 'kind': 'event', 'title': 'Spam', 'date': '2026-12-01'})
    s, x = call('PATCH', f"/api/collections/cal_entries/records/{own.get('id')}", G, {'family': FAM})
    check('a calendar entry cannot be moved into another Wir', s in (400, 403, 404), (s, x))
    s, x = call('POST', '/api/collections/cal_entries/records', B, {'family': FAM, 'kind': 'event', 'title': 'x', 'date': '2026-12-01', 'added_by': fg.get('member')})
    check('added_by must be a person of the same Wir', s in (400, 403), (s, x))
    s, feed = call('GET', f"/api/djuu/cal/{cal_b2.get('token')}.ics", raw=True)
    flat = str(feed).replace('\r\n ', '')
    check('feed: own entry with repeat and alarm', s == 200 and 'SUMMARY:Elternabend' in flat and 'RRULE:FREQ=WEEKLY;UNTIL=20270128T225959Z' in flat and 'TRIGGER:-PT1H' in flat, flat[:400])
    check('feed: the taken-over day shows who picks up', f'SUMMARY:Mia abholen: Anna' in flat and 'SUMMARY:Mia abholen: ' in flat, flat[-800:])
    check('feed: Kita closing days as all-day range', 'SUMMARY:Kita zu: Mia' in flat and 'DTSTART;VALUE=DATE:20261222' in flat and 'DTEND;VALUE=DATE:20270103' in flat, '')
    check('feed: birthday for the family group', 'SUMMARY:Geburtstag Mia' in flat and 'RRULE:FREQ=YEARLY' in flat, '')
    check('feed: no school holidays unless asked', '(Schulferien)' not in flat, '')
    s, feed2 = call('GET', f"/api/djuu/cal/{cal_b2.get('token')}.ics?ferien=1", raw=True)
    check('feed with ?ferien=1: Hamburg school holidays', s == 200 and 'Weihnachtsferien (Schulferien)' in str(feed2).replace('\r\n ', ''), '')
    s, feed3 = call('GET', f"/api/djuu/cal/{cal_c.get('token')}.ics", raw=True)
    flat3 = str(feed3).replace('\r\n ', '')
    check('helper feed: entries yes, birthdays no', s == 200 and 'SUMMARY:Elternabend' in flat3 and 'Geburtstag' not in flat3, flat3[:300])
    s, x = call('POST', '/api/djuu/member', A, {'id': MC, 'perms': {'perm_shop': 'edit', 'perm_errands': 'view', 'perm_cal': 'none', 'perm_saved': 'none'}})
    check('admin gives the helper "Mitbearbeiten" for Einkauf', s == 200, x)
    s, x = call('POST', '/api/collections/shop_items/records', C, {'family': FAM, 'name': 'Brot', 'added_by': MC})
    check('now the helper can add', s == 200, x)
    s, x = call('POST', '/api/djuu/calendar', C)
    check('calendar closed after access removed', s == 403 and code(x) == 'no_calendar_access', (s, x))
    s, _ = call('GET', f"/api/djuu/cal/{cal_c.get('token')}.ics", raw=True)
    check('the helper\'s calendar address stops when access is removed', s == 404, s)
    s, _ = call('GET', f'/api/djuu/cal/{LEGACY}.ics', raw=True)
    check('changing someone\'s access retires the old family-wide address', s == 404, s)
    s, x = call('POST', '/api/djuu/member', A, {'id': MC, 'until': '2020-01-01'})
    check('admin sets an end date in the past', s == 200, x)
    s, l = call('GET', '/api/collections/shop_items/records', C)
    check('expired access: helper sees nothing', s == 200 and l['totalItems'] == 0, l)
    s, x = call('GET', f'/api/collections/members/records/{MC}', C)
    check('expired access: the helper still reads their own record', s == 200 and x.get('id') == MC, (s, x))
    s, l = call('GET', '/api/collections/members/records', C)
    check('expired access: nobody else\'s record', s == 200 and [r['id'] for r in l['items']] == [MC], l)
    s, x = call('POST', '/api/collections/pings/records', C, {'family': FAM, 'from': MC, 'to': MA})
    check('expired access: no "Wo seid ihr?"', s in (400, 403), (s, x))
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

    # ---------- another Wir: nothing crosses over ----------
    D = mkuser('D')
    s, f = call('POST', '/api/djuu/family', D, {'name': 'Andere', 'myName': 'Dora'})
    FAM2, MD = f.get('family'), f.get('member')
    families.append(FAM2)
    s, x = call('PATCH', f'/api/collections/members/records/{MD}', D, {'family': FAM})
    check('an admin of another Wir cannot move into this Wir', s in (400, 403, 404), (s, str(x)[:120]))
    s, l = call('GET', '/api/collections/members/records', D)
    check('… and still sees only their own Wir', s == 200 and all(r['family'] == FAM2 for r in l['items']), [r.get('family') for r in l.get('items', [])])
    s, x = call('PATCH', f"/api/collections/members/records/{kid['id']}", B, {'family': FAM2})
    check('a child cannot be moved into another Wir', s in (400, 403, 404), (s, str(x)[:120]))
    s, it2 = call('POST', '/api/collections/shop_items/records', D, {'family': FAM2, 'name': 'Bier'})
    s, x = call('PATCH', f"/api/collections/shop_items/records/{it2.get('id')}", D, {'family': FAM})
    check('an item cannot be pushed into another Wir\'s list', s in (400, 403, 404), (s, str(x)[:120]))
    s, x = call('POST', '/api/collections/errands/records', D, {'family': FAM2, 'title': 'x', 'for_member': kid['id']})
    check('relations cannot point at people of another Wir', s in (400, 403), (s, str(x)[:120]))
    s, x = call('POST', '/api/collections/pings/records', D, {'family': FAM2, 'from': MD, 'to': MA})
    check('no "Wo seid ihr?" to people of another Wir', s in (400, 403), (s, str(x)[:120]))
    n, last = 0, None
    for i in range(32):
        s, last = create('/api/collections/members/records', D, {'family': FAM2, 'name': f'K{i}', 'kind': 'kid'})
        if s != 200: break
        n += 1
    check('a Wir has at most 30 people', n == 29 and code(last) == 'limit_reached', (n, last))

    # ---------- joining at the same moment, deleting accounts ----------
    E, F = mkuser('E'), mkuser('F')
    s, inv = call('POST', '/api/djuu/invite', A)
    out = []
    th = [threading.Thread(target=lambda t: out.append(call('POST', '/api/djuu/join', t, {'token': inv['token'], 'myName': 'R'})[0]), args=(t,)) for t in (E, F)]
    [t.start() for t in th]; [t.join() for t in th]
    check('one invite works only once, also at the same moment', sorted(out) == [200, 400], out)
    s, x = call('DELETE', f"/api/collections/users/records/{uid('B')}", B)
    check('accounts are not deleted through the records API', s in (403, 404), s)
    s, x = call('POST', '/api/djuu/remove', A, {'id': MC})
    check('admin removes the helper', s == 200, x)
    s, l = call('GET', '/api/collections/shop_items/records', C)
    check('removed helper sees nothing', s == 200 and l['totalItems'] == 0, l)
    s, cu = call('GET', f"/api/collections/users/records/{uid('C')}", C)
    check('removed helper keeps the account, without a Wir', s == 200 and not cu.get('member'), cu)

    s, o = call('POST', '/api/collections/users/request-otp', body={'email': 'nobody@example.invalid'})
    check('e-mail code login is switched off', s != 200, (s, o))
    time.sleep(3.2)  # the server allows 2 sign-ins per 3 seconds
    s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': users['B']['email'], 'password': users['B']['pw']})
    check('confirmed account signs in with password', s == 200 and o.get('token'), (s, o))
    time.sleep(3.2)
    s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': users['B']['email'], 'password': 'wrong-password'})
    check('wrong password is rejected', s in (400, 403), (s, o))
    newmail, newpw = f'test-new-{secrets.token_hex(3)}@example.invalid', secrets.token_urlsafe(12)
    s, o = call('POST', '/api/collections/users/records', body={'email': newmail, 'password': 'short', 'passwordConfirm': 'short'})
    check('password needs at least 8 characters', s == 400, (s, o))
    s, nu = call('POST', '/api/collections/users/records', body={'email': newmail, 'password': newpw, 'passwordConfirm': newpw})
    check('anyone can register', s == 200 and not nu.get('verified'), (s, nu))
    if s == 200: users['new'] = {'id': nu['id']}
    s, o = call('POST', '/api/collections/users/records', body={'email': newmail, 'password': newpw, 'passwordConfirm': newpw, 'member': MB})
    check('registration cannot pick a Wir', s == 400, (s, o))
    time.sleep(3.2)
    s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': newmail, 'password': newpw})
    check('unconfirmed account cannot sign in', s in (400, 403), (s, o))
    s, o = call('POST', '/api/collections/users/request-verification', body={'email': newmail})
    check('confirmation mail can be requested', s == 204, (s, o))
    call('PATCH', f"/api/collections/users/records/{nu.get('id')}", SU, {'verified': True})
    time.sleep(3.2)
    s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': newmail, 'password': newpw})
    check('after confirming, the account signs in', s == 200, (s, o))
    s, inv2 = call('POST', '/api/djuu/invite', A, {'grp': 'family'})
    s, info = call('GET', f"/api/djuu/invite-info/{inv2.get('token')}")
    check('invite link shows who invites', s == 200 and info.get('inviter') == 'Anna' and info.get('people'), (s, info))
    s, info = call('GET', '/api/djuu/invite-info/wrong')
    check('wrong invite link shows nothing', s == 404, (s, info))

    # ---------- leaving the Wir without deleting the account ----------
    G, Hh = mkuser('G'), mkuser('H')
    MG = call('POST', '/api/djuu/join', G, {'token': call('POST', '/api/djuu/invite', A)[1]['token'], 'myName': 'Gina'})[1].get('member')
    MH = call('POST', '/api/djuu/join', Hh, {'token': call('POST', '/api/djuu/invite', A, {'grp': 'helper'})[1]['token'], 'myName': 'Hanna'})[1].get('member')
    s, sg = call('POST', '/api/collections/saved_offers/records', G, {'family': FAM, 'offer_id': 'of_g', 'snap': {'title': 'Turnen'}, 'saved_by': MG})
    s, pg = call('POST', '/api/collections/places/records', G, {'owner': uid('G'), 'family': FAM, 'shared': True, 'name': 'Oma'})
    LEGACY2 = secrets.token_urlsafe(30)
    call('PATCH', f'/api/collections/families/records/{FAM}', SU, {'cal_token': LEGACY2})
    s, x = call('POST', '/api/djuu/leave', A)
    check('the only admin cannot leave', s == 400 and code(x) == 'last_admin', (s, x))
    s, x = call('POST', '/api/djuu/leave', G)
    check('a member leaves the Wir and keeps the account', s == 200, (s, x))
    s, x = call('GET', f"/api/collections/users/records/{uid('G')}", G)
    check('… the account has no Wir any more', s == 200 and not x.get('member'), (s, x))
    s, x = call('GET', f"/api/collections/saved_offers/records/{sg.get('id')}", A)
    check('… what they saved stays for the others', s == 200 and x.get('saved_by') == '', (s, x))
    s, x = call('GET', f"/api/collections/places/records/{pg.get('id')}", G)
    check('… their place is no longer shared', s == 200 and not x.get('shared') and not x.get('family'), (s, x))
    s, _ = call('GET', f'/api/djuu/cal/{LEGACY2}.ics', raw=True)
    check('… the old family-wide calendar address stops', s == 404, s)
    s, x = call('POST', '/api/djuu/leave', G)
    check('leaving twice: not in a Wir', s == 400 and code(x) == 'not_member', (s, x))
    s, f = call('POST', '/api/djuu/family', G, {'name': 'Ginas Wir', 'myName': 'Gina'})
    check('after leaving, a new Wir can be created', s == 200 and f.get('family'), (s, f))
    if f.get('family'): families.append(f['family'])
    MG2 = f.get('member')
    call('POST', '/api/djuu/member', A, {'id': MH, 'until': '2020-01-01'})
    s, j = call('POST', '/api/djuu/join', Hh, {'token': call('POST', '/api/djuu/invite', A, {'grp': 'helper'})[1]['token'], 'myName': 'Hanna'})
    check('a person whose access ended can join again (the ended membership is replaced)', s == 200 and j.get('member') != MH, (s, j))
    s, _ = call('GET', f'/api/collections/members/records/{MH}', SU)
    check('… the ended person record is gone', s == 404, s)
    call('POST', '/api/djuu/member', A, {'id': j.get('member'), 'until': '2020-01-01'})
    s, x = call('POST', '/api/djuu/leave', Hh)
    check('a person whose access ended can leave', s == 200, (s, x))

    # ---------- account fields: invite kept for the confirm flow, terms consent, e-mail copy, sign out everywhere ----------
    jmail, jpw = f'test-j-{secrets.token_hex(3)}@example.invalid', secrets.token_urlsafe(14)
    s, ju = call('POST', '/api/collections/users/records', body={'email': jmail, 'password': jpw, 'passwordConfirm': jpw, 'join_token': 'abc123',
                                                               'terms_version': '2026-11-20', 'terms_accepted': '2020-01-01 00:00:00.000Z'})
    check('sign-up stores the invite and the terms version', s == 200, (s, ju))
    if s == 200: users['J'] = {'id': ju['id']}
    s, x = call('GET', f"/api/collections/users/records/{ju.get('id')}", SU)
    check('… the server notes the consent time itself', x.get('join_token') == 'abc123' and x.get('terms_version') == '2026-11-20' and x.get('terms_accepted', '')[:4] == time.strftime('%Y'), x)
    call('PATCH', f"/api/collections/users/records/{ju.get('id')}", SU, {'verified': True})
    J = call('POST', f"/api/collections/users/impersonate/{ju.get('id')}", SU, {'duration': 3600})[1].get('token')
    s, x = call('PATCH', f"/api/collections/users/records/{ju.get('id')}", J, {'terms_version': '1999'})
    check('the terms version cannot be changed later', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/users/records/{ju.get('id')}", J, {'join_token': 'other'})
    check('the stored invite cannot be swapped', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/users/records/{ju.get('id')}", J, {'ev_prefs': {'mode': 'list', 'hide': ['p1']}})
    check('everyone keeps their own Termine settings in the account', s == 200 and x.get('ev_prefs', {}).get('mode') == 'list', (s, x))
    t_inv = call('POST', '/api/djuu/invite', A)[1]['token']
    call('PATCH', f"/api/collections/users/records/{ju.get('id')}", SU, {'join_token': t_inv})
    s, j = call('POST', '/api/djuu/join', J, {'token': t_inv, 'myName': 'Jo'})
    s2, x = call('GET', f"/api/collections/users/records/{ju.get('id')}", J)
    check('joining uses up the stored invite', s == 200 and s2 == 200 and x.get('join_token') == '', (s, j, x))
    s, x = call('PATCH', f"/api/collections/users/records/{ju.get('id')}", J, {'join_token': ''})
    check('the owner may clear the stored invite', s == 200, (s, x))
    newmail = f'test-g2-{secrets.token_hex(3)}@example.invalid'
    call('PATCH', f"/api/collections/users/records/{uid('G')}", SU, {'email': newmail})
    s, x = call('GET', f'/api/collections/members/records/{MG2}', SU)
    check('a changed e-mail is copied to the person record', s == 200 and x.get('email') == newmail, (s, x))
    users['G']['email'] = newmail
    time.sleep(3.2)  # the server allows 2 sign-ins per 3 seconds
    s, o = call('POST', '/api/collections/users/auth-with-password', body={'identity': newmail, 'password': users['G']['pw']})
    old = o.get('token')
    s, x = call('POST', '/api/djuu/logout-all', old)
    check('sign out everywhere answers with a fresh token for this phone', s == 200 and x.get('token'), (s, x))
    time.sleep(3.2)
    s1, _ = call('POST', '/api/collections/users/auth-refresh', old)
    time.sleep(3.2)
    s2, _ = call('POST', '/api/collections/users/auth-refresh', x.get('token'))
    check('… all other sign-ins are gone, the fresh one works', s1 == 401 and s2 == 200, (s1, s2))

    for i in range(5):
        call('POST', '/api/djuu/delete-account', D, {'password': 'wrong-password'})
    s, x = call('POST', '/api/djuu/delete-account', D, {'password': users['D']['pw']})
    check('5 wrong passwords lock deleting for a while', s == 429 and code(x) == 'too_many_attempts', (s, x))

    # a second admin leaves: the Wir stays, what they saved stays
    s, x = call('POST', '/api/djuu/member', A, {'id': MB, 'admin': True})
    check('A makes B second admin', s == 200, x)
    s, x = call('POST', '/api/djuu/member', B, {'id': MA, 'admin': False})
    check('the second admin cannot demote the founder', s == 400 and code(x) == 'founder', (s, x))
    s, x = call('POST', '/api/djuu/member', A, {'id': MA, 'admin': False})
    check('the founder cannot step down without handing over', s == 400 and code(x) == 'founder', (s, x))
    s, x = call('POST', '/api/djuu/member', A, {'id': MB, 'admin': False})
    check('with two admins one can step down', s == 200, x)
    s, x = call('POST', '/api/djuu/member', A, {'id': MB, 'admin': True})
    check('A makes B admin again', s == 200, x)
    s, sb = call('POST', '/api/collections/saved_offers/records', B, {'family': FAM, 'offer_id': 'of_b', 'snap': {'title': 'Schwimmkurs'}, 'saved_by': MB})
    s, x = call('POST', '/api/djuu/delete-account', A, {'password': 'wrong-password'})
    check('deleting needs the password', s == 400 and code(x) == 'wrong_password', (s, x))
    s, x = call('POST', '/api/djuu/delete-account', B, {'password': users['B']['pw']})
    check('a second admin leaves without deleting the Wir', s == 200 and x.get('wir_deleted') is False, x)
    s, x = call('GET', f"/api/collections/saved_offers/records/{sb.get('id')}", A)
    check('what the leaving person saved stays in the Wir', s == 200 and x.get('saved_by') == '', (s, x))
    s, x = call('GET', f"/api/collections/users/records/{uid('B')}", SU)
    check('the leaving person\'s account is gone', s == 404, (s, x))
    s, x = call('POST', '/api/djuu/delete-account', A, {'password': users['A']['pw']})
    check('the last admin deletes the account: the whole Wir is gone', s == 200 and x.get('wir_deleted') is True, x)
    s, x = call('GET', f'/api/collections/families/records/{FAM}', SU)
    check('family deleted', s == 404, x)
    left = [call('GET', f"/api/collections/users/records/{users[k]['id']}", SU) for k in 'EF']  # one of them had joined
    check('the other members keep their accounts without a Wir', all(s == 200 and not x.get('member') for s, x in left), left)

    # =====================================================================================================================
    # Round 2 (21 Nov 2026): community + moderation, export, e-mails, founder, calendar language, push, alerts.
    # Test items use a place id that does not exist in the app's data, so nothing shows up in the real app.
    # =====================================================================================================================
    TEST_PLACE = 'dj_test000000000'

    def multipart(method, path, token, fields, files):
        """files: [(field, filename, content_type, bytes)]"""
        bnd = '----djuu' + secrets.token_hex(8)
        out = b''
        for k, v in fields.items():
            out += f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n'.encode() + (v if isinstance(v, bytes) else str(v).encode()) + b'\r\n'
        for k, fn, ct, data in files:
            out += f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode() + data + b'\r\n'
        out += f'--{bnd}--\r\n'.encode()
        req = urllib.request.Request(BASE + path, method=method, data=out, headers={'Content-Type': f'multipart/form-data; boundary={bnd}', **({'Authorization': token} if token else {})})
        for _ in range(6):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return r.status, json.loads(r.read().decode() or '{}')
            except urllib.error.HTTPError as e:
                d = e.read().decode()
                try: x = json.loads(d)
                except Exception: x = d
                if e.code == 429 and not (isinstance(x, dict) and x.get('code') == 'too_many_attempts'):
                    time.sleep(5.2); continue
                return e.code, x
            except (ConnectionResetError, ConnectionAbortedError, urllib.error.URLError):
                time.sleep(5.2); continue  # the server may drop the connection of a refused upload before reading it
        return 429, {}

    def get_bytes(url):
        path = '/api/' + url.split('/api/', 1)[1]  # the answer names the public host; fetch the same path from here
        try:
            with urllib.request.urlopen(BASE + path, timeout=30) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, b''

    def raw_get(path, token=None, headers=None):
        req = urllib.request.Request(BASE + path, headers={**({'Authorization': token} if token else {}), **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read().decode(), dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(), dict(e.headers)

    def raw_post(path, body, headers):
        req = urllib.request.Request(BASE + path, method='POST', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', **headers})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode() or '{}')
        except urllib.error.HTTPError as e:
            d = e.read().decode()
            try: return e.code, json.loads(d)
            except Exception: return e.code, d

    import base64
    JPEG = base64.b64decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCjRRRXz59kf//Z')
    PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAGklEQVR4nGM8EaDBQApgIkk1w6gG4sBwCFYA+xoBWBKvXVkAAAAASUVORK5CYII=')
    WEBP = base64.b64decode('UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoQAAwAAkA4JaACdLoB+AADsAD+5AF/8WcjEdnm/+hJ2Dg/2gAAAA==')
    GPS = b'GPSLatitude=53.5511;GPSLongitude=9.9937;HOME'
    # a JPEG with an EXIF segment (APP1) and a comment right after the start marker
    app1 = b'Exif\x00\x00' + GPS
    JPEG_EXIF = JPEG[:2] + b'\xff\xe1' + (len(app1) + 2).to_bytes(2, 'big') + app1 + b'\xff\xfe' + (len(GPS) + 2).to_bytes(2, 'big') + GPS + JPEG[2:]
    import zlib
    def png_chunk(t, d): return len(d).to_bytes(4, 'big') + t + d + zlib.crc32(t + d).to_bytes(4, 'big')
    PNG_META = PNG[:33] + png_chunk(b'tEXt', b'Comment\x00' + GPS) + png_chunk(b'eXIf', b'MM\x00*' + GPS) + PNG[33:]
    # a WebP with VP8X (EXIF flag) and an EXIF chunk
    vp8 = WEBP[12:]
    vp8x = b'VP8X' + (10).to_bytes(4, 'little') + bytes([0x08, 0, 0, 0]) + (15).to_bytes(3, 'little') + (11).to_bytes(3, 'little')
    exif = b'EXIF' + len(GPS).to_bytes(4, 'little') + GPS + (b'\x00' if len(GPS) % 2 else b'')
    body = b'WEBP' + vp8x + vp8 + exif
    WEBP_META = b'RIFF' + len(body).to_bytes(4, 'little') + body

    for k in ('P', 'Q', 'R', 'S', 'T', 'M', 'U'):
        mkuser(k)
    P, Q, R, S, T, M, U = (users[k]['token'] for k in ('P', 'Q', 'R', 'S', 'T', 'M', 'U'))
    uidr = lambda k: users[k]['id']

    # ---- creating: who may, what is stored ----
    contrib = lambda tok, k, kind, data, place=TEST_PLACE, **extra: create('/api/collections/contributions/records', tok, {'user': uidr(k), 'kind': kind, 'place_id': place, 'data': data, **extra})
    s, x = call('POST', '/api/collections/contributions/records', None, {'user': uidr('P'), 'kind': 'info', 'place_id': TEST_PLACE, 'data': {'hours': 'Mo 9-10'}})
    check('community: guests cannot send', s in (400, 401, 403), (s, x))
    s, x = contrib(P, 'P', 'info', {'attrs': {'wickeltisch': 'yes'}, 'ages': ['0-2'], 'hours': 'Mo-Fr 09:00-18:00'}, status='approved')
    check('community: nobody sends an item as approved', s in (400, 403), (s, x))
    s, x = contrib(P, 'P', 'info', {'attrs': {'wickeltisch': 'yes'}, 'ages': ['0-2'], 'hours': 'Mo-Fr 09:00-18:00'}, mod_note='ok')
    s2, x2 = call('GET', f"/api/collections/contributions/records/{x.get('id')}", SU) if s == 200 else (0, {})
    check('community: nobody writes the moderation note', s in (400, 403) or (s == 200 and x2.get('mod_note') == ''), (s, x, x2.get('mod_note')))
    if s == 200: call('DELETE', f"/api/collections/contributions/records/{x['id']}", SU)
    s, x = create('/api/collections/contributions/records', P, {'user': uidr('Q'), 'kind': 'info', 'place_id': TEST_PLACE, 'data': {'hours': 'Mo 9-10'}})
    check('community: nobody sends in someone else\'s name', s in (400, 403), (s, x))
    s, info1 = contrib(P, 'P', 'info', {'attrs': {'wickeltisch': 'yes', 'hund': 'leashed'}, 'ages': ['0-2', '3-6'], 'hours': 'Mo-Fr 09:00-18:00', 'evil': '<script>', 'user': 'x'})
    check('community: Ergänzen is stored as pending, unknown keys dropped', s == 200 and info1.get('status') == 'pending' and set(info1.get('data', {})) == {'attrs', 'ages', 'hours'}, (s, info1))
    s, x = contrib(P, 'P', 'info', {'attrs': {'wickeltisch': 'no', 'stillen': 'unknown', 'nonsense_q': 'yes', 'hund': 'leashed'}})
    check('community: "Weiß nicht" and unknown questions are dropped, dogs may be "Leine"', s == 200 and x['data']['attrs'] == {'wickeltisch': 'no', 'hund': 'leashed'}, (s, x))
    if s == 200: call('DELETE', f"/api/collections/contributions/records/{x['id']}", SU)
    s, x = contrib(P, 'P', 'new_place', {'name': 'Spielplatz Umland', 'cat': 'spielplatz', 'lat': 52.70, 'lon': 11.45}, place='')
    check('community: new places in the shared box (Hamburg + Umland, about 100 km)', s == 200, (s, x))
    if s == 200: call('DELETE', f"/api/collections/contributions/records/{x['id']}", SU)
    for bad, why in ((('info', {'attrs': {'wickeltisch': '<b>yes</b>'}}), 'an answer must be a short word'), (('info', {'ages': ['0-2'] * 11}), 'at most 10 age groups'),
                     (('info', {'attrs': {'wickeltisch': 'unknown', 'hund': 'unknown'}}), 'only "Weiß nicht" says nothing'), (('info', {'attrs': {'wickeltisch': 'maybe'}}), 'answers from the app\'s list only'),
                     (('info', {'attrs': {'wickeltisch': 'leashed'}}), '"Leine" only for dogs'), (('info', {'ages': ['1-99']}), 'age groups from the app\'s list only'),
                     (('new_place', {'name': 'Ort', 'cat': 'museum', 'lat': 53.5, 'lon': 10.0}), 'new places only in the app\'s categories'),
                     (('info', {}), 'Ergänzen needs at least one answer'), (('review', {'stars': 7, 'text': 'x'}), 'stars 0-5'), (('review', {'stars': 2.5}), 'stars are whole numbers'),
                     (('report', {'target': 'not-an-id', 'reason': 'x'}), 'a report names a real item'), (('nonsense', {}), 'unknown kind')):
        s, x = contrib(P, 'P', bad[0], bad[1])
        check(f'community: refused – {why}', s == 400, (s, x))
    s, x = contrib(P, 'P', 'info', {'hours': 'x' * 9000})
    check('community: data over 8000 bytes refused', s == 400, (s, str(x)[:120]))
    s, x = contrib(P, 'P', 'info', {'hours': 'Mo 9-10'}, place='')
    check('community: Ergänzen needs a place', s == 400, (s, x))
    s, x = contrib(P, 'P', 'info', {'hours': 'Mo 9-10'}, place='dj_x" OR 1=1')
    check('community: place id is a plain id', s == 400, (s, x))
    s, x = contrib(P, 'P', 'new_place', {'name': 'Spielplatz Test', 'cat': 'spielplatz', 'lat': 48.1, 'lon': 11.5}, place='')
    check('community: a new place must be in or near Hamburg', s == 400, (s, x))
    s, x = contrib(P, 'P', 'new_place', {'name': 'Spielplatz Test', 'cat': 'spielplatz', 'lat': 53.55, 'lon': 9.99})
    check('community: a new place has no place id', s == 400, (s, x))
    s, np1 = contrib(P, 'P', 'new_place', {'name': '  Spielplatz Test  ', 'cat': 'spielplatz', 'type': 'spielplatz', 'lat': '53.55', 'lon': 9.99, 'attrs': {'schatten': 'yes'}, 'ages': ['3-6'], 'hours': ''}, place='')
    check('community: a new place is stored (name trimmed, numbers as numbers)', s == 200 and np1['data']['name'] == 'Spielplatz Test' and np1['data']['lat'] == 53.55, (s, np1))
    s, rv1 = contrib(P, 'P', 'review', {'stars': 4, 'text': 'Schön\u0000 ' + 'a' * 1200})
    check('community: a review is cut to 1000 characters, control characters removed', s == 200 and len(rv1['data']['text']) == 1000 and '\u0000' not in rv1['data']['text'], (s, str(rv1)[:200]))

    # ---- photos: types, count, metadata removed ----
    s, x = contrib(P, 'P', 'photo', {'caption': 'x'})
    check('community: a photo item needs a photo', s == 400 and code(x) == 'photo_required', (s, x))
    # a phone JPEG: EXIF with GPS, a second embedded image with its own EXIF after the end of the first, and a motion video
    second = JPEG[:2] + b'\xff\xe1' + (len(app1) + 2).to_bytes(2, 'big') + app1 + JPEG[2:]
    video = b'\x00\x00\x00\x18ftypmp42' + b'\xa9xyz+53.5511+009.9937/' * 4
    s, ph1 = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': json.dumps({'caption': 'Rutsche'})},
                       [('photos', 'a.jpg', 'image/jpeg', JPEG_EXIF), ('photos', 'b.jpg', 'image/jpeg', JPEG_EXIF + second + video), ('photos', 'c.jpg', 'image/jpeg', JPEG)])
    check('community: three JPEG photos are accepted', s == 200 and len(ph1.get('photos', [])) == 3 and ph1.get('status') == 'pending', (s, ph1))
    stored = []
    if s == 200:
        for name in ph1['photos']:
            st, b = get_bytes(f"{BASE}/api/files/contributions/{ph1['id']}/{name}")
            stored.append((st, b))
    check('community: stored photos carry no GPS / EXIF / text metadata', len(stored) == 3 and all(st == 200 and b'GPSLatitude' not in b and b'Exif\x00' not in b for st, b in stored), [(st, len(b)) for st, b in stored])
    check('community: data after the end of the image (second image, motion video) is cut off', len(stored) == 3 and all(b.endswith(b'\xff\xd9') and b.count(b'\xff\xd8') == 1 and b'53.5511' not in b for _, b in stored)
          and len(stored[1][1]) == len(JPEG_EXIF), [len(b) for _, b in stored])
    check('community: the cleaned photos are still JPEGs of the same size', len(stored) == 3 and all(b[:2] == b'\xff\xd8' for _, b in stored) and len(stored[0][1]) == len(JPEG_EXIF), [b[:4] for _, b in stored])
    for data, ct, why in ((PNG_META, 'image/png', 'PNG'), (WEBP_META, 'image/webp', 'WebP'), (PNG_META, 'image/jpeg', 'PNG named .jpg')):
        s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'}, [('photos', 'x.' + ct[6:], ct, data)])
        check(f'community: JPEG only – {why} refused', s == 400, (s, x))
    if s == 200:
        st, _ = get_bytes(f"{BASE}/api/files/contributions/{ph1['id']}/{ph1['photos'][0]}?thumb=400x0")
        check('community: a thumbnail is made from the cleaned photo', st == 200, st)
    s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'},
                     [('photos', 'x.jpg', 'image/jpeg', b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')])
    check('community: an SVG/HTML file named .jpg is refused', s == 400, (s, x))
    s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'},
                     [('photos', f'{i}.jpg', 'image/jpeg', JPEG) for i in range(4)])
    check('community: at most 3 photos', s == 400, (s, x))
    s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'info', 'place_id': TEST_PLACE, 'data': json.dumps({'hours': 'Mo 9-10'})},
                     [('photos', 'a.jpg', 'image/jpeg', JPEG)])
    check('community: no photos on Ergänzen', s == 400 and code(x) == 'too_many_photos', (s, x))
    t0 = time.time()
    s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'},
                     [('photos', 'big.jpg', 'image/jpeg', JPEG[:-2] + b'\x00' * (1536 * 1024) + b'\xff\xd9')])
    check('community: a photo over 1.5 MB is refused (before it is read)', s in (400, 413) and (s == 413 or code(x) == 'photo_too_big'), (s, str(x)[:120]))
    many = JPEG[:2] + b'\xff\xfe\x00\x02' * 70 + JPEG[2:]
    s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'}, [('photos', 'm.jpg', 'image/jpeg', many)])
    check('community: a JPEG with more than 64 segments is refused', s == 400 and code(x) == 'invalid_photo', (s, x))
    s, x = multipart('POST', '/api/collections/contributions/records', P, {'user': uidr('P'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'}, [('photos', 'e.jpg', 'image/jpeg', JPEG[:-2])])
    check('community: a JPEG without its end is refused', s == 400 and code(x) == 'invalid_photo', (s, x))
    # M3: photos cannot be added to a waiting item later (the daily photo limit counts sent items)
    s, rvp = contrib(P, 'P', 'review', {'stars': 3, 'text': 'ohne Foto'})
    s, x = multipart('PATCH', f"/api/collections/contributions/records/{rvp.get('id')}", P, {}, [('photos', 'a.jpg', 'image/jpeg', JPEG)] * 3)
    s2, x2 = call('GET', f"/api/collections/contributions/records/{rvp.get('id')}", P)
    check('community: photos cannot be added to a waiting item afterwards', s == 400 and code(x) == 'photo_locked' and x2.get('photos') == [], (s, x, x2.get('photos')))
    s, x = multipart('PATCH', f"/api/collections/contributions/records/{rvp.get('id')}", P, {}, [('photos+', 'a.jpg', 'image/jpeg', JPEG)])
    check('community: … also not appended', s == 400 and code(x) == 'photo_locked', (s, x))
    call('DELETE', f"/api/collections/contributions/records/{rvp.get('id')}", P)

    # ---- own records only ----
    s, l = call('GET', '/api/collections/contributions/records', Q)
    check('community: others do not see my waiting items', s == 200 and l['totalItems'] == 0, l)
    s, x = call('GET', f"/api/collections/contributions/records/{info1['id']}", Q)
    check('community: … not even by id', s == 404, (s, x))
    s, x = call('PATCH', f"/api/collections/contributions/records/{info1['id']}", Q, {'data': {'hours': 'hacked'}})
    check('community: others cannot change my item', s == 404, (s, x))
    s, x = call('DELETE', f"/api/collections/contributions/records/{info1['id']}", Q)
    check('community: others cannot delete my item', s == 404, (s, x))
    s, x = call('PATCH', f"/api/collections/contributions/records/{info1['id']}", P, {'status': 'approved'})
    check('community: nobody approves their own item', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/contributions/records/{info1['id']}", P, {'kind': 'review'})
    check('community: the kind is fixed', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/contributions/records/{info1['id']}", P, {'data': {'hours': 'Sa 10-12', 'attrs': {'wickeltisch': 'no'}}})
    check('community: I change my waiting item (checked again)', s == 200 and x['data']['hours'] == 'Sa 10-12' and x['status'] == 'pending', (s, x))
    s, x = call('PATCH', f"/api/collections/contributions/records/{info1['id']}", P, {'data': {'attrs': {'x': '<img>'}}})
    check('community: … with the same checks', s == 400, (s, x))

    # ---- moderators ----
    s, x = call('GET', '/api/djuu/mod/queue', P)
    check('moderation: not for normal accounts', s == 403 and code(x) == 'mod_only', (s, x))
    s, x = call('GET', '/api/djuu/mod/queue')
    check('moderation: not for guests', s == 401, (s, x))
    s, x = call('POST', '/api/djuu/mod/decide', P, {'id': info1['id'], 'status': 'approved'})
    check('moderation: normal accounts cannot decide', s == 403, (s, x))
    s, x = call('PATCH', f"/api/collections/users/records/{uidr('P')}", P, {'is_mod': True})
    check('moderation: nobody makes themselves a moderator', s in (400, 403, 404), (s, x))
    mm = f'test-mod-{secrets.token_hex(3)}@example.invalid'
    s, x = call('POST', '/api/collections/users/records', body={'email': mm, 'password': 'Passwort-123456', 'passwordConfirm': 'Passwort-123456', 'is_mod': True})
    check('moderation: … also not on sign-up', s == 400, (s, x))
    if s == 200: users['modsignup'] = {'id': x['id']}
    call('PATCH', f"/api/collections/users/records/{uidr('M')}", SU, {'is_mod': True})
    call('PATCH', f"/api/collections/users/records/{uidr('P')}", SU, {'name': 'Paula P.'})
    st, qtext, _ = raw_get('/api/djuu/mod/queue', M)
    q = json.loads(qtext) if st == 200 else {}
    mine = {i['id']: i for i in q.get('items', [])}
    check('moderation: the queue shows waiting items, oldest first, with a display name', st == 200 and info1['id'] in mine and mine[info1['id']]['user_name'] == 'Paula P.'
          and [i['created'] for i in q['items']] == sorted(i['created'] for i in q['items']), (st, qtext[:300]))
    check('moderation: the queue never contains e-mail addresses or account ids', users['P']['email'] not in qtext and uidr('P') not in qtext, '')
    check('moderation: photo items come with photo and thumbnail links', ph1.get('id') in mine and len(mine[ph1['id']]['photos']) == 3 and '?thumb=400x0' in mine[ph1['id']]['photos'][0]['thumb'], mine.get(ph1.get('id')))
    check('moderation: a new place comes with the community places within 100 m (none yet)', np1['id'] in mine and mine[np1['id']].get('near') == [], mine.get(np1['id']))

    s, c0 = call('GET', '/api/djuu/community')
    check('community list: public, nothing waiting in it', s == 200 and c0.get('ok') and all(i['id'] not in (info1['id'], rv1['id']) for i in c0['items']), (s, str(c0)[:200]))
    T0 = c0.get('until')
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': rv1['id'], 'status': 'approved', 'data': {'stars': 9, 'text': 'x'}})
    s2, x2 = call('GET', f"/api/collections/contributions/records/{rv1['id']}", SU)
    check('moderation: edited data is checked too (nothing changes on error)', s == 400 and x2.get('status') == 'pending', (s, x, x2.get('status')))
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': rv1['id'], 'status': 'maybe'})
    check('moderation: only approve or reject', s == 400, (s, x))
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': 'aaaaaaaaaaaaaaa', 'status': 'approved'})
    check('moderation: unknown item', s == 404, (s, x))
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': rv1['id'], 'status': 'approved', 'note': 'gekürzt', 'data': {'stars': 4, 'text': 'Schön hier, viel Schatten.'}})
    check('moderation: approve with edited text', s == 200, (s, x))
    for cid in (info1['id'], ph1.get('id')):
        call('POST', '/api/djuu/mod/decide', M, {'id': cid, 'status': 'approved'})
    st, ctext, hdr = raw_get(f'/api/djuu/community?since={T0}')
    c1 = json.loads(ctext) if st == 200 else {}
    byid = {i['id']: i for i in c1.get('items', [])}
    check('community list: approved items appear (since)', st == 200 and {rv1['id'], info1['id'], ph1.get('id')} <= set(byid) and byid[rv1['id']]['data']['text'] == 'Schön hier, viel Schatten.', (st, ctext[:300]))
    check('community list: never the person (no account id, name or e-mail)', uidr('P') not in ctext and 'Paula' not in ctext and users['P']['email'] not in ctext and all('user' not in i for i in c1.get('items', [])), ctext[:300])
    check('community list: photos as thumbnail links only, approval time', ph1.get('id') in byid and len(byid[ph1['id']]['photos']) == 3 and all(p.endswith('?thumb=400x0') for p in byid[ph1['id']]['photos'])
          and byid[rv1['id']]['approved'] == time.strftime('%Y-%m'), (byid.get(ph1.get('id')), byid.get(rv1['id'], {}).get('approved')))
    check('community list: cacheable', 'max-age' in hdr.get('Cache-Control', ''), hdr.get('Cache-Control'))
    s, x = call('GET', '/api/djuu/community?since=yesterday')
    check('community list: a broken since is refused', s == 400, (s, x))
    s, x = call('PATCH', f"/api/collections/contributions/records/{rv1['id']}", P, {'data': {'stars': 1, 'text': 'changed after approval'}})
    check('community: an approved item cannot be changed by its author', s in (400, 403, 404), (s, x))
    s, x = call('DELETE', f"/api/collections/contributions/records/{rv1['id']}", P)
    check('community: … nor deleted', s in (400, 403, 404), (s, x))

    # ---- reports: three different people hide a review until a moderator decides ----
    T1 = c1.get('until')
    s, x = contrib(Q, 'Q', 'report', {'target': np1['id'], 'reason': 'x'}, place='')
    check('reports: only approved items can be reported', s == 404, (s, x))
    s, rq = contrib(Q, 'Q', 'report', {'target': rv1['id'], 'reason': 'Beleidigend'}, place='')
    check('reports: a report is stored (place taken from the item)', s == 200 and rq.get('place_id') == TEST_PLACE and rq.get('target') == rv1['id'], (s, rq))
    s, x = contrib(Q, 'Q', 'report', {'target': rv1['id'], 'reason': 'nochmal'}, place='')
    check('reports: the same person reports an item once', s == 400 and code(x) == 'already_reported', (s, x))
    contrib(R, 'R', 'report', {'target': rv1['id'], 'reason': 'Spam'}, place='')
    s, c2 = call('GET', f'/api/djuu/community?since={T1}')
    s3, c3 = call('GET', '/api/djuu/community')
    check('reports: two reports do not hide it yet', rv1['id'] not in c2.get('removed', []) and any(i['id'] == rv1['id'] for i in c3.get('items', [])), (c2, ))
    s, rs = contrib(S, 'S', 'report', {'target': rv1['id'], 'reason': 'Falsch'}, place='')
    s, c2 = call('GET', f'/api/djuu/community?since={T1}')
    s3, c3 = call('GET', '/api/djuu/community')
    check('reports: the third reporter hides it (removed for phones that have it, gone from the full list)', rv1['id'] in c2.get('removed', []) and all(i['id'] != rv1['id'] for i in c3.get('items', [])), (c2.get('removed'), ))
    s, q2 = call('GET', '/api/djuu/mod/queue', M)
    rep = [i for i in q2.get('items', []) if i['kind'] == 'report' and i.get('target', {}) and i['target'].get('id') == rv1['id']]
    check('reports: the moderator sees the reports with the reported text and the count', len(rep) == 3 and rep[0]['target']['reporters'] == 3 and rep[0]['target']['data']['text'], rep[:1])
    T2 = c2.get('until')
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': rv1['id'], 'status': 'approved', 'note': 'in Ordnung'})
    s, c4 = call('GET', f'/api/djuu/community?since={T2}')
    s, q3 = call('GET', '/api/djuu/mod/queue', M)
    check('reports: the moderator keeps it: visible again, the reports are closed', any(i['id'] == rv1['id'] for i in c4.get('items', [])) and rv1['id'] not in c4.get('removed', [])
          and not [i for i in q3.get('items', []) if i.get('target') and i['target'].get('id') == rv1['id']], (c4, ))
    s, rp = contrib(T, 'T', 'report', {'target': ph1.get('id'), 'reason': 'Personen erkennbar'}, place='')
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': rp.get('id'), 'status': 'approved', 'note': 'Gesichter'})
    s, c5 = call('GET', f'/api/djuu/community?since={T2}')
    s2, x2 = call('GET', f"/api/collections/contributions/records/{ph1.get('id')}", SU)
    st, _ = get_bytes(f"{BASE}/api/files/contributions/{ph1.get('id')}/{ph1['photos'][0]}") if ph1.get('photos') else (0, b'')
    check('reports: a report that is right removes the item and deletes its photos', ph1.get('id') in c5.get('removed', []) and x2.get('status') == 'rejected' and x2.get('photos') == [] and st == 404, (c5.get('removed'), x2.get('status'), x2.get('photos'), st))
    s, x = call('GET', f"/api/collections/contributions/records/{ph1.get('id')}", P)
    check('reports: the author sees the decision, but not the moderator\'s note (K5)', s == 200 and x.get('status') == 'rejected' and 'mod_note' not in x and 'decided_by' not in x, (s, x))
    s, x = call('GET', f"/api/collections/contributions/records/{ph1.get('id')}", SU)
    check('reports: … the note and who decided stay on the server', x.get('mod_note') == 'Gesichter' and x.get('decided_by') == uidr('M'), (x.get('mod_note'), x.get('decided_by')))
    s, rp2 = contrib(Q, 'Q', 'report', {'target': 'place', 'reason': 'Geschlossen'})
    check('reports: a place can be reported too', s == 200 and rp2.get('target') == 'place', (s, rp2))
    s, c6 = call('GET', '/api/djuu/community')
    check('community list: reports are never public', all(i['kind'] != 'report' for i in c6.get('items', [])), '')

    # ---- fix round 21 Nov: "Behalten", new places, near, own delete, self-approval, failed uploads ----
    for k in ('V', 'W', 'Y'):
        mkuser(k)
    V, W, Y = (users[k]['token'] for k in ('V', 'W', 'Y'))
    s, rvV = contrib(V, 'V', 'review', {'stars': 5, 'text': 'Toller Spielplatz'})
    call('POST', '/api/djuu/mod/decide', M, {'id': rvV['id'], 'status': 'approved'})
    for tok, k in ((R, 'R'), (S, 'S'), (T, 'T')):
        contrib(tok, k, 'report', {'target': rvV['id'], 'reason': 'Spam'}, place='')
    s, ch = call('GET', f'/api/djuu/community?since={T2}')
    TK = ch.get('until')
    hidden_now = rvV['id'] in ch.get('removed', [])
    s, qk = call('GET', '/api/djuu/mod/queue', M)
    reps = [i for i in qk.get('items', []) if i['kind'] == 'report' and (i.get('target') or {}).get('id') == rvV['id']]
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': reps[0]['id'] if reps else '', 'status': 'rejected', 'note': 'passt'})
    s2, qk2 = call('GET', '/api/djuu/mod/queue', M)
    s3, ck = call('GET', f'/api/djuu/community?since={TK}')
    check('reports: "Behalten" (dismissing one report) closes every open report on the item', hidden_now and len(reps) == 3 and s == 200
          and not [i for i in qk2.get('items', []) if (i.get('target') or {}).get('id') == rvV['id']], (hidden_now, len(reps), s, x))
    check('reports: … and the kept item comes back to phones that dropped it (?since)', any(i['id'] == rvV['id'] for i in ck.get('items', [])) and rvV['id'] not in ck.get('removed', []), ck)

    # a new place: duplicates nearby, the name for items about it, rejecting closes what others sent about it
    s, npV = contrib(V, 'V', 'new_place', {'name': 'Spielplatz am Teich', 'cat': 'spielplatz', 'lat': 53.60000, 'lon': 10.05000}, place='')
    call('POST', '/api/djuu/mod/decide', M, {'id': npV['id'], 'status': 'approved'})
    s, npW = contrib(W, 'W', 'new_place', {'name': 'Spielplatz Teich', 'cat': 'spielplatz', 'lat': 53.60020, 'lon': 10.05010}, place='')
    s, npF = contrib(W, 'W', 'new_place', {'name': 'Café Weit weg', 'cat': 'cafe', 'lat': 53.61000, 'lon': 10.05000}, place='')
    s, rvW = contrib(W, 'W', 'review', {'stars': 4, 'text': 'schön'}, place='u_' + npV['id'])
    s, rvP = contrib(P, 'P', 'review', {'stars': 2, 'text': 'naja'}, place='u_' + npW['id'])
    s, inW = contrib(Y, 'Y', 'info', {'attrs': {'schatten': 'yes'}}, place='u_' + npW['id'])
    s, qn = call('GET', '/api/djuu/mod/queue', M)
    qi = {i['id']: i for i in qn.get('items', [])}
    near = (qi.get(npW['id']) or {}).get('near') or []
    check('moderation: a new place lists community places within 100 m, a similar name flagged', len(near) == 1 and near[0]['id'] == npV['id'] and near[0]['similar'] is True and 15 <= near[0]['dist'] <= 35
          and 'user' not in near[0], near)
    check('moderation: … places further away are not listed', (qi.get(npF['id']) or {}).get('near') == [], (qi.get(npF['id']) or {}).get('near'))
    check('moderation: items about a community place carry its name', (qi.get(rvW['id']) or {}).get('place_name') == 'Spielplatz am Teich' and (qi.get(rvP['id']) or {}).get('place_name') == 'Spielplatz Teich', (qi.get(rvW['id']), ))
    call('POST', '/api/djuu/mod/decide', M, {'id': npW['id'], 'status': 'rejected', 'note': 'doppelt'})
    st = [call('GET', f"/api/collections/contributions/records/{i}", SU)[1].get('status') for i in (rvP['id'], inW['id'])]
    check('moderation: rejecting a new place also rejects what others sent about it', st == ['rejected', 'rejected'], st)
    call('DELETE', f"/api/collections/contributions/records/{npF['id']}", W)

    # the author deletes an own item in any state (K3)
    call('POST', '/api/djuu/mod/decide', M, {'id': rvW['id'], 'status': 'approved'})
    s, cd0 = call('GET', '/api/djuu/community')
    TD = cd0.get('until')
    s, x = call('POST', '/api/djuu/contrib-delete', W, {'id': npV['id']})
    check('own delete: nobody deletes someone else\'s item', s == 404, (s, x))
    s, x = call('POST', '/api/djuu/contrib-delete', None, {'id': npV['id']})
    check('own delete: not without signing in', s == 401, (s, x))
    s, x = call('POST', '/api/djuu/contrib-delete', V, {'id': npV['id']})
    s2, cd1 = call('GET', f'/api/djuu/community?since={TD}')
    s3, x3 = call('GET', f"/api/collections/contributions/records/{rvW['id']}", SU)
    check('own delete: the author deletes a published new place; it leaves every phone', s == 200 and npV['id'] in cd1.get('removed', []) and s2 == 200, (s, x, cd1.get('removed')))
    check('own delete: … reviews of others about that place leave too', x3.get('status') == 'rejected' and rvW['id'] in cd1.get('removed', []), (x3.get('status'), cd1.get('removed')))
    s, pend = contrib(V, 'V', 'info', {'hours': 'Mo 8-9'})
    s, x = call('POST', '/api/djuu/contrib-delete', V, {'id': pend.get('id')})
    s2, _ = call('GET', f"/api/collections/contributions/records/{pend.get('id')}", SU)
    check('own delete: … and a waiting one', s == 200 and s2 == 404, (s, s2))

    # a moderator may decide on their own item (perhaps the only moderator); who decided is noted
    s, own = contrib(M, 'M', 'info', {'attrs': {'hochstuhl': 'yes'}})
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': own.get('id'), 'status': 'approved'})
    s2, x2 = call('GET', f"/api/collections/contributions/records/{own.get('id')}", SU)
    check('moderation: self-approval is allowed and noted (decided_by)', s == 200 and x2.get('status') == 'approved' and x2.get('decided_by') == uidr('M'), (s, x, x2.get('decided_by')))
    s, x = call('POST', '/api/djuu/mod/decide', M, {'id': own.get('id'), 'status': 'approved', 'data': {'attrs': {'hochstuhl': 'vielleicht'}}})
    check('moderation: edited answers are checked against the app\'s values too', s == 400, (s, x))

    # failed uploads are counted: after 10 refused photos within an hour the next upload waits, without being read
    fails = []
    for i in range(11):
        s, x = multipart('POST', '/api/collections/contributions/records', Y, {'user': uidr('Y'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'}, [('photos', 'x.jpg', 'image/jpeg', PNG_META)])
        fails.append((s, code(x)))
    s, x = multipart('POST', '/api/collections/contributions/records', Y, {'user': uidr('Y'), 'kind': 'photo', 'place_id': TEST_PLACE, 'data': '{}'}, [('photos', 'ok.jpg', 'image/jpeg', JPEG)])
    check('photos: after 10 refused uploads the account waits (429), also with a good photo', fails[:10] == [(400, 'invalid_photo')] * 10 and fails[10] == (429, 'too_many_attempts') and s == 429, (fails, s, x))
    s, x = contrib(Y, 'Y', 'review', {'stars': 4, 'text': 'ohne Foto geht es weiter'})
    check('photos: … items without photos still go through', s == 200, (s, x))

    # ---- daily limits ----
    n_np = 0
    for i in range(6):
        s, last = contrib(U, 'U', 'new_place', {'name': f'Ort {i}', 'cat': 'spielplatz', 'lat': 53.5, 'lon': 10.0}, place='')
        if s != 200: break
        n_np += 1
    check('community: at most 5 new places a day', n_np == 5 and code(last) == 'limit_reached', (n_np, last))
    n_all = n_np
    for i in range(40):
        s, last = contrib(U, 'U', 'info', {'hours': f'Mo {i}'})
        if s != 200: break
        n_all += 1
    check('community: at most 40 items a day', n_all == 40 and code(last) == 'limit_reached', (n_all, last))

    # an approved item of a deleted account leaves the public list
    s, rvq = contrib(Q, 'Q', 'review', {'stars': 5, 'text': 'Top'})
    call('POST', '/api/djuu/mod/decide', M, {'id': rvq['id'], 'status': 'approved'})
    s, cq = call('GET', '/api/djuu/community')
    TQ = cq.get('until')
    s, x = call('POST', '/api/djuu/delete-account', Q, {'password': users['Q']['pw']})
    s, c7 = call('GET', f'/api/djuu/community?since={TQ}')
    check('community: deleting the account removes the person\'s items from the public list', s == 200 and rvq['id'] in c7.get('removed', []), (s, c7))

    # =====================================================================================================================
    # Founder, e-mails, export
    # =====================================================================================================================
    for k in ('A2', 'B2', 'H2', 'X2', 'C2'):
        mkuser(k)
    A2, B2, H2, X2, C2 = (users[k]['token'] for k in ('A2', 'B2', 'H2', 'X2', 'C2'))
    s, f2 = call('POST', '/api/djuu/family', A2, {'name': 'Gründer-Wir', 'myName': 'Alma'})
    FAM3, MA2 = f2.get('family'), f2.get('member')
    families.append(FAM3)
    s, fr = call('GET', f'/api/collections/families/records/{FAM3}', A2)
    check('founder: whoever creates the Wir is its founder', s == 200 and fr.get('founder') == MA2, (s, fr))
    s, x = call('PATCH', f'/api/collections/families/records/{FAM3}', A2, {'founder': ''})
    check('founder: not changeable through the records API', s in (400, 403, 404), (s, x))
    MB2 = call('POST', '/api/djuu/join', B2, {'token': call('POST', '/api/djuu/invite', A2)[1]['token'], 'myName': 'Bert'})[1].get('member')
    MH2 = call('POST', '/api/djuu/join', H2, {'token': call('POST', '/api/djuu/invite', A2, {'grp': 'helper'})[1]['token'], 'myName': 'Hilde'})[1].get('member')
    s, kid3 = call('POST', '/api/collections/members/records', A2, {'family': FAM3, 'name': 'Kim', 'kind': 'kid', 'birth_ym': '2023-05', 'birth_day': 9})
    s, xf = call('POST', '/api/djuu/family', X2, {'myName': 'Xaver'})
    families.append(xf.get('family'))
    MX2 = xf.get('member')

    # e-mails
    for who, k in (('helper', 'H2'), ('family member', 'B2'), ('admin', 'A2')):
        s, l = call('GET', '/api/collections/members/records?expand=user', users[k]['token'])
        txt = json.dumps(l)
        others = [users[o]['email'] for o in ('A2', 'B2', 'H2') if o != k]  # (their own account may expand with their own address)
        check(f'e-mails: the records API sends no e-mail address of anyone else ({who})', s == 200 and l.get('items') and all('email' not in m for m in l['items'])
              and not any(o in txt for o in others), txt[:200])
    s, x = call('GET', f'/api/collections/members/records/{MA2}', H2)
    check('e-mails: … not by id either', s == 200 and 'email' not in x, x)
    s, x = call('GET', f"/api/collections/members/records?filter={urllib.parse.quote('email ~ \"@\"')}", H2)
    check('e-mails: … and they cannot be searched for', s in (200, 400) and (s == 400 or x.get('totalItems') == 0), (s, x))
    s, em = call('GET', '/api/djuu/emails', A2)
    check('e-mails: the admin gets everyone\'s address', s == 200 and em['emails'].get(MB2) == users['B2']['email'] and em['emails'].get(MH2) == users['H2']['email'] and em['emails'].get(MA2) == users['A2']['email'], em)
    s, em = call('GET', '/api/djuu/emails', H2)
    check('e-mails: a helper gets only their own address', s == 200 and em['emails'] == {MH2: users['H2']['email']}, em)
    s, em = call('GET', '/api/djuu/emails', B2)
    check('e-mails: a family member who is not admin gets only their own', s == 200 and em['emails'] == {MB2: users['B2']['email']}, em)
    s, em = call('GET', '/api/djuu/emails', X2)
    check('e-mails: an admin of another Wir gets nothing from this one', s == 200 and set(em['emails']) == {MX2}, em)
    s, em = call('GET', '/api/djuu/emails')
    check('e-mails: not without signing in', s == 401, (s, em))

    # founder rules
    call('POST', '/api/djuu/member', A2, {'id': MB2, 'admin': True})
    s, x = call('POST', '/api/djuu/remove', B2, {'id': MA2})
    check('founder: another admin cannot remove the founder', s == 400 and code(x) == 'founder', (s, x))
    s, x = call('POST', '/api/djuu/member', B2, {'id': MA2, 'admin': False})
    check('founder: another admin cannot demote the founder', s == 400 and code(x) == 'founder', (s, x))
    s, x = call('POST', '/api/djuu/member', B2, {'id': MA2, 'until': '2020-01-01'})
    s2, x2 = call('GET', f'/api/collections/members/records/{MA2}', A2)
    check('founder: … nor end the founder\'s access', s2 == 200 and not x2.get('access_until') and x2.get('is_admin'), (s, x, x2.get('access_until')))
    s, x = call('POST', '/api/djuu/founder', B2, {'member': MB2})
    check('founder: only the founder hands over', s == 403 and code(x) == 'founder_only', (s, x))
    s, x = call('POST', '/api/djuu/founder', A2, {'member': MH2})
    check('founder: only to an admin', s == 400 and code(x) == 'founder_needs_admin', (s, x))
    s, x = call('POST', '/api/djuu/founder', A2, {'member': MX2})
    check('founder: not to someone of another Wir', s == 404, (s, x))
    s, x = call('POST', '/api/djuu/founder', A2, {'member': kid3.get('id')})
    check('founder: not to a child', s == 400, (s, x))
    s, x = call('POST', '/api/djuu/founder', A2, {'member': MB2})
    s2, fr = call('GET', f'/api/collections/families/records/{FAM3}', B2)
    check('founder: hands over to another admin', s == 200 and fr.get('founder') == MB2, (s, x, fr.get('founder')))
    s, x = call('POST', '/api/djuu/member', B2, {'id': MA2, 'admin': False})
    check('founder: the old founder can now be made a normal member', s == 200, (s, x))
    call('POST', '/api/djuu/member', B2, {'id': MA2, 'admin': True})
    s, x = call('POST', '/api/djuu/member', A2, {'id': MB2, 'admin': False})
    check('founder: the new founder is protected', s == 400 and code(x) == 'founder', (s, x))
    s, x = call('POST', '/api/djuu/leave', B2)
    s2, fr = call('GET', f'/api/collections/families/records/{FAM3}', A2)
    check('founder: when the founder leaves, the oldest other admin becomes founder', s == 200 and fr.get('founder') == MA2, (s, x, fr.get('founder')))
    MB2 = call('POST', '/api/djuu/join', B2, {'token': call('POST', '/api/djuu/invite', A2)[1]['token'], 'myName': 'Bert'})[1].get('member')
    MC2 = call('POST', '/api/djuu/join', C2, {'token': call('POST', '/api/djuu/invite', A2)[1]['token'], 'myName': 'Carla'})[1].get('member')
    s, x = call('POST', '/api/djuu/leave', A2)
    check('founder: the founder as only admin cannot leave', s == 400 and code(x) == 'last_admin', (s, x))

    # export (also checks what a helper and a family member get)
    call('POST', '/api/collections/shop_items/records', A2, {'family': FAM3, 'name': 'Windeln', 'added_by': MA2})
    s, ow = call('POST', '/api/collections/places/records', B2, {'owner': uidr('B2'), 'name': 'Zuhause', 'plz': '20253'})
    call('POST', '/api/collections/push_subs/records', B2, {'user': uidr('B2'), 'endpoint': 'https://fcm.googleapis.com/fcm/send/test-' + secrets.token_hex(8),
                                                            'keys': {'p256dh': 'BDCZrguB_ZyljgTnk0fFTogtGZqp3Tog4GgKg3EVgzfNKtP6NZO-vpqQkno1aVIPRC0YsnyWeh5C1LyU2yj_730', 'auth': 'BNupwalVgwX6jaANeGKxzg'}, 'topics': ['cal'], 'lang': 'de'})
    contrib(B2, 'B2', 'review', {'stars': 3, 'text': 'ok'})
    st, txt, hdr = raw_get('/api/djuu/export', B2)
    ex = json.loads(txt) if st == 200 else {}
    check('export: a JSON download named djuu-daten.json', st == 200 and 'attachment' in hdr.get('Content-Disposition', '') and 'djuu-daten.json' in hdr.get('Content-Disposition', ''), (st, hdr.get('Content-Disposition')))
    check('export: my account without password hash or token key', ex.get('user', {}).get('email') == users['B2']['email'] and 'password' not in txt and 'tokenKey' not in txt, list(ex.get('user', {}))[:20])
    check('export: my person record, the Wir, its shopping list, my places, contributions and push subscriptions',
          ex.get('wir', {}).get('member', {}).get('id') == MB2 and ex['wir'].get('family', {}).get('id') == FAM3 and any(r['name'] == 'Windeln' for r in ex['wir']['collections'].get('shop_items', []))
          and any(p['name'] == 'Zuhause' for p in ex.get('own_places', [])) and ex.get('contributions') and ex.get('push_subscriptions'), str(ex)[:400])
    check('export: no other adult\'s e-mail, no push keys, no calendar address', users['A2']['email'] not in txt and users['C2']['email'] not in txt and 'p256dh' not in txt
          and 'cal_token' not in txt and ex['push_subscriptions'][0].get('service') == 'fcm.googleapis.com', '')
    st, _, _ = raw_get('/api/djuu/export', B2)
    check('export: not twice within seconds', st == 429, st)
    st, txt, _ = raw_get('/api/djuu/export', H2)
    exh = json.loads(txt) if st == 200 else {}
    check('export (helper): no children\'s records or birth dates, only name and age', st == 200 and '"2023-05"' not in txt and '"birth_day": 9' not in txt and exh['wir'].get('children') and exh['wir']['children'][0]['name'] == 'Kim'
          and all(m.get('kind') == 'adult' for m in exh['wir']['collections'].get('members', [])), txt[:300])
    check('export (helper): no adult\'s e-mail but their own, nothing they may not read', users['A2']['email'] not in txt and users['B2']['email'] not in txt and users['H2']['email'] in txt
          and 'saved_offers' not in exh['wir']['collections'], list(exh.get('wir', {}).get('collections', {})))
    st, txt, _ = raw_get('/api/djuu/export', X2)
    check('export: nothing of another Wir', st == 200 and FAM3 not in txt and 'Windeln' not in txt, '')
    st, _, _ = raw_get('/api/djuu/export')
    check('export: not without signing in', st == 401, st)

    # founder deletes the account while another admin exists: the founder role moves on
    call('POST', '/api/djuu/member', A2, {'id': MC2, 'admin': True})
    s, x = call('POST', '/api/djuu/delete-account', A2, {'password': users['A2']['pw']})
    s2, fr = call('GET', f'/api/collections/families/records/{FAM3}', C2)
    check('founder: deleting the founder\'s account hands the Wir to the oldest other admin', s == 200 and x.get('wir_deleted') is False and fr.get('founder') == MC2, (s, x, fr.get('founder')))

    # =====================================================================================================================
    # Calendar feed in English (C9)
    # =====================================================================================================================
    call('POST', '/api/collections/saved_offers/records', C2, {'family': FAM3, 'offer_id': 'of_en', 'snap': {'title': 'Babyschwimmen', 'kind': 'gruppe', 'weekday': 3, 'time_from': '10:00'}, 'saved_by': MC2})
    tok3 = call('POST', '/api/djuu/calendar', C2)[1].get('token')
    s, de = call('GET', f'/api/djuu/cal/{tok3}.ics', raw=True)
    s2, en = call('GET', f'/api/djuu/cal/{tok3}.ics?lang=en', raw=True)
    check('calendar feed: German by default, English with ?lang=en', s == 200 and s2 == 200 and 'Ohne Gew' in de.replace('\r\n ', '') and 'No guarantee' in en.replace('\r\n ', ''), (s, s2))

    # =====================================================================================================================
    # Push (C5)
    # =====================================================================================================================
    KEYS = {'p256dh': 'BDCZrguB_ZyljgTnk0fFTogtGZqp3Tog4GgKg3EVgzfNKtP6NZO-vpqQkno1aVIPRC0YsnyWeh5C1LyU2yj_730', 'auth': 'BNupwalVgwX6jaANeGKxzg'}
    ep = lambda: 'https://fcm.googleapis.com/fcm/send/test-' + secrets.token_hex(12)
    sub = lambda tok, k, **kw: create('/api/collections/push_subs/records', tok, {'user': uidr(k), 'endpoint': kw.pop('endpoint', None) or ep(), 'keys': kw.pop('keys', KEYS), 'topics': kw.pop('topics', ['pickup']), 'lang': kw.pop('lang', 'de'), **kw})
    s, sb = sub(C2, 'C2', topics=['pickup', 'cal', 'cal'])
    check('push: a subscription is stored, topics cleaned, keys never sent back', s == 200 and sb.get('topics') == ['pickup', 'cal'] and 'keys' not in sb, (s, sb))
    s, x = call('GET', f"/api/collections/push_subs/records/{sb.get('id')}", C2)
    check('push: … not even to the owner', s == 200 and 'keys' not in x, x)
    for bad_ep, why in (('http://fcm.googleapis.com/fcm/send/x', 'http'), ('https://127.0.0.1:8090/api/djuu/push/claim', 'internal address'), ('https://djuu-api:8090/x', 'container name'),
                        ('https://169.254.169.254/latest/meta-data', 'metadata service'), ('https://fcm.googleapis.com.evil.example/x', 'look-alike host'),
                        ('https://user@fcm.googleapis.com/x', 'user in the address'), ('https://evil.example/push', 'unknown host'), ('https://fcm.googleapis.com:8443/x', 'other port')):
        s, x = sub(C2, 'C2', endpoint=bad_ep)
        check(f'push: endpoint refused – {why}', s == 400, (s, x))
    s, x = sub(C2, 'C2', topics=['spam'])
    check('push: unknown topics refused', s == 400, (s, x))
    s, x = sub(C2, 'C2', keys={'p256dh': 'x', 'auth': 'y'})
    check('push: broken keys refused', s == 400, (s, x))
    s, x = create('/api/collections/push_subs/records', C2, {'user': uidr('B2'), 'endpoint': ep(), 'keys': KEYS, 'topics': []})
    check('push: nobody subscribes someone else', s in (400, 403), (s, x))
    s, x = call('PATCH', f"/api/collections/push_subs/records/{sb.get('id')}", C2, {'endpoint': ep()})
    check('push: the endpoint cannot be swapped later', s in (400, 403, 404), (s, x))
    s, x = call('PATCH', f"/api/collections/push_subs/records/{sb.get('id')}", C2, {'topics': ['lists', 'pickup', 'cal']})
    check('push: the owner changes the topics', s == 200 and x.get('topics') == ['lists', 'pickup', 'cal'], (s, x))
    for verb in ('GET', 'PATCH', 'DELETE'):
        s, x = call(verb, f"/api/collections/push_subs/records/{sb.get('id')}", B2, {'topics': []} if verb == 'PATCH' else None)
        check(f'push: others cannot {verb} my subscription', s == 404, (s, x))
    s, l = call('GET', '/api/collections/push_queue/records', C2)
    s2, x2 = call('POST', '/api/collections/push_queue/records', C2, {'user': uidr('C2'), 'topic': 'cal', 'title': 'Spam'})
    check('push: the queue has no API access', s == 403 and s2 == 403, (s, s2))
    s, x = call('GET', '/api/djuu/push/key')
    check('push: the public key route answers (key or "off")', (s == 200 and len(x.get('key', '')) >= 80) or (s == 503 and code(x) == 'push_off'), (s, x))
    s, x = raw_post('/api/djuu/push/claim', {}, {})
    s2, x2 = raw_post('/api/djuu/push/claim', {}, {'X-Djuu-Push': 'x' * 48})
    s3, x3 = raw_post('/api/djuu/push/done', {'gone': [sb.get('id')]}, {'X-Djuu-Push': 'x' * 48})
    check('push: the sender routes answer 404 without the secret', s == 404 and s2 == 404 and s3 == 404, (s, s2, s3))
    SECRET = os.environ.get('DJUU_PUSH_SECRET', '')
    if SECRET:
        s, x = raw_post('/api/djuu/push/claim', {}, {'X-Djuu-Push': SECRET, 'X-Forwarded-For': '1.2.3.4'})
        check('push: … and not through the proxy even with the secret', s == 404, (s, x))
    # Bringen/Abholen: C2 plans a pickup for B2 (subscribed to pickup) -> B2 gets a message, C2 (who made it) none
    sub(B2, 'B2', topics=['pickup', 'cal'])
    s, kid4 = call('POST', '/api/collections/members/records', C2, {'family': FAM3, 'name': 'Ole', 'kind': 'kid'})
    s, pk = call('POST', '/api/collections/cal_entries/records', C2, {'family': FAM3, 'kind': 'pickup', 'date': time.strftime('%Y-%m-%d'), 'time_from': '15:00', 'repeat': 'weekly', 'who': [MB2], 'kids': [kid4.get('id')], 'added_by': MC2})
    queue = lambda k, topic: call('GET', f"/api/collections/push_queue/records?perPage=200&filter={urllib.parse.quote(f'user=' + chr(39) + uidr(k) + chr(39) + ' && topic=' + chr(39) + topic + chr(39))}", SU)[1].get('items', [])
    qb = queue('B2', 'pickup')
    check('push: a new pickup for me is queued in my language', s == 200 and len(qb) == 1 and qb[0]['title'] == 'Ole abholen' and qb[0]['body'].startswith('Neu für dich: jeden') and '(Carla)' in qb[0]['body'], qb)
    check('push: … the person who made it gets nothing', queue('C2', 'pickup') == [], '')
    day7 = time.strftime('%Y-%m-%d', time.localtime(time.time() + 7 * 86400))
    s, x = call('POST', '/api/djuu/cal-take', C2, {'id': pk.get('id'), 'set': {day7: MC2}, 'del': []})
    qb2 = queue('B2', 'pickup')
    check('push: someone takes over a day I was planned for -> I hear who', s == 200 and len(qb2) == 2 and any(q['body'].startswith('Carla übernimmt') for q in qb2), [q['body'] for q in qb2])
    s, x = call('PATCH', f"/api/collections/cal_entries/records/{pk.get('id')}", C2, {'time_from': '15:30'})
    qb3 = queue('B2', 'pickup')
    check('push: a changed time reaches the planned person', s == 200 and any(q['body'].startswith('Geändert: jeden') and '15:30' in q['body'] for q in qb3), [q['body'] for q in qb3])
    sub(H2, 'H2', topics=['pickup', 'cal'])
    call('POST', '/api/djuu/member', C2, {'id': MH2, 'perms': {'perm_cal': 'none'}})
    s, pk2 = call('POST', '/api/collections/cal_entries/records', C2, {'family': FAM3, 'kind': 'pickup', 'date': time.strftime('%Y-%m-%d'), 'who': [MH2], 'kids': [kid4.get('id')], 'added_by': MC2})
    check('push: nobody without calendar access gets calendar news', queue('H2', 'pickup') == [], queue('H2', 'pickup'))
    s, x = call('POST', '/api/collections/cal_entries/records', X2, {'family': xf.get('family'), 'kind': 'pickup', 'date': time.strftime('%Y-%m-%d'), 'who': [MB2], 'added_by': MX2})
    check('push: another Wir cannot send me pickup messages', len(queue('B2', 'pickup')) == len(qb3), (s, x))
    # a reminder 10 minutes ahead (alarm 15 minutes before): queued by the scan that runs before every sender fetch
    import datetime
    try:
        from zoneinfo import ZoneInfo
        start = datetime.datetime.now(ZoneInfo('Europe/Berlin')) + datetime.timedelta(minutes=10)
    except Exception:  # no time zone data on this machine: Hamburg = UTC+1 in winter
        start = datetime.datetime.utcnow() + datetime.timedelta(hours=1, minutes=10)
    s, ev = call('POST', '/api/collections/cal_entries/records', C2, {'family': FAM3, 'kind': 'event', 'title': 'Kinderarzt', 'date': start.strftime('%Y-%m-%d'), 'time_from': start.strftime('%H:%M'), 'alarm': 'PT15M', 'who': [MB2], 'added_by': MC2})
    if SECRET:
        s, cl = raw_post('/api/djuu/push/claim', {}, {'X-Djuu-Push': SECRET})
        check('push: the sender gets due messages with endpoint and keys, never the account', s == 200 and cl.get('items') and all(set(i) == {'id', 'topic', 'title', 'body', 'url', 'subs'} for i in cl['items'])
              and all(set(sb_) == {'id', 'endpoint', 'p256dh', 'auth'} for i in cl['items'] for sb_ in i['subs']), (s, str(cl)[:300]))
        qc = queue('B2', 'cal')
        check('push: a reminder that involves me is queued at start minus alarm', len(qc) == 1 and qc[0]['title'] == 'Kinderarzt' and qc[0]['body'].startswith('Heute ' + start.strftime('%H:%M')), qc)
        check('push: … only for the people it involves', queue('C2', 'cal') == [], queue('C2', 'cal'))
        mine_ids = [i['id'] for i in cl.get('items', [])]
        s, d = raw_post('/api/djuu/push/done', {'sent': mine_ids, 'gone': [sb.get('id')]}, {'X-Djuu-Push': SECRET})
        s2, x2 = call('GET', f"/api/collections/push_subs/records/{sb.get('id')}", SU)
        sent_ok = all(q.get('sent') for q in queue('B2', 'cal'))
        check('push: done marks messages sent and drops subscriptions the push service no longer knows', s == 200 and s2 == 404 and sent_ok, (s, d, s2))
        s, cl2 = raw_post('/api/djuu/push/claim', {}, {'X-Djuu-Push': SECRET})
        check('push: a sent reminder is not queued again', s == 200 and not [i for i in cl2.get('items', []) if i['title'] == 'Kinderarzt'] and len(queue('B2', 'cal')) == 1, cl2)
    else:
        for _ in range(9):  # the running sender fetches every 30 s and with it runs the reminder scan
            if queue('B2', 'cal'): break
            time.sleep(5)
        qc = queue('B2', 'cal')
        check('push: a reminder that involves me is queued at start minus alarm', len(qc) == 1 and qc[0]['title'] == 'Kinderarzt', qc)
        print('SKIP sender route checks with the secret (set DJUU_PUSH_SECRET to run them)')
    n = call('GET', f"/api/collections/push_subs/records?filter={urllib.parse.quote('user=' + chr(39) + uidr('C2') + chr(39))}", SU)[1].get('totalItems', 0)
    while n < 12:
        s, x = sub(C2, 'C2')
        if s != 200: break
        n += 1
    check('push: at most 10 subscriptions per account', n == 10 and code(x) == 'limit_reached', (n, x))

    # =====================================================================================================================
    # Fix round (21 Nov 2026): access areas, Notfall-Infos (perm_care), open invites, founder record, feed, push takeover
    # =====================================================================================================================
    for k in ('F1', 'F2', 'F3', 'F4', 'F5', 'F6'):
        mkuser(k)
    F1, F2, F3, F4, F5, F6 = (users[k]['token'] for k in ('F1', 'F2', 'F3', 'F4', 'F5', 'F6'))
    s, ff = call('POST', '/api/djuu/family', F1, {'myName': 'Frida'})
    FAMF, MF1 = ff.get('family'), ff.get('member')
    families.append(FAMF)
    MF2 = call('POST', '/api/djuu/join', F2, {'token': call('POST', '/api/djuu/invite', F1)[1]['token'], 'myName': 'Fritz'})[1].get('member')
    MF3 = call('POST', '/api/djuu/join', F3, {'token': call('POST', '/api/djuu/invite', F1, {'grp': 'helper'})[1]['token'], 'myName': 'Fenja'})[1].get('member')
    MF4 = call('POST', '/api/djuu/join', F4, {'token': call('POST', '/api/djuu/invite', F1)[1]['token'], 'myName': 'Falk'})[1].get('member')
    call('POST', '/api/djuu/member', F1, {'id': MF4, 'admin': True})
    perms = lambda mid: {k: v for k, v in call('GET', f'/api/collections/members/records/{mid}', SU)[1].items() if k.startswith('perm_')}
    check('perm_care: family group "edit", helpers "none" by default', perms(MF1).get('perm_care') == 'edit' and perms(MF2).get('perm_care') == 'edit' and perms(MF3).get('perm_care') == 'none', (perms(MF2), perms(MF3)))
    # changing one area keeps the others (was: every other area went back to the group's default)
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_shop': 'edit', 'perm_cal': 'edit'}})
    s, x = call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_saved': 'view'}})
    p3 = perms(MF3)
    check('access: changing one area keeps the other areas as they were', s == 200 and p3 == {'perm_shop': 'edit', 'perm_errands': 'view', 'perm_cal': 'edit', 'perm_saved': 'view', 'perm_care': 'none'}, p3)
    s, x = call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_care': 'bogus', 'perm_shop': 'view'}})
    p3 = perms(MF3)
    check('access: unknown levels are ignored, the area keeps its level', s == 200 and p3['perm_care'] == 'none' and p3['perm_shop'] == 'view' and p3['perm_cal'] == 'edit', p3)
    s, x = call('POST', '/api/djuu/member', F1, {'id': MF2, 'grp': 'helper'})
    p2 = perms(MF2)
    check('access: a new group starts from the defaults of that group', s == 200 and p2 == {'perm_shop': 'view', 'perm_errands': 'view', 'perm_cal': 'view', 'perm_saved': 'none', 'perm_care': 'none'}, p2)
    call('POST', '/api/djuu/member', F1, {'id': MF2, 'grp': 'family'})
    check('access: … and back in the family group, the family defaults', set(perms(MF2).values()) == {'edit'}, perms(MF2))
    s, x = call('PATCH', f'/api/collections/members/records/{MF3}', F1, {'perm_care': 'edit'})
    check('perm_care: not settable through the records API', s in (400, 403, 404) and perms(MF3)['perm_care'] == 'none', (s, x))

    # emergency information: family members write it (perm_care edit), helpers only with access
    s, kidf = create('/api/collections/members/records', F1, {'family': FAMF, 'name': 'Finn', 'kind': 'kid', 'birth_ym': '2022-03'})
    care = {'family': FAMF, 'kid': kidf.get('id'), 'allergies': 'Nüsse', 'emergency_contacts': [{'name': 'Oma', 'phone': '040 1'}]}
    s, x = create('/api/collections/kid_care/records', F2, {**care, 'consent_by': MF1})
    check('Notfall-Infos: consent only in one\'s own name', s in (400, 403), (s, x))
    s, cr = create('/api/collections/kid_care/records', F2, {**care, 'consent_by': MF2})
    check('Notfall-Infos: a family member (not admin) writes them with consent', s == 200 and cr.get('consent_by') == MF2 and cr.get('consent_at'), (s, cr))
    s, l = call('GET', '/api/collections/kid_care/records', F3)
    check('Notfall-Infos: a helper without access reads nothing', s == 200 and l.get('totalItems') == 0, l)
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_care': 'view'}})
    s, l = call('GET', '/api/collections/kid_care/records', F3)
    s2, x2 = call('PATCH', f"/api/collections/kid_care/records/{cr.get('id')}", F3, {'allergies': '-', 'consent_by': MF3})
    check('Notfall-Infos: a helper with "Ansehen" reads, but cannot change', s == 200 and l.get('totalItems') == 1 and s2 in (400, 403, 404), (l.get('totalItems'), s2))
    call('POST', '/api/djuu/member', F1, {'id': MF2, 'perms': {'perm_care': 'view'}})
    s, x = call('PATCH', f"/api/collections/kid_care/records/{cr.get('id')}", F2, {'allergies': '-', 'consent_by': MF2})
    check('Notfall-Infos: a family member with "Ansehen" cannot change them', s in (400, 403, 404) and perms(MF2)['perm_shop'] == 'edit', (s, x, perms(MF2)))
    s, x = call('DELETE', f"/api/collections/kid_care/records/{cr.get('id')}", F2)
    check('Notfall-Infos: … nor delete them', s in (400, 403, 404), (s, x))
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_care': 'edit'}})
    s, x = call('PATCH', f"/api/collections/kid_care/records/{cr.get('id')}", F3, {'allergies': 'Nüsse, Kiwi', 'consent_by': MF3})
    check('Notfall-Infos: a helper with "Mitbearbeiten" changes them (consent in their name)', s == 200 and x.get('consent_by') == MF3, (s, x))
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'until': '2020-01-01'})
    s, l = call('GET', '/api/collections/kid_care/records', F3)
    check('Notfall-Infos: nothing after the access ended', s == 200 and l.get('totalItems') == 0, l)
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'until': ''})
    s, inv5 = call('POST', '/api/djuu/invite', F1, {'grp': 'helper', 'perms': {'perm_care': 'view'}, 'name': 'Babysitterin Lea'})
    s, j5 = call('POST', '/api/djuu/join', F5, {'token': inv5.get('token'), 'myName': 'Lea'})
    check('invites: a helper can be invited with access to the Notfall-Infos', perms(j5.get('member')).get('perm_care') == 'view', perms(j5.get('member')))
    st, txt, _ = raw_get('/api/djuu/export', F2)
    check('export: the access areas include perm_care', st == 200 and '"perm_care":"view"' in txt.replace(' ', ''), (st, txt[:200]))

    # open invites: the admins see them (never the link) and take one back (K2)
    s, inv6 = call('POST', '/api/djuu/invite', F1, {'grp': 'helper', 'role': 'Oma', 'name': 'Oma Inge', 'until': time.strftime('%Y-%m-%d', time.localtime(time.time() + 30 * 86400))})
    st, itxt, _ = raw_get('/api/djuu/invites', F1)
    il = json.loads(itxt) if st == 200 else {}
    mine6 = [i for i in il.get('invites', []) if i.get('name') == 'Oma Inge']
    check('invites: the admin lists the open invites (group, role, name, expiry), never the link', st == 200 and len(mine6) == 1 and mine6[0]['group'] == 'helper' and mine6[0]['role'] == 'Oma'
          and mine6[0]['expires'] and inv6.get('token') not in itxt and 'token' not in itxt, itxt[:300])
    check('invites: used invites are not listed', not [i for i in il.get('invites', []) if i.get('name') == 'Babysitterin Lea'], il)
    s, x = call('GET', '/api/djuu/invites', F2)
    s2, x2 = call('POST', '/api/djuu/invite-revoke', F2, {'id': mine6[0]['id'] if mine6 else ''})
    check('invites: not for people who are not admin', s == 403 and s2 == 403, (s, s2))
    s, x = call('POST', '/api/djuu/invite-revoke', X2, {'id': mine6[0]['id'] if mine6 else ''})
    check('invites: an admin of another Wir cannot take it back', s == 404, (s, x))
    s, x = call('POST', '/api/djuu/invite-revoke', F1, {'id': mine6[0]['id'] if mine6 else ''})
    s2, j6 = call('POST', '/api/djuu/join', F6, {'token': inv6.get('token'), 'myName': 'Inge'})
    check('invites: a link taken back stops working at once', s == 200 and s2 == 400 and code(j6) == 'invite_invalid', (s, x, s2, j6))

    # invites with an end date: not in the past, and refused once the end has passed
    s, x = call('POST', '/api/djuu/invite', F1, {'grp': 'helper', 'until': '2020-01-01'})
    check('invites: an end date in the past is refused', s == 400 and code(x) == 'invalid_date', (s, x))
    s, inv7 = call('POST', '/api/djuu/invite', F1, {'grp': 'helper', 'until': time.strftime('%Y-%m-%d', time.localtime(time.time() + 86400))})
    s, il = call('GET', '/api/djuu/invites', F1)
    for i in il.get('invites', []):
        if i.get('until'): call('PATCH', f"/api/collections/invites/records/{i['id']}", SU, {'access_until': '2021-01-01 22:59:59.000Z'})
    s, j7 = call('POST', '/api/djuu/join', F6, {'token': inv7.get('token'), 'myName': 'Inge'})
    check('invites: a helper invite whose end date has passed is refused (invite_expired)', s == 400 and code(j7) == 'invite_expired', (s, j7))

    # the founder's own record: only the founder changes it
    s, x = call('PATCH', f'/api/collections/members/records/{MF1}', F4, {'name': 'Umbenannt'})
    s2, x2 = call('GET', f'/api/collections/members/records/{MF1}', SU)
    check('founder: another admin cannot rename the founder', s in (400, 403, 404) and x2.get('name') == 'Frida', (s, x, x2.get('name')))
    s, x = call('POST', '/api/djuu/member', F4, {'id': MF1, 'role': 'Chefin'})
    check('founder: … nor change the founder\'s role or access', s == 400 and code(x) == 'founder', (s, x))
    s, x = call('PATCH', f'/api/collections/members/records/{MF1}', F1, {'name': 'Frida F.'})
    check('founder: the founder renames themselves', s == 200 and x.get('name') == 'Frida F.', (s, x))
    s, x = call('PATCH', f'/api/collections/members/records/{MF2}', F4, {'role': 'Papa'})
    check('founder: the second admin still changes other people', s == 200, (s, x))
    s, x = call('POST', '/api/djuu/remove', F1, {'id': MF1})
    check('remove: removing oneself points to "Wir verlassen"', s == 400 and 'Wir verlassen' in x.get('message', ''), (s, x))

    # the calendar feed of a helper: saved offers only with access to "Gemerkt"
    call('POST', '/api/collections/saved_offers/records', F1, {'family': FAMF, 'offer_id': 'of_fix', 'snap': {'title': 'Kinderturnen Fix', 'kind': 'gruppe', 'weekday': 1, 'time_from': '16:00'}, 'saved_by': MF1})
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_saved': 'none', 'perm_cal': 'view'}})
    tokf = call('POST', '/api/djuu/calendar', F3)[1].get('token')
    s, fd = call('GET', f'/api/djuu/cal/{tokf}.ics', raw=True)
    call('POST', '/api/djuu/member', F1, {'id': MF3, 'perms': {'perm_saved': 'view'}})
    s2, fd2 = call('GET', f'/api/djuu/cal/{tokf}.ics', raw=True)
    check('calendar feed: a helper without "Gemerkt" does not get the saved offers', s == 200 and 'Kinderturnen Fix' not in fd and 'Kinderturnen Fix' in fd2, (s, s2))

    # push: an endpoint of another account is taken over only by the browser that holds it (same secret keys)
    epf = 'https://fcm.googleapis.com/fcm/send/fix-' + secrets.token_hex(10)
    KEYS2 = {'p256dh': KEYS['p256dh'], 'auth': 'AAAAAAAAAAAAAAAAAAAAAA'}
    s, sbf = create('/api/collections/push_subs/records', F2, {'user': uidr('F2'), 'endpoint': epf, 'keys': KEYS, 'topics': ['cal'], 'lang': 'de'})
    s, x = create('/api/collections/push_subs/records', F4, {'user': uidr('F4'), 'endpoint': epf, 'keys': KEYS2, 'topics': ['cal'], 'lang': 'de'})
    s2, x2 = call('GET', f"/api/collections/push_subs/records/{sbf.get('id')}", SU)
    check('push: another account cannot take over a subscription by its address alone', s == 400 and code(x) == 'push_endpoint_taken' and s2 == 200 and x2.get('user') == uidr('F2'), (s, x, s2))
    s, x = create('/api/collections/push_subs/records', F4, {'user': uidr('F4'), 'endpoint': epf, 'keys': KEYS, 'topics': ['cal'], 'lang': 'de'})
    s2, _ = call('GET', f"/api/collections/push_subs/records/{sbf.get('id')}", SU)
    check('push: … the same browser (same keys) signed in with another account takes it over', s == 200 and x.get('user') == uidr('F4') and s2 == 404, (s, x, s2))

    # =====================================================================================================================
    # Failure alert route (S4): superusers only; dry run here (no mail)
    # =====================================================================================================================
    s, x = call('POST', '/api/djuu/alert', C2, {'subject': 'x', 'text': 'y', 'dry': True})
    s2, x2 = call('POST', '/api/djuu/alert', None, {'subject': 'x', 'dry': True})
    check('alert: not for accounts or guests', s in (401, 403) and s2 in (401, 403), (s, s2))
    s, x = call('POST', '/api/djuu/alert', SU, {'subject': '', 'dry': True})
    check('alert: needs a subject', s == 400, (s, x))
    s, x = call('POST', '/api/djuu/alert', SU, {'subject': 'Test', 'text': 'Testlauf', 'dry': True})
    check('alert: superuser dry run', s == 200 and x.get('dry') and '@' in x.get('to', ''), (s, x))

finally:
    # clean up: deleting a family removes its members, items, offers and pings (cascade); then the users
    for fam in families:
        call('DELETE', f'/api/collections/families/records/{fam}', SU)
    for u in users.values():
        call('DELETE', f"/api/collections/users/records/{u['id']}", SU)
    # leftovers of earlier runs (before 21 Nov 2026 one test account per run was not deleted): throwaway addresses only
    old = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() - 7200))
    flt = urllib.parse.quote(f"email ~ 'test-%@example.invalid' && created < '{old}'")
    for u in call('GET', f'/api/collections/users/records?perPage=200&filter={flt}', SU)[1].get('items', []):
        if u.get('email', '').startswith('test-') and u['email'].endswith('@example.invalid'):
            call('DELETE', f"/api/collections/users/records/{u['id']}", SU)

print(f'\n{sum(results)} of {len(results)} checks passed')
sys.exit(0 if all(results) else 1)
