/* Djuu sync: the shared family on the Djuu server (PocketBase at window.DJUU_API).
   Sign in with e-mail and password (confirmed by a link), create or join a Wir, then the family profile, shopping list, errands, saved offers and places
   and visits are the same on every phone, live. Changes without network wait in an outbox and go out later.
   How it works: every save() compares the local data with the last known server state ("shadow") and queues the
   differences; changes from others arrive over the realtime connection and update both. Without login nothing leaves the device.
   Loaded after app.js and family.js. */
'use strict'; // i18n-skip

const API = (window.DJUU_API || '').replace(/\/$/, '');
const AUTH_KEY = 'djuu.auth', OUT_KEY = 'djuu.outbox', SHADOW_KEY = 'djuu.shadow';
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const writeJson = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
let auth = readJson(AUTH_KEY, null); // { token, userId, email, family, member, familyName }
let outbox = readJson(OUT_KEY, []);
let shadow = readJson(SHADOW_KEY, {});
const SY = { busy: false, error: '', calToken: '', pings: [], online: true, invite: null };
const when = t => Date.parse(String(t || '').replace(' ', 'T')) || Date.now();
const isPbId = id => typeof id === 'string' && /^[a-z0-9]{15}$/.test(id);

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(auth?.token ? { Authorization: auth.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { const err = new Error('offline'); err.status = 0; throw err; }
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
  if (!r.ok) { const err = new Error(data?.message || String(r.status)); err.status = r.status; err.data = data; throw err; }
  return data;
}
const listAll = async (coll, filter = '') => (await api('GET', `/api/collections/${coll}/records?perPage=500${filter ? '&filter=' + encodeURIComponent(filter) : ''}`)).items;

// ---------- What is synced: local shape <-> server record ----------
const memberRef = id => (isPbId(id) && members().some(m => m.id === id) ? id : '');
const OFFER_SNAP = ['title', 'url', 'venue', 'address', 'provider', 'kind', 'weekday', 'time_from', 'time_to', 'start_date', 'end_date'];
const SPECS = {
  members: {
    local: () => store.profile.adults.map(a => ({ ...a, _kind: 'adult' })).concat(store.profile.kids.filter(k => !k.remote).map(k => ({ ...k, _kind: 'kid' })), (store.profile.dogList || []).map(d => ({ ...d, _kind: 'dog' }))),
    key: x => x.id, newId: x => x.id,
    // group, admin, access and e-mail are not in here: only the admin changes them, through /api/djuu/member
    payload: x => ({ name: (x.name || '').slice(0, 30) || (x._kind === 'kid' ? tl('Kind') : x._kind === 'dog' ? '' : tl('Erwachsene*r')), kind: x._kind, birth_ym: x.ym || '', birth_day: (String(x.ym || '').length === 7 && +x.d) || 0, birth_approx: !!x.approx, school: x.school || '', size: x.size || '', shoe: x.shoe || '', work: x.work || '', role: x.role || '', color: x.color || '', photo: x.photo || '' }),
    keep: s => s.account, // members with an account leave only by deleting their account
    setAll(rs) {
      const kid = r => ({ id: r.id, name: r.name, ym: r.birth_ym, d: r.birth_day ? String(r.birth_day) : '', approx: !!r.birth_approx, school: r.school, size: r.size, shoe: r.shoe, color: r.color || '', photo: r.photo || '' });
      const lvl = v => v || 'edit';
      store.profile.adults = rs.filter(r => r.kind === 'adult').map(r => ({ id: r.id, name: r.name, work: r.work, role: r.role || '', color: r.color || '', photo: r.photo || '', account: !!r.user, user: r.user || '', grp: r.grp || 'family', admin: !!r.is_admin,
        perms: { shop: lvl(r.perm_shop), errands: lvl(r.perm_errands), cal: lvl(r.perm_cal), saved: lvl(r.perm_saved) }, until: r.access_until ? String(r.access_until).slice(0, 10) : '', email: r.email || '', at: when(r.created) }));
      store.profile.kids = rs.filter(r => r.kind === 'kid').map(kid).concat(store.profile.kids.filter(k => k.remote)); // helpers: ages from helperKids()
      store.profile.dogList = rs.filter(r => r.kind === 'dog').map(r => ({ id: r.id, name: r.name || '', photo: r.photo || '' })); // helpers get none
    },
    shadowExtra: r => ({ account: !!r.user }),
  },
  shop_items: {
    local: () => store.shop.items, key: x => x.id, newId: x => x.id,
    payload: x => ({ name: x.name, qty: x.qty || '', cat: x.cat || 'sonst', added_by: memberRef(x.by), done_by: memberRef(x.doneBy), done: !!x.done, later: !!x.later }),
    setAll(rs) { store.shop.items = rs.map(r => ({ id: r.id, name: r.name, qty: r.qty, cat: r.cat, by: r.added_by, doneBy: r.done_by, done: r.done, later: r.later, at: when(r.created) })); resortSonst(); },
  },
  errands: {
    local: () => store.errands, key: x => x.id, newId: x => x.id,
    payload: x => ({ title: x.title, link: x.link || '', for_member: memberRef(x.for), price: x.price || '', note: x.note || '', state: x.state || 'idee', added_by: memberRef(x.by) }),
    setAll(rs) { store.errands = rs.sort((a, b) => b.created.localeCompare(a.created)).map(r => ({ id: r.id, title: r.title, link: r.link, for: r.for_member, price: r.price, note: r.note, state: r.state, by: r.added_by, at: when(r.created) })); },
  },
  saved_offers: {
    local: () => store.savedOffers, key: x => x.id,
    payload: x => { const o = OFFER_BY_ID.get(x.id); return { offer_id: x.id, snap: o ? Object.fromEntries(OFFER_SNAP.map(k => [k, o[k] ?? null])) : x.snap, saved_by: memberRef(x.by) }; },
    setAll(rs) { store.savedOffers = rs.map(r => ({ id: r.offer_id, at: when(r.created), snap: r.snap || {}, by: r.saved_by })); },
    recordKey: r => r.offer_id,
  },
  saved_places: {
    local: () => store.favorites.map(id => ({ id })), key: x => x.id,
    payload: x => ({ place_id: x.id, saved_by: memberRef(store.favBy?.[x.id]) }),
    setAll(rs) { store.favorites = rs.map(r => r.place_id); store.favBy = Object.fromEntries(rs.map(r => [r.place_id, r.saved_by])); },
    recordKey: r => r.place_id,
  },
  visits: {
    local: () => Object.entries(store.visits).flatMap(([id, days]) => days.map(day => ({ id, day }))), key: x => x.id + '|' + x.day,
    payload: x => ({ offer_id: x.id, day: x.day, added_by: memberRef(meId()) }),
    setAll(rs) { store.visits = {}; for (const r of rs.sort((a, b) => a.day.localeCompare(b.day))) (store.visits[r.offer_id] || (store.visits[r.offer_id] = [])).push(r.day); },
    recordKey: r => r.offer_id + '|' + r.day,
    same: (a, b) => a.offer_id === b.offer_id && a.day === b.day, // who added it does not matter
  },
  // Meine Orte: my own places (private or shared with the Wir) plus the places others shared; only my own ones go up
  places: {
    filter: '',
    local: () => (store.places || []).filter(x => x.mine !== false), key: x => x.id, newId: x => x.id,
    payload: x => ({ owner: auth.userId, family: x.shared ? auth.family : '', name: (x.name || '').slice(0, 40), plz: x.plz || '', address: x.address || '', lat: x.lat || 0, lon: x.lon || 0, shared: !!x.shared, is_default: !!x.def }),
    setAll(rs) {
      const byUser = u => store.profile.adults.find(a => a.user && a.user === u)?.name || '';
      store.places = rs.map(r => { const mine = r.owner === auth.userId; return { id: r.id, name: r.name, plz: r.plz, address: r.address, lat: r.lat, lon: r.lon, shared: r.shared, def: mine && r.is_default, mine, byName: mine ? '' : byUser(r.owner) }; });
    },
  },
  shop_memory: {
    local: () => [{ k: 'm' }], key: () => 'm',
    payload: () => ({ history: store.shop.history, learned: store.shop.learned, rank: store.shop.rank, trips: store.shop.trips }),
    setAll(rs) { const r = rs[0]; if (r) Object.assign(store.shop, { history: r.history || {}, learned: r.learned || {}, rank: r.rank || {}, trips: r.trips || 0 }); },
    recordKey: () => 'm',
  },
};
const COLLS = Object.keys(SPECS);

// ---------- Outbox ----------
function queue(op) {
  // fold with what is still waiting for the same record
  const i = outbox.findIndex(o => o.coll === op.coll && o.id === op.id);
  if (i >= 0) {
    const prev = outbox[i];
    if (op.op === 'update' && prev.op !== 'delete') { prev.data = { ...prev.data, ...op.data }; return saveOutbox(); }
    if (op.op === 'delete' && prev.op === 'create') { outbox.splice(i, 1); return saveOutbox(); }
  }
  outbox.push(op); saveOutbox();
}
const saveOutbox = () => writeJson(OUT_KEY, outbox);
const saveShadow = () => writeJson(SHADOW_KEY, shadow);

// local data vs. last known server state -> operations
function diffAll() {
  if (!auth?.family) return;
  for (const coll of COLLS) {
    const spec = SPECS[coll], sh = shadow[coll] || (shadow[coll] = {});
    const local = new Map(spec.local().map(x => [spec.key(x), x]));
    for (const [k, x] of local) {
      const p = spec.payload(x), ps = JSON.stringify(p), s = sh[k];
      if (!s) {
        const id = spec.newId && isPbId(spec.newId(x)) ? spec.newId(x) : pbId();
        sh[k] = { id, p: ps };
        queue({ coll, op: 'create', id, data: { family: auth.family, ...p, id } });
      } else if (s.p !== ps && !(spec.same && spec.same(JSON.parse(s.p), p))) {
        s.p = ps;
        queue({ coll, op: 'update', id: s.id, data: p });
      }
    }
    for (const k of Object.keys(sh)) if (!local.has(k)) { if (spec.keep && spec.keep(sh[k])) continue; queue({ coll, op: 'delete', id: sh[k].id }); delete sh[k]; }
  }
  saveShadow();
}
let flushing = false;
async function flush() {
  if (flushing || !auth?.family) return;
  flushing = true;
  try {
    while (outbox.length) {
      const o = outbox[0], path = `/api/collections/${o.coll}/records`;
      try {
        if (o.op === 'create') await api('POST', path, o.data);
        else if (o.op === 'update') await api('PATCH', `${path}/${o.id}`, o.data);
        else await api('DELETE', `${path}/${o.id}`);
        SY.online = true;
      } catch (e) {
        if (!e.status) { SY.online = false; break; } // no network: try again later
        if (e.status === 401) { SY.online = false; break; } // token expired: refreshed on next start
        if (o.op === 'create' && e.status === 400) { try { const { id, family, ...rest } = o.data; await api('PATCH', `${path}/${o.id}`, rest); } catch (x) { /* already there under another id: the next reload settles it */ } }
        else if (e.status !== 404) console.warn('Djuu sync: dropped', o, e.message);
      }
      outbox.shift(); saveOutbox();
    }
  } finally { flushing = false; }
}
let syncTimer = null;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { syncTimer = null; diffAll(); flush(); }, 250); }

