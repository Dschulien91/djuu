/* Djuu v0.2 – family map for Hamburg.
   Data: data/places.json, exported from the Djuu database (db/export.py). Every value carries its source.
   User input (new places, confirmations, ratings, photos) is stored on this device only until the server exists.
   Data model of user input is server-ready: see STORE below. */
'use strict';

const VERSION = '0.2';

// ---------- Category groups (chips) and categories (detail labels) ----------
const GROUPS = [
  { id: 'spielplatz', label: 'Spielplätze', color: '#E8590C', cats: ['spielplatz'] },
  { id: 'drinnen', label: 'Drinnen spielen', color: '#D6336C', cats: ['indoor', 'spielhaus', 'freizeit'] },
  { id: 'essen', label: 'Essen & Trinken', color: '#9C36B5', cats: ['cafe', 'restaurant', 'imbiss', 'eis'] },
  { id: 'einkauf', label: 'Windeln & Einkauf', color: '#1971C2', cats: ['windeln', 'laden'] },
  { id: 'wickeln', label: 'Wickeln, Stillen, WC', color: '#0C8599', cats: ['wc', 'wickel', 'familienfreundlich'] },
  { id: 'gesundheit', label: 'Gesundheit', color: '#E03131', cats: ['apotheke', 'kinderarzt', 'hebamme', 'klinik', 'babyklappe'] },
  { id: 'kultur', label: 'Kultur & Ausflüge', color: '#E67700', cats: ['museum', 'kultur', 'ausflug', 'buecherei'] },
  { id: 'baden', label: 'Baden', color: '#1098AD', cats: ['baden'] },
  { id: 'natur', label: 'Parks & Natur', color: '#2F9E44', cats: ['park', 'picknick', 'grillplatz', 'trinkwasser'] },
  { id: 'hund', label: 'Hundeauslauf', color: '#8D6E63', cats: ['hundeauslauf'] },
  { id: 'zentren', label: 'Familienzentren & Beratung', color: '#6741D9', cats: ['treffpunkt', 'beratung'] },
  { id: 'kita', label: 'Kitas', color: '#F59F00', cats: ['kita'] },
  { id: 'unterwegs', label: 'Aufzüge & Bahnhöfe', color: '#5C677D', cats: ['aufzug', 'bahnhof'] },
];
const CAT_LABEL = {
  spielplatz: 'Spielplatz', indoor: 'Drinnen spielen', spielhaus: 'Spielhaus', freizeit: 'Freizeit', cafe: 'Café',
  restaurant: 'Restaurant', imbiss: 'Imbiss', eis: 'Eis', windeln: 'Drogerie / Supermarkt / Späti', laden: 'Laden',
  wc: 'Toilette', wickel: 'Wickelplatz', familienfreundlich: 'Familienfreundlicher Ort', apotheke: 'Apotheke',
  kinderarzt: 'Kinderarzt', hebamme: 'Hebamme', klinik: 'Klinik', babyklappe: 'Babyklappe', museum: 'Museum',
  kultur: 'Kultur', ausflug: 'Ausflugsziel', buecherei: 'Bücherhalle', baden: 'Baden', park: 'Park', picknick: 'Picknickplatz',
  grillplatz: 'Grillplatz', trinkwasser: 'Trinkwasser', hundeauslauf: 'Hundeauslaufzone', treffpunkt: 'Familienzentrum / Treffpunkt',
  beratung: 'Beratung', kita: 'Kita', aufzug: 'Aufzug', bahnhof: 'Bahnhof',
};
const GROUP_OF = {};
for (const g of GROUPS) for (const c of g.cats) GROUP_OF[c] = g;

// ---------- Attributes (the filters Google does not have) ----------
// keys: fact keys in places.json, first non-empty wins. groups: where the filter is offered (null = everywhere).
const truthy = v => /^(yes|designated|room|true|ja|1|limited|partial)$/i.test(v) ? (v === 'limited' || v === 'partial' ? 'limited' : 'yes') : /^(no|false|nein|0)$/i.test(v) ? 'no' : null;
const ATTRS = [
  { id: 'wickeltisch', label: 'Wickeltisch', keys: ['changing_table'], groups: ['essen', 'einkauf', 'wickeln', 'gesundheit', 'kultur', 'baden', 'drinnen', 'zentren', 'unterwegs'], q: 'Gibt es hier einen Wickeltisch?' },
  { id: 'stillen', label: 'Stillmöglichkeit / Stillraum', keys: ['baby_feeding'], groups: ['essen', 'einkauf', 'wickeln', 'gesundheit', 'kultur', 'baden', 'drinnen', 'zentren', 'unterwegs'], q: 'Gibt es hier eine Stillmöglichkeit?' },
  { id: 'hochstuhl', label: 'Hochstuhl', keys: ['highchair'], groups: ['essen'], q: 'Gibt es Hochstühle?' },
  { id: 'spielecke', label: 'Spielecke', keys: ['kids_area'], groups: ['essen', 'einkauf', 'kultur', 'gesundheit', 'zentren'], q: 'Gibt es eine Spielecke?' },
  { id: 'kindermenue', label: 'Kindermenü', keys: ['kids_menu'], groups: ['essen'], q: 'Gibt es ein Kindermenü?' },
  { id: 'windeln', label: 'Windeln / Babynahrung', keys: [], groups: ['einkauf'], q: 'Gibt es hier Windeln oder Babynahrung?' },
  { id: 'kleinkind', label: 'Bereich für Kleinkinder', keys: ['for_baby', 'for_toddler'], groups: ['spielplatz'], q: 'Gibt es einen Bereich für Kleinkinder?' },
  { id: 'eingezaeunt', label: 'Eingezäunt', keys: ['fenced'], groups: ['spielplatz'], q: 'Ist der Spielplatz eingezäunt?' },
  { id: 'schatten', label: 'Schatten', keys: ['shade'], groups: ['spielplatz'], q: 'Gibt es Schatten?' },
  { id: 'wc_nahe', label: 'WC in der Nähe', keys: ['wc_near'], groups: ['spielplatz'], q: 'Gibt es ein WC in der Nähe?' },
  { id: 'wasser', label: 'Wasserspiel', keys: ['water_play'], groups: ['spielplatz'], q: 'Gibt es ein Wasserspiel?' },
  { id: 'kinderwagen', label: 'Kinderwagengeeignet', keys: ['stroller', 'wheelchair'], q: 'Kommt man gut mit dem Kinderwagen hin?' },
  { id: 'toilette', label: 'Toilette', keys: ['toilets'], groups: ['essen', 'kultur', 'baden', 'drinnen', 'natur', 'einkauf'], q: 'Gibt es eine Toilette?' },
  { id: 'drinnen', label: 'Drinnen', keys: ['indoor'], groups: ['spielplatz', 'drinnen', 'kultur', 'baden', 'zentren'], q: 'Ist es drinnen?' },
  { id: 'hund', label: 'Hunde erlaubt', keys: ['dog'], q: 'Sind Hunde erlaubt?' },
  { id: 'kostenlos', label: 'Kostenlos', keys: ['fee'], invert: true, groups: ['spielplatz', 'drinnen', 'kultur', 'baden', 'wickeln', 'zentren'], q: 'Ist es kostenlos?' },
];
const ATTR = Object.fromEntries(ATTRS.map(a => [a.id, a]));

function normValue(attr, key, v) {
  if (v == null || v === '') return null;
  if (attr.id === 'hund') return /yes|leashed|outside|offleash/.test(v) ? 'yes' : v === 'no' ? 'no' : null;
  if (attr.id === 'wc_nahe') return 'yes';
  if (attr.invert) { const t = truthy(v); return t === 'yes' ? 'no' : t === 'no' ? 'yes' : null; }
  return truthy(v);
}

