/* Djuu moderation page (mod.html): what parents sent waits here until a moderator approves or rejects it.
   Only for accounts with users.is_mod (set by a superuser). Uses the sign-in of the app on the same phone (djuu.auth).
   GET /api/djuu/mod/queue lists the waiting entries (oldest first, the sender's display name only for context);
   POST /api/djuu/mod/decide {id, status, note, data?} decides; changed data replaces the sent data before approving.
   Every value from the server is escaped before it goes into the page. */
'use strict';

const MAPI = (window.DJUU_API || '').replace(/\/$/, '');
const $m = s => document.querySelector(s);
const escM = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mAuth = (() => { try { return JSON.parse(localStorage.getItem('djuu.auth') || 'null'); } catch (e) { return null; } })();
const M = { items: [], places: null, community: null, open: new Set(), busy: new Set(), state: 'loading', error: '' };
// Hamburg and the Umland region, [[south, west], [north, east]]: same as app.js AREA_BOX / server NOTES
const MOD_BOX = [[52.65, 8.48], [54.45, 11.51]];
const inModBox = (lat, lon) => lat > MOD_BOX[0][0] && lat < MOD_BOX[1][0] && lon > MOD_BOX[0][1] && lon < MOD_BOX[1][1];
document.title = tl('Djuu – Beiträge prüfen');

