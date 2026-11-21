/* Djuu sync: the shared family on the Djuu server (PocketBase at window.DJUU_API).
   Sign in with e-mail and password (confirmed by a link), create or join a Wir, then the family profile, shopping list, errands, saved offers and places,
   the lists, the calendar and the emergency information are the same on every phone, live. Changes without network wait in an outbox and go out later.
   How it works: RECS holds the records as the server last confirmed them, the "shadow" the same state in the app's own shape.
   Every save() compares the local data with shadow plus what is still waiting, and queues only the fields that changed
   (the last change of a field wins). Changes from others arrive over the realtime connection; the local data is then
   rebuilt as "server state + own changes still on the way" (settle). A change the server refuses comes back from the server
   (or, for a new entry, stays on this phone marked "nicht gespeichert"), with one calm toast saying why.
   When the session ends (signed out elsewhere, new password, 90 days) nothing is thrown away: the phone asks once to sign in
   again and sends what is waiting afterwards. When the Wir is gone or the access ended, the family data leaves this phone.
   Without login nothing leaves the device. Loaded after app.js and family.js. */
'use strict'; // i18n-skip

const API = (window.DJUU_API || '').replace(/\/$/, '');
const AUTH_KEY = 'djuu.auth', OUT_KEY = 'djuu.outbox', SHADOW_KEY = 'djuu.shadow', UNSAVED_KEY = 'djuu.unsaved';
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const writeJson = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
// { token, userId, email, family, member, familyName, ended (session over, sign in again), gone ({ kind, date }: the Wir is no longer there) }
let auth = readJson(AUTH_KEY, null);
let outbox = readJson(OUT_KEY, []);
let shadow = readJson(SHADOW_KEY, {});
let unsaved = readJson(UNSAVED_KEY, {}); // coll -> id -> { data, reason }: new entries the server refused, kept on this phone
const SY = { busy: false, error: '', calToken: '', pings: [], online: true, invite: null, live: false, userRec: null, pendingSignIn: null, emails: {} };
const when = t => Date.parse(String(t || '').replace(' ', 'T')) || Date.now();
const isPbId = id => typeof id === 'string' && /^[a-z0-9]{15}$/.test(id);
// stable JSON (sorted keys), so the same content always compares equal
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x);

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(auth?.token ? { Authorization: auth.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { const err = new Error('offline'); err.status = 0; throw err; }
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
  if (!r.ok) {
    // the token is no longer valid (signed out everywhere, new password or e-mail, too old): keep everything, ask to sign in again
    if (r.status === 401 && auth?.token) sessionEnd();
    const err = new Error(data?.message || String(r.status)); err.status = r.status; err.data = data; err.code = data?.code || data?.data?.code || ''; throw err;
  }
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
    // group, admin, access and e-mail are not in here: only the admin changes them, through /api/djuu/member.
    // Photo and colour only where this phone may change them (the server refuses the whole change otherwise).
    payload: x => {
      const p = { name: (x.name || '').slice(0, 30) || (x._kind === 'kid' ? tl('Kind') : x._kind === 'dog' ? '' : tl('Erwachsene*r')), kind: x._kind, birth_ym: x.ym || '', birth_day: (String(x.ym || '').length === 7 && +x.d) || 0, birth_approx: !!x.approx, school: x.school || '', size: x.size || '', shoe: x.shoe || '', work: x.work || '', role: x.role || '' };
      // only values the server takes: #RRGGBB and data:image/...;base64 (anything else is sent as empty)
      if (typeof canEditLooks !== 'function' || canEditLooks(x)) Object.assign(p, { color: /^#[0-9a-f]{6}$/i.test(x.color || '') ? x.color : '', photo: safePhoto(x.photo) });
      return p;
    },
    keep: s => s.account, // members with an account leave only through the server routes
    setAll(rs) {
      const kid = r => ({ id: r.id, name: r.name, ym: r.birth_ym, d: r.birth_day ? String(r.birth_day) : '', approx: !!r.birth_approx, school: r.school, size: r.size, shoe: r.shoe, color: r.color || '', photo: r.photo || '' });
      const lvl = v => v || 'edit';
      store.profile.adults = rs.filter(r => r.kind === 'adult').map(r => ({ id: r.id, name: r.name, work: r.work, role: r.role || '', color: r.color || '', photo: r.photo || '', account: !!r.user, user: r.user || '', grp: r.grp || 'family', admin: !!r.is_admin,
        perms: { shop: lvl(r.perm_shop), errands: lvl(r.perm_errands), cal: lvl(r.perm_cal), saved: lvl(r.perm_saved), care: careLevel(r) }, until: r.access_until ? String(r.access_until).slice(0, 10) : '', email: r.email || '', at: when(r.created) }));
      store.profile.kids = rs.filter(r => r.kind === 'kid').map(kid).concat(store.profile.kids.filter(k => k.remote)); // helpers: ages from helperKids()
      store.profile.dogList = rs.filter(r => r.kind === 'dog').map(r => ({ id: r.id, name: r.name || '', photo: r.photo || '', color: r.color || '' })); // helpers get none
    },
    shadowExtra: r => ({ account: !!r.user }),
  },
  // more lists (lists.js): shopping lists besides the main one, to-do lists, packing lists
  lists: {
    local: () => store.lists || [], key: x => x.id, newId: x => x.id,
    payload: x => ({ name: (x.name || '').slice(0, 40) || tl('Liste'), kind: x.kind || 'shop', sort: +x.sort || 0, archived: !!x.archived }),
    setAll(rs) { store.lists = rs.map(r => ({ id: r.id, name: r.name || '', kind: r.kind || 'shop', sort: r.sort || 0, archived: !!r.archived, at: when(r.created), ...(r._unsaved ? { unsaved: r._unsaved } : {}) })); },
    area: p => (p.kind === 'todo' ? 'errands' : 'shop'),
  },
  // the entries of all lists: the main shopping list (no list), more shopping lists, to-dos (assignee, due) and packing lists
  shop_items: {
    local: () => store.shop.items, key: x => x.id, newId: x => x.id,
    payload: x => ({ name: x.name, qty: x.qty || '', cat: x.cat || 'sonst', added_by: memberRef(x.by), done_by: memberRef(x.doneBy), done: !!x.done, later: !!x.later,
      list: isPbId(x.list) ? x.list : '', assignee: memberRef(x.assignee), due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '' }),
    setAll(rs) {
      store.shop.items = rs.map(r => ({ id: r.id, name: r.name, qty: r.qty, cat: r.cat, by: r.added_by, doneBy: r.done_by, done: r.done, later: r.later,
        ...(r.list ? { list: r.list } : {}), ...(r.assignee ? { assignee: r.assignee } : {}), ...(r.due ? { due: r.due } : {}), at: when(r.created), ...(r._unsaved ? { unsaved: r._unsaved } : {}) }));
      resortSonst();
    },
    // to-dos belong to "Besorgungen", everything else to "Einkauf"
    area: p => (listKindOf(p.list) === 'todo' ? 'errands' : 'shop'),
  },
  // emergency information per child: only admins write it, directly with the consent box (wir.js saveCare); everyone allowed reads it here
  kid_care: {
    local: () => store.kidCare || [], key: x => x.id, readOnly: true,
    payload: x => ({ kid: x.kid }),
    setAll(rs) {
      store.kidCare = rs.map(r => ({ id: r.id, kid: r.kid, allergies: r.allergies || '', meds: r.meds || '', doctor: r.doctor || '', notes: r.notes || '',
        contacts: Array.isArray(r.emergency_contacts) ? r.emergency_contacts.filter(c => c && typeof c === 'object') : [], consentBy: r.consent_by || '', consentAt: r.consent_at || '', at: when(r.updated) }));
    },
  },
  errands: {
    local: () => store.errands, key: x => x.id, newId: x => x.id,
    payload: x => ({ title: x.title, link: x.link || '', for_member: memberRef(x.for), price: x.price || '', note: x.note || '', state: x.state || 'idee', added_by: memberRef(x.by) }),
    setAll(rs) { store.errands = rs.sort((a, b) => String(b.created || '').localeCompare(String(a.created || ''))).map(r => ({ id: r.id, title: r.title, link: r.link, for: r.for_member, price: r.price, note: r.note, state: r.state, by: r.added_by, at: when(r.created), ...(r._unsaved ? { unsaved: r._unsaved } : {}) })); },
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
  // Meine Orte: my own places (private or shared with the Wir) plus the places others shared; only my own ones go up
  places: {
    filter: '',
    local: () => (store.places || []).filter(x => x.mine !== false), key: x => x.id, newId: x => x.id,
    payload: x => ({ owner: auth.userId, family: x.shared ? auth.family : '', name: (x.name || '').slice(0, 40), plz: x.plz || '', address: (x.address || '').slice(0, 120), lat: x.lat || 0, lon: x.lon || 0, shared: !!x.shared, is_default: !!x.def }),
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
  // the family calendar (cal.js): own entries, Bringen/Abholen with taken-over days, Kita-Schließtage
  cal_entries: {
    local: () => store.cal || [], key: x => x.id, newId: x => x.id,
    payload: x => ({ kind: x.kind || 'event', title: (x.title || '').slice(0, 80), date: x.date || '', end_date: x.end || '', time_from: x.from || '', time_to: x.to || '',
      repeat: x.repeat || '', until: x.until || '', who: (x.who || []).filter(isPbId), kids: (x.kids || []).filter(isPbId), overrides: x.overrides || {}, plan: x.plan || '',
      place: (x.place || '').slice(0, 80), alarm: x.alarm || '', note: (x.note || '').slice(0, 200), offer_id: x.offer || '', added_by: memberRef(x.by), changes: x.changes || {} }),
    setAll(rs) {
      const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
      const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      store.cal = rs.map(r => ({ id: r.id, kind: r.kind || 'event', title: r.title || '', date: r.date || '', end: r.end_date || '', from: r.time_from || '', to: r.time_to || '', repeat: r.repeat || '', until: r.until || '',
        who: arr(r.who), kids: arr(r.kids), overrides: obj(r.overrides), changes: obj(r.changes), plan: r.plan || '', place: r.place || '', alarm: r.alarm || '', note: r.note || '', offer: r.offer_id || '', by: r.added_by || '', at: when(r.created), ...(r._unsaved ? { unsaved: r._unsaved } : {}) }));
    },
  },
};
const COLLS = Object.keys(SPECS);
// access to the emergency information (members.perm_care): a server without the field still lets every active adult read it
// (only admins write); an empty value is the default of the group (family edits, helpers see nothing)
function careLevel(r) {
  if (!r || r.perm_care === undefined) return 'view';
  return ['none', 'view', 'edit'].includes(r.perm_care) ? r.perm_care : r.grp === 'helper' ? 'none' : 'edit';
}
// the access area of a collection: without "Mitbearbeiten" this phone never writes there (members and places: the rules decide).
// shop_items and lists decide per record (spec.area), so the collection is written when either area may be changed.
const AREA_OF_COLL = { shop_memory: 'shop', errands: 'errands', saved_offers: 'saved', saved_places: 'saved', cal_entries: 'cal' };
// collections the server does not have (yet, e.g. before an update): nothing is written there, the phone keeps its own data
const MISSING = new Set();
const canEditArea = a => typeof perm !== 'function' || perm(a) === 'edit';
const canWrite = coll => !MISSING.has(coll) && !SPECS[coll].readOnly
  && (SPECS[coll].area ? canEditArea('shop') || canEditArea('errands') : !AREA_OF_COLL[coll] || canEditArea(AREA_OF_COLL[coll]));
// the kind of a list ('' for the main shopping list)
const listKindOf = id => (id && (store.lists || []).find(l => l.id === id)?.kind) || '';
// empty values count as the same ('' = missing = {} = []), so fields added later never look changed
const blank = v => v == null || v === '' || (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length);
const sameVal = (a, b) => (blank(a) && blank(b)) || canon(a) === canon(b);
const recKey = (spec, r) => (spec.recordKey ? spec.recordKey(r) : r.id);

// ---------- Outbox ----------
function queue(op) {
  // fold with what is still waiting for the same record
  const i = outbox.findIndex(o => o.coll === op.coll && o.id === op.id);
  if (i >= 0) {
    const prev = outbox[i];
    if (op.op === 'update' && prev.op !== 'delete') { prev.data = { ...prev.data, ...op.data }; if (op.base && !prev.base) prev.base = op.base; return saveOutbox(); }
    if (op.op === 'delete' && prev.op === 'create') { outbox.splice(i, 1); return saveOutbox(); }
    if (op.op === 'delete' && prev.op === 'update') { outbox.splice(i, 1); }
  }
  outbox.push(op); saveOutbox();
}
const saveOutbox = () => writeJson(OUT_KEY, outbox);
const saveShadow = () => writeJson(SHADOW_KEY, shadow);
const saveUnsaved = () => writeJson(UNSAVED_KEY, unsaved);
// everything still waiting for one record, folded into one object ('deleted' when a delete waits)
function pendingOf(coll, id) {
  let d = null;
  for (const o of outbox) if (o.coll === coll && o.id === id) { if (o.op === 'delete') return 'deleted'; d = { ...(d || {}), ...o.data }; }
  return d;
}
function dropUnsaved(coll, id) { if (unsaved[coll]?.[id]) { delete unsaved[coll][id]; saveUnsaved(); } }

// local data vs. last confirmed server state + what is waiting -> operations with only the changed fields
function diffAll() {
  if (!auth?.family) return;
  for (const coll of COLLS) {
    if (!canWrite(coll)) continue;
    const spec = SPECS[coll], sh = shadow[coll] || (shadow[coll] = {});
    const local = new Map(spec.local().map(x => [spec.key(x), x]));
    for (const [k, x] of local) {
      const p = spec.payload(x), s = sh[k];
      if (spec.area && !canEditArea(spec.area(p))) continue; // e.g. a helper who may change to-dos but not the shopping list
      if (!s) {
        const id = spec.newId && isPbId(spec.newId(x)) ? spec.newId(x) : pbId();
        sh[k] = { id, p: null };
        queue({ coll, op: 'create', id, data: { family: auth.family, ...p, id } });
        continue;
      }
      if (s.p == null && s.rejected) {
        // a new entry the server refused: try again only when it was changed
        if (s.rejected === canon(p)) continue;
        delete s.rejected; dropUnsaved(coll, s.id);
        queue({ coll, op: 'create', id: s.id, data: { family: auth.family, ...p, id: s.id } });
        continue;
      }
      const waiting = pendingOf(coll, s.id);
      if (waiting === 'deleted') continue;
      const base = { ...(s.p ? JSON.parse(s.p) : {}), ...(waiting || {}) };
      if (spec.same && s.p && spec.same(base, p)) continue;
      const changed = {};
      for (const f of Object.keys(p)) if (!sameVal(p[f], base[f])) changed[f] = p[f];
      // taken-over days and single occurrences are merged day by day with what others did meanwhile: remember what they were based on
      const byDay = (changed.overrides || changed.changes) && s.p;
      if (Object.keys(changed).length) queue({ coll, op: 'update', id: s.id, data: changed, ...(byDay ? { base: { overrides: base.overrides || {}, changes: base.changes || {} } } : {}) });
    }
    for (const k of Object.keys(sh)) if (!local.has(k)) {
      if (spec.keep && spec.keep(sh[k])) continue;
      if (spec.area && sh[k].p && !canEditArea(spec.area(JSON.parse(sh[k].p)))) continue;
      const s = sh[k]; delete sh[k];
      dropUnsaved(coll, s.id);
      if (s.p == null && !outbox.some(o => o.coll === coll && o.id === s.id)) continue; // never reached the server
      queue({ coll, op: 'delete', id: s.id });
    }
  }
  saveShadow();
}
// the server's answer for one record: becomes the confirmed state
function storeRec(coll, rec) {
  if (!RECS[coll] || !rec?.id) return;
  // answers and live events can arrive out of order: an older state never replaces a newer one
  const cur = RECS[coll].find(r => r.id === rec.id);
  if (!rec._deleted && cur?.updated && rec.updated && rec.updated < cur.updated) return;
  RECS[coll] = RECS[coll].filter(r => r.id !== rec.id);
  if (!rec._deleted) RECS[coll].push(rec);
}
// rebuild one collection: confirmed server state, then own changes still on the way on top (the shadow follows the server)
function settle(coll) {
  const spec = SPECS[coll], recs = RECS[coll];
  if (!recs) return;
  const old = shadow[coll] || {};
  spec.setAll(recs.map(r => ({ ...r })));
  const sh = {};
  for (const x of spec.local()) {
    const k = spec.key(x), r = recs.find(y => recKey(spec, y) === k);
    if (r) sh[k] = { id: r.id, p: JSON.stringify(spec.payload(x)), ...(spec.shadowExtra ? spec.shadowExtra(r) : {}) };
  }
  // new entries that are still waiting or were refused are not on the server yet; they keep their place
  for (const [k, s] of Object.entries(old)) if (!sh[k] && s.p == null && (unsaved[coll]?.[s.id] || outbox.some(o => o.coll === coll && o.id === s.id))) sh[k] = s;
  shadow[coll] = sh;
  spec.setAll(withPending(coll));
}
function settleAll(colls = COLLS) {
  diffAll(); // changes typed in the last moment go into the outbox first, so they are not lost
  for (const c of colls) settle(c);
  saveShadow(); saveLocal();
}
let flushing = false;
async function flush() {
  if (flushing || !auth?.family || !auth?.token) return;
  flushing = true;
  const reasons = new Set(), touched = new Set();
  let checked = false;
  try {
    while (outbox.length && auth?.token) {
      const o = outbox[0], path = `/api/collections/${o.coll}/records`;
      try {
        let rec = null;
        if (o.op === 'create') rec = await api('POST', path, o.data);
        else if (o.op === 'update' && o.coll === 'cal_entries' && o.base && (o.data.overrides || o.data.changes)) rec = await takeOver(o);
        else if (o.op === 'update') rec = await api('PATCH', `${path}/${o.id}`, o.coll === 'shop_memory' ? await mergeMemory(o) : o.data);
        else await api('DELETE', `${path}/${o.id}`);
        SY.online = true;
        storeRec(o.coll, o.op === 'delete' ? { id: o.id, _deleted: true } : rec);
      } catch (e) {
        if (!e.status || e.status === 429 || e.status >= 500) { SY.online = !!e.status; break; } // try again later
        if (e.status === 401) break; // session over (sessionEnd): waits for the next sign-in
        // refused: first make sure this is not a general problem (session, Wir gone)
        if (!checked) { checked = true; if (!(await checkMembership())) return; }
        const why = await refused(o, e);
        if (why) reasons.add(why);
        // the refused change must not come back with the next diff: rebuild this list from the server now
        if (outbox[0] === o) { outbox.shift(); saveOutbox(); }
        settle(o.coll); saveShadow(); saveLocal();
      }
      if (outbox[0] === o) { outbox.shift(); saveOutbox(); }
      touched.add(o.coll);
    }
  } catch (e) { SY.online = false; } finally { flushing = false; }
  if (touched.has('shop_items') && typeof mergeShopDuplicates === 'function') mergeShopDuplicates(); // same item added on two phones while one was offline
  if (touched.size) { settleAll([...touched]); rerender(); }
  if (reasons.size) toast(tl('Nicht gespeichert: {why}', { why: [...reasons].join(' ') }));
  if (outbox.length && auth?.token && SY.online) scheduleSync();
}
// why the server refused a change, in words
function reasonOf(e) {
  if (e.code === 'limit_reached') return tl('Das Limit für diesen Bereich ist erreicht.');
  const fields = Object.values(e.data?.data || {}).filter(f => f && typeof f === 'object' && f.code);
  if (fields.some(f => /max|length|size/i.test(f.code + ' ' + (f.message || '')))) return tl('Der Text ist zu lang.');
  if (fields.length) return tl('Eine Angabe passt nicht.');
  return tl('Dazu fehlt dir die Berechtigung.');
}
// what happens to a refused change; returns the reason to tell, or '' when nothing went wrong after all
async function refused(o, e) {
  const spec = SPECS[o.coll];
  let cur = null;
  try { cur = await api('GET', `/api/collections/${o.coll}/records/${o.id}`); } catch (x) { if (!x.status) throw x; }
  if (o.op === 'create') {
    if (cur) { storeRec(o.coll, cur); return ''; } // an earlier try got through
    // an entry for a list that was deleted meanwhile (on another phone): it goes with the list, without a word
    if (o.coll === 'shop_items' && isPbId(o.data.list) && !(await listExists(o.data.list))) { dropOrphan(o.id); return ''; }
    if (spec.recordKey) { // the same thing, saved by someone else under another id
      try {
        const rs = await listAll(o.coll, `family='${auth.family}'`);
        if (RECS[o.coll]) RECS[o.coll] = rs;
        if (rs.some(r => recKey(spec, r) === recKey(spec, o.data))) return '';
      } catch (x) { if (!x.status) throw x; }
    }
    // stays on this phone, marked "nicht gespeichert", until it is changed or removed
    const reason = reasonOf(e), { family, id, ...p } = o.data;
    (unsaved[o.coll] || (unsaved[o.coll] = {}))[o.id] = { data: { ...p, created: new Date().toISOString() }, reason };
    saveUnsaved();
    const sh = shadow[o.coll] || {};
    for (const s of Object.values(sh)) if (s.id === o.id) { s.p = null; s.rejected = canon(p); }
    return reason;
  }
  if (!cur) { storeRec(o.coll, { id: o.id, _deleted: true }); return ''; } // deleted on another phone meanwhile: gone here too
  storeRec(o.coll, cur); // refused update or delete: the server's state comes back
  return reasonOf(e);
}
// does this list still exist on the server? (only "not found" counts as gone; no network is decided later)
async function listExists(id) {
  try { await api('GET', `/api/collections/lists/records/${id}`); return true; }
  catch (x) { if (!x.status) throw x; return x.status !== 404; }
}
// forget a new entry that will never reach the server (its list is gone)
function dropOrphan(id) {
  dropUnsaved('shop_items', id);
  const sh = shadow.shop_items || {};
  for (const [k, s] of Object.entries(sh)) if (s.id === id) delete sh[k];
  store.shop.items = store.shop.items.filter(i => i.id !== id);
}
// entries kept as "nicht gespeichert" whose list is gone (refused before this version): they go too
function dropOrphanUnsaved() {
  if (!RECS.lists) return;
  const ids = new Set(RECS.lists.map(l => l.id));
  for (const [id, u] of Object.entries(unsaved.shop_items || {})) if (isPbId(u.data?.list) && !ids.has(u.data.list)) dropOrphan(id);
}
// the shop memory is one record for the whole Wir: merge with what the server has instead of overwriting it
async function mergeMemory(o) {
  let cur;
  try { cur = await api('GET', `/api/collections/shop_memory/records/${o.id}`); } catch (e) { if (!e.status) throw e; return o.data; }
  const out = { ...o.data };
  if (o.data.history) {
    const h = { ...(cur.history || {}) };
    for (const [k, v] of Object.entries(o.data.history)) { const c = h[k]; h[k] = !c ? v : { ...((v.last || 0) >= (c.last || 0) ? v : c), n: Math.max(v.n || 0, c.n || 0), last: Math.max(v.last || 0, c.last || 0) }; }
    out.history = h;
  }
  if (o.data.learned) out.learned = { ...(cur.learned || {}), ...o.data.learned };
  if (o.data.trips != null) out.trips = Math.max(+o.data.trips || 0, +cur.trips || 0);
  return out;
}
// day-keyed fields of a calendar entry (taken-over days, single occurrences): only the days this phone changed go on top of
// the server's (two people changing different days at once both stay; a day taken back here is removed)
function overridesDelta(server, mine, base) {
  const out = { ...(server && typeof server === 'object' && !Array.isArray(server) ? server : {}) }, b = base || {}, m = mine || {};
  for (const [k, v] of Object.entries(m)) if (canon(b[k]) !== canon(v)) out[k] = v;
  for (const k of Object.keys(b)) if (!(k in m)) delete out[k];
  return out;
}
// [days set or changed here, days removed here]
function dayDelta(base, mine) {
  const b = base || {}, m = mine || {};
  return [Object.fromEntries(Object.entries(m).filter(([k, v]) => canon(b[k]) !== canon(v))), Object.keys(b).filter(k => !(k in m))];
}
// the changed days go through /api/djuu/cal-take (one transaction on the server), the other fields as a normal change
async function takeOver(o) {
  const path = `/api/collections/cal_entries/records/${o.id}`, body = { id: o.id };
  if (o.data.overrides) [body.set, body.del] = dayDelta(o.base.overrides, o.data.overrides);
  if (o.data.changes) [body.chg, body.chgdel] = dayDelta(o.base.changes, o.data.changes);
  const { overrides, changes, ...rest } = o.data;
  let rec = null;
  try { rec = await api('POST', '/api/djuu/cal-take', body); }
  catch (e) {
    if (e.status !== 404 || e.code) throw e;
    // a server without the route: merge here with what it has
    const cur = await api('GET', path), merged = { ...rest };
    if (overrides) merged.overrides = overridesDelta(cur.overrides, overrides, o.base.overrides);
    if (changes) merged.changes = overridesDelta(cur.changes, changes, o.base.changes);
    return api('PATCH', path, merged);
  }
  if (Object.keys(rest).length) rec = await api('PATCH', path, rest);
  return rec;
}
let syncTimer = null;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { syncTimer = null; diffAll(); flush(); }, 250); }

// every local save also syncs
const saveLocal = save;
save = function () { saveLocal(); if (auth?.family) scheduleSync(); };

// ---------- Loading and live updates ----------
const RECS = {}; // server records as last seen, per collection
async function loadAll() {
  const fam = auth.family, f = `family='${fam}'`;
  const data = {};
  for (const coll of COLLS) {
    try { data[coll] = await listAll(coll, SPECS[coll].filter ?? f); MISSING.delete(coll); }
    catch (e) { if (!e.status || e.status === 401) throw e; data[coll] = null; if (e.status === 404) MISSING.add(coll); } // a collection the server does not have (yet): keep what is on this phone
  }
  // my own person is not in the list any more (removed, Wir deleted), or my access ended
  const mine = data.members && data.members.find(m => m.id === auth.member);
  if (data.members && (!mine || endedOn(mine)) && !(await checkMembership())) return;
  if (!auth?.family || auth.family !== fam) return; // the Wir changed or was wiped while loading: this data is stale
  diffAll();
  for (const coll of COLLS) if (data[coll]) RECS[coll] = data[coll];
  dropOrphanUnsaved();
  for (const coll of COLLS) if (data[coll]) settle(coll);
  store.profile.me = auth.member;
  await helperKids();
  try { const fr = await api('GET', `/api/collections/families/records/${auth.family}`); auth.familyName = fr.name; store.wirPhoto = fr.photo || ''; store.wirFounder = fr.founder || ''; writeJson(AUTH_KEY, auth); } catch (e) { /* keep */ }
  await loadEmails();
  // news: what others created since this phone last looked (the first time only remembers the moment)
  if (store.newsSince) for (const coll of ['shop_items', 'errands', 'saved_offers', 'members']) for (const r of (data[coll] || [])) if (when(r.created) > store.newsSince) newsFromRecord(coll, r);
  store.newsSince = Date.now(); holidayNews(); courseBlockNews(); assignColors();
  if (typeof birthdayNews === 'function') birthdayNews();
  if (typeof mergeShopDuplicates === 'function') mergeShopDuplicates();
  saveShadow(); saveLocal();
  SY.loadedAt = Date.now();
  await loadPings();
  if (outbox.length) scheduleSync();
}
let es = null;
function connectRealtime() {
  if (es) es.close();
  SY.live = false;
  let ready;
  SY.connected = new Promise(res => { ready = res; });
  es = new EventSource(API + '/api/realtime');
  // every connect (also the first) loads everything after subscribing, so nothing falls into a gap
  es.addEventListener('PB_CONNECT', async e => {
    try {
      await api('POST', '/api/realtime', { clientId: JSON.parse(e.data).clientId, subscriptions: COLLS.filter(c => !MISSING.has(c)).concat('pings', 'families') });
      SY.online = true; SY.live = true;
      await flush();
      if (auth?.family) { await loadAll(); rerender(); }
      ready(true);
    } catch (x) { /* retried on the next connect */ }
  });
  es.onerror = () => { SY.live = false; if (es && es.readyState === 2) { es = null; retryLater(); } };
  for (const coll of COLLS) es.addEventListener(coll, e => applyRemote(coll, JSON.parse(e.data)));
  es.addEventListener('families', e => {
    const { action, record } = JSON.parse(e.data);
    if (record.id !== auth?.family) return;
    if (action === 'delete') return wirGone('gone');
    if (action === 'update') { auth.familyName = record.name; store.wirPhoto = record.photo || ''; store.wirFounder = record.founder || ''; writeJson(AUTH_KEY, auth); saveLocal(); rerender(); }
  });
  es.addEventListener('pings', e => { const { action, record } = JSON.parse(e.data); SY.pings = SY.pings.filter(p => p.id !== record.id); if (action !== 'delete') SY.pings.unshift(record); showPingBar(); });
}
// local data = server records plus own changes still waiting in the outbox (and new entries the server refused)
function withPending(coll) {
  const recs = (RECS[coll] || []).map(r => ({ ...r }));
  for (const [id, u] of Object.entries(unsaved[coll] || {})) if (!recs.some(r => r.id === id)) recs.push({ ...u.data, id, _unsaved: u.reason });
  for (const o of outbox) {
    if (o.coll !== coll) continue;
    const i = recs.findIndex(r => r.id === o.id);
    if (o.op === 'delete') { if (i >= 0) recs.splice(i, 1); }
    else if (i >= 0) {
      const server = { overrides: recs[i].overrides, changes: recs[i].changes };
      Object.assign(recs[i], o.data);
      if (o.base) for (const f of ['overrides', 'changes']) if (o.data[f]) recs[i][f] = overridesDelta(server[f], o.data[f], o.base[f]);
    }
    else recs.push({ created: new Date().toISOString(), ...o.data });
  }
  return recs;
}
function applyRemote(coll, { action, record }) {
  if (!auth?.family || !RECS[coll]) return;
  if (coll === 'members' && action === 'delete' && record.id === auth.member) { checkMembership(); return; }
  // my own access ended (the admin set an end date in the past): the family data leaves this phone at once
  if (coll === 'members' && action !== 'delete' && record.id === auth.member && endedOn(record)) { wirGone('expired', endedOn(record)); return; }
  // own changes from the last moment (still waiting for the 250 ms pause) go into the outbox first
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; diffAll(); flush(); }
  // my own access changed: load again, so what I may no longer see leaves this phone (and what I may see now arrives)
  const before = coll === 'members' && record.id === auth.member ? (RECS.members || []).find(m => m.id === record.id) : null;
  if (before && action === 'update' && ['perm_shop', 'perm_errands', 'perm_cal', 'perm_saved', 'perm_care', 'grp', 'is_admin'].some(k => (before[k] ?? '') !== (record[k] ?? ''))) setTimeout(() => { if (auth?.family && auth.token) loadAll().then(rerender).catch(() => {}); }, 300);
  storeRec(coll, action === 'delete' ? { id: record.id, _deleted: true } : record);
  diffAll(); settle(coll); // field by field: the other phone's change, with own fields still on the way on top
  if (action === 'create') newsFromRecord(coll, record);
  if (coll === 'members') assignColors();
  if (coll === 'shop_items' && action === 'create' && typeof mergeShopDuplicates === 'function') mergeShopDuplicates();
  store.newsSince = Date.now();
  saveShadow(); saveLocal(); rerender();
}
// rerender the views that show synced data, but never under a typing finger
let pendingRender = false;
function rerender() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('#panelBody input, #panelBody textarea, #panelBody select')) { pendingRender = true; return; }
  pendingRender = false;
  if (['me', 'favs', 'events', 'offer', 'detail', 'wir', 'person'].includes(view().type)) renderPanel();
  if (typeof updateBell === 'function') updateBell();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) rerender(); }, 200));

