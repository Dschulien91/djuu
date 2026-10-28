/* Djuu v0.6 – family map for Hamburg.
   Map first: search + category row on top, one panel (bottom sheet on phones, left column on desktop)
   for list, place details, filters, urgent help, events, saved places and the add-place wizard.
   Data: data/places.json (db/export.py); every value carries its source.
   User input is stored on this device only until the server exists (server-ready shape, see STORE). */
'use strict';

const VERSION = '0.6';

// ---------- Icons (24px line icons) ----------
const ICON = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  route: '<path d="M3.5 11.5l17-8-8 17-2-7-7-2z"/>',
  share: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.4 13.4l7.2 4.2M15.6 6.4l-7.2 4.2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  bolt: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  playground: '<path d="M4 21L8 3h8l4 18"/><path d="M10 3v10M14 3v10M8.5 13h3M12.5 13h3"/>',
  cup: '<path d="M4 9h12v4a6 6 0 0 1-12 0V9z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3v3M12 3v3"/>',
  baby: '<circle cx="12" cy="12.5" r="8.5"/><path d="M9.2 11.5h.01M14.8 11.5h.01M9.8 15.2a3.2 3.2 0 0 0 4.4 0"/><path d="M11 4.2c.6-1 2.2-.9 2.2.4"/>',
  bag: '<path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  tree: '<path d="M12 22v-5"/><path d="M12 2.5L18.5 12H15l3 5H6l3-5H5.5L12 2.5z"/>',
  museum: '<path d="M3 9l9-5 9 5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  waves: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><circle cx="12" cy="6.5" r="2.5"/>',
  cross: '<path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/>',
  paw: '<circle cx="6.8" cy="9.5" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17.2" cy="9.5" r="1.8"/><path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.7 1.5 2.3 3 2.3 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.5 0 3-.6 3-2.3C17.5 15 15 12 12 12z"/>',
  people: '<circle cx="9" cy="7.5" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15.5 14.3c3 0 5.5 2.2 5.5 5.7"/>',
  blocks: '<rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><rect x="8" y="3" width="8" height="8" rx="1.5"/>',
  elevator: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M9 9.5l3-3 3 3M9 14.5l3 3 3-3"/>',
  toilet: '<path d="M6 3h5v8H6z"/><path d="M4 11h16c0 3.5-2.8 6-6 6h-1l.8 4H8.5l.8-4.3C6.2 16 4 13.8 4 11z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  group: '<circle cx="12" cy="7" r="2.6"/><circle cx="5.5" cy="10" r="2.1"/><circle cx="18.5" cy="10" r="2.1"/><path d="M7.5 20c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5"/><path d="M2 19c0-2.2 1.6-4 3.5-4M22 19c0-2.2-1.6-4-3.5-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
};
const svg = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;

// ---------- Category groups and categories ----------
const GROUPS = [
  { id: 'tipps', label: 'Djuu-Tipps', short: 'Djuu-Tipps', icon: 'star', color: '#E0A100', cats: [], virtual: true },
  { id: 'spielplatz', label: 'Spielplätze', short: 'Spielplätze', icon: 'playground', color: '#E8590C', cats: ['spielplatz', 'abenteuer'] },
  { id: 'essen', label: 'Essen & Café', short: 'Essen & Café', icon: 'cup', color: '#9C36B5', cats: ['cafe', 'restaurant', 'imbiss', 'eis'] },
  { id: 'wickeln', label: 'Wickeln, Stillen, WC', short: 'Wickeln & WC', icon: 'baby', color: '#0C8599', cats: ['wc', 'wickel', 'familienfreundlich'] },
  { id: 'einkauf', label: 'Windeln & Einkauf', short: 'Windeln', icon: 'bag', color: '#1971C2', cats: ['windeln', 'laden'] },
  { id: 'kurse', label: 'Kurse & Gruppen', short: 'Kurse & Gruppen', icon: 'group', color: '#C2255C', cats: ['kurs', 'geburtshaus', 'hebamme'] },
  { id: 'drinnen', label: 'Drinnen spielen', short: 'Drinnen', icon: 'house', color: '#D6336C', cats: ['indoor', 'spielhaus', 'freizeit'] },
  { id: 'natur', label: 'Parks & Natur', short: 'Draußen', icon: 'tree', color: '#2F9E44', cats: ['park', 'picknick', 'grillplatz', 'trinkwasser'] },
  { id: 'baden', label: 'Baden', short: 'Baden', icon: 'waves', color: '#1098AD', cats: ['baden'] },
  { id: 'kultur', label: 'Kultur & Ausflüge', short: 'Ausflüge', icon: 'museum', color: '#E67700', cats: ['museum', 'kultur', 'ausflug', 'buecherei'] },
  { id: 'gesundheit', label: 'Gesundheit', short: 'Gesundheit', icon: 'cross', color: '#E03131', cats: ['apotheke', 'kinderarzt', 'klinik', 'babyklappe'] },
  { id: 'zentren', label: 'Treffpunkte & Beratung', short: 'Treffpunkte', icon: 'people', color: '#6741D9', cats: ['treffpunkt', 'beratung'] },
  { id: 'hund', label: 'Hundeauslauf', short: 'Hundeauslauf', icon: 'paw', color: '#8D6E63', cats: ['hundeauslauf'] },
  { id: 'kita', label: 'Kitas', short: 'Kitas', icon: 'blocks', color: '#F59F00', cats: ['kita'] },
  { id: 'unterwegs', label: 'Aufzüge & Bahnhöfe', short: 'Aufzüge', icon: 'elevator', color: '#5C677D', cats: ['aufzug', 'bahnhof'] },
];
const ROW_GROUPS = ['tipps', 'spielplatz', 'essen', 'wickeln', 'kurse', 'einkauf', 'drinnen', 'natur', 'baden'];
const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
const CAT_LABEL = {
  spielplatz: 'Spielplatz', indoor: 'Drinnen spielen', spielhaus: 'Spielhaus', freizeit: 'Freizeit', cafe: 'Café',
  restaurant: 'Restaurant', imbiss: 'Imbiss', eis: 'Eis', windeln: 'Drogerie / Supermarkt / Späti', laden: 'Laden',
  wc: 'Toilette', wickel: 'Wickelplatz', familienfreundlich: 'Familienfreundlicher Ort', apotheke: 'Apotheke',
  kinderarzt: 'Kinderarzt', hebamme: 'Hebamme', klinik: 'Klinik', babyklappe: 'Babyklappe', museum: 'Museum',
  kultur: 'Kultur', ausflug: 'Ausflugsziel', buecherei: 'Bücherhalle', baden: 'Baden', park: 'Park', picknick: 'Picknickplatz',
  grillplatz: 'Grillplatz', trinkwasser: 'Trinkwasser', hundeauslauf: 'Hundeauslaufzone', treffpunkt: 'Familienzentrum / Treffpunkt',
  beratung: 'Beratung', kita: 'Kita', aufzug: 'Aufzug', bahnhof: 'Bahnhof',
  kurs: 'Elternschule / Familienzentrum', geburtshaus: 'Geburtshaus', abenteuer: 'Abenteuer- / Bauspielplatz',
};
const GROUP_OF = {};
for (const g of GROUPS) for (const c of g.cats) GROUP_OF[c] = g;