const GEAR = [
  { id: 'schaukel', label: 'Schaukel', re: /swing/ },
  { id: 'rutsche', label: 'Rutsche', re: /slide/ },
  { id: 'sand', label: 'Sandkasten', re: /sand/ },
  { id: 'klettern', label: 'Klettern', re: /climb|structure|rope|net/ },
  { id: 'seilbahn', label: 'Seilbahn', re: /zipwire|zip_line|cableway/ },
  { id: 'wippe', label: 'Wippe / Wipptier', re: /seesaw|springy/ },
  { id: 'trampolin', label: 'Trampolin', re: /trampoline/ },
];
const TIME_FILTERS = [{ id: 'jetzt', label: 'Jetzt geöffnet' }, { id: 'sonntag', label: 'Sonntags geöffnet' }];
const AGES = [{ id: '0-2', label: '0–2 Jahre' }, { id: '3-6', label: '3–6 Jahre' }, { id: '7+', label: 'ab 7 Jahre' }];

const PRESETS = [
  { id: 'windeln-jetzt', label: 'Jetzt Windeln kaufen', groups: ['einkauf'], cats: ['apotheke'], filters: ['jetzt'] },
  { id: 'windeln-sonntag', label: 'Windeln am Sonntag', groups: ['einkauf'], cats: ['apotheke'], filters: ['sonntag'] },
  { id: 'wickeln', label: 'Wickeln unterwegs', groups: [], filters: ['wickeltisch'] },
  { id: 'stillen', label: 'Stillen', groups: [], filters: ['stillen'] },
  { id: 'cafe-hund', label: 'Café mit Kind und Hund', groups: ['essen'], filters: ['hund'] },
  { id: 'regen', label: 'Es regnet', groups: ['drinnen', 'kultur', 'baden'], filters: [] },
  { id: 'kleinkind', label: 'Spielplatz für die Kleinen', groups: ['spielplatz'], filters: ['kleinkind'] },
  { id: 'hund', label: 'Hund darf rennen', groups: ['hund'], filters: [] },
];

// ---------- Opening hours (common OSM formats; holidays ignored) ----------
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
function parseOH(s) {
  if (!s) return null;
  s = s.replace(/"[^"]*"/g, '').replace(/\bDi\b/g, 'Tu').replace(/\bMi\b/g, 'We').replace(/\bDo\b/g, 'Th').replace(/\bSo\b/g, 'Su').trim();
  if (s === '24/7') return { always: true };
  const week = Array(7).fill(null);
  const spill = Array(7).fill(null).map(() => []);
  const rules = s.split(/;|,\s+(?=[A-Z][a-z])/).map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    let days, times;
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)(?:\s+(.*))?$/);
    if (m) { days = m[1]; times = (m[2] || '').trim(); }
    else if (/^\d/.test(rule) || /^(off|closed)$/.test(rule)) { days = 'Mo-Su'; times = rule; }
    else return null;
    const idx = [];
    let onlyHolidays = true;
    for (const part of days.split(/\s*,\s*/)) {
      if (part === 'PH' || part === 'SH') continue;
      onlyHolidays = false;
      const [a, b] = part.split('-');
      const i = DAYS.indexOf(a), j = b ? DAYS.indexOf(b) : i;
      for (let k = i; ; k = (k + 1) % 7) { idx.push(k); if (k === j) break; }
    }
    if (onlyHolidays) continue;
    let ranges = [];
    const ownSpill = [];
    if (!times || /^(off|closed)$/.test(times)) ranges = times ? [] : [[0, 1440]];
    else {
      for (const tr of times.split(/\s*,\s*/)) {
        const t = tr.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/) || tr.match(/^(\d{1,2}):(\d{2})\+$/);
        if (!t) return null;
        const from = +t[1] * 60 + +t[2];
        let to = t[3] !== undefined ? +t[3] * 60 + +t[4] : 1440;
        if (to <= from) { ownSpill.push([0, to]); to = 1440; }
        ranges.push([from, to]);
      }
    }
    for (const d of idx) { week[d] = ranges; spill[(d + 1) % 7] = ownSpill; }
  }
  for (let d = 0; d < 7; d++) if (week[d] === null) week[d] = [];
  return { week, spill };
}
const dayIdx = date => (date.getDay() + 6) % 7;
function isOpen(oh, date = new Date()) {
  if (!oh) return null;
  if (oh.always) return true;
  const d = dayIdx(date), min = date.getHours() * 60 + date.getMinutes();
  return oh.week[d].some(([a, b]) => min >= a && min < b) || oh.spill[d].some(([a, b]) => min >= a && min < b);
}
const opensSunday = oh => !oh ? null : oh.always ? true : oh.week[6].length > 0;
const fmtMin = m => m === 1440 ? '24:00' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

// ---------- Local store (server-ready shape) ----------
// contributions: one per "add place" or "add info" form; attrs hold 'yes' | 'no' | 'unknown' (unknown kept separately on purpose)
// confirmations: one tap answers to "Gibt es X noch?"; reviews: stars, text, photo ids; reports: flagged content
const STORE_KEY = 'djuu.v2';
let store = { contributions: [], confirmations: [], reviews: [], reports: [], events: [], prompted: {} };
try { Object.assign(store, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { toast('Speicher voll. Bitte weniger Fotos verwenden.'); } }
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Photos live in IndexedDB (localStorage is too small).
const photoDB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('djuu-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('photos', mode); const q = fn(t.objectStore('photos')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  return { put: (id, data) => tx('readwrite', s => s.put(data, id)), get: id => tx('readonly', s => s.get(id)) };
})();

async function compressPhoto(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.75);
}

// ---------- State ----------
const state = { groups: new Set(), cats: new Set(), filters: new Set(), preset: null, showUnknown: false, q: '', view: 'map', selected: null, listLimit: 60, me: null };
let SOURCES = [];
let places = [];
const byId = new Map();

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('de-DE');
const fmtDate = t => new Date(t).toLocaleDateString('de-DE');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000); }
function dist(a, b) {
  const R = 6371000, k = Math.PI / 180;
  const x = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) * k / 2), y = (b[0] - a[0]) * k;
  return R * Math.hypot(x, y);
}
const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
const placeColor = p => (GROUP_OF[p.cat] || GROUPS[0]).color;

// User answers for an attribute: contributions and confirmations, newest wins.
function userAnswers(pid, attrId) {
  const out = [];
  for (const c of store.contributions) if (c.placeId === pid && c.attrs?.[attrId] && c.attrs[attrId] !== 'unknown') out.push({ v: c.attrs[attrId], at: c.createdAt });
  for (const c of store.confirmations) if (c.placeId === pid && c.attr === attrId) out.push({ v: c.answer, at: c.at });
  return out.sort((a, b) => b.at - a.at);
}

// Value of an attribute: { v: 'yes'|'no'|'limited'|null, src, method, evidence, confirmations }
function attrVal(p, id) {
  const ua = userAnswers(p.id, id);
  if (GEAR.some(g => g.id === id)) return { v: p.gear?.has(id) ? 'yes' : null, src: p.gear ? 'OpenStreetMap' : null };
  const a = ATTR[id];
  let base = { v: null };
  if (id === 'toilette' && p.cat === 'wc') base = { v: 'yes', src: 'Kategorie' };
  else if (id === 'wasser' && p.gear?.has('wasser')) base = { v: 'yes', src: 'OpenStreetMap' };
  else for (const k of a.keys) {
    const f = p.f[k];
    const v = f && normValue(a, k, f[0]);
    if (v) { base = { v, src: SOURCES[f[1]]?.[1], method: f[2], conf: f[3], evidence: f[4] }; break; }
  }
  if (ua.length) return { ...base, v: ua[0].v, src: 'Nutzer', method: 'user', confirmations: ua, osm: base };
  return base;
}
function filterVal(p, f) {
  if (f === 'jetzt') return isOpen(p.oh);
  if (f === 'sonntag') return opensSunday(p.oh);
  const v = attrVal(p, f).v;
  return v === 'yes' || v === 'limited' ? true : v === 'no' ? false : null;
}