// ---------- Session: start, end, Wir gone ----------
let starting = null, retryTimer = null, retryDelay = 5000;
function retryLater() { clearTimeout(retryTimer); retryTimer = setTimeout(() => { retryTimer = null; startSession(); }, retryDelay); retryDelay = Math.min(retryDelay * 2, 300000); }
async function startSession() {
  if (!API || !auth?.token) return;
  if (starting) return starting;
  starting = (async () => {
    try {
      const r = await api('POST', '/api/collections/users/auth-refresh');
      auth.token = r.token; SY.userRec = r.record; writeJson(AUTH_KEY, auth); userPrefs(r.record);
    } catch (e) { if (e.status === 401) return; SY.online = false; retryLater(); return; } // offline: keep working locally, try again later
    retryDelay = 5000; SY.online = true;
    try { await enterSession(); } catch (e) { if (!e.status) { SY.online = false; retryLater(); } }
    rerender(); showPingBar();
  })();
  try { await starting; } finally { starting = null; }
}
// with a valid token: find the Wir, send what waits, go live (the first connect loads everything)
async function enterSession() {
  if (!auth.family) await findFamily();
  if (!auth.family) return;
  await flush();
  connectRealtime();
  const ok = await Promise.race([SY.connected, new Promise(res => setTimeout(() => res(false), 6000))]);
  if (!ok && auth?.family) await loadAll(); // no realtime (yet): load anyway, realtime catches up when it connects
}
// the end date of my access passes while the app is open (also offline): the same as an ended access
function checkOwnEnd() {
  if (!auth?.family || SY.leaving) return;
  const mine = (RECS.members || []).find(m => m.id === auth.member);
  if (mine && endedOn(mine)) wirGone('expired', endedOn(mine));
}
setInterval(checkOwnEnd, 60000);
// the day an access ended ('YYYY-MM-DD', local), or '' while it runs
function endedOn(m) {
  const t = m?.access_until ? Date.parse(String(m.access_until).replace(' ', 'T')) : NaN;
  if (!(t < Date.now())) return '';
  const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
async function findFamily() {
  const ms = await listAll('members', `user='${auth.userId}'`);
  if (ms[0] && endedOn(ms[0])) { if (auth.gone?.kind !== 'expired' && !auth.wasGone) { auth.member = ms[0].id; wirGone('expired', endedOn(ms[0])); } return; } // ended access: no Wir on this phone
  if (ms[0]) {
    auth.family = ms[0].family; auth.member = ms[0].id; delete auth.gone; delete auth.wasGone;
    store.onboarded = true; // an existing person (back after an extended access, a second phone): no first steps
    const f = await api('GET', `/api/collections/families/records/${auth.family}`); auth.familyName = f.name; writeJson(AUTH_KEY, auth); saveLocal();
  }
}
// Am I still in my Wir? Checks the session first, so an invalid token is never taken for "Wir gone".
// Returns false when the session ended or the Wir is gone (then the family data has left this phone).
async function checkMembership() {
  if (!auth?.token || !auth.family || SY.leaving) return false;
  let rec;
  try { const r = await api('POST', '/api/collections/users/auth-refresh'); auth.token = r.token; rec = SY.userRec = r.record; writeJson(AUTH_KEY, auth); }
  catch (e) { return e.status === 401 ? false : true; } // no network: nothing is decided now
  let ms;
  try { ms = await listAll('members', `user='${auth.userId}'`); } catch (e) { return true; }
  const mine = ms.find(m => m.id === auth.member) || ms[0];
  if (mine && endedOn(mine)) { wirGone('expired', endedOn(mine)); return false; }
  if (mine) { if (mine.family !== auth.family) { auth.family = mine.family; auth.member = mine.id; store.onboarded = true; writeJson(AUTH_KEY, auth); saveLocal(); } return true; }
  // the account still points to its person record only while it exists: then the access has ended, else the Wir or the person is gone
  wirGone(rec?.member ? 'expired' : 'gone');
  return false;
}
// the session is over: nothing is thrown away, the phone asks once to sign in again (one calm line) and sends what waits afterwards
function sessionEnd() {
  if (!auth?.token) return;
  if (es) { es.close(); es = null; }
  SY.live = false;
  auth.token = ''; auth.ended = true; writeJson(AUTH_KEY, auth);
  setTimeout(() => { toast(tl('Bitte melde dich neu an.')); rerender(); }, 0);
}
// the Wir is gone for this account (deleted, removed, access ended): its data leaves this phone, a new Wir or an invite is possible
function wirGone(kind, date) {
  if (!auth) return;
  const me = store.profile.adults.find(a => a.id === auth.member);
  if (es) { es.close(); es = null; }
  SY.live = false;
  wipeFamilyData();
  auth.gone = { kind, date: kind === 'expired' ? (date || me?.until || '') : '', member: auth.member };
  auth.family = null; auth.member = null; auth.familyName = '';
  writeJson(AUTH_KEY, auth);
  showPingBar(); rerender();
}
// everything of the family on this phone (lists, people, places, news); map, language, area and filters stay
function wipeFamilyData() {
  Object.assign(store.shop, { items: [], history: {}, learned: {}, rank: {}, trips: 0, seq: [] });
  store.errands = []; store.savedOffers = []; store.favorites = []; store.favBy = {}; store.places = []; store.fit = null; store.cal = []; store.lists = []; store.kidCare = []; store.wirFounder = '';
  store.profile.adults = []; store.profile.kids = []; store.profile.dogList = []; store.profile.me = null; store.profile.expecting = '';
  store.wirPhoto = ''; store.news = []; store.newsSince = 0; store.newsOff = []; store.blocksSeen = {}; store.onboarded = false;
  outbox = []; shadow = {}; unsaved = {}; for (const k of Object.keys(RECS)) delete RECS[k];
  SY.pings = []; SY.calToken = ''; SY.emails = {};
  writeJson(OUT_KEY, null); writeJson(SHADOW_KEY, null); writeJson(UNSAVED_KEY, null);
  saveLocal();
  if (typeof updateBell === 'function') updateBell();
}
// E-mail addresses of the people (members.email is hidden): admins get everyone's, everyone else only their own.
// A server without the route still has members.email in the records (setAll keeps it).
async function loadEmails() {
  try { const r = await api('GET', '/api/djuu/emails'); SY.emails = r?.emails && typeof r.emails === 'object' ? r.emails : {}; }
  catch (e) { if (e.status === 401) throw e; } // offline or missing route: keep what is known
}
const emailOf = id => (typeof SY.emails?.[id] === 'string' ? SY.emails[id] : '') || store.profile.adults.find(a => a.id === id)?.email || '';
// Konto › "Meine Daten herunterladen": everything the server keeps about me, as one JSON file
async function downloadMyData() {
  let r;
  try { r = await fetch(API + '/api/djuu/export', { headers: { Authorization: auth.token } }); } catch (e) { const err = new Error('offline'); err.status = 0; throw err; }
  if (!r.ok) {
    if (r.status === 401) sessionEnd();
    const err = new Error(String(r.status)); err.status = r.status;
    try { err.data = await r.json(); err.code = err.data?.code || ''; } catch (x) { /* not json */ }
    throw err;
  }
  const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
  a.href = url; a.download = 'djuu-daten.json'; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}
// Helpers do not see the children's records (birth dates stay in the family); the server tells them name and age only.
async function helperKids() {
  const me = store.profile.adults.find(a => a.id === auth.member);
  if (me?.grp !== 'helper') { store.profile.kids = store.profile.kids.filter(k => !k.remote); return; }
  try { store.profile.kids = (await api('GET', '/api/djuu/kids')).kids.map(k => ({ id: k.id, name: k.name, ageMin: k.min, ageMax: k.max, remote: true })); }
  catch (e) { /* keep what is known */ }
}
// personal settings kept in the account (on every phone of this person): news topics that are switched off, and more
// (window.djuuPrefs.<key> = users.<key>_prefs, e.g. ev for the Termine settings; a field the server does not have stays empty)
const PREFS_KEY = 'djuu.prefs';
window.djuuPrefs = readJson(PREFS_KEY, {}) || {};
function userPrefs(rec) {
  const off = rec?.news_prefs?.off;
  if (Array.isArray(off)) { store.newsOff = off.filter(x => typeof x === 'string').slice(0, 20); saveLocal(); if (typeof updateBell === 'function') updateBell(); }
  if (!rec) return;
  for (const [k, v] of Object.entries(rec)) if (/^[a-z]+_prefs$/.test(k) && v != null && v !== '') window.djuuPrefs[k.replace(/_prefs$/, '')] = v;
  writeJson(PREFS_KEY, window.djuuPrefs);
  try { window.dispatchEvent(new CustomEvent('djuu:prefs', { detail: window.djuuPrefs })); } catch (e) { /* old browser */ }
}
// save one setting: at once on this phone, and (debounced, only the own record) in the account for all phones
const prefTimers = {};
window.djuuSavePref = function (key, value) {
  if (!/^[a-z]+$/.test(String(key))) return;
  window.djuuPrefs[key] = value; writeJson(PREFS_KEY, window.djuuPrefs);
  clearTimeout(prefTimers[key]);
  prefTimers[key] = setTimeout(() => {
    if (!auth?.token || !auth.userId) return;
    api('PATCH', `/api/collections/users/records/${auth.userId}`, { [key + '_prefs']: value }).catch(() => { /* tried again with the next change */ });
  }, 800);
};
// ---------- Account: register, confirm the e-mail, sign in, passwords ----------
const PENDING_KEY = 'djuu.pendingEmail', JOIN_KEY = 'djuu.join', TERMS_VERSION = '2026-11-20';
// Sign in. When this phone still holds the data of another account, nothing happens without a clear choice:
// the error 'other_user' lets the page ask; signIn(.., .., true) then removes that data and signs in.
async function signIn(email, password, discard) {
  const r = await api('POST', '/api/collections/users/auth-with-password', { identity: email.trim(), password });
  return adoptSignIn(r, discard);
}
async function adoptSignIn(r, discard) {
  const prev = auth, same = !!prev?.userId && prev.userId === r.record.id;
  const others = !!prev?.userId && !same && (!!prev.family || outbox.length > 0);
  if (others && !discard) { SY.pendingSignIn = r; const err = new Error('other_user'); err.code = 'other_user'; err.status = 409; err.other = prev.email || ''; err.n = outbox.length; throw err; }
  SY.pendingSignIn = null;
  if (others) wipeFamilyData();
  auth = same ? { ...prev, token: r.token, email: r.record.email } : { token: r.token, userId: r.record.id, email: r.record.email };
  delete auth.ended;
  SY.userRec = r.record; userPrefs(r.record);
  writeJson(AUTH_KEY, auth);
  try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage blocked */ }
  // an invite the person opened in another browser before confirming the e-mail (kept with the account, see NOTES)
  if (r.record.join_token && !SY.invite) { SY.invite = r.record.join_token; try { localStorage.setItem(JOIN_KEY, SY.invite); } catch (e) { /* storage blocked */ } }
  await enterSession(); // this person's Wir exists already (second phone, or back after the session ended): what waits goes up, then the server's state
  showPingBar();
  return auth;
}
async function register(email, password) {
  email = email.trim();
  // the terms version and moment of consent, and an invite that should survive opening the confirmation link elsewhere
  // (fields the server may not have yet are ignored by it, see NOTES)
  const body = { email, password, passwordConfirm: password, terms_version: TERMS_VERSION }; // the server notes the moment itself
  if (SY.invite) body.join_token = SY.invite;
  await api('POST', '/api/collections/users/records', body);
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
// an access that ended still holds a person record on the server: leave it first, so a new Wir or an invite works
async function leaveEnded() {
  if (auth?.gone?.kind !== 'expired' && auth?.wasGone?.kind !== 'expired') return;
  try { await api('POST', '/api/djuu/leave', {}); } catch (e) { /* route missing or nothing to leave: the next step says what is wrong */ }
}
async function createFamily(myName, familyName, role) {
  await leaveEnded();
  const r = await api('POST', '/api/djuu/family', { myName, name: familyName, role: role || '', state: store.profile.state || 'DE-HH' });
  await enterFamily(r, myName, true);
}
async function joinFamily(token, myName, role) {
  await leaveEnded();
  const r = await api('POST', '/api/djuu/join', { token, myName, role: role || '' });
  try { localStorage.removeItem(JOIN_KEY); } catch (e) { /* storage blocked */ }
  SY.invite = null;
  if (SY.userRec && 'join_token' in SY.userRec) api('PATCH', `/api/collections/users/records/${auth.userId}`, { join_token: '' }).catch(() => {});
  // the family's members come from the server; the shared lists of this phone are added to the family's
  store.profile.adults = []; store.profile.kids = [];
  await enterFamily(r, myName, false);
}
async function enterFamily(r, myName, keepMembers) {
  auth.family = r.family; auth.member = r.member; delete auth.gone; delete auth.wasGone;
  const f = await api('GET', `/api/collections/families/records/${r.family}`); auth.familyName = f.name;
  writeJson(AUTH_KEY, auth);
  const meLocal = keepMembers ? (meId() || null) : null;
  if (keepMembers && !store.profile.adults.some(a => a.id === meLocal)) store.profile.adults.unshift({ id: 'me', name: myName });
  adoptLocalIds(keepMembers ? (meLocal || 'me') : null, r.member);
  // the server already has: my member (with the role chosen when joining) and the shop memory record
  const myRec = await api('GET', `/api/collections/members/records/${r.member}`);
  const me = store.profile.adults.find(a => a.id === r.member);
  const rights = { account: true, user: auth.userId, grp: myRec.grp || 'family', admin: !!myRec.is_admin, perms: { shop: myRec.perm_shop || 'edit', errands: myRec.perm_errands || 'edit', cal: myRec.perm_cal || 'edit', saved: myRec.perm_saved || 'edit', care: careLevel(myRec) } };
  if (me) { Object.assign(me, rights); me.name = me.name || myName; me.role = me.role || myRec.role || ''; } else store.profile.adults.unshift({ id: r.member, name: myName, role: myRec.role || '', ...rights });
  const mem = (await listAll('shop_memory', `family='${r.family}'`))[0];
  shadow = {}; outbox = []; unsaved = {}; saveOutbox(); saveUnsaved();
  for (const k of Object.keys(RECS)) delete RECS[k];
  const recPayload = SPECS.members.payload({ ...myRec, _kind: 'adult', id: r.member, account: true, name: myRec.name, work: myRec.work, role: myRec.role, color: myRec.color, photo: myRec.photo });
  shadow.members = { [r.member]: { id: r.member, p: JSON.stringify(recPayload), account: true } };
  if (mem) shadow.shop_memory = { m: { id: mem.id, p: '{}' } }; // differs on purpose: our memory goes up once (merged on the server's)
  saveShadow(); saveLocal();
  diffAll(); await flush();
  await enterSession();
}
function logout(silent) {
  if (es) { es.close(); es = null; }
  clearTimeout(retryTimer);
  try { if (auth?.token) window.djuuPush?.disable?.(auth.token)?.catch?.(() => {}); } catch (e) { /* push not loaded */ }
  wipeFamilyData();
  auth = null; SY.pings = []; SY.userRec = null;
  writeJson(AUTH_KEY, null);
  showPingBar(); if (typeof updateBell === 'function') updateBell(); if (!silent) toast(tl('Abgemeldet.'));
  rerender();
}
// leave the Wir and keep the account (not for the last admin); the Wir's data leaves this phone
async function leaveWir() {
  if (es) { es.close(); es = null; } // the own "deleted" event must not be taken for "Wir gone"
  SY.leaving = true;
  try { await api('POST', '/api/djuu/leave', {}); } catch (e) { SY.leaving = false; startSession(); throw e; }
  SY.leaving = false;
  wipeFamilyData();
  auth.family = null; auth.member = null; auth.familyName = ''; delete auth.wasGone;
  auth.gone = { kind: 'left' }; // the Wir page says so; a new Wir only with a clear tap (never by the next "Weiter")
  writeJson(AUTH_KEY, auth); showPingBar(); rerender();
}
// sign out on every device: all sessions end, this phone gets a fresh token and stays signed in
async function logoutAll() {
  const r = await api('POST', '/api/djuu/logout-all', {});
  if (r?.token) { auth.token = r.token; writeJson(AUTH_KEY, auth); if (auth.family) connectRealtime(); }
  else logout(true);
}
// changes that would be lost when signing out now
const unsentCount = () => outbox.length + Object.values(unsaved).reduce((n, c) => n + Object.keys(c || {}).length, 0);
// the warning and the password are asked in Wir › Konto (wir.js)
async function deleteAccount(password) {
  await api('POST', '/api/djuu/delete-account', { password });
  logout(true); // nothing of the deleted account stays on this phone either
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
  catch (e) { toast(tl('Das hat nicht geklappt. Bitte mit Netz noch einmal versuchen.')); }
}
function answerPing(id, share) {
  const send = body => api('PATCH', `/api/collections/pings/records/${id}`, { ...body, answered: new Date().toISOString().replace('T', ' ') })
    .then(() => toast(share ? tl('Standort einmal gesendet.') : tl('Erledigt.')), () => toast(tl('Senden hat nicht geklappt.')));
  if (!share) return send({});
  if (!navigator.geolocation) return toast(tl('Dieses Gerät kann den Standort nicht bestimmen.'));
  navigator.geolocation.getCurrentPosition(p => send({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
    () => toast(tl('Standort nicht verfügbar. Bitte im Browser erlauben.')), { enableHighAccuracy: true, timeout: 15000 });
}
const seenPings = new Set(readJson('djuu.pingsSeen', []));
function showPingBar() {
  let bar = document.getElementById('pingbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'pingbar'; bar.className = 'pingbar'; document.body.appendChild(bar); }
  const me = auth?.member;
  const ask = me && SY.pings.find(p => p.to === me && !p.answered && !seenPings.has(p.id));
  const ans = me && SY.pings.find(p => p.from === me && p.answered && !seenPings.has(p.id));
  if (ask) bar.innerHTML = `<b>${esc(nameOf(ask.from))} ${tl('fragt: Wo bist du?')}</b><div><button type="button" class="btn primary" data-pinganswer="${esc(ask.id)}">${tl('Standort einmal senden')}</button><button type="button" class="btn" data-pingno="${esc(ask.id)}">${tl('Nicht jetzt')}</button></div>`;
  else if (ans) bar.innerHTML = ans.lat != null
    ? `<b>${esc(nameOf(ans.to))} ${tl('hat den Standort geschickt.')}</b><div><button type="button" class="btn primary" data-pingshow="${esc(ans.id)}">${tl('Auf der Karte zeigen')}</button><button type="button" class="btn" data-pingok="${esc(ans.id)}">${tl('OK')}</button></div>`
    : `<b>${esc(nameOf(ans.to))} ${tl('möchte den Standort gerade nicht senden.')}</b><div><button type="button" class="btn" data-pingok="${esc(ans.id)}">${tl('OK')}</button></div>`;
  bar.hidden = !(ask || ans);
}
const markSeen = id => { seenPings.add(id); writeJson('djuu.pingsSeen', [...seenPings].slice(-100)); showPingBar(); };
let pingMarker = null;
function showPingOnMap(p) {
  if (pingMarker) map.removeLayer(pingMarker);
  const lat = +p.lat, lon = +p.lon;
  if (!isFinite(lat) || !isFinite(lon)) return;
  const m = memberById(p.to), c = safeColor(m?.color);
  pingMarker = L.marker([lat, lon], { icon: L.divIcon({ className: '', iconSize: [44, 44], html: `<div class="mkhit"><div class="pingdot" style="--c:${c}">${esc((m?.name || '?').slice(0, 1))}</div></div>` }) })
    .bindTooltip(`${esc(m?.name || '')}, ${new Date(String(p.answered).replace(' ', 'T')).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} ${tl('Uhr, ±')}${Math.round(+p.accuracy) || '?'} m`, { permanent: true, direction: 'top', offset: [0, -16] })
    .addTo(map);
  home('peek'); map.setView([lat, lon], 16);
}

// ---------- Family calendar subscription ----------
async function calendarLink(renew) {
  const r = await api('POST', '/api/djuu/calendar', renew ? { renew: true } : {});
  SY.calToken = r.token; renderPanel();
}
// with the Hamburg school holidays when chosen, and in English for English users (the feed's own texts)
const calUrl = () => {
  const q = [store.calFerien ? 'ferien=1' : '', typeof LANG !== 'undefined' && LANG === 'en' ? 'lang=en' : ''].filter(Boolean).join('&');
  return `${API.replace(/^https:/, 'webcal:')}/api/djuu/cal/${encodeURIComponent(SY.calToken)}.ics${q ? '?' + q : ''}`;
};

// ---------- The "Wir" card ----------
// the family calendar subscription (Wir › Einstellungen › Familienkalender)
function calHtml() {
  if (!auth?.family) return '';
  const hh = (store.profile.state || 'DE-HH') === 'DE-HH';
  return SY.calToken ? `<p class="text">${tl('Eure Kalender-Einträge, Abholen und Bringen, Kita-Schließtage, Geburtstage und alle gemerkten Termine erscheinen automatisch in deinem Kalender.')}</p>
      ${hh ? `<label class="tgl"><span><b>${tl('Schulferien mitnehmen')}</b><small>${tl('Hamburger Schulferien als ganztägige Einträge')}</small></span><span class="tglr"><input type="checkbox" role="switch" data-calferien="1"${store.calFerien ? ' checked' : ''}></span></label>` : ''}
      <div class="calmenu"><a class="btn" href="${esc(calUrl())}">${svg('cal')}${tl('iPhone, Mac, Outlook: abonnieren')}</a>
      <a class="btn" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calUrl())}" target="_blank" rel="noopener">${svg('cal')}${tl('Google Kalender: abonnieren')}</a>
      <button type="button" class="linkbtn" data-sycalcopy="1">${tl('Adresse kopieren')}</button> <button type="button" class="linkbtn" data-sycalrenew="1">${tl('Neue Adresse (alte wird ungültig)')}</button></div>
      <p class="note">${tl('Kalender-Apps holen Änderungen meist alle paar Stunden. Das ist deine persönliche Adresse: Wer sie hat, sieht eure gemerkten Termine, also nicht weitergeben.')}</p>`
    : `<p class="text">${tl('Abonniere eure gemerkten Termine in der Kalender-App deines Handys.')}</p><button type="button" class="btn" data-sycal="1">${svg('cal')}${tl('Familienkalender einrichten')}</button>`;
}

// ---------- Interaction ----------
const run = async (fn, okMsg) => {
  SY.busy = true; SY.error = ''; renderPanel();
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { SY.error = typeof accountError === 'function' ? accountError(e) : !e.status ? tl('Keine Verbindung. Bitte später noch einmal.') : tl('Das hat nicht geklappt.'); toast(SY.error); }
  SY.busy = false; renderPanel();
};
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.sylogout) {
    // changes that never reached the server would be lost: say so before (only then)
    const n = unsentCount();
    if (n && !confirm(tl('Noch nicht gesendete Änderungen: {n}. Beim Abmelden gehen sie verloren. Trotzdem abmelden?', { n }))) return;
    logout(); home();
  }
  else if (d.syask) askWhere(d.syask);
  else if (d.sycal) run(() => calendarLink(false));
  else if (d.sycalrenew) { if (confirm(tl('Neue Adresse erzeugen? Dein bisheriger Kalender-Link hört dann auf zu funktionieren.'))) run(() => calendarLink(true)); }
  else if (d.sycalcopy) navigator.clipboard?.writeText(calUrl().replace(/^webcal:/, 'https:')).then(() => toast(tl('Adresse kopiert.')), () => toast(calUrl()));
  else if (d.pinganswer) { answerPing(d.pinganswer, true); markSeen(d.pinganswer); }
  else if (d.pingno) { answerPing(d.pingno, false); markSeen(d.pingno); }
  else if (d.pingshow) { const p = SY.pings.find(x => x.id === d.pingshow); if (p) showPingOnMap(p); markSeen(d.pingshow); }
  else if (d.pingok) markSeen(d.pingok);
});
// back online, or the app comes back to the front: reconnect if needed, else catch up after a longer pause
const reconnect = () => { if (!auth?.token) return; if (!es || es.readyState === 2 || !SY.live) startSession(); else flush(); };
document.addEventListener('change', e => {
  if (!e.target.dataset?.calferien) return;
  store.calFerien = e.target.checked; saveLocal(); renderPanel();
  toast(tl('Neue Adresse: Bitte den Kalender mit dieser Adresse neu abonnieren.'));
});
window.addEventListener('online', () => { SY.online = true; retryDelay = 5000; reconnect(); });
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  checkOwnEnd();
  if (!auth?.token) return;
  if (!es || es.readyState === 2 || !SY.live) return startSession();
  // phones often drop the live connection in the background without telling: after 30 s away, catch up
  if (hiddenAt && Date.now() - hiddenAt > 30000 && auth.family) flush().then(() => auth?.family && auth.token && loadAll()).then(rerender).catch(() => {});
});

// an invite link opens the Wir: who invites, then sign up or sign in and join (wir.js shows the pages)
(() => {
  const m = location.hash.match(/^#join=([A-Za-z0-9]+)/);
  if (m) { try { localStorage.setItem(JOIN_KEY, m[1]); } catch (e) { /* storage blocked */ } history.replaceState(null, '', location.pathname); }
  try { SY.invite = localStorage.getItem(JOIN_KEY); } catch (e) { SY.invite = null; }
  if (SY.invite && auth?.family) { try { localStorage.removeItem(JOIN_KEY); } catch (e) { /* storage blocked */ } SY.invite = null; setTimeout(() => toast(tl('Du bist schon in einem Wir.')), 1500); }
})();
if (API) setTimeout(startSession, 800); // after offers are loaded, so saved offers carry full calendar data