// ---------- Attributes (the filters Google does not have) ----------
const truthy = v => /^(yes|designated|room|true|ja|1|limited|partial)$/i.test(v) ? (v === 'limited' || v === 'partial' ? 'limited' : 'yes') : /^(no|false|nein|0)$/i.test(v) ? 'no' : null;
const INDOOR = ['essen', 'einkauf', 'wickeln', 'gesundheit', 'kultur', 'baden', 'drinnen', 'zentren', 'unterwegs', 'kurse'];
const ATTRS = [
  { id: 'wickeltisch', label: 'Wickeltisch', keys: ['changing_table'], groups: INDOOR, q: 'Gibt es hier einen Wickeltisch?' },
  { id: 'stillen', label: 'Stillmöglichkeit', keys: ['baby_feeding'], groups: INDOOR, q: 'Kann man hier in Ruhe stillen?' },
  { id: 'hochstuhl', label: 'Hochstuhl', keys: ['highchair'], groups: ['essen'], q: 'Gibt es Hochstühle?' },
  { id: 'spielecke', label: 'Spielecke', keys: ['kids_area'], groups: ['essen', 'einkauf', 'kultur', 'gesundheit', 'zentren'], q: 'Gibt es eine Spielecke?' },
  { id: 'kindermenue', label: 'Kindermenü', keys: ['kids_menu'], groups: ['essen'], q: 'Gibt es ein Kindermenü?' },
  { id: 'windeln', label: 'Windeln / Babynahrung', keys: [], groups: ['einkauf'], q: 'Gibt es hier Windeln oder Babynahrung?' },
  { id: 'kleinkind', label: 'Für Kleinkinder', keys: ['for_baby', 'for_toddler'], groups: ['spielplatz'], q: 'Gibt es einen Bereich für Kleinkinder?' },
  { id: 'eingezaeunt', label: 'Eingezäunt', keys: ['fenced'], groups: ['spielplatz'], q: 'Ist der Spielplatz eingezäunt?' },
  { id: 'schatten', label: 'Schatten', keys: ['shade'], groups: ['spielplatz'], q: 'Gibt es Schatten?' },
  { id: 'wc_nahe', label: 'WC in der Nähe', keys: ['wc_near'], groups: ['spielplatz'], q: 'Gibt es ein WC in der Nähe?' },
  { id: 'wasser', label: 'Wasserspiel', keys: ['water_play'], groups: ['spielplatz'], q: 'Gibt es ein Wasserspiel?' },
  { id: 'kinderwagen', label: 'Kinderwagen', keys: ['stroller', 'wheelchair'], q: 'Kommt man gut mit dem Kinderwagen hin?' },
  { id: 'toilette', label: 'Toilette', keys: ['toilets'], groups: ['essen', 'kultur', 'baden', 'drinnen', 'natur', 'einkauf'], q: 'Gibt es eine Toilette?' },
  { id: 'drinnen', label: 'Drinnen', keys: ['indoor'], groups: ['spielplatz', 'drinnen', 'kultur', 'baden', 'zentren'], q: 'Ist es drinnen oder überdacht?' },
  { id: 'hund', label: 'Hunde erlaubt', keys: ['dog'], q: 'Sind Hunde erlaubt?' },
  { id: 'kostenlos', label: 'Kostenlos', keys: ['fee'], invert: true, groups: ['spielplatz', 'drinnen', 'kultur', 'baden', 'wickeln', 'zentren', 'natur', 'kurse'], q: 'Ist es kostenlos?' },
];
const ATTR = Object.fromEntries(ATTRS.map(a => [a.id, a]));
function normValue(attr, v) {
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
  { id: 'wippe', label: 'Wippe', re: /seesaw|springy/ },
  { id: 'trampolin', label: 'Trampolin', re: /trampoline/ },
];
const TIME_FILTERS = [{ id: 'jetzt', label: 'Jetzt offen' }, { id: 'sonntag', label: 'Sonntags offen' }];
const FILTER_LABEL = Object.fromEntries([...TIME_FILTERS, ...ATTRS, ...GEAR].map(f => [f.id, f.label]));
const GROUP_FILTERS = {
  spielplatz: ['kleinkind', 'schatten', 'wasser', 'eingezaeunt', 'wc_nahe'],
  essen: ['jetzt', 'hochstuhl', 'wickeltisch', 'spielecke', 'hund'],
  wickeln: ['wickeltisch', 'stillen', 'kostenlos', 'jetzt'],
  einkauf: ['jetzt', 'sonntag', 'windeln'],
  drinnen: ['jetzt', 'kostenlos', 'wickeltisch', 'kinderwagen'],
  natur: ['hund', 'kostenlos'],
  baden: ['jetzt', 'kostenlos', 'wickeltisch'],
  kultur: ['jetzt', 'kostenlos', 'wickeltisch', 'kinderwagen'],
  gesundheit: ['jetzt', 'sonntag', 'kinderwagen'],
  zentren: ['jetzt', 'kostenlos'],
  kurse: ['kostenlos', 'kinderwagen', 'wickeltisch'],
  tipps: ['jetzt', 'kostenlos', 'wickeltisch'],
  unterwegs: ['kinderwagen'],
  _: ['jetzt', 'wickeltisch', 'kinderwagen', 'hund'],
};
const AGES = [{ id: '0-2', label: '0–2 Jahre' }, { id: '3-6', label: '3–6 Jahre' }, { id: '7+', label: 'ab 7 Jahre' }];
const PRESETS = [
  { id: 'windeln-jetzt', label: 'Jetzt Windeln kaufen', icon: 'bag', groups: ['einkauf'], cats: ['apotheke'], filters: ['jetzt'] },
  { id: 'windeln-sonntag', label: 'Windeln am Sonntag', icon: 'bag', groups: ['einkauf'], cats: ['apotheke'], filters: ['sonntag'] },
  { id: 'tipps', label: 'Djuu-Tipps: was Eltern lieben', icon: 'star', groups: ['tipps'], filters: [] },
  { id: 'kurse', label: 'Krabbelgruppen & Kurse', icon: 'group', groups: ['kurse'], filters: [] },
  { id: 'wickeln', label: 'Wickeln unterwegs', icon: 'baby', groups: [], filters: ['wickeltisch'] },
  { id: 'regen', label: 'Es regnet', icon: 'house', groups: ['drinnen', 'kultur', 'baden'], filters: [] },
  { id: 'kleinkind', label: 'Spielplatz für die Kleinen', icon: 'playground', groups: ['spielplatz'], filters: ['kleinkind'] },
  { id: 'wasser', label: 'Wasserspielplatz', icon: 'waves', groups: ['spielplatz'], filters: ['wasser'] },
  { id: 'cafe-hund', label: 'Café mit Kind und Hund', icon: 'cup', groups: ['essen'], filters: ['hund'] },
  { id: 'hund', label: 'Hund darf rennen', icon: 'paw', groups: ['hund'], filters: [] },
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
// "Offen bis 18:00" / "Öffnet um 10:00" / "Heute geschlossen"
function openText(p) {
  const oh = p.oh; if (!oh) return '';
  if (oh.always) return '<span class="open">24 Stunden offen</span>';
  const now = new Date(), d = dayIdx(now), min = now.getHours() * 60 + now.getMinutes();
  const cur = oh.week[d].find(([a, b]) => min >= a && min < b) || oh.spill[d].find(([a, b]) => min >= a && min < b);
  if (cur) return `<span class="open">Offen bis ${fmtMin(cur[1] === 1440 && oh.spill[(d + 1) % 7][0] ? oh.spill[(d + 1) % 7][0][1] : cur[1])}</span>`;
  const next = oh.week[d].find(([a]) => a > min);
  return next ? `<span class="closed">Öffnet um ${fmtMin(next[0])}</span>` : '<span class="closed">Heute geschlossen</span>';
}

// ---------- Local store (server-ready shape) ----------
const STORE_KEY = 'djuu.v2';
let store = { contributions: [], confirmations: [], reviews: [], reports: [], events: [], prompted: {}, favorites: [], profile: { kids: [], expecting: '', dogs: 0 } };
try { Object.assign(store, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
store.favorites = store.favorites || [];
store.profile = Object.assign({ kids: [], expecting: '', dogs: 0 }, store.profile || {});
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { toast('Speicher voll. Bitte weniger Fotos verwenden.'); } }
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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
const state = { groups: new Set(), cats: new Set(), filters: new Set(), preset: null, showUnknown: false, q: '', tab: 'map', listLimit: 40, me: null, selected: null };
let SOURCES = [];
const places = [];
const byId = new Map();

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('de-DE');
const fmtDate = t => new Date(t).toLocaleDateString('de-DE');
const desktop = () => window.innerWidth >= 900;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000); }
function dist(a, b) {
  const k = Math.PI / 180;
  return 6371000 * Math.hypot((b[1] - a[1]) * k * Math.cos((a[0] + b[0]) * k / 2), (b[0] - a[0]) * k);
}
const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
const walkMin = m => Math.max(1, Math.round(m * 1.3 / 75));
const groupOf = p => GROUP_OF[p.cat] || GROUPS[0];
const badge = (p, cls = 'badge') => `<span class="${cls}" style="--c:${groupOf(p).color}">${svg(groupOf(p).icon, '')}</span>`;
const origin = () => state.me || [map.getCenter().lat, map.getCenter().lng];

function userAnswers(pid, attrId) {
  const out = [];
  for (const c of store.contributions) if (c.placeId === pid && c.attrs?.[attrId] && c.attrs[attrId] !== 'unknown') out.push({ v: c.attrs[attrId], at: c.createdAt });
  for (const c of store.confirmations) if (c.placeId === pid && c.attr === attrId) out.push({ v: c.answer, at: c.at });
  return out.sort((a, b) => b.at - a.at);
}
function attrVal(p, id) {
  if (GEAR.some(g => g.id === id)) return { v: p.gear?.has(id) ? 'yes' : null, src: p.gear ? 'OpenStreetMap' : null };
  const a = ATTR[id];
  let base = { v: null };
  if (id === 'toilette' && p.cat === 'wc') base = { v: 'yes', src: 'Kategorie' };
  else if (id === 'wasser' && p.gear?.has('wasser')) base = { v: 'yes', src: 'OpenStreetMap' };
  else for (const k of a.keys) {
    const f = p.f[k];
    const v = f && normValue(a, f[0]);
    if (v) { base = { v, src: SOURCES[f[1]]?.[1], method: f[2], conf: f[3], evidence: f[4] }; break; }
  }
  const ua = userAnswers(p.id, id);
  if (ua.length) return { ...base, v: ua[0].v, src: 'Nutzer', method: 'user', confirmations: ua };
  return base;
}
function filterVal(p, f) {
  if (f === 'jetzt') return isOpen(p.oh);
  if (f === 'sonntag') return opensSunday(p.oh);
  const v = attrVal(p, f).v;
  return v === 'yes' || v === 'limited' ? true : v === 'no' ? false : null;
}
const relevantAttrs = p => ATTRS.filter(a => !a.groups || a.groups.includes(groupOf(p).id));

// ---------- Data ----------
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

