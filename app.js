/* Djuu prototype v0.1 – family map for Hamburg.
   Data: OpenStreetMap (data/orte.tsv, data/geraete.tsv, built by tools/fetch-data.sh).
   User input (ratings, confirmations, new places) is stored on this device only. */
'use strict';

const VERSION = '0.1';

// ---------- Categories ----------
const CATS = [
  { id: 'spielplatz', label: 'Spielplätze', color: '#E8590C' },
  { id: 'indoor', label: 'Indoor-Spielen', color: '#D6336C' },
  { id: 'cafe', label: 'Cafés', color: '#9C36B5' },
  { id: 'restaurant', label: 'Restaurants', color: '#6741D9' },
  { id: 'eis', label: 'Eis', color: '#F06595' },
  { id: 'windeln', label: 'Windeln & Drogerie', color: '#1971C2' },
  { id: 'apotheke', label: 'Apotheken', color: '#2F9E44' },
  { id: 'kinderarzt', label: 'Kinderärzte', color: '#E03131' },
  { id: 'wc', label: 'Toiletten', color: '#0C8599' },
  { id: 'wickel', label: 'Weitere Wickelplätze', color: '#0CA678' },
  { id: 'aufzug', label: 'Aufzüge', color: '#5C677D' },
  { id: 'baden', label: 'Baden', color: '#1098AD' },
  { id: 'buecherei', label: 'Bücherhallen', color: '#A0522D' },
  { id: 'ausflug', label: 'Zoo & Museum', color: '#E67700' },
  { id: 'spielzeug', label: 'Spielzeug', color: '#AE3EC9' },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

const SUBTYPE = {
  chemist: 'Drogerie', baby_goods: 'Babyladen', convenience: 'Späti / kleiner Supermarkt', kiosk: 'Kiosk',
  supermarket: 'Supermarkt', fuel: 'Tankstelle', toys: 'Spielzeugladen', zoo: 'Zoo / Tierpark', museum: 'Museum',
  public_bath: 'Schwimmbad', water_park: 'Spaßbad', sports_centre: 'Schwimmhalle', indoor_play: 'Indoorspielplatz',
};

function categorize(t) {
  if (t['healthcare:speciality'] && /paediatrics/.test(t['healthcare:speciality'])) return 'kinderarzt';
  if (t.leisure === 'playground') {
    if (/^(private|no|customers)$/.test(t.access || '')) return null;
    return t.indoor === 'yes' ? 'indoor' : 'spielplatz';
  }
  if (t.leisure === 'indoor_play') return 'indoor';
  if (t.leisure === 'water_park' || t.amenity === 'public_bath' || (t.leisure === 'sports_centre' && /swimming/.test(t.sport || ''))) return 'baden';
  const a = t.amenity;
  if (a === 'cafe') return 'cafe';
  if (a === 'restaurant') return 'restaurant';
  if (a === 'ice_cream') return 'eis';
  if (a === 'toilets') return 'wc';
  if (a === 'library') return 'buecherei';
  if (a === 'pharmacy') return 'apotheke';
  if (a === 'fuel') return 'windeln';
  if (/^(chemist|baby_goods|convenience|kiosk|supermarket)$/.test(t.shop || '')) return 'windeln';
  if (t.shop === 'toys') return 'spielzeug';
  if (t.highway === 'elevator') return 'aufzug';
  if (t.tourism === 'zoo' || t.tourism === 'museum') return 'ausflug';
  if (t.changing_table === 'yes') return 'wickel';
  return null;
}

// ---------- Attributes (the filters Google does not have) ----------
// Each returns true / false / 'limited' / null (unknown).
const yn = v => v === 'yes' || v === 'designated' ? true : v === 'no' ? false : v === 'limited' ? 'limited' : null;
const ATTRS = [
  { id: 'wickeltisch', label: 'Wickeltisch', from: t => yn(t.changing_table) },
  { id: 'kinderwagen', label: 'Kinderwagen / stufenlos', from: t => yn(t.wheelchair) },
  { id: 'hochstuhl', label: 'Hochstuhl', from: t => yn(t.highchair), cats: ['cafe', 'restaurant', 'eis'] },
  { id: 'spielecke', label: 'Spielecke', from: t => yn(t.kids_area), cats: ['cafe', 'restaurant', 'eis', 'apotheke', 'windeln', 'buecherei'] },
  { id: 'hund', label: 'Hund erlaubt', from: t => !t.dog ? null : /yes|leashed|outside/.test(t.dog) ? true : t.dog === 'no' ? false : null },
  { id: 'toilette', label: 'Toilette', from: t => t.amenity === 'toilets' ? true : yn(t.toilets), cats: ['cafe', 'restaurant', 'eis', 'spielplatz', 'baden', 'buecherei', 'ausflug', 'indoor'] },
];
const ATTR = Object.fromEntries(ATTRS.map(a => [a.id, a]));

// Playground equipment, matched from separately mapped device nodes.
const GEAR = [
  { id: 'schaukel', label: 'Schaukel', re: /swing/ },
  { id: 'rutsche', label: 'Rutsche', re: /slide/ },
  { id: 'sand', label: 'Sandkasten', re: /sandpit|sand/ },
  { id: 'klettern', label: 'Klettern', re: /climb|structure|rope|net/ },
  { id: 'wasser', label: 'Wasserspiel', re: /water|splash|pump|archimedes/ },
  { id: 'seilbahn', label: 'Seilbahn', re: /zipwire|zip_line|cableway/ },
  { id: 'wippe', label: 'Wippe / Wipptier', re: /seesaw|springy/ },
];

const TIME_FILTERS = [
  { id: 'jetzt', label: 'Jetzt geöffnet' },
  { id: 'sonntag', label: 'Sonntags geöffnet' },
];

const PRESETS = [
  { id: 'windeln-jetzt', label: 'Jetzt Windeln kaufen', cats: ['windeln', 'apotheke'], filters: ['jetzt'] },
  { id: 'windeln-sonntag', label: 'Windeln am Sonntag', cats: ['windeln', 'apotheke'], filters: ['sonntag'] },
  { id: 'wickeln', label: 'Wickeln unterwegs', cats: [], filters: ['wickeltisch'] },
  { id: 'cafe-hund', label: 'Café mit Kind und Hund', cats: ['cafe'], filters: ['hund'] },
  { id: 'regen', label: 'Es regnet', cats: ['indoor', 'baden', 'buecherei', 'ausflug'], filters: [] },
  { id: 'wasser', label: 'Wasserspielplatz', cats: ['spielplatz'], filters: ['wasser'] },
];

// ---------- Opening hours (common OSM formats; holidays ignored) ----------
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
function parseOH(s) {
  if (!s) return null;
  s = s.replace(/"[^"]*"/g, '').trim();
  if (s === '24/7') return { always: true };
  const week = Array(7).fill(null);
  const spill = Array(7).fill(null).map(() => []);
  const rules = s.split(/;|,\s+(?=[A-Z][a-z])/).map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    let days, times;
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)(?:\s+(.*))?$/);
    if (m) { days = m[1]; times = (m[2] || '').trim(); }
    else if (/^\d/.test(rule) || /^(off|closed)$/.test(rule)) { days = 'Mo-Su'; times = rule; }
    else return null; // months, weeks, dates: too complex for the prototype
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