// every local save also syncs
const saveLocal = save;
save = function () { saveLocal(); if (auth?.family) scheduleSync(); };

// ---------- Loading and live updates ----------
async function loadAll() {
  const f = `family='${auth.family}'`;
  const data = {};
  for (const coll of COLLS) {
    try { data[coll] = await listAll(coll, SPECS[coll].filter ?? f); }
    catch (e) { if (!e.status) throw e; data[coll] = null; } // a collection the server does not have (yet): keep what is on this phone
  }
  for (const coll of COLLS) {
    const spec = SPECS[coll], rs = data[coll];
    if (!rs) continue;
    RECS[coll] = rs;
    spec.setAll(rs);
    shadow[coll] = {};
    for (const x of spec.local()) {
      const k = spec.key(x), r = rs.find(r => (spec.recordKey ? spec.recordKey(r) : r.id) === k);
      if (r) shadow[coll][k] = { id: r.id, p: JSON.stringify(spec.payload(x)), ...(spec.shadowExtra ? spec.shadowExtra(r) : {}) };
    }
  }
  store.profile.me = auth.member;
  await helperKids();
  try { const f = await api('GET', `/api/collections/families/records/${auth.family}`); auth.familyName = f.name; store.wirPhoto = f.photo || ''; writeJson(AUTH_KEY, auth); } catch (e) { /* keep */ }
  // news: what others created since this phone last looked (the first time only remembers the moment)
  if (store.newsSince) for (const coll of ['shop_items', 'errands', 'saved_offers', 'members']) for (const r of (data[coll] || [])) if (when(r.created) > store.newsSince) newsFromRecord(coll, r);
  store.newsSince = Date.now(); holidayNews(); courseBlockNews(); assignColors();
  saveShadow(); saveLocal();
  await loadPings();
}
let es = null;
function connectRealtime() {
  if (es) es.close();
  es = new EventSource(API + '/api/realtime');
  es.addEventListener('PB_CONNECT', async e => {
    try {
      await api('POST', '/api/realtime', { clientId: JSON.parse(e.data).clientId, subscriptions: COLLS.concat('pings', 'families') });
      SY.online = true;
      if (SY.connectedBefore) { await flush(); await loadAll(); rerender(); } // events may have been missed while away
      SY.connectedBefore = true;
    } catch (x) { /* retried on the next connect */ }
  });
  for (const coll of COLLS) es.addEventListener(coll, e => applyRemote(coll, JSON.parse(e.data)));
  es.addEventListener('families', e => { const { action, record } = JSON.parse(e.data); if (action === 'update' && record.id === auth?.family) { auth.familyName = record.name; store.wirPhoto = record.photo || ''; writeJson(AUTH_KEY, auth); saveLocal(); rerender(); } });
  es.addEventListener('pings', e => { const { action, record } = JSON.parse(e.data); SY.pings = SY.pings.filter(p => p.id !== record.id); if (action !== 'delete') SY.pings.unshift(record); showPingBar(); });
}
// Server records as last seen, per collection; local data = these plus own changes still waiting in the outbox.
const RECS = {};
function withPending(coll) {
  const recs = (RECS[coll] || []).map(r => ({ ...r }));
  for (const o of outbox) {
    if (o.coll !== coll) continue;
    const i = recs.findIndex(r => r.id === o.id);
    if (o.op === 'delete') { if (i >= 0) recs.splice(i, 1); }
    else if (i >= 0) Object.assign(recs[i], o.data);
    else recs.push({ created: new Date().toISOString(), ...o.data });
  }
  return recs;
}
function applyRemote(coll, { action, record }) {
  // own changes from the last moment (still waiting for the 250 ms pause) go into the outbox first, so they win
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; diffAll(); flush(); }
  const spec = SPECS[coll], sh = shadow[coll] || (shadow[coll] = {});
  RECS[coll] = (RECS[coll] || []).filter(r => r.id !== record.id);
  if (action !== 'delete') RECS[coll].push(record);
  if (outbox.some(o => o.coll === coll && o.id === record.id)) return; // our own change is still on its way and wins
  spec.setAll(withPending(coll));
  if (action === 'create') newsFromRecord(coll, record);
  if (coll === 'members') assignColors();
  store.newsSince = Date.now();
  const k = spec.recordKey ? spec.recordKey(record) : record.id;
  if (action === 'delete') delete sh[k];
  else { const x = spec.local().find(x => spec.key(x) === k); if (x) sh[k] = { id: record.id, p: JSON.stringify(spec.payload(x)), ...(spec.shadowExtra ? spec.shadowExtra(record) : {}) }; }
  saveShadow(); saveLocal(); rerender();
}
// rerender the views that show synced data, but never under a typing finger
let pendingRender = false;
function rerender() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('#panelBody input, #panelBody textarea, #panelBody select')) { pendingRender = true; return; }
  pendingRender = false;
  if (['me', 'favs', 'events', 'offer', 'detail', 'wir', 'person'].includes(view().type)) renderPanel();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) rerender(); }, 200));