// ---------- Offers: courses, groups, events (data/offers.json) ----------
let OFFERS = [];
const offersByPlace = new Map();
const TOPIC_LABEL = {
  geburtsvorbereitung: 'Geburtsvorbereitung', rueckbildung: 'Rückbildung', pekip: 'PEKiP & Bewegung', babymassage: 'Babymassage',
  schwimmen: 'Babyschwimmen', musik: 'Musik', krabbelgruppe: 'Krabbel- & Spielgruppe', eltern_cafe: 'Eltern-Café', beratung: 'Beratung',
  erste_hilfe: 'Erste Hilfe am Kind', kreativ: 'Basteln', lesen: 'Vorlesen', sonstiges: 'Angebot',
};
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
function loadOffers(data) {
  const cols = data.cols;
  OFFERS = data.offers.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  for (const o of OFFERS) if (o.place_id) (offersByPlace.get(o.place_id) || offersByPlace.set(o.place_id, []).get(o.place_id)).push(o);
}
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymd = d => d.toISOString().slice(0, 10);
// Next date this offer takes place (today included), or null.
function nextDate(o) {
  const t = today0();
  const start = o.start_date ? new Date(o.start_date + 'T00:00') : null;
  const end = o.end_date ? new Date(o.end_date + 'T00:00') : null;
  if (o.kind === 'termin') return start && start >= t ? start : null;
  if (o.weekday != null) {
    const from = start && start > t ? start : t;
    const d = new Date(from); d.setDate(d.getDate() + ((o.weekday - dayIdx(d) + 7) % 7));
    return end && d > end ? null : d;
  }
  if (start && start >= t) return start;
  return end && end >= t ? t : null;
}
function ageLabel(min, max) {
  if (min == null && max == null) return '';
  const f = m => m < 24 ? `${m} Mon.` : `${Math.floor(m / 12)} J.`;
  if (max == null) return `ab ${f(min)}`;
  if (!min) return `bis ${f(max - 1)}`;
  return min < 24 && max <= 25 ? `${min}–${max - 1} Mon.` : `${f(min)}–${f(max - 1)}`;
}
// Ages of the user's children in months (from birth month); negative = expected baby.
function familyAges() {
  const now = new Date(), out = [];
  for (const k of store.profile.kids) {
    if (!k.ym) continue;
    const [y, m] = k.ym.split('-').map(Number);
    out.push({ name: k.name || 'Kind', months: (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) });
  }
  return out;
}
function kidLabel(m) { return m < 0 ? 'unterwegs' : m < 24 ? `${m} Monate` : `${Math.floor(m / 12)} Jahre`; }
const hasFamily = () => store.profile.kids.some(k => k.ym) || !!store.profile.expecting;
// true = fits one of the children (or the pregnancy), false = fits none, null = no profile / no age info
function offerFits(o) {
  if (!hasFamily()) return null;
  if (o.for_parents) return !!store.profile.expecting || familyAges().some(a => a.months < 3);
  if (o.age_min_m == null && o.age_max_m == null) return null;
  return familyAges().some(a => a.months >= (o.age_min_m ?? 0) && a.months < (o.age_max_m ?? 999));
}
const fmtDay = d => {
  const t = today0(), diff = Math.round((d - t) / 864e5);
  return diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : `${WD[dayIdx(d)]} ${d.getDate()}.${d.getMonth() + 1}.`;
};
function offerItem(o, nd) {
  const place = o.place_id && byId.get(o.place_id);
  const d = (o.lat && o.lon) || place ? dist(origin(), place ? [place.lat, place.lon] : [o.lat, o.lon]) : null;
  const fits = offerFits(o);
  const tags = [ageLabel(o.age_min_m, o.age_max_m), o.free ? 'kostenlos' : o.price, o.kind === 'gruppe' ? 'offene Gruppe' : o.kind === 'kurs' ? (o.sessions ? `Kurs, ${o.sessions}×` : 'Kurs') : '']
    .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
  const inner = `<span class="datebox"><b>${nd ? esc(fmtDay(nd)) : '–'}</b><span>${esc(o.time_from || '')}</span></span>
    <span><h3>${esc(o.title)}</h3><span class="meta">${esc(TOPIC_LABEL[o.topic] || '')}${o.venue ? ' · ' + esc(o.venue) : ''}${d != null ? ' · ' + fmtDist(d) : ''}</span>
    <span class="mini${fits === true ? ' fit' : ''}">${fits === true ? '<span class="fitchip">passt zu euch</span>' : ''}${tags}</span></span><span></span>`;
  return place ? `<li><button type="button" class="item offer" data-id="${place.id}">${inner}</button></li>`
    : `<li><a class="item offer" href="${esc(o.url)}" target="_blank" rel="noopener">${inner}</a></li>`;
}

// ---------- Map ----------
const map = L.map('map', { zoomControl: false, minZoom: 10, maxZoom: 19, maxBounds: [[53.25, 9.55], [53.85, 10.45]] }).setView([53.5600, 9.9800], 13);
// Simplified, Google-like vector basemap from OpenFreeMap (free, no key). Always the light style (dark was too dark).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const styleUrl = () => STYLE_URL;
const baseOpts = { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org">OpenFreeMap</a> · Quellen je Ort' };
L.maplibreGL({ style: styleUrl(), ...baseOpts }).addTo(map);
const cluster = L.markerClusterGroup({
  chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, disableClusteringAtZoom: 17,
  iconCreateFunction: c => {
    const n = c.getChildCount(), size = n < 50 ? '' : n < 300 ? 'm' : 'l';
    return L.divIcon({ html: `<div class="cluster ${size}">${n < 1000 ? n : Math.round(n / 100) / 10 + 'k'}</div>`, className: '', iconSize: [40, 40] });
  },
});
map.addLayer(cluster);
const iconCache = {};
function iconFor(p, unknown) {
  const g = groupOf(p), tip = !!p.f.tipp, k = g.id + (unknown ? 'u' : '') + (p.mine ? 'm' : '') + (tip ? 't' : '');
  return iconCache[k] || (iconCache[k] = L.divIcon({ className: '', iconSize: [30, 30], html: `<div class="mk${unknown ? ' unk' : ''}${p.mine ? ' mine' : ''}${tip ? ' tip' : ''}" style="--c:${g.color}"><svg viewBox="0 0 24 24">${ICON[g.icon]}</svg>${tip ? `<span class="star">${svg('star', '')}</span>` : ''}</div>` }));
}
function markerFor(p, unknown) {
  if (!p.marker) { p.marker = L.marker([p.lat, p.lon]); p.marker.on('click', () => showPlace(p.id, true)); }
  p.marker.setIcon(iconFor(p, unknown));
  return p.marker;
}
let meMarker = null;
map.on('click', () => { if (!desktop() && view().type === 'list') setSize('peek'); });
map.on('moveend', () => { if (view().type === 'list') renderPanel(); });

// ---------- Filtering ----------
function inSelection(p) {
  if (!state.groups.size && !state.cats.size) return true;
  return state.groups.has(groupOf(p).id) || state.cats.has(p.cat) || (state.groups.has('tipps') && !!p.f.tipp);
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
let last = { match: [], unknown: [] };
const shownList = () => state.showUnknown ? last.match.concat(last.unknown) : last.match;
function refresh() {
  last = compute();
  cluster.clearLayers();
  cluster.addLayers(last.match.map(p => markerFor(p, false)).concat(state.showUnknown ? last.unknown.map(p => markerFor(p, true)) : []));
  renderTop();
  if (['list', 'filters'].includes(view().type)) renderPanel();
}

// ---------- Top bar ----------
function renderTop() {
  const row = ROW_GROUPS.map(id => GROUP[id]);
  const extra = [...state.groups].filter(id => !ROW_GROUPS.includes(id)).map(id => GROUP[id]);
  $('#cats').innerHTML = extra.concat(row).map(g =>
    `<button type="button" class="cat${state.groups.has(g.id) ? ' on' : ''}" data-group="${g.id}" style="--c:${g.color}"><span class="ic">${svg(g.icon, '')}</span>${esc(g.short)}</button>`).join('') +
    `<button type="button" class="cat" data-open="groups" style="--c:var(--muted)"><span class="ic">${svg('more', '')}</span>Mehr</button>`;
  const first = [...state.groups][0];
  const rel = GROUP_FILTERS[first] || GROUP_FILTERS._;
  const ids = [...new Set((store.profile.dogs > 0 ? ['hund'] : []).concat(rel, [...state.filters]))];
  $('#ctx').innerHTML =
    (state.q ? `<button type="button" class="chip on" data-clearq="1">„${esc(state.q)}“ ${svg('close')}</button>` : '') +
    `<button type="button" class="chip" data-open="filters">${svg('filter')}Filter${state.filters.size ? ' · ' + state.filters.size : ''}</button>` +
    ids.map(id => `<button type="button" class="chip${state.filters.has(id) ? ' on' : ''}" data-filter="${id}">${state.filters.has(id) ? svg('check') : ''}${esc(FILTER_LABEL[id])}</button>`).join('');
}

// ---------- Panel: one stack of views ----------
let stack = [{ type: 'list' }];
const view = () => stack[stack.length - 1];
function go(v, size) { if (view().type === v.type && v.type !== 'detail') stack.pop(); stack.push(v); renderPanel(); setSize(size || 'full'); }
function back() { stack.pop(); if (!stack.length) stack = [{ type: 'list' }]; clearSel(); renderPanel(); if (view().type === 'list') setSize(desktop() ? 'full' : 'half'); }
function home(size = 'peek') { stack = [{ type: 'list' }]; clearSel(); renderPanel(); setSize(size); setTab('map'); }
function setSize(s) {
  if (desktop()) s = 'full';
  $('#panel').dataset.size = s; $('#app').dataset.size = s;
}
function clearSel() { if (state.selected) { byId.get(state.selected)?.marker?._icon?.classList.remove('sel'); state.selected = null; } if (wiz.map) { wiz.map.remove(); wiz.map = null; } }
const head = (title, sub = '', canBack = true) => `<div class="ph">${canBack ? `<button type="button" class="round" data-back="1" aria-label="Zurück">${svg('back')}</button>` : ''}
  <h2>${title}${sub ? `<span class="sub">${sub}</span>` : ''}</h2>${canBack ? `<button type="button" class="round" data-home="1" aria-label="Schließen">${svg('close')}</button>` : ''}</div>`;

async function renderPanel() {
  const v = view(), body = $('#panelBody');
  if (v.type !== 'wizard' && wiz.map) { wiz.map.remove(); wiz.map = null; }
  if (v.type === 'list') body.innerHTML = listView();
  else if (v.type === 'detail') { const html = await detailView(v.id); if (view() !== v) return; body.innerHTML = html; bindDetail(v.id); }
  else if (v.type === 'filters') body.innerHTML = filtersView();
  else if (v.type === 'groups') body.innerHTML = groupsView();
  else if (v.type === 'search') body.innerHTML = searchView();
  else if (v.type === 'sos') body.innerHTML = sosView(v.kind);
  else if (v.type === 'events') body.innerHTML = eventsView();
  else if (v.type === 'me') body.innerHTML = savedView();
  else if (v.type === 'rate') { body.innerHTML = rateView(v.id); bindRate(v.id); }
  else if (v.type === 'wizard') { renderWizard(); return; }
  else if (v.type === 'thanks') body.innerHTML = v.html;
  if (v.type !== 'detail' && v.type !== 'rate') body.scrollTop = v.type === 'list' ? body.scrollTop : 0;
}

// list (the home view)
function listView() {
  const o = origin();
  const shown = shownList();
  const sorted = shown.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]);
  const u = last.unknown.length;
  const title = state.preset ? esc(PRESETS.find(x => x.id === state.preset).label)
    : state.groups.size === 1 ? esc(GROUP[[...state.groups][0]].label) : 'In der Nähe';
  const sub = state.filters.size
    ? `${nf.format(last.match.length)} passen sicher${u ? ` · ${nf.format(u)} ohne Angabe <button type="button" data-unk="1">${state.showUnknown ? 'ausblenden' : 'auch zeigen'}</button>` : ''}`
    : `${nf.format(shown.length)} Orte · ${state.me ? 'von dir aus' : 'ab Kartenmitte'}`;
  const todayFits = hasFamily() ? OFFERS.filter(o => { const d = nextDate(o); return d && +d === +today0() && offerFits(o) === true; }).length : 0;
  const famCard = todayFits && !state.groups.size && !state.filters.size ? `<button type="button" class="askcard" data-tab="events" style="width:100%;border:0;text-align:left;margin:0 0 8px"><div><b>Heute: ${todayFits} passende ${todayFits === 1 ? 'Gruppe' : 'Gruppen und Kurse'}</b><span>für ${esc(familyAges().map(k => k.name).join(', ') || 'euch')}</span></div>${svg('cal')}</button>` : '';
  return `<div class="ph" data-expand="1"><h2>${title}<span class="sub">${sub}</span></h2></div>${famCard}
    ${sorted.length ? `<ol class="list">${sorted.slice(0, state.listLimit).map(([d, p]) => itemHtml(p, d)).join('')}</ol>
    ${sorted.length > state.listLimit ? '<button type="button" class="more" data-more="1">Mehr anzeigen</button>' : ''}`
    : `<div class="empty"><b>Hier ist nichts dabei.</b>Probier weniger Filter oder zoom raus.</div>`}`;
}
function itemHtml(p, d) {
  const yes = relevantAttrs(p).filter(a => attrVal(p, a.id).v === 'yes').slice(0, 3).map(a => `<span>${esc(a.label)}</span>`).join('');
  const ot = openText(p);
  return `<li><button type="button" class="item" data-id="${p.id}">${badge(p)}
    <span><h3>${esc(p.name)}${p.f.tipp ? ` <span class="tipdot" title="Djuu-Tipp">${svg('star', '')}</span>` : ''}</h3><span class="meta">${esc(CAT_LABEL[p.cat] || '')}${ot ? ' · ' + ot : ''}</span>${yes ? `<span class="mini">${yes}</span>` : ''}</span>
    <span class="dist">${fmtDist(d)}</span></button></li>`;
}

