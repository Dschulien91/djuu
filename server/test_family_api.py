"""Checks for the Wir features of round 2: more lists (lists + shop_items.list/assignee/due), emergency information
(kid_care), single occurrences of repeating calendar entries (cal_entries.changes, /api/djuu/cal-take, feed) and
followed lists with push messages (members.follow_lists, push_queue), including permission attacks
(helper, expired helper, other Wir, stranger).
Run like test_api.py: python3 test_family_api.py http://<container-ip>:8090 <admin-email> <admin-password>
Creates throwaway users and Wirs and deletes everything it created at the end (also when a check crashes)."""
import datetime
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request

BASE, ADMIN, PW = sys.argv[1], sys.argv[2], sys.argv[3]
results, skipped = [], []


def call(method, path, token=None, body=None, raw=False, headers=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': token} if token else {}), **(headers or {})})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read().decode()
                return r.status, (data if raw else (json.loads(data) if data else {}))
        except urllib.error.HTTPError as e:
            data = e.read().decode()
            try: return e.code, json.loads(data)
            except Exception: return e.code, data
        except (ConnectionResetError, ConnectionAbortedError) as e:  # a dropped connection after the rate limit: try again
            if attempt == 3: raise
            time.sleep(5.2)


def create(path, token, body):
    """POST that waits out the create rate limit instead of failing on it."""
    for _ in range(8):
        s, x = call('POST', path, token, body)
        if s != 429: return s, x
        time.sleep(5.2)
    return s, x


def check(name, ok, info=''):
    ok = bool(ok)
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if not ok and info else ''))


def skip(name, why):
    skipped.append(name)
    print(f'SKIP {name}  ({why})')


def code(x):
    return x.get('code') if isinstance(x, dict) else None


REFUSED = (400, 403, 404)
s, a = call('POST', '/api/collections/_superusers/auth-with-password', body={'identity': ADMIN, 'password': PW})
check('superuser login', s == 200, a)
SU = a['token']
users, families = {}, []


def mkuser(k):
    email = f'test-fam2-{k.lower()}-{secrets.token_hex(3)}@example.invalid'
    pw = secrets.token_urlsafe(18)
    s, u = call('POST', '/api/collections/users/records', SU, {'email': email, 'password': pw, 'passwordConfirm': pw, 'verified': True})
    s2, t = call('POST', f"/api/collections/users/impersonate/{u.get('id')}", SU, {'duration': 3600})
    check(f'create user {k}', s == 200 and s2 == 200, (u, t))
    users[k] = {'id': u.get('id'), 'token': t.get('token')}
    return users[k]['token']


def items(path, token):
    s, l = call('GET', path, token)
    return l.get('items', []) if s == 200 and isinstance(l, dict) else None


def ymd(d): return d.isoformat()


