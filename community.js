/* Djuu community: what parents add (Ergänzen, new places, reviews, photos, reports) goes to the Djuu server, where a
   moderator checks it before anyone else sees it (collection `contributions`, see server/pb_hooks).
   - Approved entries of everyone come from GET /api/djuu/community (public, never a name), are kept on the phone and
     brought up to date with ?since=. app.js applies them exactly where it applies the phone's own entries: facts, ages,
     opening hours, new places, reviews and photos (contribsOf, reviewsOf, addUserPlaces).
   - Signed-in people send what they enter; their own entries that wait for the check are shown only to them.
   - Guests keep everything on this phone as before. After signing in, the place page offers to send it (one quiet line).
   Loaded after app.js and sync.js. */
'use strict'; // i18n-skip

const COMM_KEY = 'djuu.community', COMM_MINE_KEY = 'djuu.commMine';
const COMM_API = (window.DJUU_API || '').replace(/\/$/, '');
// approved entries as the server sent them; `since` for the next update; `full` = time of the last complete load
const COMM = Object.assign({ items: [], since: '', full: 0 }, readJson(COMM_KEY, {}) || {});
// own entries that wait for the check (only this account, only on this phone)
const COMM_MINE = Object.assign({ user: '', items: [] }, readJson(COMM_MINE_KEY, {}) || {});
const COMMX = { byPlace: new Map(), reviews: new Map(), places: [], hours: new Map(), mine: new Map(), minePlaces: [], rejected: new Map(), photoOwner: new Map(), loadedAt: 0, busy: false,
  my: { state: '', items: [], confirm: '', busy: '' } };
// Hamburg and the Umland region: the same box as the map (app.js AREA_BOX, server NOTES); [[south, west], [north, east]]
const COMM_BOX = typeof AREA_BOX !== 'undefined' ? AREA_BOX : [[52.65, 8.48], [54.45, 11.51]];
const commInBox = (lat, lon) => lat > COMM_BOX[0][0] && lat < COMM_BOX[1][0] && lon > COMM_BOX[0][1] && lon < COMM_BOX[1][1];

const commOn = () => !!COMM_API;
const commSignedIn = () => commOn() && typeof auth !== 'undefined' && !!auth?.token && !auth.ended && SY.userRec?.verified !== false;
const commIsMod = () => commSignedIn() && SY.userRec?.is_mod === true;