// ---------- Data loading ----------
function buildPlace(row) {
  const [id, name, cat, lat, lon, district, f, srcs] = row;
  const p = { id, name: name || CAT_LABEL[cat] || 'Ort', named: !!name, cat, lat, lon, district, f, srcs: srcs || [], mine: false };
  if (f.opening_hours) { p.hoursRaw = f.opening_hours[0]; p.oh = parseOH(p.hoursRaw); }
  if (f.gear) {
    p.gear = new Set();
    for (const g of GEAR) if (g.re.test(f.gear[0])) p.gear.add(g.id);
    if (/water|splash|pump|archimedes/.test(f.gear[0])) p.gear.add('wasser');
  }
  return p;
}
function addUserPlaces() {
  for (const c of store.contributions) if (c.isNew && !byId.has(c.placeId)) {
    const p = { id: c.placeId, name: c.name, named: true, cat: c.cat, lat: c.lat, lon: c.lon, district: '', f: {}, srcs: [], mine: true };
    if (c.hours) { p.hoursRaw = c.hours; p.oh = parseOH(c.hours); }
    places.push(p); byId.set(p.id, p);
  }
}

// ---------- Map ----------
const map = L.map('map', { zoomControl: false, minZoom: 10, maxBounds: [[53.25, 9.55], [53.85, 10.45]] }).setView([53.5600, 9.9800], 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Quellen je Ort',
}).addTo(map);
const cluster = L.markerClusterGroup({
  chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 48, disableClusteringAtZoom: 17,
  iconCreateFunction: c => {
    const n = c.getChildCount(), size = n < 50 ? '' : n < 300 ? 'm' : 'l';
    return L.divIcon({ html: `<div class="cluster ${size}">${n < 1000 ? n : Math.round(n / 100) / 10 + 'k'}</div>`, className: '', iconSize: [40, 40] });
  },
});
map.addLayer(cluster);
const iconCache = {};
function iconFor(p, unknown) {
  const k = p.cat + (unknown ? 'u' : '') + (p.mine ? 'm' : '');
  return iconCache[k] || (iconCache[k] = L.divIcon({ className: '', iconSize: [18, 18], html: `<div class="pin${unknown ? ' unk' : ''}${p.mine ? ' mine' : ''}" style="--c:${placeColor(p)}"></div>` }));
}
function markerFor(p, unknown) {
  if (!p.marker) { p.marker = L.marker([p.lat, p.lon]); p.marker.on('click', () => openPlace(p.id)); }
  p.marker.setIcon(iconFor(p, unknown));
  return p.marker;
}
let meMarker = null;

// ---------- Filtering ----------
function activeGroups() { return [...state.groups]; }
function relevantFilters() {
  const gs = activeGroups();
  const fits = a => !a.groups || gs.length === 0 || gs.some(g => a.groups.includes(g));
  const out = [...TIME_FILTERS, ...ATTRS.filter(fits).map(a => ({ id: a.id, label: a.label }))];
  if (gs.includes('spielplatz') || GEAR.some(g => state.filters.has(g.id))) out.push(...GEAR);
  return out;
}
function inSelection(p) {
  if (!state.groups.size && !state.cats.size) return true;
  return state.groups.has(GROUP_OF[p.cat]?.id) || state.cats.has(p.cat);
}
function compute() {
  const q = state.q.trim().toLowerCase();
  const fs = [...state.filters];
  const res = { match: [], unknown: [] };
  for (const p of places) {
    if (!inSelection(p)) continue;
    if (q && !(p.name.toLowerCase().includes(q) || (p.district || '').toLowerCase().includes(q) || (CAT_LABEL[p.cat] || '').toLowerCase().includes(q))) continue;
    let unk = false, ok = true;
    for (const f of fs) {
      const v = filterVal(p, f);
      if (v === null || v === undefined) unk = true;
      else if (v === false) { ok = false; break; }
    }
    if (!ok) continue;
    (unk ? res.unknown : res.match).push(p);
  }
  return res;
}

let last = null;
const shownList = () => state.showUnknown ? last.match.concat(last.unknown) : last.match;
function render() {
  last = compute();
  cluster.clearLayers();
  cluster.addLayers(last.match.map(p => markerFor(p, false)).concat(state.showUnknown ? last.unknown.map(p => markerFor(p, true)) : []));
  renderStatus();
  renderChips();
  renderList(shownList());
  if (state.view === 'events') renderEvents();
}
function renderStatus() {
  const s = $('#status');
  const m = last.match.length, u = last.unknown.length;
  if (!state.filters.size) { s.innerHTML = `<b>${nf.format(m)}</b> Orte`; return; }
  s.innerHTML = `<b>${nf.format(m)}</b> passen · ${nf.format(u)} ohne Angabe` +
    (u ? ` <button type="button" id="toggleUnk">${state.showUnknown ? 'ausblenden' : 'zeigen'}</button>` : '');
  const b = $('#toggleUnk'); if (b) b.onclick = () => { state.showUnknown = !state.showUnknown; render(); };
}
function renderChips() {
  $('#presets').innerHTML = PRESETS.map(p => `<button type="button" class="chip preset${state.preset === p.id ? ' on' : ''}" data-preset="${p.id}">${esc(p.label)}</button>`).join('');
  const counts = {}; for (const p of places) { const g = GROUP_OF[p.cat]?.id; counts[g] = (counts[g] || 0) + 1; }
  const ordered = GROUPS.filter(g => state.groups.has(g.id)).concat(GROUPS.filter(g => !state.groups.has(g.id)));
  $('#cats').innerHTML = ordered.filter(g => counts[g.id]).map(g =>
    `<button type="button" class="chip${state.groups.has(g.id) ? ' on' : ''}" data-group="${g.id}" style="--c:${g.color}"><span class="dot"></span>${esc(g.label)} <span class="n">${nf.format(counts[g.id])}</span></button>`).join('');
  const labels = Object.fromEntries([...TIME_FILTERS, ...ATTRS, ...GEAR].map(f => [f.id, f.label]));
  const rel = relevantFilters().slice(0, 6);
  $('#activeFilters').innerHTML = `<button type="button" class="chip filter" id="openFilters">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Filter${state.filters.size ? ' (' + state.filters.size + ')' : ''}</button>` +
    rel.concat([...state.filters].filter(f => !rel.some(r => r.id === f)).map(id => ({ id, label: labels[id] })))
      .map(f => `<button type="button" class="chip filter${state.filters.has(f.id) ? ' on' : ''}" data-filter="${f.id}">${esc(f.label)}</button>`).join('');
}
function tagsFor(p) {
  const out = [];
  if (isOpen(p.oh) === true) out.push('<span class="tag open">offen</span>');
  for (const a of ATTRS) {
    const { v } = attrVal(p, a.id);
    if (v === 'yes' || v === 'limited') out.push(`<span class="tag y">${esc(a.label)}${v === 'limited' ? ' (eingeschr.)' : ''}</span>`);
    else if (v === 'no') out.push(`<span class="tag n">${esc(a.label)}</span>`);
  }
  if (p.gear) for (const g of GEAR) if (p.gear.has(g.id)) out.push(`<span class="tag">${esc(g.label)}</span>`);
  return out.length ? `<div class="tags">${out.slice(0, 8).join('')}</div>` : '';
}
const origin = () => state.me || [map.getCenter().lat, map.getCenter().lng];
function renderList(shown) {
  const o = origin();
  const sorted = shown.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]);
  $('#listHead').innerHTML = deskTabs() + `${nf.format(shown.length)} Orte, sortiert nach Entfernung ${state.me ? 'von dir' : 'zur Kartenmitte'}`;
  $('#list').innerHTML = sorted.slice(0, state.listLimit).map(([d, p]) => `
    <li><button type="button" class="item" data-id="${p.id}" style="--c:${placeColor(p)}">
      <span class="dot"></span>
      <span><h3>${esc(p.name)}</h3><span class="sub">${esc(CAT_LABEL[p.cat] || '')}${p.district ? ' · ' + esc(p.district) : ''}</span>${tagsFor(p)}</span>
      <span class="dist">${fmtDist(d)}</span>
    </button></li>`).join('');
  $('#more').hidden = sorted.length <= state.listLimit;
  bindDeskTabs();
}
function deskTabs() {
  return `<div class="desk-tabs">
    <button type="button" class="chip${state.view !== 'events' ? ' on' : ''}" data-dview="list">Orte</button>
    <button type="button" class="chip${state.view === 'events' ? ' on' : ''}" data-dview="events">Events</button>
    <button type="button" class="chip preset" data-dview="add">+ Ort eintragen</button></div>`;
}
function bindDeskTabs() { document.querySelectorAll('[data-dview]').forEach(b => b.onclick = () => setView(b.dataset.dview === 'list' ? 'map' : b.dataset.dview)); }