// detail
function showPlace(id, fromMap) {
  const p = byId.get(id); if (!p) return;
  if (fromMap && view().type === 'detail') stack.pop();
  go({ type: 'detail', id }, desktop() ? 'full' : 'half');
  if (state.selected) byId.get(state.selected)?.marker?._icon?.classList.remove('sel');
  state.selected = id;
  setTimeout(() => p.marker?._icon?.classList.add('sel'), 50);
}
async function photoTags(ids) {
  const out = [];
  for (const id of ids || []) { try { const d = await photoDB.get(id); if (d) out.push(`<img src="${d}" alt="Foto von Nutzer" loading="lazy">`); } catch (e) { /* ignore */ } }
  return out.join('');
}
async function detailView(id) {
  const p = byId.get(id), f = p.f;
  const d = dist(origin(), [p.lat, p.lon]);
  const fav = store.favorites.includes(id);
  const known = [];
  for (const a of relevantAttrs(p)) { const r = attrVal(p, a.id); if (r.v) known.push([a, r]); }
  for (const a of ATTRS) if (!relevantAttrs(p).includes(a) && attrVal(p, a.id).v) known.push([a, attrVal(p, a.id)]);
  const reviews = store.reviews.filter(r => r.placeId === id && !store.reports.some(x => x.targetId === r.id));
  const avg = reviews.filter(r => r.stars).length ? (reviews.reduce((s, r) => s + (r.stars || 0), 0) / reviews.filter(r => r.stars).length).toFixed(1).replace('.', ',') : null;
  const ages = [...new Set(store.contributions.filter(c => c.placeId === id).flatMap(c => c.ages || []))];
  const addr = f.address?.[0] || [f.street?.[0], f.housenumber?.[0]].filter(Boolean).join(' ');
  const web = f.website?.[0];
  const photos = await photoTags(store.contributions.filter(c => c.placeId === id).flatMap(c => c.photoIds || []).concat(reviews.flatMap(r => r.photoIds || [])));
  const extra = [
    f.description && esc(f.description[0]),
    f.dog_rule && `<b>${esc(f.dog_rule[0])}</b>`,
    f.water_status && `<b>Wasserqualität:</b> ${esc(f.water_status[0])}`,
    f.age_groups && `<b>Für Altersgruppen:</b> ${esc(f.age_groups[0])} Jahre`,
    f.care_types && `Betreuung: ${esc(f.care_types[0])}`,
    f.services && esc(f.services[0]).slice(0, 280),
  ].filter(Boolean);
  const today = dayIdx(new Date());
  const factChip = ([a, r]) => `<span class="fact${r.v === 'no' ? ' no' : r.v === 'limited' ? ' lim' : ''}">${r.v === 'no' ? '' : svg('check')}${esc(a.label)}${r.v === 'limited' ? ' (eingeschränkt)' : ''}</span>`;
  return `
    <div class="ph"><button type="button" class="round" data-back="1" aria-label="Zurück">${svg('back')}</button><span style="flex:1"></span>
      <button type="button" class="round" data-home="1" aria-label="Schließen">${svg('close')}</button></div>
    <div class="hero">${badge(p)}<div style="min-width:0">
      <h2 style="margin:0;font:800 23px/1.15 var(--font-display);letter-spacing:-.02em;text-wrap:balance">${esc(p.name)}</h2>
      <div class="status-line"><span>${esc(CAT_LABEL[p.cat] || '')}${p.district ? ' · ' + esc(p.district) : ''}</span></div>
      <div class="status-line">${openText(p)}<span>${fmtDist(d)} · ${walkMin(d)} Min. zu Fuß</span>${avg ? `<span class="stars-read">★ ${avg}</span>` : ''}</div>
    </div></div>
    <div class="acts">
      <a class="act primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${svg('route')}Route</a>
      <button type="button" class="act${fav ? ' on' : ''}" data-fav="${id}">${svg('heart')}${fav ? 'Gemerkt' : 'Merken'}</button>
      <button type="button" class="act" data-share="${id}">${svg('share')}Teilen</button>
      <button type="button" class="act" data-addinfo="${id}">${svg('edit')}Ergänzen</button>
    </div>
    ${f.tipp ? `<div class="tipbanner">${svg('star')}<div><b>Djuu-Tipp</b>${esc(f.tipp[0])}</div></div>` : ''}
    ${groupOf(p).id === 'kurse' && !offersByPlace.has(id) ? `<p class="note">Für diesen Ort haben wir noch keine Kurszeiten. Schau auf die Webseite.</p>` : ''}
    ${photos ? `<div class="photos" style="margin-top:12px">${photos}</div>` : ''}
    <div class="sec"><h4>Auf einen Blick</h4>
      ${known.length || p.gear || ages.length ? `<div class="facts">${known.map(factChip).join('')}
        ${p.gear ? GEAR.filter(g => p.gear.has(g.id)).map(g => `<span class="fact neutral">${esc(g.label)}</span>`).join('') : ''}
        ${ages.map(a => `<span class="fact neutral">${esc(AGES.find(x => x.id === a)?.label || a)}</span>`).join('')}</div>`
      : '<p class="muted text">Zu diesem Ort wissen wir noch wenig.</p>'}
    </div>
    ${placeOffersHtml(id)}
    ${extra.length ? `<div class="sec">${extra.map(x => `<p class="text">${x}</p>`).join('')}</div>` : ''}
    ${addr || web || f.phone ? `<div class="sec"><h4>Kontakt</h4>${addr ? `<p class="text">${esc(addr)}</p>` : ''}
      ${f.phone ? `<p class="text">Telefon: <span style="user-select:all">${esc(f.phone[0])}</span></p>` : ''}
      ${web ? `<p class="text"><a href="${esc(web.startsWith('http') ? web : 'https://' + web)}" target="_blank" rel="noopener">Webseite öffnen</a></p>` : ''}</div>` : ''}
    ${p.hoursRaw ? `<details class="fold"><summary>Öffnungszeiten</summary>${!p.oh ? `<p>${esc(p.hoursRaw)}</p>` : p.oh.always ? '<p>Rund um die Uhr</p>' :
      '<table class="hours">' + p.oh.week.map((r, i) => `<tr class="${i === today ? 'today' : ''}"><td>${DAY_DE[i]}</td><td>${r.length ? r.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : 'geschlossen'}</td></tr>`).join('') + '</table><p class="note">Feiertage noch nicht berücksichtigt.</p>'}</details>` : ''}
    <details class="fold"${reviews.length ? ' open' : ''}><summary>Bewertungen${reviews.length ? ` (${reviews.length})` : ''}</summary>
      <div style="margin-top:8px">${reviews.length ? '' : '<p class="muted text">Noch keine Bewertung.</p>'}
      ${(await Promise.all(reviews.sort((a, b) => b.at - a.at).map(async r => `<div class="review">${r.stars ? `<b class="stars-read">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</b> ` : ''}<span class="muted">${fmtDate(r.at)}</span>
        ${r.text ? `<div>${esc(r.text)}</div>` : ''}${r.photoIds?.length ? `<div class="photos">${await photoTags(r.photoIds)}</div>` : ''}
        <button type="button" class="linkbtn" data-report="${r.id}">Melden</button></div>`))).join('')}
      <button type="button" class="btn" data-rate="${id}" style="margin-top:8px">Bewerten</button></div></details>
    <details class="fold"><summary>Woher stammen die Infos?</summary><div style="margin-top:8px">
      ${known.map(([a, r]) => `<div class="srcrow"><b>${esc(a.label)}</b><span>${r.v === 'yes' ? 'Ja' : r.v === 'no' ? 'Nein' : 'Eingeschränkt'}</span>
        <span class="s">${r.method === 'user' ? `Von Nutzern bestätigt (${r.confirmations.length}×, zuletzt ${fmtDate(r.confirmations[0].at)}, auf diesem Gerät)` : r.method === 'website' ? `Webseite des Ortes, automatisch gelesen (${Math.round((r.conf || .6) * 100)} % sicher)` : r.method === 'computed' ? 'Aus Kartendaten berechnet' : esc(r.src || '')}</span>
        ${r.evidence ? `<q>${esc(r.evidence)}</q>` : ''}</div>`).join('')}
      <p class="note">Datensätze: ${p.srcs.map(i => esc(SOURCES[i]?.[1]) + ' (' + esc(SOURCES[i]?.[2]) + ')').join(' · ') || 'von dir eingetragen'}</p></div></details>
    <p class="note" style="margin-top:16px">Prototyp: Deine Angaben werden bisher nur auf diesem Gerät gespeichert.</p>`;
}
function placeOffersHtml(id) {
  const list = (offersByPlace.get(id) || []).map(o => [nextDate(o), o]).filter(([d]) => d).sort((a, b) => a[0] - b[0]);
  if (!list.length) return '';
  const fitsFirst = list.sort((a, b) => (offerFits(b[1]) === true) - (offerFits(a[1]) === true) || a[0] - b[0]);
  return `<div class="sec"><h4>Gruppen & Kurse</h4><ol class="list">${fitsFirst.slice(0, 8).map(([d, o]) => offerItem(o, d).replace('class="item offer" data-id', `class="item offer" data-offerurl="${esc(o.url)}" data-x`)).join('')}</ol>
    ${list.length > 8 ? `<p class="note">und ${list.length - 8} weitere</p>` : ''}<p class="note">Anmeldung und aktuelle Infos beim Anbieter.</p></div>`;
}
function bindDetail(id) { /* actions handled by the global click handler */ }