// ---------- Local storage (prototype: this device only) ----------
const STORE_KEY = 'djuu.v1';
let local = { attrs: {}, confirms: {}, reviews: {}, places: [] };
try { Object.assign(local, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(local)); } catch (e) { /* ignore */ } }

// ---------- State ----------
const state = { cats: new Set(), filters: new Set(), preset: null, showUnknown: false, q: '', view: 'map', selected: null, listLimit: 60, adding: false, me: null };
let places = [];
let byId = new Map();

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('de-DE');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
function dist(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';

// Value of an attribute for a place, user input wins over OSM.
function attrVal(p, id) {
  const mine = local.attrs[p.id]?.[id];
  if (mine !== undefined) return { v: mine, src: 'du' };
  if (ATTR[id]) { const v = p.osmAttrs[id]; return { v, src: v === null ? null : 'osm' }; }
  if (GEAR.some(g => g.id === id)) {
    if (p.cat !== 'spielplatz' && p.cat !== 'indoor') return { v: null, src: null };
    if (!p.gear) return { v: null, src: null };
    return { v: p.gear.has(id) ? true : null, src: p.gear.has(id) ? 'osm' : null };
  }
  return { v: null, src: null };
}
function filterVal(p, f) {
  if (f === 'jetzt') return p.oh === undefined ? null : isOpen(p.oh);
  if (f === 'sonntag') return opensSunday(p.oh);
  return attrVal(p, f).v;
}

// ---------- Data loading ----------
async function loadTSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const lines = (await res.text()).split('\n');
  const head = lines.shift().split('\t');
  const unq = v => v && v[0] === '"' && v.endsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v;
  return lines.filter(Boolean).map(l => { const c = l.replace(/\r$/, '').split('\t'); const o = {}; head.forEach((h, i) => { if (c[i]) o[h] = unq(c[i]); }); return o; });
}