// ---------- Sheet ----------
function openSheet(html, cls = '') { const s = $('#sheet'); $('#sheetBody').innerHTML = html; s.className = 'sheet ' + cls; s.hidden = false; s.scrollTop = 0; }
function closeSheet() {
  $('#sheet').hidden = true;
  if (wiz.map) { wiz.map.remove(); wiz.map = null; }
  if (state.selected) { byId.get(state.selected)?.marker?._icon?.classList.remove('sel'); state.selected = null; }
}
function valPill(v) {
  if (v === 'yes') return '<span class="val y">Ja</span>';
  if (v === 'no') return '<span class="val n">Nein</span>';
  if (v === 'limited') return '<span class="val l">Eingeschränkt</span>';
  return '<span class="val u">Unbekannt</span>';
}
function srcText(r) {
  if (!r.src) return 'Weißt du es?';
  if (r.method === 'user') return `Bestätigt ${r.confirmations.length}×, zuletzt am ${fmatDateSafe(r.confirmations[0].at)} (auf diesem Gerät)`;
  if (r.method === 'website') return `Laut Webseite (automatisch gelesen, ${Math.round((r.conf || 0.6) * 100)} % sicher)`;
  if (r.method === 'computed') return 'Berechnet aus Kartendaten';
  return 'Quelle: ' + r.src;
}
const fmatDateSafe = t => t ? fmtDate(t) : '';
function hoursTable(p) {
  if (!p.hoursRaw) return '<p class="muted">Keine Öffnungszeiten bekannt.</p>';
  if (!p.oh) return `<p>${esc(p.hoursRaw)}</p>`;
  if (p.oh.always) return '<p><b>Rund um die Uhr geöffnet</b></p>';
  const today = dayIdx(new Date());
  return '<table class="hours">' + p.oh.week.map((r, d) => `<tr class="${d === today ? 'today' : ''}"><td>${DAY_DE[d]}</td><td>${r.length ? r.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : 'geschlossen'}</td></tr>`).join('') + '</table><p class="note">Feiertage sind noch nicht berücksichtigt.</p>';
}
const visibleAttrs = p => ATTRS.filter(a => !a.groups || a.groups.includes(GROUP_OF[p.cat]?.id) || attrVal(p, a.id).v !== null);

async function photoTags(ids) {
  const out = [];
  for (const id of ids || []) { try { const d = await photoDB.get(id); if (d) out.push(`<img src="${d}" alt="Foto von Nutzer" loading="lazy">`); } catch (e) { /* ignore */ } }
  return out.join('');
}