// rating
function rateView(id) {
  const p = byId.get(id);
  return `${head('Bewerten', esc(p.name))}
    <form id="rateForm"><div class="stars" role="group" aria-label="Sterne">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${n} Sterne">★</button>`).join('')}</div>
    <div class="field"><label for="revText">Kommentar</label><textarea id="revText" maxlength="500" placeholder="Was sollten andere Eltern wissen?"></textarea></div>
    <div class="field"><label for="revPhoto">Foto (optional)</label><input id="revPhoto" type="file" accept="image/*"><p class="hint-kids">Bitte keine Gesichter von Kindern fotografieren.</p></div>
    <p class="error" id="revErr" hidden></p>
    <div class="sticky-bar"><button type="submit" class="btn big sun">Speichern</button></div></form>`;
}
function bindRate(id) {
  let stars = 0;
  const body = $('#panelBody');
  body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { stars = +b.dataset.star; body.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= stars)); });
  $('#rateForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#revErr');
    if (!stars) { err.textContent = 'Bitte vergib 1 bis 5 Sterne.'; err.hidden = false; return; }
    const photoIds = [], file = $('#revPhoto').files[0];
    if (file) {
      if (!file.type.startsWith('image/')) { err.textContent = 'Bitte wähle ein Bild aus (JPG oder PNG).'; err.hidden = false; return; }
      try { const pid = uid('ph_'); await photoDB.put(pid, await compressPhoto(file)); photoIds.push(pid); }
      catch (x) { err.textContent = 'Das Foto konnte nicht gespeichert werden. Versuch es ohne Foto.'; err.hidden = false; return; }
    }
    store.reviews.push({ id: uid('r_'), placeId: id, stars, text: $('#revText').value.trim(), photoIds, at: Date.now() });
    save(); toast('Bewertung gespeichert.'); back();
  };
}

// filters
function filtersView() {
  const first = [...state.groups][0];
  const fits = a => !a.groups || !state.groups.size || [...state.groups].some(g => a.groups.includes(g));
  const count = id => { let n = 0; for (const p of places) if (inSelection(p) && filterVal(p, id) === true) n++; return n; };
  const block = (title, items) => items.length ? `<div class="sec"><h4>${title}</h4><div class="fgrid">${items.map(x => `<button type="button" class="chip${state.filters.has(x.id) ? ' on' : ''}" data-filter="${x.id}">${esc(x.label)} <span class="n">${nf.format(count(x.id))}</span></button>`).join('')}</div></div>` : '';
  const total = last.match.length + (state.showUnknown ? last.unknown.length : 0);
  return `${head('Filter', state.groups.size ? 'für ' + [...state.groups].map(g => GROUP[g].label).join(', ') : 'für alle Orte')}
    <p class="muted text">Die Zahl zeigt, wie viele Orte die Angabe sicher haben.</p>
    ${block('Öffnungszeiten', TIME_FILTERS)}
    ${block('Ausstattung', ATTRS.filter(fits))}
    ${!state.groups.size || state.groups.has('spielplatz') ? block('Spielgeräte', GEAR) : ''}
    <label class="switch" for="unkSwitch">Orte ohne Angabe blass zeigen <input type="checkbox" id="unkSwitch" ${state.showUnknown ? 'checked' : ''}></label>
    <div class="sticky-bar"><button type="button" class="btn" data-reset="1">Zurücksetzen</button><button type="button" class="btn big primary" data-home="half">${nf.format(total)} Orte zeigen</button></div>`;
}
function groupsView() {
  return `${head('Alle Kategorien')}
    <div class="groupgrid">${GROUPS.map(g => `<button type="button" class="cat${state.groups.has(g.id) ? ' on' : ''}" data-group="${g.id}" style="--c:${g.color}"><span class="ic">${svg(g.icon, '')}</span>${esc(g.label)}</button>`).join('')}</div>
    <div class="sticky-bar"><button type="button" class="btn big primary" data-home="half">Fertig</button></div>`;
}

// search
function searchView() {
  const q = $('#q').value.trim().toLowerCase();
  if (!q) return `${head('Schnelle Fragen', 'Tippe eine an oder suche oben nach Namen')}
    <ol class="list">${PRESETS.map(p => `<li><button type="button" class="item" data-preset="${p.id}"><span class="badge" style="--c:var(--brand)">${svg(p.icon, '')}</span><span><h3>${esc(p.label)}</h3></span><span></span></button></li>`).join('')}</ol>`;
  const gs = GROUPS.filter(g => g.label.toLowerCase().includes(q));
  const fs = ATTRS.filter(a => a.label.toLowerCase().includes(q));
  const o = origin();
  const ps = places.filter(p => p.name.toLowerCase().includes(q)).map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]).slice(0, 25);
  return `${head('Suche', `„${esc(q)}“`)}
    ${gs.length || fs.length ? `<div class="fgrid" style="margin-bottom:10px">${gs.map(g => `<button type="button" class="chip" data-group-only="${g.id}">${esc(g.label)}</button>`).join('')}${fs.map(a => `<button type="button" class="chip" data-filter-only="${a.id}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    ${ps.length ? `<ol class="list">${ps.map(([d, p]) => itemHtml(p, d)).join('')}</ol>` : '<div class="empty"><b>Nichts gefunden.</b>Versuch einen anderen Namen.</div>'}`;
}

// urgent
const SOS = [
  { id: 'wc', label: 'Toilette', title: 'Nächste Toilette', icon: 'toilet', color: '#0C8599', test: p => (p.cat === 'wc' || attrVal(p, 'toilette').v === 'yes') && isOpen(p.oh) !== false, hint: 'öffentlich oder im Café' },
  { id: 'wickeln', label: 'Wickeltisch', title: 'Nächster Wickeltisch', icon: 'baby', color: '#0CA678', test: p => attrVal(p, 'wickeltisch').v === 'yes' && isOpen(p.oh) !== false, hint: 'sicher bekannte Plätze' },
  { id: 'windeln', label: 'Windeln', title: 'Windeln: nächster offener Laden', icon: 'bag', color: '#1971C2', test: p => (p.cat === 'windeln' || p.cat === 'apotheke') && isOpen(p.oh) === true, hint: 'jetzt geöffnet' },
  { id: 'apotheke', label: 'Apotheke', title: 'Nächste offene Apotheke', icon: 'pill', color: '#E03131', test: p => p.cat === 'apotheke' && isOpen(p.oh) === true, hint: 'jetzt geöffnet' },
];
function sosView(kind) {
  const calls = `<div class="calls"><b style="font-family:var(--font-display)">Medizinischer Notfall</b>
    <span>Notruf: <b>112</b></span><span>Kinderärztlicher Bereitschaftsdienst: <b>116 117</b></span><span>Giftnotruf Nord: <b>0551 19240</b></span></div>`;
  if (!kind) return `${head('Was braucht ihr jetzt?', state.me ? 'Ab deinem Standort' : 'Ab Kartenmitte · Standort freigeben für genauere Wege')}
    <div class="sosgrid">${SOS.map(s => `<button type="button" class="sostile" data-sos="${s.id}"><span class="ic" style="--c:${s.color}">${svg(s.icon)}</span><span>${s.label}<small>${s.hint}</small></span></button>`).join('')}</div>${calls}`;
  const s = SOS.find(x => x.id === kind), o = origin();
  const near = [];
  for (const p of places) {
    if (Math.abs(p.lat - o[0]) > 0.03 || Math.abs(p.lon - o[1]) > 0.05) continue;
    if (s.test(p)) near.push([dist(o, [p.lat, p.lon]), p]);
  }
  near.sort((a, b) => a[0] - b[0]);
  if (!near.length) return `${head(s.label)}<div class="empty"><b>Nichts in der Nähe bekannt.</b>Zoom raus oder versuch eine andere Kachel.</div>${calls}`;
  const [d, p] = near[0];
  return `${head(s.title, state.me ? 'Ab deinem Standort' : 'Ab Kartenmitte')}
    <div class="best"><span class="muted">${esc(CAT_LABEL[p.cat] || '')}</span><b style="font-size:18px">${esc(p.name)}</b>
      <span class="mins">${walkMin(d)} Min.</span><span class="muted">${fmtDist(d)} zu Fuß${p.oh ? ' · ' : ''}${openText(p)}</span>
      <a class="btn big primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${svg('route')}Route starten</a>
      <button type="button" class="btn" data-id="${p.id}">Details</button></div>
    ${near.length > 1 ? `<div class="sec"><h4>Weitere in der Nähe</h4><ol class="list">${near.slice(1, 5).map(([dd, pp]) => itemHtml(pp, dd)).join('')}</ol></div>` : ''}${calls}`;
}