// ---------- Cleaning what comes from the server (it is checked there, but the app never trusts it blindly) ----------
const COMM_ATTR_V = new Set(['yes', 'no', 'limited', 'leashed']);
const COMM_CATS = new Set(WIZ_TYPES.map(t => t.cat).filter(c => c !== 'event'));
const commStr = (s, n) => typeof s === 'string' ? s.trim().slice(0, n) : '';
function commAttrs(a) {
  const out = {};
  if (a && typeof a === 'object' && !Array.isArray(a)) for (const [k, v] of Object.entries(a)) if (/^[a-z0-9_]{1,30}$/.test(k) && COMM_ATTR_V.has(v)) out[k] = v;
  return out;
}
const commAges = a => Array.isArray(a) ? [...new Set(a.filter(x => AGES.some(g => g.id === x)))] : [];
// only pictures from the Djuu server (no outside addresses that could follow people around)
function commPhotos(list) {
  if (!Array.isArray(list)) return [];
  return list.map(u => typeof u === 'string' && u.startsWith('/') ? COMM_API + u : u)
    .filter(u => typeof u === 'string' && u.startsWith(COMM_API + '/') && !/[\s"'<>\\]/.test(u)).slice(0, 3);
}
const commTime = s => Date.parse(String(s || '').replace(' ', 'T')) || 0;
// one server entry in the shape app.js uses for the phone's own entries, or null
function commNorm(it, pending) {
  if (!it || typeof it.id !== 'string' || !/^[a-z0-9]{5,20}$/.test(it.id)) return null;
  const d = it.data && typeof it.data === 'object' ? it.data : {}, at = commTime(it.approved || it.created) || Date.now();
  const base = { id: it.id, remote: true, pending: !!pending, photoIds: pending ? [] : commPhotos(it.photos), createdAt: at };
  const pid = commStr(it.place_id, 40);
  if (it.kind === 'new_place') {
    const lat = +d.lat, lon = +d.lon, name = commStr(d.name, 80);
    if (!name || !COMM_CATS.has(d.cat) || !commInBox(lat, lon)) return null;
    return { ...base, kind: 'new_place', placeId: 'u_' + it.id, isNew: true, cat: d.cat, type: commStr(d.type, 20), name, lat, lon, attrs: commAttrs(d.attrs), ages: commAges(d.ages), hours: commStr(d.hours, 200) };
  }
  if (!pid) return null;
  if (it.kind === 'info') return { ...base, kind: 'info', placeId: pid, attrs: commAttrs(d.attrs), ages: commAges(d.ages), hours: commStr(d.hours, 200) };
  if (it.kind === 'photo') return { ...base, kind: 'photo', placeId: pid, attrs: {}, ages: [], hours: '', caption: commStr(d.caption, 200) };
  if (it.kind === 'review') { const stars = Math.round(+d.stars) || 0; return { ...base, kind: 'review', placeId: pid, stars: stars >= 0 && stars <= 5 ? stars : 0, text: commStr(d.text, 1000), at }; }
  if (it.kind === 'report' && pending) return { ...base, kind: 'report', placeId: pid };
  return null;
}
// the indexes app.js reads (rebuilt after every change)
function commIndex() {
  COMMX.byPlace.clear(); COMMX.reviews.clear(); COMMX.hours.clear(); COMMX.mine.clear(); COMMX.rejected.clear(); COMMX.photoOwner.clear(); COMMX.places = []; COMMX.minePlaces = [];
  const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  for (const it of COMM.items) {
    const c = commNorm(it); if (!c) continue;
    for (const u of c.photoIds) COMMX.photoOwner.set(u, c.id); // "Melden" under a photo reports the entry it belongs to
    if (c.kind === 'review') { push(COMMX.reviews, c.placeId, c); continue; }
    if (c.kind === 'new_place') COMMX.places.push(c);
    push(COMMX.byPlace, c.placeId, c);
    if (c.hours && parseOH(c.hours) && (!COMMX.hours.has(c.placeId) || COMMX.hours.get(c.placeId).at < c.createdAt)) COMMX.hours.set(c.placeId, { h: c.hours, at: c.createdAt });
  }
  for (const it of commMineItems()) {
    const c = commNorm(it, true); if (!c) continue;
    if (it.status === 'rejected') { push(COMMX.rejected, c.placeId, c); continue; } // only the sender sees it, quietly
    push(COMMX.mine, c.placeId, c);
    if (c.kind === 'new_place' && !COMM.items.some(x => x.id === c.id)) COMMX.minePlaces.push({ ...c, mine: true });
  }
}
const commMineItems = () => commSignedIn() && COMM_MINE.user === auth.userId ? COMM_MINE.items : [];

// ---------- What app.js asks ----------
const COMM_NONE = Object.freeze([]); // asked for every place while filtering: no new arrays
const commContribsOf = pid => COMMX.byPlace.get(pid) || COMM_NONE;
const commReviewsOf = pid => COMMX.reviews.get(pid) || COMM_NONE;
const commNewPlaces = () => COMMX.places.concat(COMMX.minePlaces);
const commHours = () => COMMX.hours;
const commMineOf = pid => COMMX.mine.get(pid) || COMM_NONE;
const commReview = id => { for (const l of COMMX.reviews.values()) { const r = l.find(x => x.id === id); if (r) return r; } return null; };
// the approved entry a photo address belongs to, or null (app.js: "Melden" under a photo)
const commPhotoOwner = url => COMMX.photoOwner.get(url) || null;

// ---------- Loading the approved entries ----------
// the kept copy stays small next to the app's own data (localStorage holds about 5 MB per site): a larger list is only
// kept in memory and loaded whole on the next start
function commSave() {
  try { const j = JSON.stringify(COMM); if (j.length > 1500000) localStorage.removeItem(COMM_KEY); else localStorage.setItem(COMM_KEY, j); }
  catch (e) { /* storage full or blocked: works without the copy */ }
}
async function commLoad() {
  if (!commOn() || COMMX.busy) return false;
  COMMX.busy = true;
  try {
    // a complete load once a week keeps the copy right, in between only what changed
    const full = !COMM.since || Date.now() - COMM.full > 7 * 864e5;
    const r = await fetchJson(`${COMM_API}/api/djuu/community${full ? '' : '?since=' + encodeURIComponent(COMM.since)}`, 10000);
    if (!r || !r.ok || !Array.isArray(r.items)) return false;
    const before = JSON.stringify(COMM.items), whole = full || r.full === true; // `full`: the server sent the whole list
    const by = new Map(whole ? [] : COMM.items.map(x => [x.id, x]));
    for (const it of r.items) if (it && typeof it.id === 'string') by.set(it.id, it);
    for (const id of Array.isArray(r.removed) ? r.removed : []) by.delete(id);
    COMM.items = [...by.values()];
    // the server's own time is the mark for the next update (`until`); else the newest approval seen
    let since = typeof r.until === 'string' ? r.until : COMM.since || '';
    if (typeof r.until !== 'string') for (const it of r.items) if (typeof it?.approved === 'string' && it.approved > since) since = it.approved;
    COMM.since = since; if (whole) COMM.full = Date.now();
    commSave();
    return JSON.stringify(COMM.items) !== before;
  } catch (e) { return false; } finally { COMMX.busy = false; COMMX.loadedAt = Date.now(); }
}
// own entries that wait for the check, and those not taken over in the last 30 days (shown quietly, only to the sender;
// the moderator's note is never shown): the server lists only the caller's own records
async function commLoadMine() {
  if (!commSignedIn()) return false;
  try {
    const t = new Date(Date.now() - 30 * 864e5).toISOString().replace('T', ' ');
    const r = await api('GET', `/api/collections/contributions/records?perPage=150&sort=-created&fields=id,kind,place_id,data,status,created&filter=${encodeURIComponent(`status='pending' || (status='rejected' && kind!='report' && updated>='${t}')`)}`);
    const before = JSON.stringify(COMM_MINE.items);
    COMM_MINE.user = auth.userId; COMM_MINE.items = (r?.items || []).map(x => ({ id: x.id, kind: x.kind, place_id: x.place_id, data: x.data, status: x.status === 'rejected' ? 'rejected' : 'pending', created: x.created }));
    writeJson(COMM_MINE_KEY, COMM_MINE);
    return JSON.stringify(COMM_MINE.items) !== before;
  } catch (e) { return false; }
}
// after a change: places on the map, facts, and the open place page follow
function commApply() {
  commIndex();
  if (!places.length) return;
  addUserPlaces(); refresh();
  if (['detail', 'card'].includes(view().type)) {
    if (view().id && !byId.has(view().id)) back(); else renderPanel();
  }
}
async function commRefresh() {
  const [a, b] = await Promise.all([commLoad(), commLoadMine()]);
  if (a || b) commApply();
  // a shared link to a new place on a first visit: the place arrives only now
  const h = location.hash.slice(1);
  if (!COMMX.hashDone && /^u_[a-z0-9]{5,20}$/.test(h) && byId.has(h) && view().type === 'list') { const p = byId.get(h); map.setView([p.lat, p.lon], 17); showPlace(h); }
  COMMX.hashDone = true;
}
function commStart() {
  commIndex();
  if (!commOn()) return;
  commRefresh();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - COMMX.loadedAt > 30 * 6e4) commRefresh(); });
}