async function openPlace(id) {
  const p = byId.get(id); if (!p) return;
  if (state.selected) byId.get(state.selected)?.marker?._icon?.classList.remove('sel');
  state.selected = id;
  const open = isOpen(p.oh);
  const reviews = store.reviews.filter(r => r.placeId === id && !store.reports.some(x => x.targetId === r.id));
  const ages = [...new Set(store.contributions.filter(c => c.placeId === id).flatMap(c => c.ages || []))];
  const f = p.f;
  const route = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  const web = f.website?.[0];
  const addrTxt = f.address?.[0] || [f.street?.[0], f.housenumber?.[0]].filter(Boolean).join(' ');
  const extra = [
    f.description && `<p>${esc(f.description[0])}</p>`,
    f.dog_rule && `<p><b>${esc(f.dog_rule[0])}</b></p>`,
    f.water_status && `<p><b>Wasserqualität:</b> ${esc(f.water_status[0])}${f.water_quality_eu ? ` (EU: ${esc(f.water_quality_eu[0])})` : ''}</p>`,
    f.age_groups && `<p><b>Altersgruppen (Stadt Hamburg):</b> ${esc(f.age_groups[0])} Jahre</p>`,
    f.services && `<p class="muted">${esc(f.services[0]).slice(0, 300)}</p>`,
    f.care_types && `<p class="muted">Betreuung: ${esc(f.care_types[0])}</p>`,
  ].filter(Boolean).join('');
  const photosHtml = await photoTags(store.contributions.filter(c => c.placeId === id).flatMap(c => c.photoIds || []));
  if (state.selected !== id) return;
  openSheet(`
    <span class="kind" style="--c:${placeColor(p)}"><span class="dot"></span>${esc(CAT_LABEL[p.cat] || '')}${p.district ? ' · ' + esc(p.district) : ''}${p.mine ? ' · von dir eingetragen' : ''}</span>
    <h2>${esc(p.name)}</h2>
    <div class="facts">
      ${addrTxt ? `<span>${esc(addrTxt)}</span>` : ''}
      ${open === true ? '<span class="open-now">Jetzt geöffnet</span>' : open === false ? '<span class="closed-now">Jetzt geschlossen</span>' : ''}
      ${ages.length ? `<span>Empfohlen für: ${ages.map(a => esc(AGES.find(x => x.id === a)?.label || a)).join(', ')}</span>` : ''}
      ${f.phone ? `<span class="muted">Telefon: <span class="selectable">${esc(f.phone[0])}</span></span>` : ''}
    </div>
    <div class="actions">
      <a class="btn primary" href="${route}" target="_blank" rel="noopener">Route</a>
      ${web ? `<a class="btn" href="${esc(web.startsWith('http') ? web : 'https://' + web)}" target="_blank" rel="noopener">Webseite</a>` : ''}
      <button type="button" class="btn sun" id="addInfo">Infos ergänzen</button>
    </div>
    ${photosHtml ? `<div class="photos">${photosHtml}</div>` : ''}
    ${extra}
    <h4>Für Familien</h4>
    <div class="attrs">
      ${visibleAttrs(p).map(a => { const r = attrVal(p, a.id);
        return `<div class="attr"><span><span class="lbl">${esc(a.label)}</span><span class="src">${esc(srcText(r))}</span>
            ${r.evidence ? `<details class="evidence"><summary>Beleg</summary>„${esc(r.evidence)}“</details>` : ''}</span>
          <span class="attr-right">${valPill(r.v)}
          <span class="ask">${r.v === null
            ? `<button type="button" data-ans="${a.id}" data-v="yes">Ja</button><button type="button" data-ans="${a.id}" data-v="no">Nein</button>`
            : `<button type="button" data-ans="${a.id}" data-v="${r.v === 'no' ? 'no' : 'yes'}">Stimmt</button><button type="button" data-ans="${a.id}" data-v="${r.v === 'no' ? 'yes' : 'no'}">Stimmt nicht</button>`}</span></span></div>`; }).join('')}
      ${p.gear ? `<div class="attr"><span><span class="lbl">Spielgeräte</span><span class="src">Quelle: OpenStreetMap</span></span><span>${GEAR.filter(g => p.gear.has(g.id)).map(g => esc(g.label)).join(', ') || '–'}</span></div>` : ''}
    </div>
    ${['aufzug', 'spielplatz', 'park', 'hundeauslauf', 'trinkwasser', 'picknick'].includes(p.cat) && !p.hoursRaw ? '' : `<h4>Öffnungszeiten</h4>${hoursTable(p)}`}

    <h4>Bewertungen</h4>
    ${reviews.length ? '' : '<p class="muted">Noch keine Bewertung. Sei die erste Person!</p>'}
    <div id="reviewList"></div>
    <form id="revForm" class="revform">
      <div class="stars" role="group" aria-label="Sterne">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${n} Sterne">★</button>`).join('')}</div>
      <div class="field"><label for="revText">Kommentar</label><textarea id="revText" maxlength="500" placeholder="Was sollten andere Eltern wissen?"></textarea></div>
      <div class="field"><label for="revPhoto">Foto (optional)</label><input id="revPhoto" type="file" accept="image/*">
        <p class="hint-kids">Bitte keine Gesichter von Kindern fotografieren.</p></div>
      <p class="error" id="revErr" hidden></p>
      <div class="actions"><button type="submit" class="btn sun">Bewertung speichern</button></div>
    </form>

    <h4>Quellen</h4>
    <p class="note">${p.srcs.map(i => esc(SOURCES[i]?.[1]) + ' (' + esc(SOURCES[i]?.[2]) + ')').join(' · ') || 'Von dir eingetragen'}</p>
    <p class="note">Prototyp: Deine Angaben, Bewertungen und Fotos werden bisher nur auf diesem Gerät gespeichert.</p>
  `);
  p.marker?._icon?.classList.add('sel');
  renderReviews(reviews);
  const body = $('#sheetBody');
  body.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => {
    store.confirmations.push({ placeId: id, attr: b.dataset.ans, answer: b.dataset.v, at: Date.now() });
    save(); toast('Danke! Das hilft anderen Familien.'); render(); openPlace(id);
  });
  $('#addInfo').onclick = () => startWizard({ place: p });
  let stars = 0;
  body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
    stars = +b.dataset.star;
    body.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= stars));
  });
  $('#revForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#revErr');
    if (!stars) { err.textContent = 'Bitte vergib zuerst 1 bis 5 Sterne.'; err.hidden = false; return; }
    const photoIds = [];
    const file = $('#revPhoto').files[0];
    if (file) {
      if (!file.type.startsWith('image/')) { err.textContent = 'Bitte wähle ein Bild aus (JPG oder PNG).'; err.hidden = false; return; }
      try { const pidPhoto = uid('ph_'); await photoDB.put(pidPhoto, await compressPhoto(file)); photoIds.push(pidPhoto); }
      catch (x) { err.textContent = 'Das Foto konnte nicht gespeichert werden. Versuch es ohne Foto.'; err.hidden = false; return; }
    }
    store.reviews.push({ id: uid('r_'), placeId: id, stars, text: $('#revText').value.trim(), photoIds, at: Date.now() });
    save(); toast('Bewertung gespeichert.'); openPlace(id);
  };
}
async function renderReviews(reviews) {
  const el = $('#reviewList'); if (!el) return;
  const parts = [];
  for (const r of reviews.sort((a, b) => b.at - a.at)) {
    parts.push(`<div class="review"><b class="stars-read">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</b> <span class="muted">${fmtDate(r.at)}</span>
      ${r.text ? `<div>${esc(r.text)}</div>` : ''}<div class="photos">${await photoTags(r.photoIds)}</div>
      <button type="button" class="linkbtn" data-report="${r.id}">Melden</button></div>`);
  }
  el.innerHTML = parts.join('');
  el.querySelectorAll('[data-report]').forEach(b => b.onclick = () => {
    store.reports.push({ targetType: 'review', targetId: b.dataset.report, at: Date.now() }); save();
    toast('Gemeldet und ausgeblendet. Mit dem Server geht die Meldung später an das Djuu-Team.');
    openPlace(state.selected);
  });
}

// ---------- Filter sheet ----------
function openFilters() {
  const f = relevantFilters();
  const counts = {};
  for (const x of f) { let n = 0; for (const p of places) if (inSelection(p) && filterVal(p, x.id) === true) n++; counts[x.id] = n; }
  const block = (title, items) => items.length ? `<h4>${title}</h4><div class="filtergrid">${items.map(x => `<button type="button" class="chip filter${state.filters.has(x.id) ? ' on' : ''}" data-f="${x.id}"><span>${esc(x.label)}</span><span class="n">${nf.format(counts[x.id])}</span></button>`).join('')}</div>` : '';
  openSheet(`
    <h2>Filter</h2>
    <p class="muted" style="margin:0">Die Zahl zeigt, wie viele Orte${state.groups.size ? ' in deiner Auswahl' : ''} die Angabe sicher haben.</p>
    ${block('Öffnungszeiten', f.filter(x => TIME_FILTERS.some(t => t.id === x.id)))}
    ${block('Ausstattung', f.filter(x => ATTR[x.id]))}
    ${block('Spielgeräte', f.filter(x => GEAR.some(g => g.id === x.id)))}
    <label class="switch"><input type="checkbox" id="unkSwitch" ${state.showUnknown ? 'checked' : ''}> Orte ohne Angabe blass anzeigen</label>
    <div class="actions"><button type="button" class="btn primary" id="fDone">Fertig</button><button type="button" class="btn" id="fReset">Alles zurücksetzen</button></div>
  `);
  $('#sheetBody').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { toggle(state.filters, b.dataset.f); state.preset = null; b.classList.toggle('on'); render(); });
  $('#unkSwitch').onchange = e => { state.showUnknown = e.target.checked; render(); };
  $('#fDone').onclick = closeSheet;
  $('#fReset').onclick = () => { state.filters.clear(); state.groups.clear(); state.cats.clear(); state.preset = null; state.showUnknown = false; render(); openFilters(); };
}
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

// ---------- "Ort hinzufügen" wizard: 3 steps, one-handed, under 30 seconds ----------
const WIZ_TYPES = [
  { id: 'spielplatz', label: 'Spielplatz', cat: 'spielplatz', icon: '<path d="M4 20V8l4-4 4 4v12M4 12h8M16 20v-9h4v9M14 20h8" />', attrs: ['kleinkind', 'eingezaeunt', 'schatten', 'wc_nahe', 'wasser'] },
  { id: 'essen', label: 'Café / Restaurant', cat: 'cafe', icon: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM16 10h2a2 2 0 0 1 0 4h-2M7 3v3M11 3v3" />', attrs: ['hochstuhl', 'wickeltisch', 'spielecke', 'kindermenue', 'kinderwagen'] },
  { id: 'laden', label: 'Laden', cat: 'windeln', icon: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2" />', attrs: ['windeln', 'sonntag_user'] },
  { id: 'service', label: 'Service (Wickeln, Stillen, WC)', cat: 'wickel', icon: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />', attrs: ['wickeltisch', 'stillen', 'toilette'] },
  { id: 'event', label: 'Veranstaltung', cat: 'event', icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4" />', attrs: [] },
];
const COMMON_ATTRS = ['drinnen', 'kinderwagen', 'hund', 'kostenlos'];
const EXTRA_ATTR = { sonntag_user: { id: 'sonntag_user', label: 'Sonntags geöffnet' } };
const wizAttr = id => ATTR[id] || EXTRA_ATTR[id];
const wiz = { step: 1, data: null, map: null };

function startWizard({ place } = {}) {
  closeSheet(); setView('map', true);
  const t = place ? (WIZ_TYPES.find(w => GROUP_OF[place.cat]?.id === w.id || w.cat === place.cat) || null) : null;
  wiz.data = { placeId: place?.id || null, isNew: !place, type: t?.id || (place ? 'service' : null), name: place?.name || '',
               lat: place?.lat ?? map.getCenter().lat, lon: place?.lon ?? map.getCenter().lng, attrs: {}, ages: [], comment: '',
               stars: 0, hours: '', photo: null, eventDate: '', eventTime: '', locating: !place };
  wiz.step = 1;
  renderWizard();
  if (!place && navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => {
    if (!wiz.data || !wiz.data.locating) return;
    wiz.data.lat = pos.coords.latitude; wiz.data.lon = pos.coords.longitude; wiz.data.locating = false;
    if (wiz.map) { wiz.map.setView([wiz.data.lat, wiz.data.lon], 18); wiz.pin.setLatLng([wiz.data.lat, wiz.data.lon]); }
    $('#wizLocNote') && ($('#wizLocNote').textContent = 'Position per GPS gesetzt. Zieh den Pin, falls er nicht genau stimmt.');
  }, () => { wiz.data && (wiz.data.locating = false); $('#wizLocNote') && ($('#wizLocNote').textContent = 'Kein GPS. Zieh den Pin an die richtige Stelle.'); }, { enableHighAccuracy: true, timeout: 8000 });
}

function wizHeader() {
  return `<div class="progress" aria-label="Schritt ${wiz.step} von 3"><span>Schritt ${Math.min(wiz.step, 3)} von 3</span>
    <div class="bar"><i style="width:${Math.min(wiz.step, 3) / 3 * 100}%"></i></div></div>`;
}
function triRow(id) {
  const a = wizAttr(id), v = wiz.data.attrs[id] || 'unknown';
  return `<div class="tri"><span class="tri-label">${esc(a.label)}</span><span class="seg" role="radiogroup" aria-label="${esc(a.label)}">
    ${[['yes', 'Ja'], ['no', 'Nein'], ['unknown', 'Weiß nicht']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${v === k}" class="${v === k ? 'on ' + k : ''}" data-tri="${id}" data-v="${k}">${l}</button>`).join('')}
  </span></div>`;
}
function nameSuggestions(text) {
  const d = wiz.data, q = text.trim().toLowerCase();
  if (!d.isNew || q.length < 2) return [];
  return places.filter(p => p.named && p.name.toLowerCase().includes(q) && dist([d.lat, d.lon], [p.lat, p.lon]) < 1500)
    .map(p => [dist([d.lat, d.lon], [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]).slice(0, 5);
}

function renderWizard() {
  const d = wiz.data, type = WIZ_TYPES.find(t => t.id === d.type);
  if (wiz.map) { wiz.map.remove(); wiz.map = null; }
  let html = '';
  if (wiz.step === 1) {
    html = `<h2>${d.isNew ? 'Ort hinzufügen' : 'Infos ergänzen'}</h2>${wizHeader()}
      ${d.isNew ? `<div class="minimap" id="wizMap" aria-label="Position auf der Karte"></div>
        <p class="note" id="wizLocNote">${d.locating ? 'Suche deine Position …' : 'Zieh den Pin an die richtige Stelle.'}</p>` : `<p class="muted">${esc(d.name)}</p>`}
      <h4>Was ist es?</h4>
      <div class="typegrid">${WIZ_TYPES.filter(t => d.isNew || t.id !== 'event').map(t => `<button type="button" class="typebtn${d.type === t.id ? ' on' : ''}" data-type="${t.id}">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg><span>${esc(t.label)}</span></button>`).join('')}</div>
      ${d.isNew ? `<div class="field"><label for="wizName">Name</label><input id="wizName" autocomplete="off" value="${esc(d.name)}" placeholder="z. B. Spielplatz Weiher" maxlength="80">
        <div class="suggest" id="wizSuggest"></div></div>` : ''}
      ${d.type === 'event' ? `<div class="row2"><div class="field"><label for="wizDate">Datum</label><input id="wizDate" type="date" value="${esc(d.eventDate)}"></div>
        <div class="field"><label for="wizTime">Uhrzeit</label><input id="wizTime" type="time" value="${esc(d.eventTime)}"></div></div>` : ''}
      <div class="field"><label for="wizPhoto">Foto (optional)</label><input id="wizPhoto" type="file" accept="image/*" capture="environment">
        ${d.photo ? '<img class="preview" src="' + d.photo + '" alt="Vorschau">' : ''}
        <p class="hint-kids">Bitte keine Gesichter von Kindern zeigen.</p></div>`;
  } else if (wiz.step === 2) {
    const own = type?.attrs || [];
    html = `<h2>Was gibt es hier?</h2>${wizHeader()}
      <p class="muted">Nur antippen, was du sicher weißt. Alles andere bleibt auf „Weiß nicht“.</p>
      ${own.length ? `<h4>${esc(type.label)}</h4>${own.map(triRow).join('')}` : ''}
      <h4>Für alle Orte</h4>${COMMON_ATTRS.filter(a => !own.includes(a)).map(triRow).join('')}`;
  } else if (wiz.step === 3) {
    html = `<h2>Noch etwas? (optional)</h2>${wizHeader()}
      <h4>Für welches Alter passt es am besten?</h4>
      <div class="agegrid">${AGES.map(a => `<button type="button" class="chip${d.ages.includes(a.id) ? ' on' : ''}" data-age="${a.id}">${a.label}</button>`).join('')}</div>
      <h4>Bewertung</h4>
      <div class="stars" role="group" aria-label="Sterne">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-wstar="${n}" class="${n <= d.stars ? 'on' : ''}" aria-label="${n} Sterne">★</button>`).join('')}</div>
      <div class="field"><label for="wizComment">Kurzer Kommentar</label><input id="wizComment" maxlength="140" value="${esc(d.comment)}" placeholder="z. B. Toller Sandkasten, wenig Schatten"></div>
      ${d.type !== 'event' ? `<div class="field"><label for="wizHours">Öffnungszeiten (nur wenn bekannt)</label><input id="wizHours" value="${esc(d.hours)}" placeholder="Mo-Fr 09:00-18:00; Sa 10:00-16:00"></div>` : ''}`;
  } else {
    const ans = Object.entries(d.attrs).filter(([, v]) => v !== 'unknown');
    html = `<h2>Alles richtig?</h2>
      <dl class="summary">
        <dt>Art</dt><dd>${esc(type?.label || '–')}</dd>
        <dt>Name</dt><dd>${esc(d.name || '–')}</dd>
        ${d.type === 'event' ? `<dt>Termin</dt><dd>${esc(d.eventDate)} ${esc(d.eventTime)}</dd>` : ''}
        <dt>Angaben</dt><dd>${ans.length ? ans.map(([k, v]) => `${esc(wizAttr(k).label)}: <b>${v === 'yes' ? 'Ja' : 'Nein'}</b>`).join('<br>') : 'keine'}</dd>
        ${d.ages.length ? `<dt>Alter</dt><dd>${d.ages.map(a => esc(AGES.find(x => x.id === a).label)).join(', ')}</dd>` : ''}
        ${d.stars ? `<dt>Bewertung</dt><dd>${'★'.repeat(d.stars)}</dd>` : ''}
        ${d.comment ? `<dt>Kommentar</dt><dd>${esc(d.comment)}</dd>` : ''}
        ${d.hours ? `<dt>Öffnungszeiten</dt><dd>${esc(d.hours)}</dd>` : ''}
        ${d.photo ? `<dt>Foto</dt><dd><img class="preview" src="${d.photo}" alt="Vorschau"></dd>` : ''}
      </dl>`;
  }
  html += `<p class="error" id="wizErr" hidden></p>
    <div class="wizbar">
      ${wiz.step > 1 ? '<button type="button" class="btn big" id="wizBack">Zurück</button>' : '<button type="button" class="btn big" id="wizCancel">Abbrechen</button>'}
      ${wiz.step === 2 || wiz.step === 3 ? '<button type="button" class="btn big ghost" id="wizSkip">Überspringen</button>' : ''}
      <button type="button" class="btn big sun" id="wizNext">${wiz.step === 4 ? 'Speichern' : 'Weiter'}</button>
    </div>`;
  openSheet(html, 'wizard');
  bindWizard();
}