// ---------- Login, family, invite ----------
async function startSession() {
  if (!API || !auth?.token) return;
  try {
    const r = await api('POST', '/api/collections/users/auth-refresh');
    auth.token = r.token; writeJson(AUTH_KEY, auth); userPrefs(r.record);
  } catch (e) { if (e.status === 401) { logout(true); return; } SY.online = false; return; } // offline: keep working locally
  if (!auth.family) { await findFamily(); if (!auth.family) return rerender(); }
  await flush();
  try { await loadAll(); } catch (e) { SY.online = false; }
    connectRealtime(); rerender(); showPingBar();
}
async function findFamily() {
  const ms = await listAll('members', `user='${auth.userId}'`);
  if (ms[0]) { auth.family = ms[0].family; auth.member = ms[0].id; const f = await api('GET', `/api/collections/families/records/${auth.family}`); auth.familyName = f.name; writeJson(AUTH_KEY, auth); }
}
// Helpers do not see the children's records (birth dates stay in the family); the server tells them name and age only.
async function helperKids() {
  const me = store.profile.adults.find(a => a.id === auth.member);
  if (me?.grp !== 'helper') { store.profile.kids = store.profile.kids.filter(k => !k.remote); return; }
  try { store.profile.kids = (await api('GET', '/api/djuu/kids')).kids.map(k => ({ id: k.id, name: k.name, ageMin: k.min, ageMax: k.max, remote: true })); }
  catch (e) { /* keep what is known */ }
}
// personal settings kept in the account (on every phone of this person): news topics that are switched off
function userPrefs(rec) {
  const off = rec?.news_prefs?.off;
  if (Array.isArray(off)) { store.newsOff = off.filter(x => typeof x === 'string').slice(0, 20); saveLocal(); if (typeof updateBell === 'function') updateBell(); }
}
// ---------- Account: register, confirm the e-mail, sign in, passwords ----------
const PENDING_KEY = 'djuu.pendingEmail', JOIN_KEY = 'djuu.join';
async function signIn(email, password) {
  const r = await api('POST', '/api/collections/users/auth-with-password', { identity: email.trim(), password });
  auth = { token: r.token, userId: r.record.id, email: r.record.email }; userPrefs(r.record);
  writeJson(AUTH_KEY, auth);
  try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage blocked */ }
  await findFamily();
  // this person's Wir exists already (second phone): the server's state replaces the local one
  if (auth.family) { await flush(); await loadAll(); connectRealtime(); showPingBar(); }
  return auth;
}
async function register(email, password) {
  email = email.trim();
  await api('POST', '/api/collections/users/records', { email, password, passwordConfirm: password });
  await api('POST', '/api/collections/users/request-verification', { email });
  try { localStorage.setItem(PENDING_KEY, email); } catch (e) { /* storage blocked */ }
}
const resendVerification = email => api('POST', '/api/collections/users/request-verification', { email });
const confirmVerification = token => api('POST', '/api/collections/users/confirm-verification', { token });
const requestReset = email => api('POST', '/api/collections/users/request-password-reset', { email: email.trim() });
const confirmReset = (token, password) => api('POST', '/api/collections/users/confirm-password-reset', { token, password, passwordConfirm: password });
// sensitive steps ask for the password again
async function checkPassword(password) { await api('POST', '/api/collections/users/auth-with-password', { identity: auth.email, password }); }
async function changePassword(oldPassword, password) {
  await api('PATCH', `/api/collections/users/records/${auth.userId}`, { oldPassword, password, passwordConfirm: password });
  await signIn(auth.email, password); // a new password ends all old sessions, this phone signs in again
}
async function requestEmailChange(password, newEmail) { await checkPassword(password); await api('POST', '/api/collections/users/request-email-change', { newEmail: newEmail.trim() }); }
const confirmEmailChange = (token, password) => api('POST', '/api/collections/users/confirm-email-change', { token, password });
const inviteInfo = token => api('GET', `/api/djuu/invite-info/${encodeURIComponent(token)}`);
// local ids from before the family existed become server ids, references follow
function adoptLocalIds(myLocalId, myServerId) {
  const map = {};
  for (const m of members()) map[m.id] = m.id === myLocalId ? myServerId : (isPbId(m.id) ? m.id : pbId());
  const re = id => map[id] || id;
  for (const a of store.profile.adults) a.id = re(a.id);
  for (const k of store.profile.kids) k.id = re(k.id);
  for (const i of store.shop.items) { i.id = isPbId(i.id) ? i.id : pbId(); i.by = re(i.by); i.doneBy = re(i.doneBy); }
  for (const e of store.errands) { e.id = isPbId(e.id) ? e.id : pbId(); e.for = re(e.for); e.by = re(e.by); }
  for (const s of store.savedOffers) s.by = re(s.by);
  store.profile.me = myServerId;
}
async function createFamily(myName, familyName, role) {
  const r = await api('POST', '/api/djuu/family', { myName, name: familyName, role: role || '', state: store.profile.state || 'DE-HH' });
  await enterFamily(r, myName, true);
}
async function joinFamily(token, myName, role) {
  const r = await api('POST', '/api/djuu/join', { token, myName, role: role || '' });
  try { localStorage.removeItem(JOIN_KEY); } catch (e) { /* storage blocked */ }
  SY.invite = null;
  // the family's members come from the server; the shared lists of this phone are added to the family's
  store.profile.adults = []; store.profile.kids = [];
  await enterFamily(r, myName, false);
}
async function enterFamily(r, myName, keepMembers) {
  auth.family = r.family; auth.member = r.member;
  const f = await api('GET', `/api/collections/families/records/${r.family}`); auth.familyName = f.name;
  writeJson(AUTH_KEY, auth);
  const meLocal = keepMembers ? (meId() || null) : null;
  if (keepMembers && !store.profile.adults.some(a => a.id === meLocal)) store.profile.adults.unshift({ id: 'me', name: myName });
  adoptLocalIds(keepMembers ? (meLocal || 'me') : null, r.member);
  // the server already has: my member (with the role chosen when joining) and the shop memory record
  const myRec = await api('GET', `/api/collections/members/records/${r.member}`);
  const me = store.profile.adults.find(a => a.id === r.member);
  if (me) { me.name = me.name || myName; me.account = true; me.role = me.role || myRec.role || ''; } else store.profile.adults.unshift({ id: r.member, name: myName, account: true, role: myRec.role || '' });
  const mem = (await listAll('shop_memory', `family='${r.family}'`))[0];
  shadow = {};
  shadow.members = { [r.member]: { id: r.member, p: JSON.stringify(SPECS.members.payload({ ...myRec, _kind: 'adult', name: myRec.name, work: myRec.work, role: myRec.role })), account: true } };
  if (mem) shadow.shop_memory = { m: { id: mem.id, p: '' } }; // differs on purpose: our memory goes up once
  saveShadow(); saveLocal();
  diffAll(); await flush();
  await loadAll(); connectRealtime();
}
function logout(silent) {
  if (es) { es.close(); es = null; }
  auth = null; outbox = []; shadow = {}; SY.pings = [];
  writeJson(AUTH_KEY, null); writeJson(OUT_KEY, null); writeJson(SHADOW_KEY, null);
  showPingBar(); if (typeof updateBell === 'function') updateBell(); if (!silent) toast(tl('Abgemeldet.'));
  rerender();
}
// the warning and the password are asked in Wir › Konto & Anmeldung (wir.js)
async function deleteAccount(password) {
  await api('POST', '/api/djuu/delete-account', { password });
  // nothing of the deleted account stays on this phone either
  Object.assign(store.shop, { items: [], history: {}, learned: {}, rank: {}, trips: 0, seq: [] });
  store.errands = []; store.savedOffers = []; store.favorites = []; store.favBy = {}; store.visits = {}; store.places = []; store.fit = null;
  store.profile.adults = []; store.profile.kids = []; store.profile.dogList = []; store.wirPhoto = ''; store.news = []; store.newsSince = 0; store.onboarded = false;
  logout(true); saveLocal();
}