// ---------- Sending ----------
function commBlob(u) {
  const bin = atob(String(u).split(',')[1] || ''), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: 'image/jpeg' });
}
// The server takes JPEG only, at most 1.5 MB: anything else (an old PNG/WebP copy on the phone, a large picture) is drawn
// again on a canvas (at most 1600 px) and saved as JPEG, smaller until it fits. Resolves to a data: URL of a JPEG.
const COMM_PHOTO_MAX = 1450000;
async function commJpeg(u) {
  u = String(u || '');
  const bytes = x => Math.floor((x.length - x.indexOf(',') - 1) * 3 / 4);
  if (u.startsWith('data:image/jpeg;base64,') && bytes(u) <= COMM_PHOTO_MAX) return u;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  let side = 1600, q = 0.85, out = '';
  for (let round = 0; round < 6; round++) {
    const k = Math.min(1, side / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (out.startsWith('data:image/jpeg') && bytes(out) <= COMM_PHOTO_MAX) return out;
    side = Math.round(side * 0.8); q = Math.max(0.6, q - 0.08);
  }
  throw new Error('photo');
}
// the server's reasons in the app's words (codes from server/pb_hooks/djuu_community.js)
const COMM_WHY = { limit_reached: tl('Für heute hast du schon sehr viel geschickt. Morgen geht es weiter.'), queue_full: tl('Gerade kommen sehr viele Beiträge an. Bitte versuch es später noch einmal.'),
  already_reported: tl('Du hast das schon gemeldet.'), invalid_photo: tl('Das Foto konnte nicht gelesen werden. Versuch ein anderes.'), not_found: tl('Diesen Beitrag gibt es nicht mehr.'),
  too_many_photos: tl('Höchstens 3 Fotos auf einmal.'), photo_required: tl('Bitte füge ein Foto hinzu.'), burst: tl('Gerade kam zu viel auf einmal. Bitte versuch es gleich noch einmal.') };
// one record; photos = data: URLs (compressed JPEGs). Resolves to the new record, throws an Error with .status and .why.
async function commPost(kind, placeId, data, photos = []) {
  const body = new FormData();
  body.append('user', auth.userId); body.append('kind', kind); body.append('place_id', placeId || ''); body.append('status', 'pending');
  body.append('data', JSON.stringify(data));
  let jpegs;
  try { jpegs = await Promise.all(photos.filter(Boolean).slice(0, 3).map(commJpeg)); }
  catch (e) { const err = new Error('photo'); err.status = 400; err.code = 'invalid_photo'; err.why = COMM_WHY.invalid_photo; throw err; }
  jpegs.forEach((p, i) => body.append('photos', commBlob(p), `foto${i + 1}.jpg`));
  let r;
  try { r = await fetch(COMM_API + '/api/collections/contributions/records', { method: 'POST', headers: { Authorization: auth.token }, body }); }
  catch (e) { const err = new Error('offline'); err.status = 0; err.why = tl('Gerade keine Verbindung.'); throw err; }
  const rec = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && typeof sessionEnd === 'function') sessionEnd();
    const code = rec?.code || rec?.data?.code || '', err = new Error(rec?.message || String(r.status)); err.status = r.status; err.code = code;
    // 429 is the server's short burst guard (many requests within seconds), not the daily limit (code limit_reached)
    err.why = COMM_WHY[code] || (r.status === 429 ? COMM_WHY.burst : tl('Das konnte gerade nicht gesendet werden.'));
    throw err;
  }
  COMM_MINE.user = auth.userId; COMM_MINE.items.unshift({ id: rec.id, kind, place_id: placeId || '', data, status: 'pending', created: rec.created || new Date().toISOString() });
  COMMX.my.state = ''; // "Meine Beiträge" loads again when it is opened
  writeJson(COMM_MINE_KEY, COMM_MINE);
  return rec;
}
// the server records for a phone entry: c = place entry (new place, facts, photo), rv = review. Returns [{kind, data, photos}].
function commPayloads(c, rv) {
  const out = [];
  if (c) {
    const attrs = commAttrs(c.attrs), ages = commAges(c.ages), hours = commStr(c.hours, 200), photos = c.photos || [];
    if (c.isNew) out.push({ kind: 'new_place', data: { name: commStr(c.name, 80), cat: c.cat, type: c.type || '', lat: +(+c.lat).toFixed(6), lon: +(+c.lon).toFixed(6), attrs, ages, hours }, photos });
    else {
      // facts carry no photos on the server: a photo goes as its own entry
      if (Object.keys(attrs).length || ages.length || hours) out.push({ kind: 'info', data: { attrs, ages, hours }, photos: [] });
      if (photos.length) out.push({ kind: 'photo', data: { caption: '' }, photos });
    }
  }
  if (rv && (rv.stars || commStr(rv.text, 1000))) out.push({ kind: 'review', data: { stars: Math.max(0, Math.min(5, rv.stars | 0)), text: commStr(rv.text, 1000) }, photos: rv.photos || [] });
  return out;
}
// Send a place entry and/or review of this phone. A review of a new place points to it as 'u_<id>'.
// Resolves to { placeId (of the new place, if any), sent: n }; throws when nothing could be sent.
async function commSendEntry(placeId, c, rv) {
  const list = commPayloads(c, rv);
  let pid = c?.isNew ? '' : placeId, sent = 0, newId = null;
  for (const x of list) {
    try {
      const rec = await commPost(x.kind, x.kind === 'new_place' ? '' : pid, x.data, x.photos);
      if (x.kind === 'new_place') { newId = 'u_' + rec.id; pid = newId; }
      sent++;
    } catch (e) {
      if (sent) e.partial = { sent, newId }; // the first part went up, the rest did not
      throw e;
    }
  }
  commIndex();
  return { placeId: newId, sent };
}
const commPhotosOf = async ids => (await Promise.all((ids || []).map(id => photoDB.get(id).catch(() => null)))).filter(Boolean);
// what this phone holds for a place and could send (the old entries from before the server took them)
function commLocalFor(pid) {
  const sendable = c => c.isNew || commPayloads({ ...c, photos: c.photoIds?.length ? ['photo'] : [] }).length > 0; // old entries with only "Weiß nicht" say nothing
  const cs = store.contributions.filter(c => c.placeId === pid && sendable(c));
  const rs = store.reviews.filter(r => r.placeId === pid && (r.stars || (r.text || '').trim()));
  return { cs, rs, n: cs.length + rs.length };
}
const commCanSendLocal = pid => commSignedIn() && commLocalFor(pid).n > 0;
// "Deine Angaben auf diesem Gerät senden": everything of this place goes up, what went up leaves the phone
async function commSendLocal(pid) {
  const { cs, rs } = commLocalFor(pid);
  let target = pid, sent = 0, failed = null;
  for (const c of cs) {
    try {
      const r = await commSendEntry(pid, { ...c, photos: await commPhotosOf(c.photoIds) }, null);
      if (r.placeId) target = r.placeId;
      store.contributions = store.contributions.filter(x => x !== c); sent++;
    } catch (e) { failed = e; if (c.isNew) break; } // without its place the reviews of a new place cannot go
  }
  if (!(failed && target === pid && pid.startsWith('u_') && cs.some(c => c.isNew))) {
    for (const r of rs) {
      try { await commSendEntry(target, null, { stars: r.stars, text: r.text, photos: await commPhotosOf(r.photoIds) }); store.reviews = store.reviews.filter(x => x !== r); sent++; }
      catch (e) { failed = e; }
    }
  }
  // a new place got its server id: whatever else on this phone pointed to the old one follows
  if (target !== pid) {
    for (const r of store.reviews) if (r.placeId === pid) r.placeId = target;
    store.favorites = store.favorites.map(x => x === pid ? target : x);
  }
  save(); commIndex(); addUserPlaces(); refresh();
  if (view().type === 'detail' && view().id === pid) view().id = target;
  renderPanel();
  toast(failed ? `${failed.why || tl('Das konnte gerade nicht gesendet werden.')}${sent ? ' ' + tl('Ein Teil ist angekommen.') : ''}` : tl('Danke! Wird kurz geprüft.'));
}
// "Melden" under a review of others: signed in it goes to the moderators, the review is hidden here at once either way
async function commReportReview(id) {
  const r = commReview(id);
  if (!r || !commSignedIn()) return false;
  try { await commPost('report', r.placeId, { target: id, reason: tl('Bewertung gemeldet') }); return true; } catch (e) { toast(e.why); return null; }
}
// "Melden" under a photo of others: reports the approved entry the photo belongs to. true = sent, null = failed (said in a
// toast), false = not signed in or the photo is not from the Djuu server
async function commReportPhoto(url) {
  const id = commPhotoOwner(url);
  if (!id || !commSignedIn()) return false;
  let pid = '';
  for (const it of COMM.items) if (it.id === id) { pid = it.kind === 'new_place' ? 'u_' + it.id : commStr(it.place_id, 40); break; }
  try { await commPost('report', pid, { target: id, reason: tl('Foto gemeldet') }); return true; } catch (e) { toast(e.why); return null; }
}
async function commReportPlace(pid, reason) {
  try { await commPost('report', pid, { target: 'place', reason: commStr(reason, 500) }); return true; } catch (e) { toast(e.why); return false; }
}