// events
function nextDow(dow, plusWeeks = 0) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7) + plusWeeks * 7); return d; }
const EXAMPLE_EVENTS = [
  { d: nextDow(6), time: '10:00–13:00', title: 'Kinderflohmarkt von Eltern für Eltern', where: 'Eimsbüttel', kind: 'Flohmarkt' },
  { d: nextDow(3), time: '16:00', title: 'Bilderbuchkino ab 3 Jahren', where: 'Bücherhalle', kind: 'Lesen' },
  { d: nextDow(0), time: '11:00', title: 'Familienkonzert: Klassik für Kleine', where: 'Konzertsaal', kind: 'Musik' },
  { d: nextDow(6, 1), time: '09:00–14:00', title: 'Kinderkleiderbasar Herbst/Winter', where: 'Winterhude', kind: 'Flohmarkt' },
];
function eventsView() {
  const v = view(), f = v.f || 'alle', fam = v.fam ?? hasFamily();
  const t = today0(), sat = new Date(t); sat.setDate(t.getDate() + ((5 - dayIdx(t) + 7) % 7)); const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  const own = store.events.map(e => ({ title: e.title, kind: 'termin', start_date: e.date, time_from: e.time, lat: e.lat, lon: e.lon, venue: 'von dir eingetragen', url: '#', topic: 'sonstiges' }));
  let list = OFFERS.concat(own).map(o => [nextDate(o), o]).filter(([d]) => d && d - t < 56 * 864e5);
  if (f === 'heute') list = list.filter(([d]) => +d === +t);
  if (f === 'wochenende') list = list.filter(([d]) => +d === +sat || +d === +sun);
  if (f === 'gruppen') list = list.filter(([, o]) => o.kind === 'gruppe');
  if (f === 'kurse') list = list.filter(([, o]) => o.kind === 'kurs');
  if (f === 'termine') list = list.filter(([, o]) => o.kind === 'termin');
  if (fam && hasFamily()) list = list.filter(([, o]) => offerFits(o) !== false);
  const o0 = origin();
  const near = o => { const pl = o.place_id && byId.get(o.place_id); return pl ? dist(o0, [pl.lat, pl.lon]) : o.lat ? dist(o0, [o.lat, o.lon]) : 9e9; };
  list.sort((a, b) => a[0] - b[0] || near(a[1]) - near(b[1]));
  const chips = [['alle', 'Alle'], ['heute', 'Heute'], ['wochenende', 'Wochenende'], ['gruppen', 'Offene Gruppen'], ['kurse', 'Kurse'], ['termine', 'Veranstaltungen']]
    .map(([id, l]) => `<button type="button" class="chip${f === id ? ' on' : ''}" data-ef="${id}">${l}</button>`).join('');
  const kids = familyAges();
  return `${head('Termine', 'Gruppen, Kurse und Veranstaltungen in den nächsten 8 Wochen', false)}
    <div class="row" style="padding:0 0 10px;margin:0 -2px">${chips}</div>
    ${hasFamily() ? `<label class="switch" for="famSwitch" style="margin:0 0 10px">Nur passend für ${esc(kids.map(k => `${k.name} (${kidLabel(k.months)})`).join(', ') || 'unser Baby')} <input type="checkbox" id="famSwitch" ${fam ? 'checked' : ''}></label>`
      : `<button type="button" class="askcard" data-tab="me" style="width:100%;border:0;text-align:left"><div><b>Alter deiner Kinder eintragen</b><span>Dann zeigen wir nur Gruppen und Kurse, die passen.</span></div>${svg('back')}</button>`}
    ${list.length ? `<ol class="list">${list.slice(0, v.limit || 60).map(([d, o]) => offerItem(o, d)).join('')}</ol>${list.length > (v.limit || 60) ? '<button type="button" class="more" data-emore="1">Mehr anzeigen</button>' : ''}`
      : `<div class="empty"><b>${OFFERS.length ? 'Nichts gefunden.' : 'Noch keine Termine geladen.'}</b>${OFFERS.length ? 'Probier einen anderen Filter.' : ''}</div>`}
    <button type="button" class="btn" data-addevent="1" style="margin-top:14px">${svg('plus')}Veranstaltung eintragen</button>
    <p class="note">Quellen: Eltern-Kind-Zentren, Elternschulen, Familienbildung, Bücherhallen, Bäderland u. a. Anmeldung immer beim Anbieter.</p>`;
}
function savedView() {
  const o = origin();
  const ps = store.favorites.map(id => byId.get(id)).filter(Boolean);
  const pr = store.profile, now = new Date();
  const maxYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `${head('Meins', 'Nur auf diesem Gerät gespeichert', false)}
    <div class="sec"><h4>Unsere Familie</h4>
      <p class="muted text">Mit dem Alter deiner Kinder zeigt Djuu passende Gruppen, Kurse und Orte. Wir fragen nur Monat und Jahr, nicht den genauen Geburtstag.</p>
      <div id="kids">${pr.kids.map((k, i) => `<div class="kidrow">
        <input id="kidName${i}" data-kid="${i}" data-k="name" value="${esc(k.name || '')}" placeholder="Name (optional)" maxlength="20" aria-label="Name von Kind ${i + 1}">
        <input id="kidYm${i}" data-kid="${i}" data-k="ym" type="month" value="${esc(k.ym || '')}" max="${maxYm}" aria-label="Geburtsmonat von Kind ${i + 1}">
        <button type="button" class="round" data-delkid="${i}" aria-label="Kind entfernen">${svg('close')}</button></div>`).join('')}</div>
      <button type="button" class="btn" data-addkid="1">${svg('plus')}Kind hinzufügen</button>
      <div class="field"><label for="expecting">Baby unterwegs? Errechneter Monat (optional)</label><input id="expecting" type="month" value="${esc(pr.expecting || '')}" min="${maxYm}"></div>
      <div class="field"><label for="dogs">Hunde in der Familie</label>
        <div class="stepper"><button type="button" data-dogs="-1" aria-label="Weniger">–</button><b id="dogsN">${pr.dogs || 0}</b><button type="button" data-dogs="1" aria-label="Mehr">+</button></div></div>
      <p class="note">Wenn ihr einen Hund habt, zeigt Djuu „Hunde erlaubt“ immer direkt mit an.</p>
    </div>
    <div class="sec"><h4>Gemerkt</h4>
    ${ps.length ? `<ol class="list">${ps.map(p => itemHtml(p, dist(o, [p.lat, p.lon]))).join('')}</ol>`
    : `<p class="muted text">Noch nichts gemerkt. Tippe bei einem Ort auf „Merken“.</p>`}</div>`;
}
function saveProfileField(el) {
  const pr = store.profile;
  if (el.dataset.kid != null) pr.kids[+el.dataset.kid][el.dataset.k] = el.value.trim();
  if (el.id === 'expecting') pr.expecting = el.value;
  save(); renderTop();
}

// ---------- Add-place wizard (3 steps, one-handed) ----------
const WIZ_TYPES = [
  { id: 'spielplatz', label: 'Spielplatz', cat: 'spielplatz', icon: 'playground', attrs: ['kleinkind', 'eingezaeunt', 'schatten', 'wc_nahe', 'wasser'] },
  { id: 'essen', label: 'Café / Restaurant', cat: 'cafe', icon: 'cup', attrs: ['hochstuhl', 'wickeltisch', 'spielecke', 'kindermenue', 'kinderwagen'] },
  { id: 'laden', label: 'Laden', cat: 'windeln', icon: 'bag', attrs: ['windeln', 'sonntag_user'] },
  { id: 'service', label: 'Wickeln, Stillen, WC', cat: 'wickel', icon: 'baby', attrs: ['wickeltisch', 'stillen', 'toilette'] },
  { id: 'event', label: 'Veranstaltung', cat: 'event', icon: 'cal', attrs: [] },
];
const COMMON_ATTRS = ['drinnen', 'kinderwagen', 'hund', 'kostenlos'];
const EXTRA_ATTR = { sonntag_user: { id: 'sonntag_user', label: 'Sonntags geöffnet' } };
const wizAttr = id => ATTR[id] || EXTRA_ATTR[id];
const wiz = { step: 1, data: null, map: null };