// ---------- "Wo seid ihr?" ----------
async function loadPings() {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString().replace('T', ' ');
  try { SY.pings = (await api('GET', `/api/collections/pings/records?perPage=50&sort=-created&filter=${encodeURIComponent(`created>'${since}'`)}`)).items; } catch (e) { SY.pings = []; }
  showPingBar();
}
const nameOf = id => memberById(id)?.name || tl('Jemand');
async function askWhere(memberId) {
  try { await api('POST', '/api/collections/pings/records', { family: auth.family, from: auth.member, to: memberId }); toast(`${tl('Gefragt.')} ${nameOf(memberId)} ${tl('sieht die Frage beim nächsten Öffnen von Djuu.')}`); }
  catch (e) { toast('Das hat nicht geklappt. Bitte mit Netz noch einmal versuchen.'); }
}
function answerPing(id, share) {
  const send = body => api('PATCH', `/api/collections/pings/records/${id}`, { ...body, answered: new Date().toISOString().replace('T', ' ') })
    .then(() => toast(share ? tl('Standort einmal gesendet.') : tl('Erledigt.')), () => toast('Senden hat nicht geklappt.'));
  if (!share) return send({});
  if (!navigator.geolocation) return toast('Dieses Gerät kann den Standort nicht bestimmen.');
  navigator.geolocation.getCurrentPosition(p => send({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
    () => toast('Standort nicht verfügbar. Bitte im Browser erlauben.'), { enableHighAccuracy: true, timeout: 15000 });
}
const seenPings = new Set(readJson('djuu.pingsSeen', []));
function showPingBar() {
  let bar = document.getElementById('pingbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'pingbar'; bar.className = 'pingbar'; document.body.appendChild(bar); }
  const me = auth?.member;
  const ask = me && SY.pings.find(p => p.to === me && !p.answered && !seenPings.has(p.id));
  const ans = me && SY.pings.find(p => p.from === me && p.answered && !seenPings.has(p.id));
  if (ask) bar.innerHTML = `<b>${esc(nameOf(ask.from))} ${tl('fragt: Wo bist du?')}</b><div><button type="button" class="btn primary" data-pinganswer="${ask.id}">${tl('Standort einmal senden')}</button><button type="button" class="btn" data-pingno="${ask.id}">${tl('Nicht jetzt')}</button></div>`;
  else if (ans) bar.innerHTML = ans.lat != null
    ? `<b>${esc(nameOf(ans.to))} ${tl('hat den Standort geschickt.')}</b><div><button type="button" class="btn primary" data-pingshow="${ans.id}">${tl('Auf der Karte zeigen')}</button><button type="button" class="btn" data-pingok="${ans.id}">OK</button></div>`
    : `<b>${esc(nameOf(ans.to))} ${tl('möchte den Standort gerade nicht senden.')}</b><div><button type="button" class="btn" data-pingok="${ans.id}">OK</button></div>`;
  bar.hidden = !(ask || ans);
}
const markSeen = id => { seenPings.add(id); writeJson('djuu.pingsSeen', [...seenPings].slice(-100)); showPingBar(); };
let pingMarker = null;
function showPingOnMap(p) {
  if (pingMarker) map.removeLayer(pingMarker);
  const m = memberById(p.to), c = m?.color || '#6B4EE6';
  pingMarker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [44, 44], html: `<div class="mkhit"><div class="pingdot" style="--c:${c}">${esc((m?.name || '?').slice(0, 1))}</div></div>` }) })
    .bindTooltip(`${esc(m?.name || '')}, ${new Date(p.answered.replace(' ', 'T')).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} ${tl('Uhr, ±')}${p.accuracy || '?'} m`, { permanent: true, direction: 'top', offset: [0, -16] })
    .addTo(map);
  home('peek'); map.setView([p.lat, p.lon], 16);
}