// ---------- The place page: own waiting entries, and the line to send old ones ----------
const COMM_KIND = { info: tl('Angaben ergänzt'), new_place: tl('Neuer Ort'), review: tl('Bewertung'), photo: tl('Foto'), report: tl('Meldung') };
function commPlaceHtml(pid) {
  // signed in during this visit: the own waiting entries are asked for once
  if (commSignedIn() && COMM_MINE.user !== auth.userId && !COMMX.mineAsked) { COMMX.mineAsked = true; commLoadMine().then(ch => ch && commApply()); }
  const mine = commMineOf(pid), rejected = COMMX.rejected.get(pid) || COMM_NONE;
  const row = (c, chip) => `<li>${esc(COMM_KIND[c.kind] || '')}${c.kind === 'review' && c.stars ? ` <span class="stars-read">${'★'.repeat(c.stars)}</span>` : ''}${c.kind === 'review' && c.text ? ` <span class="muted">„${esc(c.text.slice(0, 60))}${c.text.length > 60 ? ' …' : ''}“</span>` : ''} ${chip}</li>`;
  const rows = mine.map(c => row(c, `<span class="waitchip">${tl('wartet auf Prüfung')}</span>`)).join('') + rejected.map(c => row(c, `<span class="waitchip">${tl('Nicht übernommen')}</span>`)).join('');
  return `${rows ? `<div class="sec mine"><h4>${tl('Deine Beiträge')}</h4><ul class="minelist">${rows}</ul><p class="note">${mine.length ? tl('Nur du siehst sie, bis sie geprüft sind.') : tl('Nur du siehst das.')}${typeof WIR_PAGES === 'object' ? ` <button type="button" class="linkbtn" data-commmy="1">${tl('Alle deine Beiträge')}</button>` : ''}</p></div>` : ''}
    ${commCanSendLocal(pid) ? `<button type="button" class="linkbtn" data-commsend="${esc(pid)}">${tl('Deine Angaben auf diesem Gerät senden')}</button>` : ''}`;
}
// the quiet line at the end of a place page
function commFootNote() {
  if (!commOn()) return tl('Was du hier einträgst, bleibt auf diesem Gerät.');
  return commSignedIn() ? tl('Was du hier einträgst, wird kurz geprüft. Danach sehen es alle.') : tl('Was du hier einträgst, bleibt auf diesem Gerät, bis du dich anmeldest.');
}
// guests: said once, after the first entry, never again
function commLocalHint() {
  if (!commOn() || commSignedIn() || store.prompted.commLocal) return '';
  store.prompted.commLocal = Date.now(); save();
  return tl('Wenn du dich anmeldest, kannst du es senden. Nach einer kurzen Prüfung sehen es dann alle.');
}