try:
    A, B, H, D, X = (mkuser(k) for k in 'ABHDX')
    s, f = call('POST', '/api/djuu/family', A, {'myName': 'Anna'})
    FAM, MA = f.get('family'), f.get('member')
    families.append(FAM)
    s, inv = call('POST', '/api/djuu/invite', A, {'grp': 'family'})
    s, j = call('POST', '/api/djuu/join', B, {'token': inv.get('token'), 'myName': 'Ben'})
    MB = j.get('member')
    s, inv = call('POST', '/api/djuu/invite', A, {'grp': 'helper', 'role': 'Babysitter:in'})
    s, j = call('POST', '/api/djuu/join', H, {'token': inv.get('token'), 'myName': 'Hanna'})
    MH = j.get('member')
    s, f2 = call('POST', '/api/djuu/family', D, {'myName': 'Dora'})
    FAM2, MD = f2.get('family'), f2.get('member')
    families.append(FAM2)
    check('setup: Wir with admin, family member, helper; a second Wir', all([FAM, MA, MB, MH, FAM2, MD]), (FAM, MB, MH, FAM2))
    s, kid = create('/api/collections/members/records', A, {'family': FAM, 'name': 'Mia', 'kind': 'kid', 'birth_ym': '2021-05'})
    s, kid2 = create('/api/collections/members/records', D, {'family': FAM2, 'name': 'Dex', 'kind': 'kid', 'birth_ym': '2020'})
    KID, KID2 = kid.get('id'), kid2.get('id')
    check('setup: children in both Wirs', KID and KID2, (kid, kid2))

    # ---------------- lists ----------------
    s, ls = create('/api/collections/lists/records', A, {'family': FAM, 'name': 'Drogerie', 'kind': 'shop', 'sort': 1})
    check('admin creates a shopping list', s == 200, ls)
    s, lt = create('/api/collections/lists/records', A, {'family': FAM, 'name': 'To-dos', 'kind': 'todo', 'sort': 2})
    check('admin creates a to-do list', s == 200, lt)
    s, lp = create('/api/collections/lists/records', B, {'family': FAM, 'name': 'Kita-Tasche', 'kind': 'pack', 'sort': 3})
    check('family member creates a packing list', s == 200, lp)
    LS, LT, LP = ls.get('id'), lt.get('id'), lp.get('id')
    s, x = create('/api/collections/lists/records', H, {'family': FAM, 'name': 'Meins', 'kind': 'shop'})
    check('helper with "Ansehen" cannot create a list', s in REFUSED, (s, x))
    s, x = create('/api/collections/lists/records', A, {'family': FAM, 'name': 'X', 'kind': 'other'})
    check('unknown list kind refused', s in REFUSED, (s, x))
    s, x = create('/api/collections/lists/records', A, {'family': FAM, 'name': 'x' * 41, 'kind': 'shop'})
    check('list name longer than 40 refused', s in REFUSED, (s, x))
    l = items('/api/collections/lists/records', H)
    check('helper reads the lists (view)', l is not None and {LS, LT, LP} <= {r['id'] for r in l}, l)
    check('stranger and other Wir see no lists', items('/api/collections/lists/records', X) == [] and items('/api/collections/lists/records', D) == [], '')
    s, x = create('/api/collections/lists/records', D, {'family': FAM, 'name': 'Fremd', 'kind': 'shop'})
    check('other Wir cannot create a list in this Wir', s in REFUSED, (s, x))
    s, x = call('PATCH', f'/api/collections/lists/records/{LS}', A, {'kind': 'todo'})
    check('a list\'s kind is fixed', s in REFUSED, (s, x))
    s, x = call('PATCH', f'/api/collections/lists/records/{LS}', A, {'family': FAM2})
    check('a list cannot move to another Wir', s in REFUSED, (s, x))
    s, x = call('PATCH', f'/api/collections/lists/records/{LS}', B, {'name': 'Drogerie & Apotheke', 'archived': True})
    check('family member renames and archives a list', s == 200 and x.get('archived') is True, (s, x))

    s, i1 = create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Zahnpasta', 'list': LS, 'added_by': MA})
    check('item in the shopping list', s == 200 and i1.get('list') == LS, i1)
    s, i0 = create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Milch', 'added_by': MA})
    check('item without list = main list (as before)', s == 200 and i0.get('list') == '', i0)
    due = ymd(datetime.date.today() + datetime.timedelta(days=3))
    s, t1 = create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Kita-Formular abgeben', 'list': LT, 'assignee': MB, 'due': due, 'added_by': MA})
    check('to-do with assignee and due date', s == 200 and t1.get('assignee') == MB and t1.get('due') == due, t1)
    s, x = create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'X', 'list': LT, 'due': '24.11.2026'})
    check('due date must be YYYY-MM-DD', s in REFUSED, (s, x))
    s, x = create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'X', 'list': LT, 'assignee': MD})
    check('assignee from another Wir refused', s in REFUSED, (s, x))
    s, lx = create('/api/collections/lists/records', D, {'family': FAM2, 'name': 'Doras', 'kind': 'shop'})
    s, x = create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'X', 'list': lx.get('id')})
    check('item cannot point to a list of another Wir', s in REFUSED, (s, x))
    s, x = create('/api/collections/shop_items/records', D, {'family': FAM2, 'name': 'X', 'list': LS})
    check('other Wir cannot put items into this Wir\'s list', s in REFUSED, (s, x))
    s, x = call('PATCH', f"/api/collections/shop_items/records/{i1.get('id')}", A, {'list': LP})
    check('an item\'s list is fixed', s in REFUSED, (s, x))
    s, x = call('PATCH', f"/api/collections/shop_items/records/{t1.get('id')}", A, {'assignee': MD})
    check('assignee cannot be changed to another Wir\'s person', s in REFUSED, (s, x))
    l = items('/api/collections/shop_items/records', H)
    check('helper (view) reads items of all lists', l is not None and {i0.get('id'), i1.get('id'), t1.get('id')} <= {r['id'] for r in l}, l)
    s, x = create('/api/collections/shop_items/records', H, {'family': FAM, 'name': 'X', 'list': LT})
    check('helper with "Ansehen" cannot add a to-do', s in REFUSED, (s, x))

    # helper: Einkauf only view, Besorgungen (to-dos) edit
    s, x = call('POST', '/api/djuu/member', A, {'id': MH, 'perms': {'perm_shop': 'view', 'perm_errands': 'edit', 'perm_cal': 'view', 'perm_saved': 'none'}})
    check('admin gives the helper "Mitbearbeiten" for Besorgungen only', s == 200, x)
    s, x = create('/api/collections/shop_items/records', H, {'family': FAM, 'name': 'Wäsche', 'list': LT, 'added_by': MH})
    check('… helper adds a to-do', s == 200, x)
    s, x2 = create('/api/collections/shop_items/records', H, {'family': FAM, 'name': 'Brot', 'added_by': MH})
    check('… but not to the main shopping list', s in REFUSED, (s, x2))
    s, x2 = create('/api/collections/shop_items/records', H, {'family': FAM, 'name': 'Seife', 'list': LS})
    check('… nor to another shopping list', s in REFUSED, (s, x2))
    s, x2 = call('PATCH', f"/api/collections/shop_items/records/{t1.get('id')}", H, {'done': True, 'done_by': MH})
    check('… ticks a to-do off', s == 200 and x2.get('done') is True, (s, x2))
    s, x2 = call('PATCH', f"/api/collections/shop_items/records/{i0.get('id')}", H, {'done': True})
    check('… cannot tick a shopping item', s in REFUSED, (s, x2))
    s, x2 = create('/api/collections/lists/records', H, {'family': FAM, 'name': 'Hannas To-dos', 'kind': 'todo'})
    check('… may create a to-do list, not a shopping list', s == 200 and create('/api/collections/lists/records', H, {'family': FAM, 'name': 'N', 'kind': 'pack'})[0] in REFUSED, (s, x2))
    s, x2 = call('DELETE', f'/api/collections/lists/records/{LS}', H)
    check('… cannot delete a shopping list', s in REFUSED, (s, x2))

    # deleting a list deletes its entries
    s, _ = create('/api/collections/shop_items/records', B, {'family': FAM, 'name': 'Wechselwäsche', 'list': LP, 'added_by': MB})
    s, x = call('DELETE', f'/api/collections/lists/records/{LP}', B)
    left = items(f"/api/collections/shop_items/records?filter={urllib.request.quote(f'list={chr(39)}{LP}{chr(39)}')}", SU)
    check('deleting a list deletes its entries', s == 204 and left == [], (s, left))

    # ---------------- emergency information ----------------
    care = {'family': FAM, 'kid': KID, 'allergies': 'Erdnüsse', 'meds': 'Notfallspray im Rucksack', 'doctor': 'Dr. Weiß, 040 123456', 'notes': 'Mittagsschlaf 13 Uhr',
            'emergency_contacts': [{'name': 'Oma Inge', 'phone': '0171 22<b>33', 'rel': 'Oma'}] + [{'name': f'P{i}', 'phone': '1'} for i in range(6)], 'consent_by': MA}
    s, c1 = create('/api/collections/kid_care/records', A, {**care, 'consent_by': ''})
    check('emergency info without consent refused', s in REFUSED, (s, c1))
    s, c1 = create('/api/collections/kid_care/records', A, {**care, 'consent_by': MB})
    check('consent must be given by the admin who saves', s in REFUSED, (s, c1))
    s, c1 = create('/api/collections/kid_care/records', A, {**care, 'consent_at': '2000-01-01 00:00:00.000Z'})
    ec = c1.get('emergency_contacts') if isinstance(c1, dict) else None
    check('admin saves emergency info with consent', s == 200, c1)
    check('… the server notes the moment of consent itself', s == 200 and str(c1.get('consent_at', '')).startswith(str(datetime.date.today().year)), c1.get('consent_at'))
    check('… contacts are cleaned (max 5, phone digits only)', isinstance(ec, list) and len(ec) == 5 and ec[0]['phone'] == '0171 2233', ec)
    CARE = c1.get('id')
    s, x = create('/api/collections/kid_care/records', A, care)
    check('only one entry per child', s in REFUSED, (s, x))
    s, x = create('/api/collections/kid_care/records', A, {**care, 'kid': MB})
    check('emergency info only for children', s in REFUSED, (s, x))
    s, x = create('/api/collections/kid_care/records', A, {**care, 'kid': KID2})
    check('not for a child of another Wir', s in REFUSED, (s, x))
    s, x = create('/api/collections/kid_care/records', B, {**care, 'consent_by': MB})
    check('only one entry per child, also from a family member', s in REFUSED, (s, x))
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', B, {'allergies': 'Erdnüsse!', 'consent_by': MB})
    check('family member (Notfall-Infos "edit" by default) changes it with consent in their own name', s == 200 and x.get('consent_by') == MB, (s, x))
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', B, {'allergies': '-', 'consent_by': MA})
    check('… never in someone else\'s name', s in REFUSED, (s, x))
    check('family member reads it', [r['id'] for r in (items('/api/collections/kid_care/records', B) or [])] == [CARE], '')
    check('helper reads nothing by default (Notfall-Infos "none")', items('/api/collections/kid_care/records', H) == [], '')
    call('POST', '/api/djuu/member', A, {'id': MH, 'perms': {'perm_care': 'view'}})
    check('helper reads it once the admin allows "Ansehen"', [r['id'] for r in (items('/api/collections/kid_care/records', H) or [])] == [CARE], '')
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', H, {'allergies': '-', 'consent_by': MH})
    check('… but cannot change it', s in REFUSED, (s, x))
    call('POST', '/api/djuu/member', A, {'id': MB, 'perms': {'perm_care': 'view'}})
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', B, {'allergies': '-', 'consent_by': MB})
    check('family member with "Ansehen" cannot change it', s in REFUSED, (s, x))
    check('stranger and other Wir read nothing', items('/api/collections/kid_care/records', X) == [] and items('/api/collections/kid_care/records', D) == [], '')
    s, x = call('GET', f'/api/collections/kid_care/records/{CARE}', D)
    check('other Wir cannot open it by id', s == 404, (s, x))
    s, x = create('/api/collections/kid_care/records', D, {**care, 'family': FAM, 'consent_by': MD})
    check('other Wir cannot write into this Wir', s in REFUSED, (s, x))
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', A, {'allergies': 'Erdnüsse, Kiwi'})
    check('changing needs the consent again', s in REFUSED, (s, x))
    time.sleep(1.1)
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', A, {'allergies': 'Erdnüsse, Kiwi', 'consent_by': MA})
    check('admin changes it with consent, new consent time', s == 200 and x.get('consent_at') > c1.get('consent_at'), (s, x))
    s, x = call('PATCH', f'/api/collections/kid_care/records/{CARE}', A, {'kid': KID2, 'consent_by': MA})
    check('the child of an entry is fixed', s in REFUSED, (s, x))
    s, x = call('DELETE', f'/api/collections/kid_care/records/{CARE}', B)
    check('family member cannot delete it', s in REFUSED, (s, x))

    # ---------------- single occurrences of repeating entries ----------------
    today = datetime.date.today()
    start = today + datetime.timedelta(days=(7 - today.weekday()) % 7 or 7)  # next Monday
    k1, k2, k3 = (ymd(start + datetime.timedelta(days=7 * n)) for n in (1, 2, 3))
    k2moved = ymd(start + datetime.timedelta(days=15))
    s, ev = create('/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'event', 'title': 'Training', 'date': ymd(start), 'time_from': '17:00', 'time_to': '18:00', 'repeat': 'weekly', 'who': [MA], 'added_by': MA})
    EV = ev.get('id')
    check('weekly entry', s == 200, ev)
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': EV, 'chg': {k1: {'del': True}, k2: {'date': k2moved, 'from': '18:30', 'to': '19:30', 'title': 'Training (verlegt)', 'bogus': 1, 'who': [MA, MD]}, 'not-a-day': {'del': True}}})
    ch = x.get('changes') if isinstance(x, dict) else None
    check('one day removed, one day changed through cal-take', s == 200 and ch and ch.get(k1) == {'del': True} and ch.get(k2, {}).get('from') == '18:30', (s, x))
    check('… unknown fields and invalid days dropped, people of other Wirs removed', ch and 'bogus' not in ch.get(k2, {}) and 'not-a-day' not in ch and ch.get(k2, {}).get('who') == [MA], ch)
    s, x = call('POST', '/api/djuu/cal-take', H, {'id': EV, 'chg': {k3: {'del': True}}})
    check('helper with calendar "Ansehen" cannot change a day', s == 403 and code(x) == 'no_calendar_access', (s, x))
    s, x = call('POST', '/api/djuu/cal-take', D, {'id': EV, 'chg': {k3: {'del': True}}})
    check('other Wir cannot change a day', s == 404 and code(x) == 'entry_not_found', (s, x))
    s, x = call('POST', '/api/djuu/cal-take', X, {'id': EV, 'chg': {k3: {'del': True}}})
    check('stranger cannot change a day', s in REFUSED, (s, x))
    s, x = call('PATCH', f'/api/collections/cal_entries/records/{EV}', B, {'changes': {**ch, k3: {'title': 'x' * 300, 'evil': '<script>'}, 'junk': 1}})
    c3 = (x.get('changes') or {}).get(k3, {}) if isinstance(x, dict) else {}
    check('changes written through the records API are cleaned too', s == 200 and 'junk' not in x.get('changes', {}) and len(c3.get('title', '')) == 80 and 'evil' not in c3, (s, x))
    # many people change different days at the same moment: all stay
    days = [ymd(start + datetime.timedelta(days=7 * n)) for n in range(4, 10)]
    out = []
    def chg(k): out.append(call('POST', '/api/djuu/cal-take', A if days.index(k) % 2 else B, {'id': EV, 'chg': {k: {'note': 'n' + k}}})[0])
    ts = [threading.Thread(target=chg, args=(k,)) for k in days]
    [t.start() for t in ts]; [t.join() for t in ts]
    s, x = call('GET', f'/api/collections/cal_entries/records/{EV}', A)
    check('six days changed at the same moment are all kept', all(c == 200 for c in out) and all(k in x.get('changes', {}) for k in days), (out, list(x.get('changes', {}))))
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': EV, 'chg': {days[0]: None}, 'chgdel': [days[1]]})
    check('a change can be taken back (null / chgdel)', s == 200 and days[0] not in x.get('changes', {}) and days[1] not in x.get('changes', {}) and k1 in x.get('changes', {}), x.get('changes'))
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': EV, 'set': {k3: MB}})
    check('taking over a day still works (overrides untouched by changes)', s == 200 and x.get('overrides', {}).get(k3) == MB and k1 in x.get('changes', {}), x)
    # Abholen: a removed day and a changed time
    p1, p2 = ymd(today + datetime.timedelta(days=7)), ymd(today + datetime.timedelta(days=14))
    s, pk = create('/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'pickup', 'date': ymd(today), 'time_from': '15:00', 'repeat': 'weekly', 'who': [MB], 'kids': [KID], 'added_by': MA})
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': pk.get('id'), 'chg': {p1: {'del': True}, p2: {'from': '16:30'}}})
    check('pickup: one day off, one day later', s == 200, x)
    s, ct = call('POST', '/api/djuu/calendar', A)
    s, feed = call('GET', f"/api/djuu/cal/{ct.get('token')}.ics", raw=True)
    flat = str(feed).replace('\r\n ', '')
    ck1, ck2 = k1.replace('-', ''), k2.replace('-', '')
    check('feed: removed day as EXDATE', f'EXDATE;TZID=Europe/Berlin:{ck1}T170000' in flat, flat[:400])
    check('feed: changed day as own event with RECURRENCE-ID and the new time', f'RECURRENCE-ID;TZID=Europe/Berlin:{ck2}T170000' in flat and f"DTSTART;TZID=Europe/Berlin:{k2moved.replace('-', '')}T183000" in flat and 'SUMMARY:Training (verlegt) (Anna)' in flat, '')
    check('feed: pickup day off is missing, changed day at 16:30', f"UID:{pk.get('id')}-{p1.replace('-', '')}@djuu" not in flat and f"DTSTART;TZID=Europe/Berlin:{p2.replace('-', '')}T163000" in flat and 'SUMMARY:Mia abholen: Ben' in flat, '')
    s, feed_en = call('GET', f"/api/djuu/cal/{ct.get('token')}.ics?lang=en&ferien=1", raw=True)
    hooks = ''
    try: hooks = open(__file__.replace('test_family_api.py', 'pb_hooks/djuu.pb.js'), encoding='utf-8').read()
    except Exception: pass
    if 'Pick up Mia' in str(feed_en) or 'get("lang")' in hooks or "get('lang')" in hooks:
        flat_en = str(feed_en).replace('\r\n ', '')
        check('feed in English (?lang=en)', 'SUMMARY:Pick up Mia: Ben' in flat_en and 'abholen' not in flat_en and '(school holidays)' in flat_en, flat_en[-600:])
    else:
        skip('feed in English (?lang=en)', 'the feed route does not pass lang through yet (server agent)')

    # ---------------- followed lists, push for new entries ----------------
    s, x = call('PATCH', f'/api/collections/members/records/{MB}', B, {'follow_lists': ['main', LT, 'not valid!', 'main']})
    check('a person follows lists (cleaned)', s == 200 and x.get('follow_lists') == ['main', LT], (s, x))
    s, x = call('PATCH', f'/api/collections/members/records/{MB}', A, {'follow_lists': []})
    check('the admin cannot change whom someone follows', s == 403, (s, x))
    s, x = call('PATCH', f'/api/collections/members/records/{MB}', A, {'role': 'Papa'})
    check('… other changes by the admin still work', s == 200, (s, x))
    s, cols = call('GET', '/api/collections?perPage=200', SU)
    names = {c['name'] for c in cols.get('items', [])} if isinstance(cols, dict) else set()
    if {'push_queue', 'push_subs'} <= names:
        s, sub = call('POST', '/api/collections/push_subs/records', SU, {'user': users['B']['id'], 'endpoint': 'https://fcm.googleapis.com/fcm/send/test-' + secrets.token_hex(8),
                                                                      'keys': {'p256dh': 'x', 'auth': 'y'}, 'topics': ['lists'], 'lang': 'de'})
        check('setup: B has a push subscription with "lists"', s == 200, sub)
        queue = lambda: items(f"/api/collections/push_queue/records?perPage=50&filter={urllib.request.quote(chr(116) + 'opic=' + chr(39) + 'lists' + chr(39))}", SU) or []
        before = len(queue())
        create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Äpfel', 'added_by': MA})
        create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Brot', 'added_by': MA})
        q = [r for r in queue() if r.get('user') == users['B']['id']]
        check('new entries in a followed list: one waiting message for B', len(queue()) == before + 1 and len(q) == 1 and q[0].get('body') == 'Anna: Äpfel, Brot' and q[0].get('url') == './#wir=shop', q)
        create('/api/collections/shop_items/records', B, {'family': FAM, 'name': 'Käse', 'added_by': MB})
        create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Seife', 'list': LS, 'added_by': MA})
        check('no message for own entries or lists not followed', len(queue()) == before + 1, queue())
        call('POST', '/api/djuu/member', A, {'id': MB, 'until': '2020-01-01'})
        create('/api/collections/shop_items/records', A, {'family': FAM, 'name': 'Wasser', 'list': LT, 'added_by': MA})
        check('no message after the access ended', len(queue()) == before + 1, queue())
        call('POST', '/api/djuu/member', A, {'id': MB, 'until': ''})
    else:
        skip('push messages for followed lists', 'push_queue / push_subs not on this server yet (server agent)')

    # ---------------- expired helper ----------------
    s, x = call('POST', '/api/djuu/member', A, {'id': MH, 'until': '2020-01-01'})
    check('admin ends the helper\'s access', s == 200, x)
    check('expired helper: no lists, no entries, no emergency info', items('/api/collections/lists/records', H) == [] and items('/api/collections/shop_items/records', H) == []
          and items('/api/collections/kid_care/records', H) == [], '')
    s, x = create('/api/collections/shop_items/records', H, {'family': FAM, 'name': 'X', 'list': LT})
    check('expired helper cannot add to-dos any more', s in REFUSED, (s, x))
    s, x = call('POST', '/api/djuu/cal-take', H, {'id': EV, 'chg': {k3: {'del': True}}})
    check('expired helper cannot change calendar days', s == 403, (s, x))

    # ---------------- calendar limits (security review 21 Nov 2026) ----------------
    base = start + datetime.timedelta(days=7 * 20)
    many = {ymd(start + datetime.timedelta(days=7 * n)): {'title': f'x{n}'} for n in range(1, 62)}
    s, x = create('/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'event', 'title': 'Viele', 'date': ymd(start), 'repeat': 'weekly', 'changes': many, 'added_by': MA})
    check('calendar: more than 60 changed days per entry are refused', s == 400 and code(x) == 'limit_reached', (s, x))
    sixty = dict(list(many.items())[:60])
    old_day = ymd(today - datetime.timedelta(days=200))
    s, e60 = create('/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'event', 'title': 'Sechzig', 'date': ymd(today - datetime.timedelta(days=203)), 'repeat': 'weekly',
                                                                 'changes': {**sixty}, 'overrides': {old_day: MA}, 'added_by': MA})
    check('calendar: 60 changed days are fine; taken-over days long past are dropped', s == 200 and len(e60.get('changes', {})) == 60 and old_day not in (e60.get('overrides') or {}), (s, str(e60)[:200]))
    s, x = call('POST', '/api/djuu/cal-take', A, {'id': e60.get('id'), 'chg': {ymd(start + datetime.timedelta(days=7 * 70)): {'del': True}}})
    check('calendar: cal-take refuses a 61st changed day', s == 400 and code(x) == 'limit_reached', (s, x))
    s, x = call('PATCH', f"/api/collections/cal_entries/records/{e60.get('id')}", A, {'changes': {**sixty, ymd(today - datetime.timedelta(days=196)): {'del': True}}})
    check('calendar: changed days long past are dropped on save (they do not count)', s == 200 and len(x.get('changes', {})) == 60, (s, len((x or {}).get('changes', {}) or {})))
    far = ymd(start + datetime.timedelta(days=7 * 75))  # about 525 days ahead: outside the feed's window
    s, ef = create('/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'event', 'title': 'Fern', 'date': ymd(start), 'time_from': '09:00', 'repeat': 'weekly',
                                                                'changes': {far: {'title': 'Ganz fern'}, k1: {'title': 'Nah'}}, 'added_by': MA})
    s, feed = call('GET', f"/api/djuu/cal/{ct.get('token')}.ics", raw=True)
    flat = str(feed).replace('\r\n ', '')
    check('feed: changed days only within its window (-60 … +400 days)', 'SUMMARY:Nah' in flat and 'Ganz fern' not in flat, '')

    # reminders: at most 200 entries with an alarm per Wir; the alarm scan stays quick with many changed days
    s, l = call('GET', f"/api/collections/cal_entries/records?perPage=1&filter={urllib.request.quote(chr(97) + 'larm!=' + chr(39) + chr(39))}", A)
    n_alarm, s, x = (l.get('totalItems', 0) if isinstance(l, dict) else 0), 200, {}
    t0 = time.time()
    while s == 200 and n_alarm < 205:
        d0 = today + datetime.timedelta(days=n_alarm % 7)
        chg = {ymd(d0 + datetime.timedelta(days=7 * n)): {'date': ymd(d0 + datetime.timedelta(days=7 * n)), 'title': 'x', 'from': '10:30'} for n in range(1, 61)}
        s, x = create('/api/collections/cal_entries/records', A, {'family': FAM, 'kind': 'event', 'title': f'Alarm {n_alarm}', 'date': ymd(d0), 'time_from': '10:00', 'repeat': 'weekly',
                                                                  'alarm': 'PT15M', 'changes': chg, 'added_by': MA})
        if s == 200: n_alarm += 1
    check('reminders: at most 200 entries with an alarm per Wir', n_alarm == 200 and s == 400 and code(x) == 'limit_reached', (n_alarm, s, x))
    s, x = call('PATCH', f"/api/collections/cal_entries/records/{EV}", A, {'alarm': 'PT1H'})
    check('reminders: … also when an alarm is added to an existing entry', s == 400 and code(x) == 'limit_reached', (s, x))
    t0 = time.time(); s, feed = call('GET', f"/api/djuu/cal/{ct.get('token')}.ics", raw=True); tf = time.time() - t0
    check('feed: quick with 200 entries of 60 changed days each', s == 200 and tf < 5 and str(feed).count('BEGIN:VEVENT') <= 3600, (s, round(tf, 2), str(feed).count('BEGIN:VEVENT')))
    SECRET = os.environ.get('DJUU_PUSH_SECRET', '')
    if SECRET:
        t0 = time.time(); s, x = call('POST', '/api/djuu/push/claim', None, {}, headers={'X-Djuu-Push': SECRET}); tc = time.time() - t0
        check('push: the alarm scan stays under a second with 200 such entries', s == 200 and tc < 1.0, (s, round(tc, 2)))
    else:
        skip('push: alarm scan time', 'set DJUU_PUSH_SECRET to run it (stop the push container meanwhile)')

    # ---------------- limit ----------------
    n, s = len(items('/api/collections/lists/records?perPage=200', A) or []), 200
    while s == 200 and n < 60:
        s, x = create('/api/collections/lists/records', A, {'family': FAM, 'name': f'L{n}', 'kind': 'todo'})
        n += 1
    check('at most 50 lists per Wir', s == 400 and code(x) == 'limit_reached' and n == 51, (n, s, x))
    s, x = call('DELETE', f'/api/collections/kid_care/records/{CARE}', A)
    check('admin deletes the emergency info', s == 204, (s, x))
finally:
    for fam in families:
        call('DELETE', f'/api/collections/families/records/{fam}', SU)
    for u in users.values():
        if u.get('id'): call('DELETE', f"/api/collections/users/records/{u['id']}", SU)

print(f'\n{sum(results)} of {len(results)} checks passed' + (f', {len(skipped)} skipped' if skipped else ''))
sys.exit(0 if all(results) else 1)