function startWizard({ place, type } = {}) {
  clearSel();
  const t = place ? (WIZ_TYPES.find(w => w.id === groupOf(place).id || w.cat === place.cat) || null) : null;
  wiz.data = { placeId: place?.id || null, isNew: !place, type: type || t?.id || (place ? 'service' : null), name: place?.name || '',
               lat: place?.lat ?? map.getCenter().lat, lon: place?.lon ?? map.getCenter().lng, attrs: {}, ages: [], comment: '',
               stars: 0, hours: '', photo: null, eventDate: '', eventTime: '', locating: !place };
  wiz.step = 1;
  go({ type: 'wizard' }, 'full');
  if (!place && navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => {
    if (!wiz.data || !wiz.data.locating) return;
    wiz.data.lat = pos.coords.latitude; wiz.data.lon = pos.coords.longitude; wiz.data.locating = false;
    if (wiz.map) { wiz.map.setView([wiz.data.lat, wiz.data.lon], 18); wiz.pin.setLatLng([wiz.data.lat, wiz.data.lon]); }
    const n = $('#wizLocNote'); if (n) n.textContent = 'Per GPS gesetzt. Zieh den Pin, falls er nicht genau stimmt.';
  }, () => { if (wiz.data) wiz.data.locating = false; const n = $('#wizLocNote'); if (n) n.textContent = 'Kein GPS. Zieh den Pin an die richtige Stelle.'; }, { enableHighAccuracy: true, timeout: 8000 });
}
const wizHeader = () => `<div class="progress"><span>Schritt ${Math.min(wiz.step, 3)} von 3</span><div class="bar"><i style="width:${Math.min(wiz.step, 3) / 3 * 100}%"></i></div></div>`;
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
    html = `${head(d.isNew ? 'Ort hinzufügen' : 'Infos ergänzen', d.isNew ? '' : esc(d.name))}${wizHeader()}
      ${d.isNew ? `<div class="minimap" id="wizMap" aria-label="Position auf der Karte"></div>
        <p class="note" id="wizLocNote">${d.locating ? 'Suche deine Position …' : 'Zieh den Pin an die richtige Stelle.'}</p>` : ''}
      <div class="sec"><h4>Was ist es?</h4>
      <div class="typegrid">${WIZ_TYPES.filter(t => d.isNew || t.id !== 'event').map(t => `<button type="button" class="typebtn${d.type === t.id ? ' on' : ''}" data-type="${t.id}">${svg(t.icon)}<span>${esc(t.label)}</span></button>`).join('')}</div></div>
      ${d.isNew ? `<div class="field"><label for="wizName">Name</label><input id="wizName" autocomplete="off" value="${esc(d.name)}" placeholder="z. B. Spielplatz am Weiher" maxlength="80">
        <div class="suggest" id="wizSuggest"></div></div>` : ''}
      ${d.type === 'event' ? `<div class="row2"><div class="field"><label for="wizDate">Datum</label><input id="wizDate" type="date" value="${esc(d.eventDate)}"></div>
        <div class="field"><label for="wizTime">Uhrzeit</label><input id="wizTime" type="time" value="${esc(d.eventTime)}"></div></div>` : ''}
      <div class="field"><label for="wizPhoto">Foto (optional)</label><input id="wizPhoto" type="file" accept="image/*" capture="environment">
        ${d.photo ? '<img class="preview" src="' + d.photo + '" alt="Vorschau">' : ''}<p class="hint-kids">Bitte keine Gesichter von Kindern zeigen.</p></div>`;
  } else if (wiz.step === 2) {
    const own = type?.attrs || [];
    html = `${head('Was gibt es hier?', 'Nur antippen, was du sicher weißt')}${wizHeader()}
      ${own.length ? `<div class="sec"><h4>${esc(type.label)}</h4>${own.map(triRow).join('')}</div>` : ''}
      <div class="sec"><h4>Für alle Orte</h4>${COMMON_ATTRS.filter(a => !own.includes(a)).map(triRow).join('')}</div>`;
  } else if (wiz.step === 3) {
    html = `${head('Noch etwas?', 'Alles freiwillig')}${wizHeader()}
      <div class="sec"><h4>Für welches Alter passt es am besten?</h4>
      <div class="agegrid">${AGES.map(a => `<button type="button" class="chip${d.ages.includes(a.id) ? ' on' : ''}" data-age="${a.id}">${a.label}</button>`).join('')}</div></div>
      <div class="sec"><h4>Bewertung</h4>
      <div class="stars" role="group" aria-label="Sterne">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-wstar="${n}" class="${n <= d.stars ? 'on' : ''}" aria-label="${n} Sterne">★</button>`).join('')}</div></div>
      <div class="field"><label for="wizComment">Kurzer Kommentar</label><input id="wizComment" maxlength="140" value="${esc(d.comment)}" placeholder="z. B. Toller Sandkasten, wenig Schatten"></div>
      ${d.type !== 'event' ? `<div class="field"><label for="wizHours">Öffnungszeiten (nur wenn bekannt)</label><input id="wizHours" value="${esc(d.hours)}" placeholder="Mo-Fr 09:00-18:00; Sa 10:00-16:00"></div>` : ''}`;
  } else {
    const ans = Object.entries(d.attrs).filter(([, v]) => v !== 'unknown');
    html = `${head('Alles richtig?')}
      <dl class="summary">
        <dt>Art</dt><dd>${esc(type?.label || '–')}</dd><dt>Name</dt><dd>${esc(d.name || '–')}</dd>
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
    <div class="sticky-bar">
      ${wiz.step > 1 ? '<button type="button" class="btn" id="wizBack">Zurück</button>' : ''}
      ${wiz.step === 2 || wiz.step === 3 ? '<button type="button" class="btn ghost" id="wizSkip">Überspringen</button>' : ''}
      <button type="button" class="btn big sun" id="wizNext">${wiz.step === 4 ? 'Speichern' : 'Weiter'}</button></div>`;
  $('#panelBody').innerHTML = html;
  $('#panelBody').scrollTop = 0;
  bindWizard();
}
function bindWizard() {
  const d = wiz.data;
  if (wiz.step === 1 && d.isNew) {
    wiz.map = L.map('wizMap', { zoomControl: false, attributionControl: false, maxZoom: 19 }).setView([d.lat, d.lon], 17);
    L.maplibreGL({ style: styleUrl(), attribution: '' }).addTo(wiz.map);
    wiz.pin = L.marker([d.lat, d.lon], { draggable: true, icon: L.divIcon({ className: '', iconSize: [30, 30], html: `<div class="mk" style="--c:#E8590C;background:#FFC83D;color:#3A2A00">${svg('plus', '')}</div>` }) }).addTo(wiz.map);
    wiz.pin.on('dragend', () => { const ll = wiz.pin.getLatLng(); d.lat = ll.lat; d.lon = ll.lng; d.locating = false; });
    wiz.map.on('click', e => { wiz.pin.setLatLng(e.latlng); d.lat = e.latlng.lat; d.lon = e.latlng.lng; d.locating = false; });
    setTimeout(() => wiz.map && wiz.map.invalidateSize(), 300);
    const inp = $('#wizName');
    inp.oninput = () => {
      d.name = inp.value;
      $('#wizSuggest').innerHTML = nameSuggestions(inp.value).map(([m, p]) => `<button type="button" data-sug="${p.id}"><b>${esc(p.name)}</b> <span class="muted">${esc(CAT_LABEL[p.cat] || '')} · ${fmtDist(m)}</span></button>`).join('');
      $('#wizSuggest').querySelectorAll('[data-sug]').forEach(b => b.onclick = () => {
        const p = byId.get(b.dataset.sug);
        Object.assign(d, { placeId: p.id, isNew: false, name: p.name, lat: p.lat, lon: p.lon });
        d.type = d.type || WIZ_TYPES.find(w => w.id === groupOf(p).id)?.id || 'service';
        toast('Den Ort gibt es schon. Du ergänzt jetzt seine Infos.');
        renderWizard();
      });
    };
  }
  const body = $('#panelBody');
  body.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { keepFields(); d.type = b.dataset.type; renderWizard(); });
  body.querySelectorAll('[data-tri]').forEach(b => b.onclick = () => { d.attrs[b.dataset.tri] = b.dataset.v; renderWizard(); });
  body.querySelectorAll('[data-age]').forEach(b => b.onclick = () => { keepFields(); d.ages = d.ages.includes(b.dataset.age) ? d.ages.filter(x => x !== b.dataset.age) : d.ages.concat(b.dataset.age); renderWizard(); });
  body.querySelectorAll('[data-wstar]').forEach(b => b.onclick = () => { keepFields(); d.stars = d.stars === +b.dataset.wstar ? 0 : +b.dataset.wstar; renderWizard(); });
  const photo = $('#wizPhoto');
  if (photo) photo.onchange = async () => {
    const file = photo.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) return wizError('Bitte wähle ein Bild aus (JPG oder PNG).');
    try { keepFields(); d.photo = await compressPhoto(file); renderWizard(); } catch (e) { wizError('Das Foto konnte nicht gelesen werden. Versuch ein anderes.'); }
  };
  $('#wizBack') && ($('#wizBack').onclick = () => { keepFields(); wiz.step--; renderWizard(); });
  $('#wizSkip') && ($('#wizSkip').onclick = () => { keepFields(); wiz.step++; renderWizard(); });
  $('#wizNext').onclick = wizNext;
}
function keepFields() {
  const d = wiz.data;
  for (const [id, k] of [['wizComment', 'comment'], ['wizHours', 'hours'], ['wizDate', 'eventDate'], ['wizTime', 'eventTime'], ['wizName', 'name']]) { const el = $('#' + id); if (el) d[k] = el.value; }
}
function wizError(msg) { const e = $('#wizErr'); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); }
function wizNext() {
  const d = wiz.data;
  keepFields();
  if (wiz.step === 1) {
    if (!d.type) return wizError('Bitte wähle aus, was für ein Ort es ist.');
    if (d.isNew && d.name.trim().length < 2) return wizError('Bitte gib einen Namen ein (mindestens 2 Zeichen).');
    if (d.isNew && !(d.lat > 53.39 && d.lat < 53.75 && d.lon > 9.72 && d.lon < 10.33)) return wizError('Der Pin liegt außerhalb von Hamburg. Bitte verschieb ihn.');
    if (d.type === 'event') {
      if (!d.eventDate) return wizError('Bitte gib das Datum der Veranstaltung an.');
      if (new Date(d.eventDate) < new Date(new Date().toDateString())) return wizError('Das Datum liegt in der Vergangenheit.');
    }
  }
  if (wiz.step === 3 && d.hours.trim() && !parseOH(d.hours.trim())) return wizError('Die Öffnungszeiten verstehe ich nicht. Zum Beispiel: Mo-Fr 09:00-18:00; Sa 10:00-16:00');
  if (wiz.step < 4) { wiz.step++; return renderWizard(); }
  saveWizard();
}
async function saveWizard() {
  const d = wiz.data, type = WIZ_TYPES.find(t => t.id === d.type);
  for (const a of (type?.attrs || []).concat(COMMON_ATTRS)) if (!d.attrs[a]) d.attrs[a] = 'unknown'; // "Weiß nicht" stored explicitly
  const photoIds = [];
  if (d.photo) { try { const id = uid('ph_'); await photoDB.put(id, d.photo); photoIds.push(id); } catch (e) { toast('Foto konnte nicht gespeichert werden.'); } }
  if (d.type === 'event') {
    store.events.push({ id: uid('e_'), title: d.name.trim(), date: d.eventDate, time: d.eventTime, lat: d.lat, lon: d.lon, attrs: d.attrs, ages: d.ages, comment: d.comment.trim(), photoIds, createdAt: Date.now() });
  } else {
    const placeId = d.placeId || uid('u_');
    store.contributions.push({ id: uid('c_'), placeId, isNew: d.isNew, type: d.type, cat: type.cat, name: d.name.trim(), lat: d.lat, lon: d.lon, attrs: d.attrs, ages: d.ages, hours: d.hours.trim(), photoIds, createdAt: Date.now() });
    if (d.stars || d.comment.trim()) store.reviews.push({ id: uid('r_'), placeId, stars: d.stars || 0, text: d.comment.trim(), photoIds: [], at: Date.now() });
    d.placeId = placeId;
  }
  save(); addUserPlaces();
  const p = byId.get(d.placeId), area = p?.district || nearestDistrict(d.lat, d.lon);
  wiz.data = null;
  refresh();
  stack = [{ type: 'list' }];
  go({ type: 'thanks', html: `<div class="thanks"><svg viewBox="0 0 24 24" width="64" height="64" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#FFC83D"/><path d="M7 12.5l3.2 3L17 9" stroke="#3A2A00" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>Danke!</h2><p>Dein Eintrag hilft Familien${area ? ' in ' + esc(area) : ' in Hamburg'}.</p>
    <p class="note">Im Prototyp ist er erst auf deinem Gerät gespeichert. Mit dem Djuu-Server sehen ihn bald alle.</p>
    <div style="display:flex;gap:8px;margin-top:10px">${p ? `<button type="button" class="btn primary" data-id="${p.id}">Ort ansehen</button>` : ''}<button type="button" class="btn" data-home="peek">Fertig</button></div></div>` }, desktop() ? 'full' : 'half');
}
function nearestDistrict(la, lo) {
  let best = null, bd = 1500;
  for (const p of places) if (p.district && Math.abs(p.lat - la) < 0.01 && Math.abs(p.lon - lo) < 0.015) { const m = dist([la, lo], [p.lat, p.lon]); if (m < bd) { bd = m; best = p.district; } }
  return best;
}

// ---------- Tabs ----------
const TABS = [
  { id: 'map', label: 'Karte', icon: 'map' },
  { id: 'events', label: 'Termine', icon: 'cal' },
  { id: 'add', label: 'Eintragen', icon: 'plus', cls: 'add' },
  { id: 'me', label: 'Meins', icon: 'user' },
];
function setTab(id) {
  state.tab = id;
  $('#tabs').innerHTML = TABS.map(t => `<button type="button" class="${t.cls || ''}${state.tab === t.id ? ' on' : ''}" data-tab="${t.id}">${svg(t.icon)}${t.label}</button>`).join('');
}

// ---------- Global interaction ----------
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-expand]'); if (!t) return;
  const ds = t.dataset;
  if (ds.group) { toggle(state.groups, ds.group); state.preset = null; state.listLimit = 40; refresh(); if (view().type === 'groups') renderPanel(); else if (view().type !== 'list') home('half'); else setSize(desktop() ? 'full' : 'half'); }
  else if (ds.groupOnly) { state.groups = new Set([ds.groupOnly]); state.q = ''; $('#q').value = ''; refresh(); home('half'); }
  else if (ds.filterOnly) { state.filters.add(ds.filterOnly); state.q = ''; $('#q').value = ''; refresh(); home('half'); }
  else if (ds.filter) { toggle(state.filters, ds.filter); state.preset = null; refresh(); if (view().type === 'list') setSize(desktop() ? 'full' : 'half'); }
  else if (ds.preset) { const p = PRESETS.find(x => x.id === ds.preset); state.preset = p.id; state.groups = new Set(p.groups); state.cats = new Set(p.cats || []); state.filters = new Set(p.filters); state.q = ''; $('#q').value = ''; $('#q').blur(); refresh(); home('half'); }
  else if (ds.open === 'filters') go({ type: 'filters' });
  else if (ds.open === 'groups') go({ type: 'groups' });
  else if (ds.clearq) { state.q = ''; $('#q').value = ''; refresh(); }
  else if (ds.unk) { state.showUnknown = !state.showUnknown; refresh(); }
  else if (ds.reset) { state.filters.clear(); state.groups.clear(); state.cats.clear(); state.preset = null; state.showUnknown = false; refresh(); renderPanel(); }
  else if (ds.more) { state.listLimit += 40; renderPanel(); }
  else if (ds.expand) { if ($('#panel').dataset.size === 'peek') setSize('half'); }
  else if (ds.id) { const p = byId.get(ds.id); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16)); showPlace(p.id); }
  else if (ds.back) back();
  else if (ds.home) home(ds.home === '1' ? (desktop() ? 'full' : 'peek') : ds.home);
  else if (ds.tab) {
    if (ds.tab === 'map') home(desktop() ? 'full' : 'half');
    else if (ds.tab === 'add') startWizard();
    else { stack = [{ type: 'list' }]; go({ type: ds.tab }, 'full'); setTab(ds.tab); }
  }
  else if (ds.fav) { const i = store.favorites.indexOf(ds.fav); i >= 0 ? store.favorites.splice(i, 1) : store.favorites.push(ds.fav); save(); toast(i >= 0 ? 'Nicht mehr gemerkt.' : 'Gemerkt. Du findest den Ort unter „Meins“.'); renderPanel(); }
  else if (ds.share) {
    const p = byId.get(ds.share), url = location.origin + location.pathname + '#' + p.id;
    if (navigator.share) navigator.share({ title: p.name, text: p.name + ' auf Djuu', url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast('Link kopiert.'), () => toast(url));
  }
  else if (ds.addinfo) startWizard({ place: byId.get(ds.addinfo) });
  else if (ds.addevent) startWizard({ type: 'event' });
  else if (ds.rate) go({ type: 'rate', id: ds.rate });
  else if (ds.ef) { view().f = ds.ef; view().limit = 60; renderPanel(); }
  else if (ds.emore) { view().limit = (view().limit || 60) + 60; renderPanel(); }
  else if (ds.offerurl) window.open(ds.offerurl, '_blank', 'noopener');
  else if (ds.addkid) { store.profile.kids.push({ name: '', ym: '' }); save(); renderPanel(); setTimeout(() => $('#kidYm' + (store.profile.kids.length - 1))?.focus(), 50); }
  else if (ds.delkid) { store.profile.kids.splice(+ds.delkid, 1); save(); renderPanel(); }
  else if (ds.dogs) { store.profile.dogs = Math.max(0, Math.min(9, (store.profile.dogs || 0) + +ds.dogs)); save(); $('#dogsN').textContent = store.profile.dogs; renderTop(); }
  else if (ds.report) { store.reports.push({ targetType: 'review', targetId: ds.report, at: Date.now() }); save(); toast('Gemeldet und ausgeblendet. Mit dem Server geht die Meldung später an das Djuu-Team.'); renderPanel(); }
  else if (ds.sos) go({ type: 'sos', kind: ds.sos });
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-kid], #expecting')) saveProfileField(e.target);
  if (e.target.id === 'famSwitch') { view().fam = e.target.checked; renderPanel(); }
});
$('#sos').innerHTML = svg('bolt') + '<span>Dringend</span>';
$('#sos').onclick = () => { stack = [{ type: 'list' }]; go({ type: 'sos' }, 'full'); locate(false); };
$('#locate').innerHTML = svg('locate');
$('#locate').onclick = () => locate(true);
const qEl = $('#q');
qEl.addEventListener('focus', () => go({ type: 'search' }, 'full'));
let qt; qEl.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { if (view().type === 'search') renderPanel(); }, 150); });
qEl.addEventListener('keydown', e => { if (e.key === 'Enter') { state.q = qEl.value.trim(); qEl.blur(); state.listLimit = 40; refresh(); home('half'); } });

// drag the sheet by its grip (phone)
(() => {
  const grip = $('#grip'); let y0 = null;
  const order = ['peek', 'half', 'full'];
  grip.addEventListener('pointerdown', e => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointerup', e => {
    if (y0 === null) return;
    const dy = e.clientY - y0, i = order.indexOf($('#panel').dataset.size);
    y0 = null;
    if (Math.abs(dy) < 8) return setSize(order[(i + 1) % 3]);
    setSize(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1) * (Math.abs(dy) > 220 ? 2 : 1)))]);
  });
})();

function locate(center) {
  if (!navigator.geolocation) { if (center) toast('Standort wird von diesem Gerät nicht unterstützt.'); return; }
  if (locate.watching) { if (center && state.me) map.setView(state.me, 16); return; }
  let first = true;
  navigator.geolocation.watchPosition(pos => {
    locate.watching = true;
    state.me = [pos.coords.latitude, pos.coords.longitude];
    $('#locate').classList.add('on');
    if (first && center) map.setView(state.me, 16);
    if (!meMarker) meMarker = L.marker(state.me, { interactive: false, icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="me-dot"></div>' }) }).addTo(map);
    else meMarker.setLatLng(state.me);
    if (first || ['list', 'sos'].includes(view().type)) renderPanel();
    first = false;
  }, () => { if (center) toast('Standort nicht verfügbar. Bitte im Browser erlauben.'); }, { enableHighAccuracy: true, maximumAge: 30000 });
}
setInterval(() => { if (state.filters.has('jetzt')) refresh(); }, 60000);
new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', $('#topbar').offsetHeight + 'px')).observe($('#topbar'));
window.addEventListener('resize', () => setSize($('#panel').dataset.size));

// ---------- Boot ----------
setTab('map');
setSize(desktop() ? 'full' : 'peek');
renderTop();
$('#panelBody').innerHTML = '<div class="ph"><h2>Lade Orte …</h2></div>';
(async () => {
  try {
    const res = await fetch('data/places.json');
    if (!res.ok) throw new Error('places.json ' + res.status);
    const data = await res.json();
    SOURCES = data.sources;
    for (const row of data.places) { const p = buildPlace(row); places.push(p); byId.set(p.id, p); }
    addUserPlaces();
    try { const ro = await fetch('data/offers.json'); if (ro.ok) loadOffers(await ro.json()); } catch (e) { /* offers optional */ }
    refresh();
    renderPanel();
    const hash = location.hash.slice(1);
    if (byId.has(hash)) { const p = byId.get(hash); map.setView([p.lat, p.lon], 17); showPlace(hash); }
  } catch (err) {
    $('#panelBody').innerHTML = '<div class="empty"><b>Daten konnten nicht geladen werden.</b>Bitte Seite neu laden.</div>';
    console.error(err);
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