// ---------- "Meine Beiträge" (Wir › Konto): everything this account sent, in any state, each one can be deleted ----------
const COMM_STATE = { pending: tl('wartet auf Prüfung'), approved: tl('veröffentlicht'), rejected: tl('Nicht übernommen') };
async function commLoadMy() {
  const M = COMMX.my;
  if (!commSignedIn() || M.state === 'loading') return;
  M.state = 'loading'; M.user = auth.userId;
  try {
    const r = await api('GET', '/api/collections/contributions/records?perPage=200&sort=-created&fields=id,kind,place_id,data,status,created');
    M.items = (r?.items || []).filter(x => x && typeof x.id === 'string').map(x => ({ id: x.id, kind: x.kind, place_id: commStr(x.place_id, 40), data: x.data && typeof x.data === 'object' ? x.data : {}, status: COMM_STATE[x.status] ? x.status : 'pending', created: x.created }));
    M.state = 'ok';
  } catch (e) { M.state = 'error'; }
  if (view().type === 'wir' && view().page === 'mycontrib') renderPanel();
}
// the place a contribution is about, in words (a new place by its own name)
function commPlaceName(x) {
  if (x.kind === 'new_place') return commStr(x.data.name, 80) || tl('Neuer Ort');
  const p = x.place_id && byId.get(x.place_id);
  if (p) return p.name;
  if (x.place_id.startsWith('u_')) { const n = COMMX.my.items.find(y => y.id === x.place_id.slice(2)); if (n) return commStr(n.data.name, 80) || tl('Neuer Ort'); }
  return tl('Ort');
}
function commWhat(x) {
  const d = x.data;
  if (x.kind === 'review') return `${d.stars ? `<span class="stars-read">${'★'.repeat(Math.min(5, d.stars | 0))}</span> ` : ''}${d.text ? `<span class="muted">„${esc(commStr(d.text, 80))}${String(d.text).length > 80 ? ' …' : ''}“</span>` : ''}`;
  if (x.kind === 'report') return d.reason ? `<span class="muted">${esc(commStr(d.reason, 80))}</span>` : '';
  if (x.kind === 'info') { const n = Object.values(d.attrs || {}).filter(v => v !== 'unknown').length + (Array.isArray(d.ages) && d.ages.length ? 1 : 0) + (d.hours ? 1 : 0); return n ? `<span class="muted">${esc(n === 1 ? tl('1 Angabe') : tl('{n} Angaben', { n }))}</span>` : ''; }
  return '';
}
function commMyView() {
  const M = COMMX.my, title = head(tl('Meine Beiträge'));
  if (!commSignedIn()) return `${title}<div class="empty"><b>${tl('Nur mit Konto.')}</b>${tl('Melde dich an, dann siehst du hier, was du für alle eingetragen hast.')}</div>`;
  if (M.user !== auth.userId) { M.state = ''; M.items = []; }
  if (!M.state) setTimeout(commLoadMy, 0);
  if (M.state !== 'ok') return `${title}${M.state === 'error' ? `<div class="empty"><b>${tl('Die Liste ließ sich gerade nicht laden.')}</b><button type="button" class="btn" data-commmyreload="1">${tl('Noch einmal')}</button></div>` : `<p class="note">${tl('Lade …')}</p>`}`;
  if (!M.items.length) return `${title}<div class="empty"><b>${tl('Du hast noch nichts beigetragen.')}</b>${tl('Ergänzungen, neue Orte, Bewertungen und Fotos, die du sendest, stehen dann hier.')}</div>`;
  const rows = M.items.map(x => {
    const pid = x.kind === 'new_place' ? 'u_' + x.id : x.place_id, open = pid && byId.has(pid) && x.status !== 'rejected';
    const name = open ? `<button type="button" class="linkbtn" data-detail="${esc(pid)}">${esc(commPlaceName(x))}</button>` : `<b>${esc(commPlaceName(x))}</b>`;
    const sure = M.confirm === x.id, busy = M.busy === x.id;
    return `<li class="myrow"><div>${esc(COMM_KIND[x.kind] || '')} · ${name}</div>
      <div class="mymeta"><span class="waitchip${x.status === 'approved' ? ' ok' : ''}">${esc(COMM_STATE[x.status])}</span> <span class="muted">${esc(fmtDate(commTime(x.created) || Date.now()))}</span> ${commWhat(x)}</div>
      <div class="myacts">${sure ? `<span class="muted">${tl('Wirklich löschen?')}</span> <button type="button" class="linkbtn" data-commdelno="1">${tl('Nein')}</button> ` : ''}<button type="button" class="linkbtn danger" data-commdel="${esc(x.id)}"${busy ? ' disabled' : ''}>${sure ? tl('Ja, löschen') : tl('Löschen')}</button></div></li>`;
  }).join('');
  return `${title}<p class="note">${tl('Was du für alle eingetragen hast. Veröffentlichtes sehen alle ohne deinen Namen. Löschst du etwas, verschwindet es auch bei den anderen.')}</p>
    <ul class="minelist mylist">${rows}</ul>`;
}
if (typeof WIR_PAGES === 'object') WIR_PAGES.mycontrib = commMyView;
// K3: POST /api/djuu/contrib-delete {id} (only the own entries, in any state); the server tells the other phones to drop it
async function commDelete(id) {
  const M = COMMX.my;
  if (!commSignedIn() || M.busy) return;
  M.busy = id; renderPanel();
  let gone = false;
  try { await api('POST', '/api/djuu/contrib-delete', { id }); gone = true; }
  catch (e) { gone = e.status === 404 && e.code === 'not_found'; if (!gone) toast(e.status === 0 ? tl('Gerade keine Verbindung.') : tl('Das ging gerade nicht. Bitte versuch es noch einmal.')); }
  M.busy = ''; M.confirm = '';
  if (gone) {
    M.items = M.items.filter(x => x.id !== id);
    COMM_MINE.items = COMM_MINE.items.filter(x => x.id !== id); writeJson(COMM_MINE_KEY, COMM_MINE);
    const before = COMM.items.length; COMM.items = COMM.items.filter(x => x.id !== id); if (COMM.items.length !== before) commSave();
    commApply();
    toast(tl('Gelöscht.'));
  }
  if (view().type === 'wir' && view().page === 'mycontrib') renderPanel();
}

document.addEventListener('click', async e => {
  const m = e.target.closest('[data-commmy],[data-commmyreload],[data-commdel],[data-commdelno]');
  if (m) {
    const M = COMMX.my;
    if (m.dataset.commmy) { M.state = ''; go({ type: 'wir', page: 'mycontrib' }); }
    else if (m.dataset.commmyreload) { M.state = ''; renderPanel(); }
    else if (m.dataset.commdelno) { M.confirm = ''; renderPanel(); }
    else if (m.dataset.commdel && !m.disabled) { if (M.confirm === m.dataset.commdel) commDelete(m.dataset.commdel); else { M.confirm = m.dataset.commdel; renderPanel(); } }
    return;
  }
  const b = e.target.closest('[data-commsend]');
  if (!b || b.disabled) return;
  b.disabled = true; b.textContent = tl('Wird gesendet …');
  await commSendLocal(b.dataset.commsend);
});