function mToast(msg) { const t = $m('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(mToast.t); mToast.t = setTimeout(() => t.hidden = true, 3500); }
async function mApi(method, path, body) {
  let r;
  try { r = await fetch(MAPI + path, { method, headers: { 'Content-Type': 'application/json', ...(mAuth?.token ? { Authorization: mAuth.token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { const err = new Error('offline'); err.status = 0; throw err; }
  const data = await r.json().catch(() => null);
  if (!r.ok) { const err = new Error(data?.message || String(r.status)); err.status = r.status; err.code = data?.code || ''; throw err; }
  return data;
}

// ---------- Labels (the same words as in the app) ----------
const KIND_LABEL = { info: tl('Angaben ergänzt'), new_place: tl('Neuer Ort'), review: tl('Bewertung'), photo: tl('Foto'), report: tl('Meldung') };
const ATTR_LABEL = { kleinkind: tl('Für Kleinkinder'), eingezaeunt: tl('Eingezäunt'), schatten: tl('Schatten'), wc_nahe: tl('WC in der Nähe'), wasser: tl('Wasserspiel'),
  hochstuhl: tl('Hochstuhl'), wickeltisch: tl('Wickeltisch'), spielecke: tl('Mit Spielecke'), kindermenue: tl('Kindermenü'), kinderwagen: tl('Stufenlos'),
  windeln: tl('Windeln / Babynahrung'), sonntag_user: tl('Sonntags geöffnet'), stillen: tl('Stillmöglichkeit'), toilette: tl('Toilette'), drinnen: tl('Drinnen'), hund: tl('Hunde erlaubt'), kostenlos: tl('Kostenlos') };
const VALUE_LABEL = { yes: tl('Ja'), no: tl('Nein'), limited: tl('Eingeschränkt'), leashed: tl('Leine'), unknown: tl('Weiß nicht') };
const AGE_LABEL = { '0-2': tl('0–2 Jahre'), '3-6': tl('3–6 Jahre'), '7+': tl('ab 7 Jahre') };
const CAT_LABEL_M = { spielplatz: tl('Spielplatz'), cafe: tl('Café / Restaurant'), windeln: tl('Laden'), wickel: tl('Wickeln, Stillen, WC') };
const mDate = s => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

// ---------- Places (names and positions for the map link) ----------
async function loadPlaces() {
  try {
    const d = await (await fetch('data/places.json')).json();
    M.places = new Map(d.places.map(r => [r[0], { name: r[1] || '', cat: r[2], lat: r[3], lon: r[4] }]));
  } catch (e) { M.places = new Map(); }
  try { M.community = (await mApi('GET', '/api/djuu/community')).items || []; } catch (e) { M.community = []; }
  // only the place lines change: what the moderator already typed in the forms stays
  for (const it of M.items) {
    const c = document.querySelector(`[data-mid="${CSS.escape(it.id)}"]`);
    if (c) { c.querySelector('.modplace').innerHTML = placeHtml(it); if (it.kind === 'report') c.querySelector('.modreport').innerHTML = reportHtml(it); }
  }
}
function placeOf(it) {
  const d = it.data || {};
  if (it.kind === 'new_place') return { name: d.name, lat: +d.lat, lon: +d.lon, isNew: true };
  const id = it.place_id || '';
  if (id.startsWith('u_')) {
    // a new place sent by parents: still waiting in this queue, or already approved
    const q = M.items.find(x => x.kind === 'new_place' && x.id === id.slice(2));
    if (q) return { name: q.data?.name, lat: +q.data?.lat, lon: +q.data?.lon, id, waiting: true };
    const c = (M.community || []).find(x => x.id === id.slice(2));
    if (c) return { name: c.data?.name, lat: +c.data?.lat, lon: +c.data?.lon, id };
    // the server names it too (/mod/queue `place_name`), e.g. when the new place was decided meanwhile
    return typeof it.place_name === 'string' && it.place_name ? { name: it.place_name.slice(0, 80), id } : { id, unknownNew: true };
  }
  const p = M.places?.get(id);
  return p ? { ...p, id } : { id };
}
// photo addresses: plain strings or { url, thumb }
const photoList = it => (Array.isArray(it.photos) ? it.photos : []).map(p => typeof p === 'string' ? { url: p.replace(/\?thumb=.*$/, ''), thumb: p } : p && typeof p.url === 'string' ? { url: p.url, thumb: p.thumb || p.url } : null)
  .filter(p => p && /^https?:\/\//.test(p.url) && /^https?:\/\//.test(p.thumb));
const senderOf = it => it.user_name ?? it.name ?? it.user?.name ?? '';

// ---------- The page ----------
function render() {
  const el = $m('#mod');
  const headHtml = `<header class="modhead"><a class="round" href="./" aria-label="${tl('Zurück zur App')}">‹</a><h1>${tl('Beiträge prüfen')}</h1>
    ${M.state === 'ok' ? `<span class="modcount">${M.items.length ? tl('{n} warten', { n: M.items.length }) : ''}</span><button type="button" class="btn sm" data-mreload="1">${tl('Neu laden')}</button>` : ''}</header>`;
  if (M.state === 'loading') { el.innerHTML = headHtml + `<p class="note">${tl('Lade …')}</p>`; return; }
  if (M.state === 'signin') { el.innerHTML = headHtml + `<div class="empty"><b>${tl('Bitte melde dich zuerst in der App an.')}</b><a class="btn primary" href="./">${tl('Zur App')}</a></div>`; return; }
  if (M.state === 'denied') { el.innerHTML = headHtml + `<div class="empty"><b>${tl('Kein Zugang.')}</b>${tl('Diese Seite ist nur für Moderatorinnen und Moderatoren.')}</div>`; return; }
  if (M.state === 'error') { el.innerHTML = headHtml + `<div class="empty"><b>${tl('Die Liste ließ sich gerade nicht laden.')}</b><button type="button" class="btn" data-mreload="1">${tl('Noch einmal')}</button></div>`; return; }
  el.innerHTML = headHtml + (M.items.length ? `<ol class="modlist">${M.items.map(cardHtml).join('')}</ol>` : `<div class="empty"><b>${tl('Alles geprüft.')}</b>${tl('Gerade wartet nichts.')}</div>`);
}
function attrRows(it, attrs) {
  const keys = Object.keys(attrs || {});
  if (!keys.length) return '';
  return `<div class="modattrs">${keys.map(k => `<label class="modrow"><span>${escM(ATTR_LABEL[k] || k)}</span><select data-f="attr" data-k="${escM(k)}">
    ${Object.entries(VALUE_LABEL).map(([v, l]) => `<option value="${v}"${attrs[k] === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}</div>`;
}
function agesRow(ages) {
  return `<div class="modages">${Object.entries(AGE_LABEL).map(([v, l]) => `<label class="chip"><input type="checkbox" data-f="age" value="${v}"${(ages || []).includes(v) ? ' checked' : ''}> ${l}</label>`).join('')}</div>`;
}
const field = (label, html) => `<div class="field"><label>${label}</label>${html}</div>`;
function formHtml(it) {
  const d = it.data || {};
  if (it.kind === 'info') return `${attrRows(it, d.attrs)}${field(tl('Alter'), agesRow(d.ages))}${field(tl('Öffnungszeiten'), `<input type="text" data-f="hours" maxlength="300" value="${escM(d.hours || '')}">`)}`;
  if (it.kind === 'new_place') return `${field(tl('Name'), `<input type="text" data-f="name" maxlength="80" value="${escM(d.name || '')}">`)}
    ${field(tl('Art'), `<select data-f="cat">${Object.entries(CAT_LABEL_M).concat(CAT_LABEL_M[d.cat] ? [] : [[d.cat, d.cat]]).map(([v, l]) => `<option value="${escM(v)}"${d.cat === v ? ' selected' : ''}>${escM(l)}</option>`).join('')}</select>`)}
    <div class="row2">${field(tl('Breite'), `<input type="text" inputmode="decimal" data-f="lat" value="${escM(d.lat ?? '')}">`)}${field(tl('Länge'), `<input type="text" inputmode="decimal" data-f="lon" value="${escM(d.lon ?? '')}">`)}</div>
    ${attrRows(it, d.attrs)}${field(tl('Alter'), agesRow(d.ages))}${field(tl('Öffnungszeiten'), `<input type="text" data-f="hours" maxlength="300" value="${escM(d.hours || '')}">`)}`;
  if (it.kind === 'review') return `${field(tl('Sterne'), `<select data-f="stars">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}"${+d.stars === n ? ' selected' : ''}>${n ? '★'.repeat(n) : tl('keine')}</option>`).join('')}</select>`)}
    ${field(tl('Text'), `<textarea data-f="text" maxlength="1000">${escM(d.text || '')}</textarea>`)}`;
  if (it.kind === 'photo') return field(tl('Bildunterschrift'), `<input type="text" data-f="caption" maxlength="200" value="${escM(d.caption || '')}">`);
  return '';
}
function reportHtml(it) {
  const d = it.data || {};
  if (d.target === 'place') return `<p class="text"><b>${tl('Ort gemeldet')}</b>${d.reason ? `: ${escM(d.reason)}` : ''}</p>`;
  const t = it.target && typeof it.target === 'object' ? it.target : null;
  const what = t ? (t.kind === 'review' ? `${t.data?.stars ? '★'.repeat(Math.min(5, +t.data.stars || 0)) + ' ' : ''}„${escM(t.data?.text || '')}“` : escM(KIND_LABEL[t.kind] || '')) : tl('(gibt es nicht mehr)');
  const state = t?.status === 'rejected' ? ` <span class="waitchip">${tl('schon entfernt')}</span>` : t?.reporters > 1 ? ` <span class="waitchip">${tl('{n}× gemeldet', { n: +t.reporters })}</span>` : '';
  return `<p class="text"><b>${tl('Gemeldet:')}</b> ${what}${state}</p>${d.reason ? `<p class="note">${escM(d.reason)}</p>` : ''}${t && photoList(t).length ? `<div class="photos">${photoList(t).map(p => `<a href="${escM(p.url)}" target="_blank" rel="noopener"><img src="${escM(p.thumb)}" alt="${tl('Foto von Nutzer')}" loading="lazy"></a>`).join('')}</div>` : ''}`;
}
function placeHtml(it) {
  const p = placeOf(it), pos = p.lat && p.lon ? `${p.lat},${p.lon}` : '';
  const name = p.name || (p.unknownNew ? tl('Neuer Ort von Eltern') : p.id ? tl('Ort {id}', { id: p.id }) : tl('Ort unbekannt'));
  return `<h3>${escM(name)}${p.waiting ? ` <span class="waitchip">${tl('wartet auch auf Prüfung')}</span>` : ''}</h3>
    <div class="modlinks">${pos ? `<a class="btn sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pos)}" target="_blank" rel="noopener">${tl('Karte')}</a>` : ''}${p.id && !p.isNew && !p.waiting && !p.unknownNew ? `<a class="btn sm" href="./#${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${tl('In Djuu ansehen')}</a>` : ''}</div>
    ${it.kind === 'new_place' ? nearHtml(it) : ''}`;
}

// ---------- Maybe already there: the server's list (approved community places) and places.json within 100 m ----------
const mDist = (a, b) => { const k = Math.PI / 180; return 6371000 * Math.hypot((b[1] - a[1]) * k * Math.cos((a[0] + b[0]) * k / 2), (b[0] - a[0]) * k); };
const GENERIC = new Set(['spielplatz', 'cafe', 'restaurant', 'laden', 'kita', 'der', 'die', 'das', 'am', 'an', 'im', 'in', 'und', 'hamburg', 'wickelraum', 'wc', 'toilette']);
const normName = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const coreName = s => normName(s).split(' ').filter(w => w && !GENERIC.has(w)).join(' ');
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function similarName(a, b) {
  const x = coreName(a), y = coreName(b);
  if (!x || !y) return normName(a) === normName(b) && !!normName(a);
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  return editDist(x, y, 2) <= Math.max(1, Math.floor(Math.min(x.length, y.length) / 6));
}
function nearList(it) {
  const d = it.data || {}, at = [+d.lat, +d.lon], out = [], seen = new Set();
  if (!(at[0] && at[1])) return out;
  // from the server: [{ id?, name, dist? | d? | m?, lat?, lon? }] – read tolerantly, the shape may grow
  for (const n of Array.isArray(it.near) ? it.near.slice(0, 10) : []) {
    if (!n || typeof n !== 'object') continue;
    const m = Number.isFinite(+(n.dist ?? n.d ?? n.m)) && (n.dist ?? n.d ?? n.m) !== null ? +(n.dist ?? n.d ?? n.m) : (+n.lat && +n.lon ? mDist(at, [+n.lat, +n.lon]) : null);
    const id = typeof n.id === 'string' ? n.id : '', key = id || normName(n.name);
    if (seen.has(key)) continue; seen.add(key);
    out.push({ id: id && /^(dj_|u_)?[a-z0-9_]{5,40}$/i.test(id) ? (id.startsWith('dj_') || id.startsWith('u_') ? id : 'u_' + id) : '', name: String(n.name || ''), m });
  }
  // from places.json: neighbours within 100 m with a similar name
  if (M.places) for (const [id, p] of M.places) {
    if (seen.has(id) || !p.name || Math.abs(p.lat - at[0]) > 0.001 || Math.abs(p.lon - at[1]) > 0.0016) continue;
    const m = mDist(at, [p.lat, p.lon]);
    if (m <= 100 && similarName(d.name, p.name)) { seen.add(id); out.push({ id, name: p.name, m }); }
  }
  return out.sort((a, b) => (a.m ?? 999) - (b.m ?? 999)).slice(0, 6);
}
function nearHtml(it) {
  const list = nearList(it);
  if (!list.length) return '';
  return `<div class="modnear"><b>${tl('Vielleicht schon vorhanden:')}</b><ul>${list.map(n => `<li>${n.id ? `<a href="./#${encodeURIComponent(n.id)}" target="_blank" rel="noopener">${escM(n.name || n.id)}</a>` : escM(n.name)}${n.m != null ? ` <span class="muted">${escM(Math.round(n.m))} m</span>` : ''}</li>`).join('')}</ul></div>`;
}
function cardHtml(it) {
  const busy = M.busy.has(it.id), ph = photoList(it), sender = senderOf(it);
  const report = it.kind === 'report', onItem = report && it.data?.target && it.data.target !== 'place';
  return `<li class="modcard" data-mid="${escM(it.id)}">
    <div class="modmeta"><b>${escM(KIND_LABEL[it.kind] || it.kind)}</b> · ${escM(mDate(it.created))}${sender ? ` · ${tl('von {name}', { name: escM(sender) })}` : ''}</div>
    <div class="modplace">${placeHtml(it)}</div>
    ${ph.length ? `<div class="photos">${ph.map(x => `<a href="${escM(x.url)}" target="_blank" rel="noopener"><img src="${escM(x.thumb)}" alt="${tl('Foto von Nutzer')}" loading="lazy"></a>`).join('')}</div>` : ''}
    ${report ? `<div class="modreport">${reportHtml(it)}</div>` : `<form class="modform" data-mform="${escM(it.id)}">${formHtml(it)}</form>`}
    <div class="field"><label for="note_${escM(it.id)}">${tl('Notiz (nur für die Moderation)')}</label><input type="text" id="note_${escM(it.id)}" data-note="1" maxlength="300"></div>
    <div class="modacts">
      ${onItem ? `<button type="button" class="btn" data-mdecide="rejected" data-id="${escM(it.id)}"${busy ? ' disabled' : ''}>${tl('Behalten')}</button>
      <button type="button" class="btn danger" data-mremove="${escM(it.id)}"${busy ? ' disabled' : ''}>${tl('Entfernen')}</button>`
      : `<button type="button" class="btn" data-mdecide="rejected" data-id="${escM(it.id)}"${busy ? ' disabled' : ''}>${report ? tl('Meldung ablehnen') : tl('Ablehnen')}</button>
      <button type="button" class="btn primary" data-mdecide="approved" data-id="${escM(it.id)}"${busy ? ' disabled' : ''}>${report ? tl('Erledigt') : tl('Freigeben')}</button>`}
    </div></li>`;
}

// the data as the moderator left it in the form, or null when nothing was changed
function formData(it) {
  const f = document.querySelector(`[data-mform="${CSS.escape(it.id)}"]`);
  if (!f) return null;
  const d = JSON.parse(JSON.stringify(it.data || {}));
  const val = k => f.querySelector(`[data-f="${k}"]`)?.value;
  if (it.kind === 'info' || it.kind === 'new_place') {
    d.attrs = {}; f.querySelectorAll('[data-f="attr"]').forEach(s => { d.attrs[s.dataset.k] = s.value; });
    d.ages = [...f.querySelectorAll('[data-f="age"]:checked')].map(x => x.value);
    d.hours = (val('hours') || '').trim();
  }
  if (it.kind === 'new_place') { d.name = (val('name') || '').trim(); d.cat = val('cat'); d.lat = Number(String(val('lat')).replace(',', '.')); d.lon = Number(String(val('lon')).replace(',', '.')); }
  if (it.kind === 'review') { d.stars = +val('stars'); d.text = (val('text') || '').trim(); }
  if (it.kind === 'photo') d.caption = (val('caption') || '').trim();
  const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x);
  return canon(d) === canon(it.data || {}) ? null : d;
}
// a report that is approved removes the reported item on the server (and closes the other reports on it)
async function decide(id, status) {
  const it = M.items.find(x => x.id === id); if (!it || M.busy.has(id)) return;
  const card = document.querySelector(`[data-mid="${CSS.escape(id)}"]`), note = (card?.querySelector('[data-note]')?.value || '').trim().slice(0, 300);
  const body = { id, status, note };
  const data = status === 'approved' && it.kind !== 'report' ? formData(it) : null;
  if (data) body.data = data;
  if (data && it.kind === 'new_place' && !inModBox(data.lat, data.lon)) { mToast(tl('Der Ort liegt nicht in Hamburg oder im Umland. Bitte prüfe Breite und Länge.')); return; }
  const btns = card ? [...card.querySelectorAll('.modacts button')] : [];
  M.busy.add(id); btns.forEach(b => { b.disabled = true; });
  let gone = false;
  try {
    await mApi('POST', '/api/djuu/mod/decide', body);
    gone = true;
    const onItem = it.kind === 'report' && it.data?.target !== 'place';
    mToast(status === 'approved' ? (onItem ? tl('Entfernt.') : it.kind === 'report' ? tl('Erledigt.') : tl('Freigegeben.')) : onItem ? tl('Bleibt sichtbar.') : tl('Abgelehnt.'));
  } catch (e) {
    mToast(e.status === 0 ? tl('Gerade keine Verbindung.') : e.status === 400 ? tl('Die Angaben sind nicht gültig. Bitte prüfe sie.') : e.status === 404 ? tl('Diesen Beitrag gibt es nicht mehr.') : tl('Das ging gerade nicht. Bitte versuch es noch einmal.'));
    gone = e.status === 404;
  } finally {
    M.busy.delete(id);
    // only this card changes: what is typed in the others stays
    if (gone) {
      const target = it.kind === 'report' ? it.data?.target : '';
      const settled = x => x.id === id
        || (target && target !== 'place' && x.kind === 'report' && x.data?.target === target) // the other reports on that item are closed with it
        || (status === 'rejected' && it.kind === 'new_place' && x.place_id === 'u_' + id) // the server rejects what was sent for a rejected new place
        || (status === 'approved' && target && target !== 'place' && x.id === target);
      const drop = M.items.filter(settled).map(x => x.id);
      M.items = M.items.filter(x => !drop.includes(x.id));
      for (const x of drop) document.querySelector(`[data-mid="${CSS.escape(x)}"]`)?.remove();
      if (!M.items.length) render(); else $m('.modcount').textContent = tl('{n} warten', { n: M.items.length });
      // waiting entries about a new place that was just approved now point to a real place
      if (status === 'approved' && it.kind === 'new_place') { (M.community || (M.community = [])).push({ id, kind: 'new_place', data: data || it.data }); }
      if (status === 'approved' && it.kind === 'new_place') for (const x of M.items) if (x.place_id === 'u_' + id) { const c = document.querySelector(`[data-mid="${CSS.escape(x.id)}"] .modplace`); if (c) c.innerHTML = placeHtml(x); }
    }
    else btns.forEach(b => { b.disabled = false; });
  }
}
async function load() {
  if (!MAPI || !mAuth?.token) { M.state = 'signin'; render(); return; }
  M.state = 'loading'; render();
  try {
    const r = await mApi('GET', '/api/djuu/mod/queue');
    M.items = Array.isArray(r?.items) ? r.items : [];
    M.state = 'ok';
  } catch (e) { M.state = e.status === 401 ? 'signin' : e.status === 403 ? 'denied' : 'error'; }
  render();
  if (M.state === 'ok' && !M.places) loadPlaces();
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mreload) load();
  else if (b.dataset.mdecide) decide(b.dataset.id, b.dataset.mdecide);
  else if (b.dataset.mremove) { if (confirm(tl('Den gemeldeten Beitrag entfernen? Er ist dann für niemanden mehr sichtbar.'))) decide(b.dataset.mremove, 'approved'); }
});
load();