// ---------- Family calendar subscription ----------
async function calendarLink(renew) {
  const r = await api('POST', '/api/djuu/calendar', renew ? { renew: true } : {});
  SY.calToken = r.token; renderPanel();
}
const calUrl = () => `${API.replace(/^https:/, 'webcal:')}/api/djuu/cal/${SY.calToken}.ics`;

// ---------- The "Wir" card ----------
// the family calendar subscription (Wir › Einstellungen › Familienkalender)
function calHtml() {
  if (!auth?.family) return '';
  return SY.calToken ? `<p class="text">${tl('Alle gemerkten Termine erscheinen automatisch in eurem Kalender.')}</p>
      <div class="calmenu"><a class="btn" href="${esc(calUrl())}">${svg('cal')}${tl('iPhone, Mac, Outlook: abonnieren')}</a>
      <a class="btn" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calUrl())}" target="_blank" rel="noopener">${svg('cal')}${tl('Google Kalender: abonnieren')}</a>
      <button type="button" class="linkbtn" data-sycalcopy="1">${tl('Adresse kopieren')}</button> <button type="button" class="linkbtn" data-sycalrenew="1">${tl('Neue Adresse (alte wird ungültig)')}</button></div>
      <p class="note">${tl('Kalender-Apps holen Änderungen meist alle paar Stunden. Wer die Adresse hat, sieht eure gemerkten Termine, also nur in der Familie teilen.')}</p>`
    : `<p class="text">${tl('Abonniere eure gemerkten Termine in der Kalender-App deines Handys.')}</p><button type="button" class="btn" data-sycal="1">${svg('cal')}${tl('Familienkalender einrichten')}</button>`;
}