function bindWizard() {
  const d = wiz.data;
  if (wiz.step === 1 && d.isNew) {
    wiz.map = L.map('wizMap', { zoomControl: false, attributionControl: false }).setView([d.lat, d.lon], 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(wiz.map);
    wiz.pin = L.marker([d.lat, d.lon], { draggable: true, icon: L.divIcon({ className: '', iconSize: [26, 26], html: '<div class="pin big" style="--c:#FFC83D"></div>' }) }).addTo(wiz.map);
    wiz.pin.on('dragend', () => { const ll = wiz.pin.getLatLng(); d.lat = ll.lat; d.lon = ll.lng; d.locating = false; });
    wiz.map.on('click', e => { wiz.pin.setLatLng(e.latlng); d.lat = e.latlng.lat; d.lon = e.latlng.lng; d.locating = false; });
    setTimeout(() => wiz.map && wiz.map.invalidateSize(), 50);
    const inp = $('#wizName');
    const showSug = () => {
      d.name = inp.value;
      $('#wizSuggest').innerHTML = nameSuggestions(inp.value).map(([m, p]) => `<button type="button" data-sug="${p.id}"><b>${esc(p.name)}</b> <span class="muted">${esc(CAT_LABEL[p.cat] || '')} · ${fmtDist(m)}</span></button>`).join('');
      $('#wizSuggest').querySelectorAll('[data-sug]').forEach(b => b.onclick = () => {
        const p = byId.get(b.dataset.sug);
        Object.assign(d, { placeId: p.id, isNew: false, name: p.name, lat: p.lat, lon: p.lon });
        d.type = d.type || WIZ_TYPES.find(w => GROUP_OF[p.cat]?.id === w.id)?.id || 'service';
        toast('Den Ort gibt es schon. Du ergänzt jetzt seine Infos.');
        renderWizard();
      });
    };
    inp.oninput = showSug;
  }
  document.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { d.type = b.dataset.type; if (wiz.step === 1 && $('#wizName')) d.name = $('#wizName').value; renderWizard(); });
  document.querySelectorAll('[data-tri]').forEach(b => b.onclick = () => { d.attrs[b.dataset.tri] = b.dataset.v; renderWizard(); });
  document.querySelectorAll('[data-age]').forEach(b => b.onclick = () => { d.ages = d.ages.includes(b.dataset.age) ? d.ages.filter(x => x !== b.dataset.age) : d.ages.concat(b.dataset.age); keepStep3(); renderWizard(); });
  document.querySelectorAll('[data-wstar]').forEach(b => b.onclick = () => { d.stars = d.stars === +b.dataset.wstar ? 0 : +b.dataset.wstar; keepStep3(); renderWizard(); });
  const photo = $('#wizPhoto');
  if (photo) photo.onchange = async () => {
    const file = photo.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) return wizError('Bitte wähle ein Bild aus (JPG oder PNG).');
    try { if ($('#wizName')) d.name = $('#wizName').value; d.photo = await compressPhoto(file); renderWizard(); }
    catch (e) { wizError('Das Foto konnte nicht gelesen werden. Versuch ein anderes.'); }
  };
  $('#wizCancel') && ($('#wizCancel').onclick = () => { wiz.data = null; closeSheet(); });
  $('#wizBack') && ($('#wizBack').onclick = () => { keepStep3(); wiz.step--; renderWizard(); });
  $('#wizSkip') && ($('#wizSkip').onclick = () => { keepStep3(); wiz.step++; renderWizard(); });
  $('#wizNext').onclick = () => wizNext();
}
function keepStep3() {
  const d = wiz.data;
  if ($('#wizComment')) d.comment = $('#wizComment').value;
  if ($('#wizHours')) d.hours = $('#wizHours').value;
  if ($('#wizDate')) d.eventDate = $('#wizDate').value;
  if ($('#wizTime')) d.eventTime = $('#wizTime').value;
  if ($('#wizName')) d.name = $('#wizName').value;
}
function wizError(msg) { const e = $('#wizErr'); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); }