function buildPlace(t) {
  const cat = categorize(t);
  if (!cat || !t['@lat']) return null;
  const osmAttrs = {};
  for (const a of ATTRS) osmAttrs[a.id] = a.from(t);
  const sub = SUBTYPE[t.shop] || SUBTYPE[t.amenity] || SUBTYPE[t.tourism] || SUBTYPE[t.leisure] || '';
  return {
    id: t['@type'][0] + t['@id'], osm: t['@type'] + '/' + t['@id'],
    lat: +t['@lat'], lon: +t['@lon'], cat, sub,
    name: t.name || defaultName(cat, sub),
    named: !!t.name,
    street: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
    web: t.website || t['contact:website'] || '', phone: t.phone || '',
    hoursRaw: t.opening_hours || '', oh: t.opening_hours ? parseOH(t.opening_hours) : undefined,
    changingWhere: t['changing_table:location'] || '', fee: t.fee || '', cuisine: t.cuisine || '',
    osmAttrs, gear: null, mine: false,
  };
}
function defaultName(cat, sub) {
  return { spielplatz: 'Spielplatz', wc: 'Öffentliche Toilette', aufzug: 'Aufzug', wickel: 'Wickelplatz' }[cat] || sub || CAT[cat].label;
}

function attachGear(devices) {
  // Bucket playgrounds in a ~100 m grid, then give each device to the nearest playground within 80 m.
  const cell = 0.001, grid = new Map();
  const key = (la, lo) => Math.floor(la / cell) + ':' + Math.floor(lo / (cell * 1.7));
  for (const p of places) if (p.cat === 'spielplatz' || p.cat === 'indoor') {
    const k = key(p.lat, p.lon); (grid.get(k) || grid.set(k, []).get(k)).push(p);
  }
  for (const d of devices) {
    const la = +d['@lat'], lo = +d['@lon'], v = d.playground || '';
    const gi = Math.floor(la / cell), gj = Math.floor(lo / (cell * 1.7));
    let best = null, bd = 80;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get((gi + i) + ':' + (gj + j)) || []) {
      const m = dist([la, lo], [p.lat, p.lon]); if (m < bd) { bd = m; best = p; }
    }
    if (!best) continue;
    best.gear = best.gear || new Set();
    for (const g of GEAR) if (g.re.test(v)) best.gear.add(g.id);
  }
}

function addLocalPlaces() {
  for (const lp of local.places) {
    const p = { ...lp, osmAttrs: {}, gear: null, mine: true, named: true, oh: lp.hoursRaw ? parseOH(lp.hoursRaw) : undefined };
    for (const a of ATTRS) p.osmAttrs[a.id] = null;
    places.push(p); byId.set(p.id, p);
  }
}

// ---------- Map ----------
const map = L.map('map', { zoomControl: false, minZoom: 10, maxBounds: [[53.25, 9.55], [53.85, 10.45]] }).setView([53.5600, 9.9800], 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>',
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
  return iconCache[k] || (iconCache[k] = L.divIcon({ className: '', iconSize: [18, 18], html: `<div class="pin${unknown ? ' unk' : ''}${p.mine ? ' mine' : ''}" style="--c:${CAT[p.cat].color}"></div>` }));
}
function markerFor(p, unknown) {
  if (!p.marker) { p.marker = L.marker([p.lat, p.lon]); p.marker.on('click', () => openPlace(p.id)); }
  p.marker.setIcon(iconFor(p, unknown));
  return p.marker;
}
let meMarker = null;