// ---------- Interaction ----------
const run = async (fn, okMsg) => {
  SY.busy = true; SY.error = ''; renderPanel();
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { SY.error = !e.status ? tl('Keine Verbindung. Bitte später noch einmal.') : e.data?.message || e.message; }
  SY.busy = false; renderPanel();
};
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.sylogout) { logout(); home(); }
  else if (d.syask) askWhere(d.syask);
  else if (d.sycal) run(() => calendarLink(false));
  else if (d.sycalrenew) { if (confirm(tl('Neue Adresse erzeugen? Wer den Kalender schon abonniert hat, muss ihn neu abonnieren.'))) run(() => calendarLink(true)); }
  else if (d.sycalcopy) navigator.clipboard?.writeText(calUrl().replace(/^webcal:/, 'https:')).then(() => toast('Adresse kopiert.'), () => toast(calUrl()));
  else if (d.pinganswer) { answerPing(d.pinganswer, true); markSeen(d.pinganswer); }
  else if (d.pingno) { answerPing(d.pingno, false); markSeen(d.pingno); }
  else if (d.pingshow) { const p = SY.pings.find(x => x.id === d.pingshow); if (p) showPingOnMap(p); markSeen(d.pingshow); }
  else if (d.pingok) markSeen(d.pingok);
});
window.addEventListener('online', () => { SY.online = true; flush(); });

// an invite link opens the Wir: who invites, then sign up or sign in and join (wir.js shows the pages)
(() => {
  const m = location.hash.match(/^#join=([A-Za-z0-9]+)/);
  if (m) { try { localStorage.setItem(JOIN_KEY, m[1]); } catch (e) { /* storage blocked */ } history.replaceState(null, '', location.pathname); }
  try { SY.invite = localStorage.getItem(JOIN_KEY); } catch (e) { SY.invite = null; }
  if (SY.invite && auth?.family) { try { localStorage.removeItem(JOIN_KEY); } catch (e) { /* storage blocked */ } SY.invite = null; setTimeout(() => toast(tl('Du bist schon in einem Wir.')), 1500); }
})();
if (API) setTimeout(startSession, 800); // after offers are loaded, so saved offers carry full calendar data