function wizNext() {
  const d = wiz.data;
  keepStep3();
  if (wiz.step === 1) {
    if (!d.type) return wizError('Bitte wähle aus, was für ein Ort es ist.');
    if (d.isNew && d.name.trim().length < 2) return wizError('Bitte gib einen Namen ein (mindestens 2 Zeichen).');
    if (d.isNew && !(d.lat > 53.39 && d.lat < 53.75 && d.lon > 9.72 && d.lon < 10.33)) return wizError('Der Pin liegt außerhalb von Hamburg. Bitte verschieb ihn.');
    if (d.type === 'event') {
      if (!d.eventDate) return wizError('Bitte gib das Datum der Veranstaltung an.');
      if (new Date(d.eventDate) < new Date(new Date().toDateString())) return wizError('Das Datum liegt in der Vergangenheit.');
    }
  }
  if (wiz.step === 3 && d.hours.trim() && !parseOH(d.hours.trim())) return wizError('Die Öffnungszeiten verstehe ich nicht. Format zum Beispiel: Mo-Fr 09:00-18:00; Sa 10:00-16:00');
  if (wiz.step < 4) { wiz.step++; return renderWizard(); }
  saveWizard();
}

async function saveWizard() {
  const d = wiz.data, type = WIZ_TYPES.find(t => t.id === d.type);
  // every question shown counts: untouched ones are stored explicitly as 'unknown' (not as 'no')
  for (const a of (type?.attrs || []).concat(COMMON_ATTRS)) if (!d.attrs[a]) d.attrs[a] = 'unknown';
  const photoIds = [];
  if (d.photo) { try { const id = uid('ph_'); await photoDB.put(id, d.photo); photoIds.push(id); } catch (e) { toast('Foto konnte nicht gespeichert werden.'); } }
  if (d.type === 'event') {
    store.events.push({ id: uid('e_'), title: d.name.trim(), date: d.eventDate, time: d.eventTime, lat: d.lat, lon: d.lon,
                        attrs: d.attrs, ages: d.ages, comment: d.comment.trim(), photoIds, createdAt: Date.now() });
  } else {
    const placeId = d.placeId || uid('u_');
    store.contributions.push({ id: uid('c_'), placeId, isNew: d.isNew, type: d.type, cat: type.cat, name: d.name.trim(), lat: d.lat, lon: d.lon,
                               attrs: d.attrs, ages: d.ages, hours: d.hours.trim(), photoIds, createdAt: Date.now() });
    if (d.stars || d.comment.trim()) store.reviews.push({ id: uid('r_'), placeId, stars: d.stars || 0, text: d.comment.trim(), photoIds: [], at: Date.now() });
    d.placeId = placeId;
  }
  save();
  addUserPlaces();
  const p = byId.get(d.placeId);
  const area = p?.district || nearestDistrict(d.lat, d.lon);
  wiz.data = null;
  render();
  openSheet(`<div class="thanks"><svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#FFC83D"/><path d="M7 12.5l3.2 3L17 9" stroke="#3A2A00" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>Danke!</h2><p>Dein Eintrag hilft Familien${area ? ' in ' + esc(area) : ' in Hamburg'}.</p>
    <p class="note">Im Prototyp ist er erst auf deinem Gerät gespeichert. Mit dem Djuu-Server sehen ihn bald alle.</p>
    <div class="actions" style="justify-content:center">${p ? `<button type="button" class="btn primary" id="thxShow">Ort ansehen</button>` : ''}<button type="button" class="btn" id="thxClose">Fertig</button></div></div>`);
  $('#thxClose').onclick = closeSheet;
  if (p) $('#thxShow').onclick = () => { map.setView([p.lat, p.lon], 18); openPlace(p.id); };
}
function nearestDistrict(la, lo) {
  let best = null, bd = 1500;
  for (const p of places) if (p.district && Math.abs(p.lat - la) < 0.01 && Math.abs(p.lon - lo) < 0.015) { const m = dist([la, lo], [p.lat, p.lon]); if (m < bd) { bd = m; best = p.district; } }
  return best;
}