// ---------- Filtering ----------
function relevantFilters() {
  const cats = [...state.cats];
  const fits = a => !a.cats || cats.length === 0 || cats.some(c => a.cats.includes(c));
  const list = ATTRS.filter(fits).map(a => ({ id: a.id, label: a.label }));
  const out = [...TIME_FILTERS, ...list];
  if (cats.includes('spielplatz') || cats.includes('indoor') || state.filters.size && GEAR.some(g => state.filters.has(g.id))) out.push(...GEAR);
  return out;
}

function compute() {
  const q = state.q.trim().toLowerCase();
  const fs = [...state.filters];
  const res = { match: [], unknown: [], total: 0 };
  for (const p of places) {
    if (state.cats.size && !state.cats.has(p.cat)) continue;
    if (q && !(p.name.toLowerCase().includes(q) || p.street.toLowerCase().includes(q) || CAT[p.cat].label.toLowerCase().includes(q))) continue;
    res.total++;
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
function render() {
  last = compute();
  const shown = state.showUnknown ? last.match.concat(last.unknown) : last.match;
  cluster.clearLayers();
  cluster.addLayers(last.match.map(p => markerFor(p, false)).concat(state.showUnknown ? last.unknown.map(p => markerFor(p, true)) : []));
  renderStatus();
  renderChips();
  renderList(shown);
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
  const counts = {}; for (const p of places) counts[p.cat] = (counts[p.cat] || 0) + 1;
  const ordered = CATS.filter(c => state.cats.has(c.id)).concat(CATS.filter(c => !state.cats.has(c.id)));
  $('#cats').innerHTML = ordered.filter(c => counts[c.id]).map(c =>
    `<button type="button" class="chip${state.cats.has(c.id) ? ' on' : ''}" data-cat="${c.id}" style="--c:${c.color}"><span class="dot"></span>${esc(c.label)} <span class="n">${nf.format(counts[c.id])}</span></button>`).join('');
  const labels = Object.fromEntries([...TIME_FILTERS, ...ATTRS, ...GEAR].map(f => [f.id, f.label]));
  $('#activeFilters').innerHTML = `<button type="button" class="chip filter" id="openFilters">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Filter${state.filters.size ? ' (' + state.filters.size + ')' : ''}</button>` +
    relevantFilters().slice(0, 6).concat([...state.filters].filter(f => !relevantFilters().slice(0, 6).some(r => r.id === f)).map(id => ({ id, label: labels[id] })))
      .map(f => `<button type="button" class="chip filter${state.filters.has(f.id) ? ' on' : ''}" data-filter="${f.id}">${esc(f.label)}</button>`).join('');
}

function tagsFor(p) {
  const out = [];
  const o = isOpen(p.oh);
  if (o === true) out.push('<span class="tag open">offen</span>');
  for (const a of ATTRS) {
    const { v } = attrVal(p, a.id);
    if (v === true || v === 'limited') out.push(`<span class="tag y">${esc(a.label)}${v === 'limited' ? ' (eingeschr.)' : ''}</span>`);
    else if (v === false) out.push(`<span class="tag n">${esc(a.label)}</span>`);
  }
  if (p.gear) for (const g of GEAR) if (p.gear.has(g.id)) out.push(`<span class="tag">${esc(g.label)}</span>`);
  return out.length ? `<div class="tags">${out.join('')}</div>` : '';
}

function origin() { return state.me || [map.getCenter().lat, map.getCenter().lng]; }

function renderList(shown) {
  const o = origin();
  const sorted = shown.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]);
  $('#listHead').innerHTML = deskTabs() + `${nf.format(shown.length)} Orte, sortiert nach Entfernung ${state.me ? 'von dir' : 'zur Kartenmitte'}`;
  $('#list').innerHTML = sorted.slice(0, state.listLimit).map(([d, p]) => `
    <li><button type="button" class="item" data-id="${p.id}" style="--c:${CAT[p.cat].color}">
      <span class="dot"></span>
      <span><h3>${esc(p.name)}</h3><span class="sub">${esc(p.sub || CAT[p.cat].label)}${p.street ? ' · ' + esc(p.street) : ''}</span>${tagsFor(p)}</span>
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
function bindDeskTabs() {
  document.querySelectorAll('[data-dview]').forEach(b => b.onclick = () => setView(b.dataset.dview === 'list' ? 'map' : b.dataset.dview));
}

// ---------- Detail sheet ----------
function openSheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; $('#sheet').scrollTop = 0; }
function closeSheet() {
  $('#sheet').hidden = true;
  if (state.selected) { byId.get(state.selected)?.marker?._icon?.classList.remove('sel'); state.selected = null; }
}

function valPill(v) {
  if (v === true) return '<span class="val y">Ja</span>';
  if (v === false) return '<span class="val n">Nein</span>';
  if (v === 'limited') return '<span class="val l">Eingeschränkt</span>';
  return '<span class="val u">Unbekannt</span>';
}

function hoursTable(p) {
  if (!p.hoursRaw) return '<p class="muted">Keine Öffnungszeiten bekannt.</p>';
  if (!p.oh) return `<p>${esc(p.hoursRaw)}</p>`;
  if (p.oh.always) return '<p><b>Rund um die Uhr geöffnet</b></p>';
  const today = dayIdx(new Date());
  return '<table class="hours">' + p.oh.week.map((r, d) => `<tr class="${d === today ? 'today' : ''}"><td>${DAY_DE[d]}</td><td>${r.length ? r.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : 'geschlossen'}</td></tr>`).join('') + '</table><p class="note">Feiertage sind im Prototyp nicht berücksichtigt.</p>';
}

function openPlace(id) {
  const p = byId.get(id); if (!p) return;
  if (state.selected) byId.get(state.selected)?.marker?._icon?.classList.remove('sel');
  state.selected = id;
  const c = CAT[p.cat];
  const open = isOpen(p.oh);
  const attrs = ATTRS.filter(a => !a.cats || a.cats.includes(p.cat) || attrVal(p, a.id).v !== null);
  const conf = local.confirms[id];
  const revs = local.reviews[id] || [];
  const avg = revs.length ? (revs.reduce((s, r) => s + r.stars, 0) / revs.length).toFixed(1).replace('.', ',') : null;
  const route = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  openSheet(`
    <span class="kind" style="--c:${c.color}"><span class="dot"></span>${esc(p.sub || c.label)}${p.mine ? ' · von dir eingetragen' : ''}</span>
    <h2>${esc(p.name)}</h2>
    <div class="facts">
      ${p.street ? `<span>${esc(p.street)}</span>` : ''}
      ${open === true ? '<span style="color:var(--yes);font-weight:700">Jetzt geöffnet</span>' : open === false ? '<span style="color:var(--no);font-weight:700">Jetzt geschlossen</span>' : ''}
      ${avg ? `<span>★ ${avg} (${revs.length} ${revs.length === 1 ? 'Bewertung' : 'Bewertungen'} von dir)</span>` : ''}
      ${p.phone ? `<span class="muted">Telefon: <span style="user-select:all">${esc(p.phone)}</span></span>` : ''}
    </div>
    <div class="actions">
      <a class="btn primary" href="${route}" target="_blank" rel="noopener">Route</a>
      ${p.web ? `<a class="btn" href="${esc(p.web.startsWith('http') ? p.web : 'https://' + p.web)}" target="_blank" rel="noopener">Webseite</a>` : ''}
      ${p.mine ? '' : `<a class="btn" href="https://www.openstreetmap.org/${p.osm}" target="_blank" rel="noopener">In OSM ansehen</a>`}
    </div>

    <h4>Für Familien</h4>
    <div class="attrs">
      ${attrs.map(a => { const { v, src } = attrVal(p, a.id); const mine = local.attrs[id]?.[a.id];
        return `<div class="attr"><span><span class="lbl">${esc(a.label)}</span><span class="src">${src === 'osm' ? 'Quelle: OpenStreetMap' : src === 'du' ? 'Quelle: deine Angabe' : 'Weißt du es?'}</span></span>
          <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">${valPill(v)}
          ${mine !== undefined ? `<span class="ask"><button type="button" data-set="${a.id}" data-v="${mine ? 1 : 0}">Zurücknehmen</button></span>`
            : v === null ? `<span class="ask"><button type="button" data-set="${a.id}" data-v="1" aria-label="${esc(a.label)}: ja">Ja</button><button type="button" data-set="${a.id}" data-v="0" aria-label="${esc(a.label)}: nein">Nein</button></span>`
            : `<span class="ask"><button type="button" data-set="${a.id}" data-v="${v === false ? 1 : 0}">Stimmt nicht</button></span>`}</span></div>`; }).join('')}
      ${p.gear ? `<div class="attr"><span><span class="lbl">Spielgeräte</span><span class="src">Quelle: OpenStreetMap</span></span><span>${GEAR.filter(g => p.gear.has(g.id)).map(g => esc(g.label)).join(', ') || '–'}</span></div>` : ''}
    </div>
    ${p.changingWhere ? `<p class="note">Wickeltisch: ${esc({ female_toilet: 'in der Damentoilette', male_toilet: 'in der Herrentoilette', wheelchair_toilet: 'in der barrierefreien Toilette', unisex_toilet: 'in der Unisex-Toilette', dedicated_room: 'eigener Wickelraum', room: 'eigener Raum' }[p.changingWhere] || p.changingWhere)}</p>` : ''}

    ${p.cat === 'aufzug' || p.cat === 'spielplatz' && !p.hoursRaw ? '' : `<h4>Öffnungszeiten</h4>${hoursTable(p)}`}

    <h4>Stimmt das noch?</h4>
    <div class="confirm">
      <span>${conf ? `Zuletzt von dir ${conf.ok ? 'bestätigt' : 'als falsch gemeldet'}: ${new Date(conf.at).toLocaleDateString('de-DE')}` : 'Sind die Angaben richtig?'}</span>
      <span class="ask"><button type="button" data-confirm="1">Ja, stimmt</button><button type="button" data-confirm="0">Nein</button></span>
    </div>

    <h4>Bewerten</h4>
    <div class="stars" role="group" aria-label="Sterne">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${n} Sterne">★</button>`).join('')}</div>
    <div class="field"><label for="revText">Kommentar</label><textarea id="revText" placeholder="Was sollten andere Eltern wissen?"></textarea></div>
    <div class="actions"><button type="button" class="btn sun" id="revSave">Bewertung speichern</button></div>
    ${revs.map(r => `<div class="review"><b>${'★'.repeat(r.stars)}</b> <span class="muted">${new Date(r.at).toLocaleDateString('de-DE')}</span><div>${esc(r.text)}</div></div>`).join('')}
    <p class="note">Prototyp: Deine Angaben und Bewertungen werden nur auf diesem Gerät gespeichert.${p.mine ? '' : ' Daten © OpenStreetMap-Mitwirkende (ODbL).'}</p>
  `);
  p.marker?._icon?.classList.add('sel');
  let stars = 0;
  const body = $('#sheetBody');
  body.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
    const v = b.dataset.v === '1';
    local.attrs[id] = local.attrs[id] || {};
    if (local.attrs[id][b.dataset.set] === v) delete local.attrs[id][b.dataset.set]; else local.attrs[id][b.dataset.set] = v;
    save(); toast('Danke! Gespeichert.'); render(); openPlace(id);
  });
  body.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => {
    local.confirms[id] = { ok: b.dataset.confirm === '1', at: Date.now() }; save();
    toast(b.dataset.confirm === '1' ? 'Danke fürs Bestätigen!' : 'Danke! Bitte korrigiere oben, was nicht stimmt.'); openPlace(id);
  });
  body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
    stars = +b.dataset.star;
    body.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= stars));
  });
  $('#revSave').onclick = () => {
    if (!stars) { toast('Bitte zuerst Sterne vergeben.'); return; }
    (local.reviews[id] = local.reviews[id] || []).unshift({ stars, text: $('#revText').value.trim(), at: Date.now() });
    save(); toast('Bewertung gespeichert.'); openPlace(id);
  };
}

// ---------- Filter sheet ----------
function openFilters() {
  const f = relevantFilters();
  const counts = {};
  for (const x of f) { let n = 0; for (const p of places) if ((!state.cats.size || state.cats.has(p.cat))) { const v = filterVal(p, x.id); if (v === true || v === 'limited') n++; } counts[x.id] = n; }
  const block = (title, items) => items.length ? `<h4>${title}</h4><div class="filtergrid">${items.map(x => `<button type="button" class="chip filter${state.filters.has(x.id) ? ' on' : ''}" data-f="${x.id}"><span>${esc(x.label)}</span><span class="n">${nf.format(counts[x.id])}</span></button>`).join('')}</div>` : '';
  openSheet(`
    <h2>Filter</h2>
    <p class="muted" style="margin:0">Die Zahl zeigt, wie viele Orte${state.cats.size ? ' in deiner Auswahl' : ''} die Angabe sicher haben.</p>
    ${block('Öffnungszeiten', f.filter(x => TIME_FILTERS.some(t => t.id === x.id)))}
    ${block('Ausstattung', f.filter(x => ATTR[x.id]))}
    ${block('Spielgeräte', f.filter(x => GEAR.some(g => g.id === x.id)))}
    <label class="switch"><input type="checkbox" id="unkSwitch" ${state.showUnknown ? 'checked' : ''}> Orte ohne Angabe blass anzeigen</label>
    <div class="actions"><button type="button" class="btn primary" id="fDone">Fertig</button><button type="button" class="btn" id="fReset">Alles zurücksetzen</button></div>
  `);
  const body = $('#sheetBody');
  body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { toggle(state.filters, b.dataset.f); state.preset = null; b.classList.toggle('on'); render(); });
  $('#unkSwitch').onchange = e => { state.showUnknown = e.target.checked; render(); };
  $('#fDone').onclick = closeSheet;
  $('#fReset').onclick = () => { state.filters.clear(); state.cats.clear(); state.preset = null; state.showUnknown = false; render(); openFilters(); };
}
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }

// ---------- Add a place ----------
function startAdd() {
  closeSheet(); setView('map', true);
  state.adding = true; $('#addHint').hidden = false;
}
function stopAdd() { state.adding = false; $('#addHint').hidden = true; }
map.on('click', e => {
  if (!state.adding) return;
  stopAdd();
  const { lat, lng } = e.latlng;
  openSheet(`
    <h2>Neuen Ort eintragen</h2>
    <p class="muted" style="margin:0">Position: ${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
    <form id="addForm">
      <div class="field"><label for="aName">Name</label><input id="aName" required placeholder="z. B. Café Kleiner Fuchs"></div>
      <div class="field"><label for="aCat">Art</label><select id="aCat">${CATS.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="aHours">Öffnungszeiten (optional)</label><input id="aHours" placeholder="Mo-Fr 09:00-18:00; Sa 10:00-16:00"></div>
      <h4>Was weißt du?</h4>
      ${ATTRS.map(a => `<div class="trio"><span>${esc(a.label)}</span><select id="aa-${a.id}" aria-label="${esc(a.label)}"><option value="">Weiß nicht</option><option value="1">Ja</option><option value="0">Nein</option></select></div>`).join('')}
      <div class="actions"><button type="submit" class="btn sun">Ort speichern</button></div>
      <p class="note">Im Prototyp nur auf diesem Gerät gespeichert. Später geht der Eintrag an alle und zurück an OpenStreetMap.</p>
    </form>`);
  $('#addForm').onsubmit = ev => {
    ev.preventDefault();
    const id = 'u' + Date.now();
    const lp = { id, osm: '', lat, lon: lng, cat: $('#aCat').value, sub: '', name: $('#aName').value.trim(), street: '', web: '', phone: '', hoursRaw: $('#aHours').value.trim(), changingWhere: '', fee: '', cuisine: '' };
    local.places.push(lp);
    local.attrs[id] = {};
    for (const a of ATTRS) { const v = $('#aa-' + a.id).value; if (v) local.attrs[id][a.id] = v === '1'; }
    save();
    const p = { ...lp, osmAttrs: Object.fromEntries(ATTRS.map(a => [a.id, null])), gear: null, mine: true, named: true, oh: lp.hoursRaw ? parseOH(lp.hoursRaw) : undefined };
    places.push(p); byId.set(id, p);
    render(); openPlace(id); toast('Ort gespeichert.');
  };
});
$('#addCancel').onclick = stopAdd;

// ---------- Events (prototype: examples only) ----------
function nextDow(dow, plusWeeks = 0) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7) + plusWeeks * 7); return d; }
const EVENTS = [
  { d: nextDow(6), time: '10:00–13:00', title: 'Kinderflohmarkt von Eltern für Eltern', where: 'Schulhof in Eimsbüttel', kind: 'Flohmarkt' },
  { d: nextDow(3), time: '16:00', title: 'Bilderbuchkino ab 3 Jahren', where: 'Bücherhalle (Beispiel)', kind: 'Lesen' },
  { d: nextDow(0), time: '11:00', title: 'Familienkonzert: Klassik für Kleine', where: 'Konzertsaal (Beispiel)', kind: 'Musik' },
  { d: nextDow(6, 1), time: '09:00–14:00', title: 'Kinderkleiderbasar Herbst/Winter', where: 'Gemeindehaus in Winterhude', kind: 'Flohmarkt' },
  { d: nextDow(5), time: '15:00–17:00', title: 'Offener Basteltreff', where: 'Familienzentrum (Beispiel)', kind: 'Basteln' },
];
function renderEvents() {
  const fmtD = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
  $('#eventsView').innerHTML = deskTabs() + `
    <div class="banner"><b>Das sind Beispiele.</b> Echte Termine kommen später automatisch von Bücherhallen, Bezirken, Familienzentren und Flohmarkt-Seiten.</div>
    ${EVENTS.sort((a, b) => a.d - b.d).map(e => `<article class="event"><div class="date"><span>${fmtD.format(e.d)}</span><b>${e.d.getDate()}.</b><span>${e.d.toLocaleDateString('de-DE', { month: 'short' })}</span></div>
      <div><h3>${esc(e.title)}<span class="badge">Beispiel</span></h3><div class="muted">${esc(e.time)} · ${esc(e.where)}</div><div class="tags"><span class="tag">${esc(e.kind)}</span></div></div></article>`).join('')}`;
  bindDeskTabs();
}

// ---------- Views ----------
function setView(v, keepAdd) {
  if (v === 'add') { startAdd(); return; }
  if (!keepAdd) stopAdd();
  state.view = v;
  document.body.className = 'view-' + v;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#listView').hidden = v === 'events';
  $('#eventsView').hidden = v !== 'events';
  if (v === 'events') renderEvents(); else renderList(state.showUnknown ? last.match.concat(last.unknown) : last.match);
  if (v === 'map') setTimeout(() => map.invalidateSize(), 0);
}

// ---------- Events wiring ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.cat) { toggle(state.cats, t.dataset.cat); state.preset = null; state.listLimit = 60; render(); }
  else if (t.dataset.filter) { toggle(state.filters, t.dataset.filter); state.preset = null; render(); }
  else if (t.dataset.preset) {
    const p = PRESETS.find(x => x.id === t.dataset.preset);
    if (state.preset === p.id) { state.preset = null; state.cats.clear(); state.filters.clear(); }
    else { state.preset = p.id; state.cats = new Set(p.cats); state.filters = new Set(p.filters); }
    render();
  }
  else if (t.id === 'openFilters') openFilters();
  else if (t.dataset.view) setView(t.dataset.view);
  else if (t.classList.contains('item')) { const p = byId.get(t.dataset.id); if (window.innerWidth < 900) setView('map'); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 17)); setTimeout(() => openPlace(p.id), 50); }
});
$('#sheetClose').onclick = closeSheet;
$('#more').onclick = () => { state.listLimit += 60; render(); };
let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; render(); }, 200); });
map.on('moveend', () => { if (last && (state.view === 'list' || window.innerWidth >= 900)) renderList(state.showUnknown ? last.match.concat(last.unknown) : last.match); });
$('#locate').onclick = () => {
  if (!navigator.geolocation) { toast('Standort wird von diesem Gerät nicht unterstützt.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    state.me = [pos.coords.latitude, pos.coords.longitude];
    map.setView(state.me, 16);
    if (!meMarker) meMarker = L.circleMarker(state.me, { radius: 8, color: '#fff', weight: 3, fillColor: '#1C7ED6', fillOpacity: 1 }).addTo(map);
    else meMarker.setLatLng(state.me);
    render();
  }, () => toast('Standort nicht verfügbar. Bitte Freigabe im Browser erlauben.'), { enableHighAccuracy: true, timeout: 8000 });
};
setInterval(() => { if (state.filters.has('jetzt')) render(); }, 60000);

// ---------- Boot ----------
(async () => {
  try {
    const [rows, devices] = await Promise.all([loadTSV('data/orte.tsv'), loadTSV('data/geraete.tsv').catch(() => [])]);
    const seen = new Set();
    for (const r of rows) {
      const p = buildPlace(r);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id); places.push(p); byId.set(p.id, p);
    }
    attachGear(devices);
    addLocalPlaces();
    render();
  } catch (err) {
    $('#status').textContent = 'Daten konnten nicht geladen werden. Bitte Seite neu laden.';
    console.error(err);
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