// ---------- One-tap confirmation near a place ----------
function checkNearby() {
  if (!state.me || !$('#sheet').hidden || state.view !== 'map') return;
  const now = Date.now(), MONTH = 30 * 864e5;
  let best = null;
  for (const p of places) {
    if (Math.abs(p.lat - state.me[0]) > 0.0015 || Math.abs(p.lon - state.me[1]) > 0.0025) continue;
    const m = dist(state.me, [p.lat, p.lon]); if (m > 120) continue;
    for (const a of ATTRS) {
      if (attrVal(p, a.id).v !== 'yes') continue;
      const key = p.id + ':' + a.id;
      if (store.prompted[key] && now - store.prompted[key] < MONTH) continue;
      if (!best || m < best.m) best = { m, p, a, key };
      break;
    }
  }
  const card = $('#nearby');
  if (!best) { card.hidden = true; return; }
  const n = userAnswers(best.p.id, best.a.id);
  card.innerHTML = `<div><span class="muted">Du bist bei ${esc(best.p.name)}</span><b>${esc(best.a.label)}: gibt es das noch?</b>
      ${n.length ? `<span class="muted">Bestätigt ${n.length}×, zuletzt am ${fmtDate(n[0].at)}</span>` : ''}</div>
    <div class="ask big"><button type="button" data-near="yes">Ja</button><button type="button" data-near="no">Nein</button><button type="button" data-near="skip" aria-label="Später">×</button></div>`;
  card.hidden = false;
  card.querySelectorAll('[data-near]').forEach(b => b.onclick = () => {
    store.prompted[best.key] = Date.now();
    if (b.dataset.near !== 'skip') { store.confirmations.push({ placeId: best.p.id, attr: best.a.id, answer: b.dataset.near, at: Date.now() }); toast('Danke! Das hilft anderen Familien.'); render(); }
    save(); card.hidden = true; setTimeout(checkNearby, 1500);
  });
}

// ---------- Events (examples + own entries) ----------
function nextDow(dow, plusWeeks = 0) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7) + plusWeeks * 7); return d; }
const EXAMPLE_EVENTS = [
  { d: nextDow(6), time: '10:00–13:00', title: 'Kinderflohmarkt von Eltern für Eltern', where: 'Schulhof in Eimsbüttel', kind: 'Flohmarkt' },
  { d: nextDow(3), time: '16:00', title: 'Bilderbuchkino ab 3 Jahren', where: 'Bücherhalle (Beispiel)', kind: 'Lesen' },
  { d: nextDow(0), time: '11:00', title: 'Familienkonzert: Klassik für Kleine', where: 'Konzertsaal (Beispiel)', kind: 'Musik' },
  { d: nextDow(6, 1), time: '09:00–14:00', title: 'Kinderkleiderbasar Herbst/Winter', where: 'Gemeindehaus in Winterhude', kind: 'Flohmarkt' },
];
function renderEvents() {
  const fmtD = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
  const own = store.events.map(e => ({ d: new Date(e.date + 'T00:00'), time: e.time, title: e.title, where: nearestDistrict(e.lat, e.lon) || 'Hamburg', kind: 'Von dir eingetragen', mine: true }));
  const all = own.concat(EXAMPLE_EVENTS).filter(e => e.d >= new Date(new Date().toDateString())).sort((a, b) => a.d - b.d);
  $('#eventsView').innerHTML = deskTabs() + `
    <div class="banner"><b>Noch Beispiele.</b> Echte Termine kommen bald automatisch von Bücherhallen, Familienzentren und Flohmarkt-Veranstaltern. Eigene Veranstaltungen kannst du über „Eintragen“ hinzufügen.</div>
    ${all.map(e => `<article class="event"><div class="date"><span>${fmtD.format(e.d)}</span><b>${e.d.getDate()}.</b><span>${e.d.toLocaleDateString('de-DE', { month: 'short' })}</span></div>
      <div><h3>${esc(e.title)}<span class="badge">${e.mine ? 'Von dir' : 'Beispiel'}</span></h3><div class="muted">${esc(e.time || '')} · ${esc(e.where)}</div><div class="tags"><span class="tag">${esc(e.kind)}</span></div></div></article>`).join('')}`;
  bindDeskTabs();
}

// ---------- Views ----------
function setView(v, keep) {
  if (v === 'add') { startWizard(); return; }
  state.view = v;
  document.body.className = 'view-' + v;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#listView').hidden = v === 'events';
  $('#eventsView').hidden = v !== 'events';
  if (v === 'events') renderEvents(); else if (last) renderList(shownList());
  if (v === 'map') setTimeout(() => map.invalidateSize(), 0);
}

// ---------- Wiring ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.group) { toggle(state.groups, t.dataset.group); state.preset = null; state.listLimit = 60; render(); }
  else if (t.dataset.filter) { toggle(state.filters, t.dataset.filter); state.preset = null; render(); }
  else if (t.dataset.preset) {
    const p = PRESETS.find(x => x.id === t.dataset.preset);
    if (state.preset === p.id) { state.preset = null; state.groups.clear(); state.cats.clear(); state.filters.clear(); }
    else { state.preset = p.id; state.groups = new Set(p.groups); state.cats = new Set(p.cats || []); state.filters = new Set(p.filters); }
    render();
  }
  else if (t.id === 'openFilters') openFilters();
  else if (t.dataset.view) setView(t.dataset.view);
  else if (t.classList.contains('item')) { const p = byId.get(t.dataset.id); if (window.innerWidth < 900) setView('map'); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 17)); setTimeout(() => openPlace(p.id), 50); }
});
$('#sheetClose').onclick = () => { wiz.data = null; closeSheet(); setTimeout(checkNearby, 500); };
$('#more').onclick = () => { state.listLimit += 60; render(); };
let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; render(); }, 200); });
map.on('moveend', () => { if (last && (state.view === 'list' || window.innerWidth >= 900)) renderList(shownList()); });
$('#locate').onclick = () => {
  if (!navigator.geolocation) { toast('Standort wird von diesem Gerät nicht unterstützt.'); return; }
  let first = true;
  navigator.geolocation.watchPosition(pos => {
    state.me = [pos.coords.latitude, pos.coords.longitude];
    if (first) { map.setView(state.me, 16); first = false; render(); }
    if (!meMarker) meMarker = L.circleMarker(state.me, { radius: 8, color: '#fff', weight: 3, fillColor: '#1C7ED6', fillOpacity: 1 }).addTo(map);
    else meMarker.setLatLng(state.me);
    checkNearby();
  }, () => toast('Standort nicht verfügbar. Bitte Freigabe im Browser erlauben.'), { enableHighAccuracy: true, maximumAge: 30000 });
};
setInterval(() => { if (state.filters.has('jetzt')) render(); }, 60000);

// ---------- Boot ----------
(async () => {
  try {
    const res = await fetch('data/places.json');
    if (!res.ok) throw new Error('places.json ' + res.status);
    const data = await res.json();
    SOURCES = data.sources;
    for (const row of data.places) { const p = buildPlace(row); places.push(p); byId.set(p.id, p); }
    addUserPlaces();
    render();
  } catch (err) {
    $('#status').textContent = 'Daten konnten nicht geladen werden. Bitte Seite neu laden.';
    console.error(err);
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
