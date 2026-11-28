/* Djuu v0.31 – family map for Hamburg.
   The map owns the screen: one chip row floats on top, map buttons on the right, the sheet starts as a slim bar.
   The chip row drills down one level at a time: Erleben or Service, then categories, then the tags of a category.
   A tapped pin opens a small card; search and favorites live in the bottom bar. Default view: playgrounds.
   for list, place details, filters, urgent help, events, saved places and the add-place wizard.
   Data: data/places.json (db/export.py); every value carries its source.
   User input is stored on this device only until the server exists (server-ready shape, see STORE). */
'use strict'; // i18n-skip

const VERSION = '0.73';
const CONTACT = window.DJUU_CONTACT || {}; // config.js: reports and feedback stay hidden until an address is set
// Logo on light backgrounds, as specified in the design PDF.
const LOGO = `<span class="logo" role="img" aria-label="djuu"><span style="color:#6B4EE6">d</span><span style="color:#0E8F84">j</span><span style="color:#D6336C">u</span><span style="color:#CC6A00">u</span>
  <svg viewBox="18 92 78 34" style="position:absolute;right:.225em;top:.84em;width:.482em;height:.21em;overflow:visible" aria-hidden="true"><path d="M20 112 C38 130 66 114 92 97" fill="none" stroke="#0E8F84" stroke-width="9" stroke-linecap="round" stroke-dasharray="0.1 17"/></svg>
  <svg viewBox="-40 -48 80 96" style="position:absolute;right:.04em;top:.39em;width:.42em;height:.5em;overflow:visible" aria-hidden="true"><g transform="rotate(-14 0 44)"><path d="M0 -44 C-24 -44 -36 -26 -36 -10 C-36 14 0 44 0 44 C0 44 36 14 36 -10 C36 -26 24 -44 0 -44 Z" fill="#6B4EE6"/><circle cx="0" cy="-10" r="15" fill="#FFFFFF"/><path d="M-27 -20 Q-26 -33 -15 -38" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity=".55"/></g></svg></span>`;
// Decorative balls (design PDF): flat circles at the edge, only on the start screen, success and empty states; never on the map, never behind text or buttons.
const ball = (pos, d, color, op = 1) => `<div class="ball" style="${pos};width:${d}px;height:${d}px;background:${color}${op === 1 ? '' : ';opacity:' + op}"><i></i></div>`;
const BALLS_THANKS = `<div class="balls" aria-hidden="true">${ball('left:10px;top:14px', 30, '#FFB3CC')}${ball('right:12px;top:30px', 40, '#7FE0D4')}${ball('left:14px;bottom:12px', 48, '#FFD166')}${ball('left:50%;bottom:10px', 24, '#6B4EE6')}${ball('right:18px;bottom:16px', 30, '#C9BDFF')}</div>`;
const BALLS_EMPTY = `<div class="balls" aria-hidden="true">${ball('left:-34px;top:-40px', 90, '#F1ECFF')}${ball('right:10px;top:8px', 30, '#7FE0D4')}${ball('left:12px;bottom:8px', 32, '#FFB3CC')}${ball('right:-30px;bottom:-34px', 92, '#FFD166', .4)}</div>`;
function decorateEmpty(root) { root.querySelectorAll('.empty').forEach(el => { if (!el.querySelector('.balls')) el.insertAdjacentHTML('afterbegin', BALLS_EMPTY); }); }

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
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  sparkle: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  cart: '<path d="M3 4h2.2l2.3 11h10.8l2-8H6.4"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
};
const svg = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;

// ---------- Modes, sub-categories (groups) and categories ----------
// A place has one home group (icon, colour); it can also be a member of other groups (Sanitär: changing tables in cafés;
// Kurse & Gruppen / Events: places with matching offers).
const MODES = [{ id: 'erleben', label: tl('Erleben') }, { id: 'service', label: tl('Service') }];
const GROUPS = [
  { id: 'tipps', mode: 'erleben', label: tl('Djuu-Tipps'), short: tl('Djuu-Tipps'), icon: 'star', color: '#CC6A00', cats: [], virtual: true },
  { id: 'spielen', mode: 'erleben', label: tl('Spielen & Toben'), short: tl('Spielen & Toben'), icon: 'playground', color: '#0E8F84', cats: ['spielplatz', 'abenteuer', 'indoor', 'spielhaus', 'freizeit', 'spielstrasse', 'bolzplatz', 'tischtennis', 'sportstaette', 'sportverein', 'reiten', 'rodeln'] },
  { id: 'gastro', mode: 'erleben', label: tl('Gastro'), short: tl('Gastro'), icon: 'cup', color: '#9C36B5', cats: ['cafe', 'restaurant', 'imbiss', 'eis'] },
  { id: 'entdecken', mode: 'erleben', label: tl('Entdecken'), short: tl('Entdecken'), icon: 'tree', color: '#2F9E44', cats: ['park', 'picknick', 'grillplatz', 'hundeauslauf', 'baden', 'museum', 'kultur', 'ausflug', 'buecherei', 'garten', 'naturschutz', 'tierhof', 'brunnen', 'buecherschrank', 'faehre', 'bootsverleih', 'camping'] },
  { id: 'kurse', mode: 'erleben', label: tl('Termine'), short: tl('Termine'), icon: 'group', color: '#C2255C', cats: [], offers: ['kurs', 'gruppe'] },
  { id: 'events', mode: 'erleben', label: tl('Events'), short: tl('Events'), icon: 'cal', color: '#D9480F', cats: [], offers: ['termin'] },
  { id: 'gesundheit', mode: 'service', label: tl('Notfall & Gesundheit'), short: tl('Notfall & Gesundheit'), icon: 'cross', color: '#E03131', cats: ['kinderarzt', 'klinik', 'apotheke', 'babyklappe', 'hebamme', 'geburtshaus', 'zahnarzt', 'frauenarzt', 'hno', 'augenarzt', 'kinderpsychologie', 'physio', 'therapie'] },
  { id: 'sanitaer', mode: 'service', label: tl('Sanitär'), short: tl('Sanitär'), icon: 'baby', color: '#0C8599', cats: ['wc', 'wickel', 'familienfreundlich', 'trinkwasser'], extra: p => p.tags.has('wickeln') || p.tags.has('stillen') || p.tags.has('trinkwasser') }, // refill points in cafés and shops
  { id: 'laeden', mode: 'service', label: tl('Läden'), short: tl('Läden'), icon: 'bag', color: '#1971C2', cats: ['windeln', 'laden', 'wochenmarkt'] },
  { id: 'familie', mode: 'service', label: tl('Familie & Beratung'), short: tl('Familie & Beratung'), icon: 'people', color: '#6741D9', cats: ['treffpunkt', 'beratung', 'kita', 'kurs', 'schule', 'musikschule', 'tanzschule', 'sprachschule', 'kreativschule', 'nachhilfe', 'jugend', 'pfadfinder'] },
  { id: 'mobil', mode: 'service', label: tl('Mobilität'), short: tl('Mobilität'), icon: 'elevator', color: '#5C677D', cats: ['haltestelle', 'bahnhof', 'aufzug'] },
];
const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
// Tags inside a sub-category. Plain tags are alternatives (Café or Restaurant); p: 1 marks a property that must hold
// in addition (Café and vegan). Offer tags 'aud:*' (who takes part) form their own dimension.
// of: a sub-category that stands for several place tags (Entdecken: "Museen & Kultur" = museum, kultur, theater ...)
const T = (id, label, p, of) => ({ id, label, p: p ? 1 : 0, of });
const TAGS = {
  spielen: [T('spielplatz', tl('Spielplatz')), T('abenteuer', tl('Abenteuerspielplatz')), T('s_indoor', tl('Indoor, Klettern & Trampolin'), 0, ['indoorspielplatz', 'klettern', 'trampolin']),
    T('spielhaus', tl('Spielhaus')), T('spielstrasse', tl('Spielstraße')), T('bolzplatz', tl('Bolzplatz')), T('tischtennis', tl('Tischtennis')), T('sportstaette', tl('Sportanlagen')), T('sportverein', tl('Sportvereine')), T('reiten', tl('Reiten')), T('s_winter', tl('Rodeln & Eislaufen'), 0, ['rodeln', 'eislaufen']), T('minigolf', tl('Minigolf')), T('skaten', tl('Skaten')),
    T('bewegung', tl('Sport & Bewegung')), T('wasserspiel', tl('Wasserspiel'), 1), T('grosser_spielplatz', tl('Großer Spielplatz'), 1)],
  gastro: [T('cafe', tl('Café')), T('restaurant', tl('Restaurant')), T('imbiss', tl('Imbiss')), T('eis', tl('Eis')), { ...T('kindercafe', tl('Kindercafé'), 1), hide: 1 },
    T('fruehstueck', tl('Frühstück'), 1), T('kuchen', tl('Kuchen'), 1), T('vegan', tl('Vegan'), 1), T('vegetarisch', tl('Vegetarisch'), 1), T('terrasse', tl('Draußen sitzen'), 1),
    T('italienisch', tl('Pizza & Pasta'), 1), T('asiatisch', tl('Asiatisch'), 1), T('burger', tl('Burger'), 1)],
  entdecken: [T('e_natur', tl('Natur & Parks'), 0, ['natur', 'picknick', 'aussicht', 'hundeauslauf']), T('tiere', tl('Tiere (Zoo, Bauernhof)')),
    T('e_kultur', tl('Museen & Kultur'), 0, ['museum', 'kultur', 'theater', 'buecherei', 'buecherschrank']), T('e_ausflug', tl('Ausflüge'), 0, ['ausflugsziel', 'faehre', 'bootsverleih', 'camping']),
    T('e_wasser', tl('Wasser & Schwimmen'), 0, ['baden', 'brunnen']), T('freilauf_alle', tl('Freilauf für alle Hunde'), 1)],
  gesundheit: [T('kinderarzt', tl('Kinderarzt')), T('apotheke', tl('Apotheke')), T('klinik', tl('Klinik')), T('hebamme', tl('Hebamme')), T('geburtshaus', tl('Geburtshaus')), T('zahnarzt', tl('Zahnarzt')), T('frauenarzt', tl('Frauenarzt')), T('hno', 'HNO'), T('augenarzt', tl('Augenarzt')), T('kinderpsychologie', tl('Kinderpsychologie')), T('physio', tl('Physiotherapie')), T('therapie', tl('Logopädie & Ergotherapie')), T('babyklappe', tl('Babyklappe'))],
  sanitaer: [T('wc', tl('Toilette')), T('wickeln', tl('Wickelplatz')), T('stillen', tl('Stillen')), T('trinkwasser', tl('Trinkwasser'))],
  laeden: [T('drogerie', tl('Drogerie')), T('supermarkt', tl('Supermarkt')), T('spaeti', tl('Späti & Kiosk')), T('tankstelle', tl('Tankstelle')), T('baby', tl('Babyausstattung')),
    T('wochenmarkt', tl('Wochenmarkt')), T('kinderkleidung', tl('Kinderkleidung')), T('spielzeug', tl('Spielzeug')), T('buecher', tl('Bücher')), T('secondhand', tl('Secondhand'))],
  familie: [T('familienzentrum', tl('Treffpunkte & Familienzentren')), T('elternschule', tl('Elternschulen')), T('beratung', tl('Beratung')), T('kita', tl('Kitas')), T('schule', tl('Schulen')), T('musikschule', tl('Musikschulen')), T('tanzschule', tl('Tanzschulen')), T('f_lernen', tl('Sprachen, Kreatives & Nachhilfe'), 0, ['sprachschule', 'kreativschule', 'nachhilfe']), T('jugend', tl('Jugendhilfe')), T('pfadfinder', tl('Pfadfinder'))],
  mobil: [T('haltestelle', tl('Haltestellen')), T('bahnhof', tl('Bahnhöfe')), T('aufzug', tl('Aufzüge'))],
  kurse: [T('aud:kinder', tl('Für Kinder')), T('aud:erwachsene', tl('Für Erwachsene')), T('krabbelgruppe', tl('Krabbel- & Spielgruppe')), T('pekip', tl('PEKiP & Bewegung')),
    T('musik', tl('Musik')), T('schwimmen', tl('Schwimmen')), T('babymassage', tl('Babymassage')), T('kreativ', tl('Kreativ')), T('spiele', tl('Spielen & Medien')),
    T('sport', tl('Sport & Toben')), T('eltern_thema', tl('Elternthemen')), T('eltern_cafe', tl('Eltern-Café')), T('geburtsvorbereitung', tl('Geburtsvorbereitung')), T('rueckbildung', tl('Rückbildung')), T('erste_hilfe', tl('Erste Hilfe')), T('beratung', tl('Beratung'))],
  events: [T('aud:kinder', tl('Für Kinder')), T('aud:erwachsene', tl('Für Erwachsene')), T('lesen', tl('Vorlesen')), T('kreativ', tl('Basteln')), T('spiele', tl('Spielen & Medien')),
    T('theater', tl('Theater, Kino & Zirkus')), T('musik', tl('Musik')), T('feste', tl('Feste & Laternen')), T('wissen', tl('Forschen & Wissen')), T('sport', tl('Sport & Toben')), T('kochen', tl('Kochen & Backen')), T('eltern_thema', tl('Elternthemen')), T('flohmarkt', tl('Flohmarkt & Basar'))],
};
const TAG_LABEL = {};
for (const list of Object.values(TAGS)) for (const t of list) TAG_LABEL[t.id] = TAG_LABEL[t.id] || t.label;
// the single place tags inside Entdecken keep their names (lists, search, quick questions)
Object.assign(TAG_LABEL, { natur: tl('Natur'), kultur: tl('Kultur'), baden: tl('Baden'), museum: tl('Museen'), theater: tl('Theater & Kino'), buecherei: tl('Bücherhallen'), picknick: tl('Picknick & Grillen'),
  hundeauslauf: tl('Hundeauslauf'), indoorspielplatz: tl('Indoor-Spielplatz'), klettern: tl('Klettern & Bouldern'), trampolin: tl('Trampolin'), rodeln: tl('Rodeln'), eislaufen: tl('Eislaufen'),
  sprachschule: tl('Sprachschulen'), kreativschule: tl('Kreativschulen'), nachhilfe: tl('Nachhilfe'), aussicht: tl('Aussicht'), brunnen: tl('Brunnen'), buecherschrank: tl('Bücherschränke'), faehre: tl('Fähren'), bootsverleih: tl('Boot fahren'), camping: tl('Camping'), ausflugsziel: tl('Ausflugsziele') });
TAG_LABEL.drinnen = tl('Drinnen'); TAG_LABEL.draussen = tl('Draußen'); TAG_LABEL.groessere = tl('Eher für Größere');
const IO_GROUPS = ['tipps', 'spielen', 'gastro', 'entdecken'];
const CAT_ICON = { museum: 'museum', kultur: 'museum', buecherei: 'museum', baden: 'waves', faehre: 'waves', bootsverleih: 'waves', brunnen: 'waves', hundeauslauf: 'paw', buecherschrank: 'museum', kita: 'blocks', schule: 'blocks', wc: 'toilet', apotheke: 'pill' };
const CAT_LABEL = {
  spielplatz: tl('Spielplatz'), indoor: tl('Drinnen spielen'), spielhaus: tl('Spielhaus'), freizeit: tl('Freizeit'), cafe: tl('Café'),
  restaurant: tl('Restaurant'), imbiss: tl('Imbiss'), eis: tl('Eis'), windeln: tl('Drogerie / Supermarkt / Späti'), laden: tl('Laden'),
  wc: tl('Toilette'), wickel: tl('Wickelplatz'), familienfreundlich: tl('Familienfreundlicher Ort'), apotheke: tl('Apotheke'),
  kinderarzt: tl('Kinderarzt'), hebamme: tl('Hebamme'), klinik: tl('Klinik'), babyklappe: tl('Babyklappe'), museum: tl('Museum'),
  kultur: tl('Kultur'), ausflug: tl('Ausflugsziel'), buecherei: tl('Bücherhalle'), baden: tl('Baden'), park: tl('Park'), picknick: tl('Picknickplatz'),
  grillplatz: tl('Grillplatz'), trinkwasser: tl('Trinkwasser'), hundeauslauf: tl('Hundeauslaufzone'), treffpunkt: tl('Familienzentrum / Treffpunkt'),
  beratung: tl('Beratung'), kita: tl('Kita'), aufzug: tl('Aufzug'), bahnhof: tl('Bahnhof'),
  spielstrasse: tl('Spielstraße (verkehrsberuhigt)'), bolzplatz: tl('Bolzplatz'), tischtennis: tl('Tischtennis'), sportstaette: tl('Sportanlage'), sportverein: tl('Sportverein'), reiten: tl('Reiten'), rodeln: tl('Rodelberg'),
  garten: tl('Garten'), naturschutz: tl('Naturschutzgebiet'), tierhof: tl('Hof mit Tieren oder Hofladen'), brunnen: tl('Brunnen'), buecherschrank: tl('Bücherschrank'), faehre: tl('Fähranleger'), bootsverleih: tl('Bootsverleih'), camping: tl('Campingplatz'),
  zahnarzt: tl('Zahnarzt'), frauenarzt: tl('Frauenarzt'), hno: tl('HNO-Arzt'), augenarzt: tl('Augenarzt'), kinderpsychologie: tl('Kinderpsychologie'), physio: tl('Physiotherapie'), therapie: tl('Logopädie / Ergotherapie'),
  musikschule: tl('Musikschule'), tanzschule: tl('Tanzschule'), sprachschule: tl('Sprachschule'), kreativschule: tl('Kreativschule'), nachhilfe: tl('Nachhilfe'), jugend: tl('Jugendhilfe'), pfadfinder: tl('Pfadfinder'), wochenmarkt: tl('Wochenmarkt'), schule: tl('Schule'), haltestelle: tl('Haltestelle'),
  kurs: tl('Elternschule / Familienzentrum'), geburtshaus: tl('Geburtshaus'), abenteuer: tl('Abenteuer- / Bauspielplatz'),
};
const GROUP_OF = {};
for (const g of GROUPS) for (const c of g.cats) GROUP_OF[c] = g;

// ---------- Attributes (the filters Google does not have) ----------
const truthy = v => /^(yes|designated|room|true|ja|1|limited|partial)$/i.test(v) ? (v === 'limited' || v === 'partial' ? 'limited' : 'yes') : /^(no|false|nein|0)$/i.test(v) ? 'no' : null;
const INDOOR = ['gastro', 'laeden', 'sanitaer', 'gesundheit', 'entdecken', 'spielen', 'familie', 'mobil'];
const ATTRS = [
  { id: 'wickeltisch', label: tl('Wickeltisch'), keys: ['changing_table'], groups: INDOOR, nochipIn: ['sanitaer'], q: tl('Gibt es hier einen Wickeltisch?') },
  { id: 'stillen', label: tl('Stillmöglichkeit'), keys: ['baby_feeding'], groups: INDOOR, q: tl('Kann man hier in Ruhe stillen?'), hide: 1 },
  { id: 'hochstuhl', label: tl('Hochstuhl'), keys: ['highchair'], groups: ['gastro'], q: tl('Gibt es Hochstühle?') },
  { id: 'spielecke', label: tl('Mit Spielecke'), keys: ['kids_area'], groups: ['gastro', 'laeden', 'entdecken', 'gesundheit', 'familie'], q: tl('Gibt es eine Spielecke?') },
  { id: 'kindermenue', label: tl('Kindermenü'), keys: ['kids_menu'], groups: ['gastro'], q: tl('Gibt es ein Kindermenü?') },
  { id: 'windeln', label: tl('Windeln / Babynahrung'), keys: [], groups: ['laeden'], q: tl('Gibt es hier Windeln oder Babynahrung?'), nofilter: 1 },
  { id: 'kleinkind', label: tl('Für Kleinkinder'), keys: ['for_baby', 'for_toddler'], groups: ['spielen'], q: tl('Gibt es einen Bereich für Kleinkinder?') },
  { id: 'eingezaeunt', label: tl('Eingezäunt'), keys: ['fenced'], groups: ['spielen'], q: tl('Ist der Spielplatz eingezäunt?') },
  { id: 'schatten', label: tl('Schatten'), keys: ['shade'], groups: ['spielen'], q: tl('Gibt es Schatten?'), hide: 1 },
  { id: 'wc_nahe', label: tl('WC in der Nähe'), keys: ['wc_near'], groups: ['spielen'], q: tl('Gibt es ein WC in der Nähe?') },
  { id: 'wasser', label: tl('Wasserspiel'), keys: ['water_play'], groups: ['spielen'], nochipIn: ['spielen'], q: tl('Gibt es ein Wasserspiel?') },
  { id: 'kinderwagen', label: tl('Stufenlos'), keys: ['stroller', 'wheelchair'], q: tl('Kommt man gut mit dem Kinderwagen hin?') },
  { id: 'toilette', label: tl('Toilette'), keys: ['toilets'], groups: ['gastro', 'entdecken', 'spielen', 'laeden'], q: tl('Gibt es eine Toilette?') },
  { id: 'drinnen', label: tl('Drinnen'), keys: ['indoor'], groups: ['spielen', 'entdecken', 'familie'], q: tl('Ist es drinnen oder überdacht?'), nofilter: 1 },
  { id: 'hund', label: tl('Hunde erlaubt'), keys: ['dog'], q: tl('Sind Hunde erlaubt?') },
  { id: 'hst_nahe', label: tl('Haltestelle in der Nähe'), keys: ['stop_near'], groups: ['spielen', 'gastro', 'entdecken', 'gesundheit', 'familie'], nochip: 1 },
  { id: 'baenke', label: tl('Sitzbänke'), keys: ['bench_count'], count: 1, groups: ['spielen', 'entdecken'], nochip: 1 },
  { id: 'hundewiese', label: tl('Hundewiese in der Nähe'), keys: [], groups: ['spielen', 'gastro'], dogOnly: 1, nofact: 1 },
  { id: 'trinkwasser', label: tl('Trinkwasser'), keys: ['drinking_water'], groups: ['spielen', 'entdecken', 'gastro', 'sanitaer'], nochipIn: ['sanitaer'] },
  { id: 'babyccino', label: tl('Babyccino'), keys: ['babyccino'], groups: ['gastro'], hide: 1 },
  { id: 'kinder_wc', label: tl('Kindertoilette'), keys: ['toilets_children'], groups: INDOOR, nofilter: 1 },
  // pool facts: only offered when "Wasser & Schwimmen" (or bathing places) is chosen
  { id: 'kinderbecken', label: tl('Kinderbecken'), keys: ['kids_pool'], groups: ['entdecken'], q: tl('Gibt es ein Kinder- oder Babybecken?'), pool: 1 },
  { id: 'wasserrutsche', label: tl('Wasserrutsche'), keys: ['water_slide'], groups: ['entdecken'], pool: 1 },
  { id: 'babyschwimmen', label: tl('Babyschwimmen'), keys: ['baby_swimming'], groups: ['entdecken'], pool: 1 },
  // live values (data/live.json): Notdienst is worked out at filter time from the duty windows, see dutyNow()
  { id: 'notdienst', label: tl('Notdienst jetzt'), keys: [], groups: ['gesundheit'], live: true },
  { id: 'aufzug_ok', label: tl('Aufzug in Betrieb'), keys: ['elevator_status'], groups: ['mobil'], live: true },
  { id: 'aufzug_kaputt', label: tl('Aufzug außer Betrieb'), keys: ['elevator_status'], groups: ['mobil'], live: true, nofact: 1 },
  // Kitas: what kind of care (Kita register, computed)
  { id: 'krippe', kitaOnly: 1, label: tl('Krippe (unter 3)'), keys: ['krippe'], groups: ['familie'] },
  { id: 'elementar', kitaOnly: 1, label: tl('Elementar (3–6)'), keys: ['elementar'], groups: ['familie'] },
  { id: 'integration', kitaOnly: 1, label: tl('Integration'), keys: ['integration'], groups: ['familie'] },
  { id: 'hort', kitaOnly: 1, label: tl('Hort'), keys: ['hort'], groups: ['familie'] },
  { id: 'kostenlos', label: tl('Kostenlos'), keys: ['fee'], invert: true, groups: ['spielen', 'entdecken', 'sanitaer', 'familie'], nochipIn: ['spielen', 'familie'], q: tl('Ist es kostenlos?') },
];
const ATTR = Object.fromEntries(ATTRS.map(a => [a.id, a]));
const NO_LABEL = { stillen: tl('Keine Stillmöglichkeit'), spielecke: tl('Keine Spielecke'), kleinkind: tl('Nicht für Kleinkinder'), eingezaeunt: tl('Nicht eingezäunt'), schatten: tl('Wenig Schatten'), kinderwagen: tl('Nicht stufenlos'), toilette: tl('Keine Toilette'), drinnen: tl('Draußen'), hund: tl('Keine Hunde'), baenke: tl('Keine Sitzbänke'), kinder_wc: tl('Keine Kindertoilette'), kostenlos: tl('Kostenpflichtig'), windeln: tl('Keine Windeln'), aufzug_ok: tl('Aufzug außer Betrieb') };
function normValue(attr, v) {
  if (v == null || v === '') return null;
  if (attr.id === 'hund') return /yes|leashed|outside|offleash/.test(v) ? 'yes' : v === 'no' ? 'no' : null;
  if (attr.id === 'wc_nahe' || attr.id === 'hst_nahe') return 'yes';
  if (attr.id === 'aufzug_ok') return v === 'in_betrieb' ? 'yes' : v === 'ausser_betrieb' ? 'no' : null;
  if (attr.id === 'aufzug_kaputt') return v === 'ausser_betrieb' ? 'yes' : v === 'in_betrieb' ? 'no' : null;
  if (attr.id === 'babyschwimmen') return truthy(v) === 'no' ? 'no' : 'yes'; // the pools give times or a text: any value means it is offered
  if (attr.count) return +v > 0 ? 'yes' : null;
  if (attr.id === 'trinkwasser') return v === 'no' ? 'no' : 'yes';
  if (attr.invert) { const t = truthy(v); return t === 'yes' ? 'no' : t === 'no' ? 'yes' : null; }
  return truthy(v);
}
const GEAR = [
  { id: 'schaukel', label: tl('Schaukel'), re: /swing/ },
  { id: 'rutsche', label: tl('Rutsche'), re: /slide/ },
  { id: 'sand', label: tl('Sandkasten'), re: /sand/ },
  { id: 'klettern', label: tl('Klettergerüst'), re: /climb|structure|rope|net/ },
  { id: 'seilbahn', label: tl('Seilbahn'), re: /zipwire|zip_line|cableway/, hide: 1 },
  { id: 'wippe', label: tl('Wippe'), re: /seesaw|springy/ },
  { id: 'trampolin', label: tl('Trampolin (Spielplatz)'), re: /trampoline/ },
];
const TIME_FILTERS = [{ id: 'jetzt', label: tl('Jetzt offen') }, { id: 'sonntag', label: tl('Sonntags offen') }];
const AGE_FILTERS = [{ id: 'age_fit', label: tl('Passt zu unseren Kindern'), family: 1 }, { id: 'age_0', label: tl('0–3 Jahre'), from: 0, to: 36 }, { id: 'age_3', label: tl('3–6 Jahre'), from: 36, to: 84 }, { id: 'age_6', label: tl('ab 6 Jahre'), from: 72, to: 216 }];
const FILTER_LABEL = Object.fromEntries([...TIME_FILTERS, ...ATTRS, ...GEAR, ...AGE_FILTERS].map(f => [f.id, f.label]));
const AGES = [{ id: '0-2', label: tl('0–2 Jahre') }, { id: '3-6', label: tl('3–6 Jahre') }, { id: '7+', label: tl('ab 7 Jahre') }];
const PRESETS = [
  // nappies: drugstores, supermarkets, kiosks, petrol stations and baby shops (plus pharmacies), never bookshops, markets or toy shops
  { id: 'windeln-jetzt', label: tl('Jetzt Windeln kaufen'), icon: 'bag', groups: ['laeden'], cats: ['apotheke'], tags: ['drogerie', 'supermarkt', 'spaeti', 'tankstelle', 'baby'], filters: ['jetzt'] },
  { id: 'windeln-sonntag', label: tl('Windeln am Sonntag'), icon: 'bag', groups: ['laeden'], cats: ['apotheke'], tags: ['drogerie', 'supermarkt', 'spaeti', 'tankstelle', 'baby'], filters: ['sonntag'] },
  { id: 'tipps', label: tl('Djuu-Tipps: was Eltern lieben'), icon: 'star', groups: ['tipps'], filters: [] },
  { id: 'kurse', label: tl('Krabbelgruppen & Kurse'), icon: 'group', groups: ['kurse'], filters: [], termine: { page: 'wiederkehrend', topic: 'krabbelgruppe' } },
  { id: 'wickeln', label: tl('Wickeln unterwegs'), icon: 'baby', groups: ['sanitaer'], tags: ['wickeln'], filters: [] },
  // rain: a curated indoor set (no sports clubs): indoor playgrounds, climbing, trampolines, play houses, museums, libraries, kids' cafés, indoor pools
  { id: 'regen', label: tl('Es regnet: drinnen spielen und entdecken'), icon: 'house', groups: ['spielen', 'entdecken', 'gastro'], cats: ['indoor', 'spielhaus'],
    tags: ['indoorspielplatz', 'klettern', 'trampolin', 'spielhaus', 'museum', 'buecherei', 'baden', 'kindercafe'], io: 'drinnen', filters: [] },
  { id: 'spielecke', label: tl('Café oder Restaurant mit Spielecke'), icon: 'cup', groups: ['gastro'], filters: ['spielecke'] },
  { id: 'kleinkind', label: tl('Spielplatz für die Kleinen'), icon: 'playground', groups: ['spielen'], tags: ['spielplatz'], filters: ['kleinkind'] },
  { id: 'wasser', label: tl('Wasserspielplatz'), icon: 'waves', groups: ['spielen'], tags: ['wasserspiel'], filters: [] },
  { id: 'hitze', label: tl('Es ist heiß: Baden und Wasser'), icon: 'waves', groups: ['spielen', 'entdecken'], tags: ['wasserspiel', 'baden'], filters: [] },
  { id: 'refill', label: tl('Wasserflasche auffüllen'), icon: 'cup', groups: ['sanitaer'], tags: ['trinkwasser'], filters: [] },
  { id: 'spielplatz-hund', label: tl('Spielplatz mit Hundewiese daneben'), icon: 'paw', groups: ['spielen'], tags: ['spielplatz', 'abenteuer'], filters: ['hundewiese'] },
  { id: 'einkehr-hund', label: tl('Einkehren nach der Hundewiese'), icon: 'cup', groups: ['gastro'], filters: ['hund', 'hundewiese'] },
  { id: 'cafe-hund', label: tl('Café mit Kind und Hund'), icon: 'cup', groups: ['gastro'], tags: ['cafe'], filters: ['hund'] },
  { id: 'hund', label: tl('Hund darf rennen'), icon: 'paw', groups: ['entdecken'], tags: ['hundeauslauf'], filters: [] },
];

// ---------- Opening hours (common OSM formats; holidays ignored) ----------
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; // i18n-skip: OSM opening-hours syntax
const DAY_DE = I18N_DAYS; // weekday names in the chosen language
function parseOH(s) {
  if (!s) return null;
  s = s.replace(/"[^"]*"/g, '').replace(/\bDi\b/g, 'Tu').replace(/\bMi\b/g, 'We').replace(/\bDo\b/g, 'Th').replace(/\bSo\b/g, 'Su').trim(); // i18n-skip
  // tolerate common typing variants: "Tu- Sa", "Sa-Su12:00", "17:30--22:30", "... open", a "||" fallback rule
  s = s.split('||')[0].replace(/([A-Z][a-z])\s*-\s*([A-Z][a-z])/g, '$1-$2').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)\s*-{2,}\s*(\d)/g, '$1-$2')
    .replace(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g, '$1-$2').replace(/\s+open\b/g, '').trim(); // i18n-skip
  if (s === '24/7') return { always: true };
  const week = Array(7).fill(null);
  const spill = Array(7).fill(null).map(() => []);
  let ph;
  // rules end at ";", at ", Mo ..." and at ", PH ..." right after a time ("Mo-Sa 07:00-22:00, PH off")
  const rules = s.split(/;|,\s+(?=[A-Z][a-z])|(?<=\d)\s*,\s*(?=(?:PH|SH)\b)/).map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    let days, times;
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)(?:\s+(.*))?$/);
    if (m) { days = m[1]; times = (m[2] || '').trim(); }
    else if (/^\d/.test(rule) || /^(off|closed)$/.test(rule)) { days = 'Mo-Su'; times = rule; } // i18n-skip
    else return null;
    const idx = [];
    let onlyHolidays = true, hasPh = false;
    for (const part of days.split(/\s*,\s*/)) {
      if (part === 'PH') hasPh = true;
      if (part === 'PH' || part === 'SH') continue;
      onlyHolidays = false;
      const [a, b] = part.split('-');
      const i = DAYS.indexOf(a), j = b ? DAYS.indexOf(b) : i;
      for (let k = i; ; k = (k + 1) % 7) { idx.push(k); if (k === j) break; }
    }
    let ranges = [];
    const ownSpill = [];
    if (times === 'unknown') continue; // "PH unknown": nothing is known for that rule
    if (times === '24/7') times = '00:00-24:00';
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
    if (hasPh) ph = ranges;
    if (onlyHolidays) continue;
    for (const d of idx) { week[d] = ranges; spill[(d + 1) % 7] = ownSpill; }
  }
  for (let d = 0; d < 7; d++) if (week[d] === null) week[d] = [];
  return { week, spill, ph };
}
// opening hours the app cannot work with ("Apr-Oct 08:00-20:00; Nov-Mar 09:00-sunset"): readable words, one rule per line
const OH_WORDS = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
const OH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; // i18n-skip: OSM syntax
function ohReadable(s) {
  return String(s).replace(/"([^"]*)"/g, '$1').split(/\s*;\s*/).filter(Boolean).map(rule => rule
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, d => I18N_DAYS[OH_WORDS[d]])
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, m => I18N_MONTHS_SHORT[OH_MONTHS.indexOf(m)])
    .replace(/\bPH\b/g, tl('Feiertage')).replace(/\bSH\b/g, tl('Schulferien')).replace(/\b(off|closed)\b/g, tl('geschlossen'))
    .replace(/\bsunset\b|\bdusk\b/g, tl('Sonnenuntergang')).replace(/\bsunrise\b|\bdawn\b/g, tl('Sonnenaufgang')).replace(/\bopen\b/g, tl('geöffnet'))
    .replace(/\bunknown\b/g, tl('unbekannt')).replace(/24\/7/g, tl('rund um die Uhr')).replace(/\s*-\s*/g, '–').replace(/\s*,\s*/g, ', ')).join('\n');
}
const dayIdx = date => (date.getDay() + 6) % 7;
const localYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Public holidays in Hamburg, computed per year.
const holidayCache = {};
function holidays(y) {
  if (holidayCache[y]) return holidayCache[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mon = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const ea = n => localYmd(new Date(y, mon - 1, day + n));
  return holidayCache[y] = { [`${y}-01-01`]: tl('Neujahr'), [ea(-2)]: tl('Karfreitag'), [ea(1)]: tl('Ostermontag'), [`${y}-05-01`]: tl('Tag der Arbeit'), [ea(39)]: tl('Christi Himmelfahrt'),
    [ea(50)]: tl('Pfingstmontag'), [`${y}-10-03`]: tl('Tag der Deutschen Einheit'), [`${y}-10-31`]: tl('Reformationstag'), [`${y}-12-25`]: tl('1. Weihnachtstag'), [`${y}-12-26`]: tl('2. Weihnachtstag') };
}
const holidayName = date => holidays(date.getFullYear())[localYmd(date)] || null;
// School holidays in Hamburg, from the official Ferienordnung 2024/25 to 2029/30 (hamburg.de).
const SCHOOL_HOLIDAYS = [['2026-10-19', '2026-10-30', tl('Herbstferien')], ['2026-12-21', '2027-01-01', tl('Weihnachtsferien')], ['2027-01-29', '2027-01-29', tl('Halbjahrespause')], ['2027-03-01', '2027-03-12', tl('Frühjahrsferien')], ['2027-05-07', '2027-05-14', tl('Maiferien')], ['2027-07-01', '2027-08-11', tl('Sommerferien')],
  ['2027-10-11', '2027-10-22', tl('Herbstferien')], ['2027-12-20', '2027-12-31', tl('Weihnachtsferien')], ['2028-01-28', '2028-01-28', tl('Halbjahrespause')], ['2028-03-06', '2028-03-17', tl('Frühjahrsferien')], ['2028-05-22', '2028-05-26', tl('Maiferien')], ['2028-07-03', '2028-08-11', tl('Sommerferien')],
  ['2028-10-02', '2028-10-13', tl('Herbstferien')], ['2028-12-18', '2028-12-29', tl('Weihnachtsferien')], ['2029-02-02', '2029-02-02', tl('Halbjahrespause')], ['2029-03-05', '2029-03-16', tl('Frühjahrsferien')], ['2029-05-11', '2029-05-18', tl('Maiferien')], ['2029-07-02', '2029-08-10', tl('Sommerferien')]];
const schoolHoliday = date => { const k = localYmd(date); return SCHOOL_HOLIDAYS.find(([a, b]) => a <= k && k <= b)?.[2] || null; };
// School holidays of the family's federal state: Hamburg is built in, other states come from the OpenHolidays API (only the state code is sent).
const STATES = { 'DE-BW': tl('Baden-Württemberg'), 'DE-BY': tl('Bayern'), 'DE-BE': tl('Berlin'), 'DE-BB': tl('Brandenburg'), 'DE-HB': tl('Bremen'), 'DE-HH': tl('Hamburg'), 'DE-HE': tl('Hessen'), 'DE-MV': tl('Mecklenburg-Vorpommern'),
  'DE-NI': tl('Niedersachsen'), 'DE-NW': tl('Nordrhein-Westfalen'), 'DE-RP': tl('Rheinland-Pfalz'), 'DE-SL': tl('Saarland'), 'DE-SN': tl('Sachsen'), 'DE-ST': tl('Sachsen-Anhalt'), 'DE-SH': tl('Schleswig-Holstein'), 'DE-TH': tl('Thüringen') };
let FAM_BREAKS = SCHOOL_HOLIDAYS, breaksFailed = false;
async function loadBreaks() {
  const st = store.profile.state || 'DE-HH';
  breaksFailed = false;
  if (st === 'DE-HH') { FAM_BREAKS = SCHOOL_HOLIDAYS; return; }
  const from = localYmd(new Date()), to = localYmd(new Date(Date.now() + 500 * 864e5)), key = `djuu.breaks.${st}.${from.slice(0, 7)}`;
  try { const c = JSON.parse(localStorage.getItem(key)); if (c) { FAM_BREAKS = c; return; } } catch (e) { /* storage blocked */ }
  try {
    const r = await fetch(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=${st}&validFrom=${from}&validTo=${to}&languageIsoCode=DE`, { referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!r.ok) throw new Error(r.status);
    FAM_BREAKS = (await r.json()).map(h => [h.startDate, h.endDate, h.name[0]?.text || tl('Ferien')]).sort((a, b) => a[0] < b[0] ? -1 : 1);
    try { localStorage.setItem(key, JSON.stringify(FAM_BREAKS)); } catch (e) { /* storage blocked */ }
  } catch (e) { FAM_BREAKS = []; breaksFailed = true; }
}
// The running or next real break (single free days do not count).
function nextBreak() {
  const k = localYmd(new Date());
  const b = FAM_BREAKS.find(([a, z]) => z >= k && (new Date(z) - new Date(a)) / 864e5 >= 2);
  if (!b) return null;
  const from = new Date(b[0] + 'T00:00'), to = new Date(b[1] + 'T00:00'), t = new Date(k + 'T00:00');
  return { name: b[2], from, to, running: b[0] <= k, days: Math.round((from - t) / 864e5) };
}
// Opening times of a day: on a public holiday the PH rule, otherwise treated like a Sunday.
const dayRanges = (oh, date) => holidayName(date) ? (oh.ph ?? oh.week[6]) : oh.week[dayIdx(date)];
function isOpen(oh, date = new Date()) {
  if (!oh) return null;
  if (oh.always) return true;
  const d = dayIdx(date), min = date.getHours() * 60 + date.getMinutes();
  return dayRanges(oh, date).some(([a, b]) => min >= a && min < b) || oh.spill[d].some(([a, b]) => min >= a && min < b);
}
const opensSunday = oh => !oh ? null : oh.always ? true : oh.week[6].length > 0;
const fmtMin = m => m === 1440 ? '24:00' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
// Emergency duty of a pharmacy (data/live.json): the duty window covering the given time, else null
const dutyNow = (p, t = Date.now()) => (p.duty || []).find(([a, b]) => Date.parse(a) <= t && t < Date.parse(b)) || null;
// open right now: by its opening hours, or because the pharmacy is on emergency duty (true / false / null = unknown)
// open_always: outdoor places without opening hours (playgrounds, parks) count as open
const openNow = (p, date = new Date()) => dutyNow(p, +date) ? true : isOpen(p.oh, date) ?? (p.f?.open_always ? true : null);
// the next opening within a week: { days: 0 today, 1 tomorrow …, date, at: minutes after midnight }, or null
function nextOpening(oh, now = new Date()) {
  if (!oh || oh.always) return null;
  for (let k = 0; k <= 7; k++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k), from = k ? -1 : now.getHours() * 60 + now.getMinutes();
    const r = dayRanges(oh, d).filter(([a]) => a > from).sort((x, y) => x[0] - y[0])[0];
    if (r) return { days: k, date: d, at: r[0] };
  }
  return null;
}
// "Offen bis 18:00" / "Notdienst bis 09:00" / "Öffnet um 10:00" / "Geschlossen · öffnet morgen 08:30"
function openText(p) {
  const duty = dutyNow(p);
  if (duty) { const end = new Date(duty[1]); return `<span class="open duty">${tl('Notdienst bis')} ${fmtMin(end.getHours() * 60 + end.getMinutes())}</span>`; }
  const oh = p.oh; if (!oh) return p.f?.open_always ? `<span class="open">${tl('Frei zugänglich')}</span>` : '';
  if (oh.always) return `<span class="open">${tl('24 Stunden offen')}</span>`;
  const now = new Date(), d = dayIdx(now), min = now.getHours() * 60 + now.getMinutes();
  const today = dayRanges(oh, now), hol = holidayName(now);
  const cur = today.find(([a, b]) => min >= a && min < b) || oh.spill[d].find(([a, b]) => min >= a && min < b);
  if (cur) return `<span class="open">${tl('Offen bis')} ${fmtMin(cur[1] === 1440 && oh.spill[(d + 1) % 7][0] ? oh.spill[(d + 1) % 7][0][1] : cur[1])}</span>`;
  const next = nextOpening(oh, now);
  if (next && next.days === 0) return `<span class="closed">${tl('Öffnet um')} ${fmtMin(next.at)}</span>`;
  const when = !next ? '' : next.days === 1 ? tl('öffnet morgen {time}', { time: fmtMin(next.at) }) : tl('öffnet {day} {time}', { day: DAY_DE[dayIdx(next.date)], time: fmtMin(next.at) });
  return `<span class="closed">${tl('Geschlossen')}${hol ? tl(' (Feiertag)') : ''}${when ? ' · ' + when : ''}</span>`;
}

// ---------- Local store (server-ready shape) ----------
const STORE_KEY = 'djuu.v2';
let store = { contributions: [], confirmations: [], reviews: [], reports: [], events: [], prompted: {}, favorites: [], profile: { kids: [], expecting: '', dogs: 0 } };
try { Object.assign(store, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
store.favorites = store.favorites || [];
store.savedOffers = store.savedOffers || []; // [{ id, at, snap }]
// v0.8: expected date is a full date now; an old 'YYYY-MM' value becomes the middle of that month
if (store.profile && /^\d{4}-\d{2}$/.test(store.profile.expecting || '')) store.profile.expecting += '-15';
store.profile = Object.assign({ kids: [], expecting: '', dogs: 0, state: 'DE-HH' }, store.profile || {});
// a shared link (place or event) opens that page directly: no welcome screen in front of it (wir.js shows it only while store.welcomed is unset)
if (/^#(dj_|u_|o=)/.test(location.hash)) store.welcomed = true;
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { toast(tl('Speicher voll. Bitte weniger Fotos verwenden.')); } }
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
  // always a fresh JPEG from a canvas (at most 1600 px, quality 0.85): no camera metadata, and the server takes JPEG only
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height); // transparent PNGs get a white ground
  g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.85);
}

// ---------- State ----------
const state = { mode: 'erleben', groups: new Set(), cats: new Set(), tags: new Set(), onlyPlace: null, io: null, area: { type: 'all' }, picking: false, drawing: null, level: 0, sq: '', filters: new Set(), preset: null, showUnknown: false, q: '', tab: 'map', listLimit: 40, me: null, selected: null };
let SOURCES = [];
const places = [];
const byId = new Map();

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat(LOCALE);
const fmtDate = t => new Date(t).toLocaleDateString(LOCALE);
const desktop = () => window.innerWidth >= 900;
function toast(msg, ms = 3000) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
const toastLong = msg => toast(msg, 7000); // a longer sentence needs time to be read
function dist(a, b) {
  const k = Math.PI / 180;
  return 6371000 * Math.hypot((b[1] - a[1]) * k * Math.cos((a[0] + b[0]) * k / 2), (b[0] - a[0]) * k);
}
const fmtDist = m => m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
const walkMin = m => Math.max(1, Math.round(m * 1.3 / 75));
const distLine = m => !state.me ? '' : `<span>${fmtDist(m)}${m <= 3000 ? ` · ${walkMin(m)} ${tl('Min. zu Fuß')}` : ''}</span>`;
const groupOf = p => GROUP_OF[p.cat] || GROUPS[0];
const iconOf = p => CAT_ICON[p.cat] || groupOf(p).icon;
const badge = (p, cls = 'badge') => `<span class="${cls}" style="--c:${groupOf(p).color}">${svg(iconOf(p), '')}</span>`;
const origin = () => state.area.type === 'radius' && state.area.center !== 'me' ? state.area.center : state.me || [map.getCenter().lat, map.getCenter().lng];

// entries for a place: this phone's own plus the approved ones of everyone (community.js); reviews alike
// (called for every place when filtering: no new arrays when there is nothing)
const NONE = Object.freeze([]);
const withLocal = (list, pid, more) => list.length ? list.filter(c => c.placeId === pid).concat(more) : more;
const contribsOf = pid => withLocal(store.contributions, pid, typeof commContribsOf === 'function' ? commContribsOf(pid) : NONE);
const reviewsOf = pid => withLocal(store.reviews, pid, typeof commReviewsOf === 'function' ? commReviewsOf(pid) : NONE);
function userAnswers(pid, attrId) {
  const out = [];
  for (const c of contribsOf(pid)) if (c.attrs?.[attrId] && c.attrs[attrId] !== 'unknown') out.push({ v: c.attrs[attrId], at: c.createdAt, remote: !!c.remote });
  for (const c of store.confirmations) if (c.placeId === pid && c.attr === attrId) out.push({ v: c.answer, at: c.at });
  return out.sort((a, b) => b.at - a.at);
}
function attrVal(p, id) {
  if (GEAR.some(g => g.id === id)) return { v: p.gear?.has(id) ? 'yes' : null, src: p.gear ? tl('OpenStreetMap') : null };
  const a = ATTR[id];
  let base = { v: null };
  if (id === 'notdienst') return p.cat !== 'apotheke' || !LIVE.ok ? { v: null } : { v: dutyNow(p) ? 'yes' : 'no', src: 'aponet.de', method: 'live' }; // worked out now, not at load
  if (id === 'toilette' && p.cat === 'wc') base = { v: 'yes', src: tl('Kategorie') };
  else if (id === 'wasser' && p.gear?.has('wasser')) base = { v: 'yes', src: tl('OpenStreetMap') };
  else if (id === 'hundewiese') return p.dogRun && p.dogRun[1] <= dogRunMax(p) ? { v: 'yes', src: tl('OpenStreetMap') } : { v: null };
  else for (const k of a.keys) {
    const f = p.f[k];
    const v = f && normValue(a, f[0]);
    if (v) { base = { v, src: SOURCES[f[1]]?.[1], method: f[2], conf: f[3], evidence: f[4] }; break; }
  }
  const ua = userAnswers(p.id, id);
  if (ua.length) return { ...base, v: ua[0].v, src: tl('Nutzer'), method: 'user', confirmations: ua };
  return base;
}
// Age span of a place in months, from the data: [[from, to], ...], or null when unknown.
function agesOf(p) {
  const f = p.f, out = [];
  if (f.age_groups) for (const r of f.age_groups[0].split(',')) { const m = r.match(/(\d+)\D+(\d+)/); if (m) out.push([+m[1] * 12, +m[2] * 12]); }
  const top = p.cat === 'kita' ? (truthy(f.hort?.[0] || '') === 'yes' ? 14 : 6) : 18; // a Kita without an upper age: up to school age
  if (f.min_age || f.max_age) out.push([(parseInt(f.min_age?.[0]) || 0) * 12, (parseInt(f.max_age?.[0]) || top) * 12]);
  if (f.for_baby || f.for_toddler) out.push([0, 36]);
  return out.length ? out : null;
}
// playgrounds without age data: "passt vermutlich" (listed after the ones we know fit), never hidden by an age filter
const MAYBE_AGE_CATS = new Set(['spielplatz', 'spielstrasse', 'indoor', 'spielhaus']);
function ageFilter(p, id) {
  const spans = agesOf(p);
  if (!spans) return MAYBE_AGE_CATS.has(p.cat) && !(p.tags.has('groessere') && id === 'age_0') && (id !== 'age_fit' || familyAges().length) ? 'maybe' : null;
  if (id === 'age_fit') { const kids = familyAges(); return kids.length ? kids.some(k => spans.some(([a, b]) => ageIn(k, a, b))) : null; }
  const a = AGE_FILTERS.find(x => x.id === id);
  return spans.some(([x, y]) => x < a.to && y > a.from);
}
function filterVal(p, f) {
  if (f.startsWith('age_')) return ageFilter(p, f);
  if (f === 'jetzt') return openNow(p);
  if (f === 'sonntag') return opensSunday(p.oh) ?? (p.f.open_always ? true : null);
  const v = attrVal(p, f).v;
  return v === 'yes' || v === 'limited' ? true : v === 'no' ? false : null;
}
const dogFact = a => a.id === 'hund' || a.dogOnly; // shown only to families with a dog
const relevantAttrs = p => ATTRS.filter(a => (!a.groups || a.groups.includes(groupOf(p).id)) && (!dogFact(a) || hasDog()));
// the few "yes" facts shown under a name in lists and on the pin card: no dog (own chip), no near-by facts, no duplicates of tags
function chipAttrs(p, n = 2) {
  return relevantAttrs(p).filter(a => a.id !== 'hund' && !a.nochip && !a.nofilter && !a.nofact && !a.live && attrVal(p, a.id).v === 'yes' && ![...p.tags].some(t => PROP_TAGS.has(t) && TAG_LABEL[t] === a.label)).slice(0, n);
}
// live state of a lift as a chip (emergency duty is already in the opening line: "Notdienst bis 09:00")
const liveChip = p => p.lift?.[0] === 'ausser_betrieb' ? `<span class="livechip bad">${tl('Außer Betrieb')}</span>`
  : p.lift?.[0] === 'in_betrieb' ? `<span class="livechip ok">${tl('In Betrieb')}</span>` : '';

// ---------- Data ----------
function buildPlace(row) {
  const [id, name, cat, lat, lon, district, f, srcs, tags] = row;
  const p = { id, name: name || (f.near_name ? `${CAT_LABEL[cat] || tl('Ort')} ${f.near_name[0]}` : CAT_LABEL[cat] || tl('Ort')), named: !!name, cat, lat, lon, district, f, srcs: srcs || [], tags: new Set(tags || []), mine: false };
  if (f.opening_hours) { p.hoursRaw = f.opening_hours[0]; p.oh = parseOH(p.hoursRaw); }
  if (f.gear) {
    p.gear = new Set();
    for (const g of GEAR) if (g.re.test(f.gear[0])) p.gear.add(g.id);
    if (/water|splash|pump|archimedes/.test(f.gear[0])) p.gear.add('wasser');
  }
  return p;
}
// Elevators rarely have a name in OpenStreetMap ("Aufzug <street>"): name them after their station (the nearest Bahnhof within
// 300 m, else a stop within 150 m) and their platform, so "Aufzug Hauptbahnhof" can be found. The station keeps a list of its lifts.
// Dog runs near playgrounds (dogs may not enter the playground: one parent stays, the other walks the dog) and near cafés.
// p.dogRun = [id of the nearest dog run within 1 km, metres]
const DOG_RUN_PLAY = new Set(['spielplatz', 'abenteuer']), DOG_RUN_EAT = new Set(['cafe', 'restaurant', 'imbiss', 'eis']);
const dogRunMax = p => DOG_RUN_EAT.has(p.cat) ? 500 : 300;
// bathing places: a pool (indoor, outdoor, thermal bath) or a lake or river beach
const isBaederland = p => /bäderland/i.test(p.f.operator?.[0] || '') || /bäderland/i.test(p.name);
const POOL_RE = /hallenbad|schwimmhalle|schulbad|leistungszentrum schwimmen|aktive freizeit|schwimmbad|lehrschwimmbecken|therme|freibad|familienbad|erlebnisbad|freizeitbad|kombibad|planschbecken|swym|-bad\b|^festland$|^midsommerland$/i;
const isPool = p => p.cat === 'baden' && !p.f.water_status && (isBaederland(p) || POOL_RE.test(p.name));
const isBeach = p => p.cat === 'baden' && !isPool(p);
const isDogRun = p => p.cat === 'hundeauslauf' || p.tags.has('hundeauslauf');
// Parks without dogs, by the lists of the Bezirke (hundefreie Parkanlagen: Altona, Eimsbüttel, Harburg), the cemetery ordinance
// (state cemeteries) and the visitor rules of the botanical garden; places and their playgrounds, by id (checked Nov 2026)
const DOG_FREE_PARK = tl('In der ganzen Anlage sind Hunde verboten.'), DOG_FREE_GUIDE = tl('In der ganzen Anlage sind Hunde verboten, außer Blinden- und Führhunde.');
const DOG_BANS = {
  dj_8ffdae678203: tl('Im ganzen Wohlers Park sind Hunde verboten, auch Führhunde.'), dj_8daf68f3959d: tl('Im ganzen Wohlers Park sind Hunde verboten, auch Führhunde.'),
  dj_d41b70b1445b: DOG_FREE_PARK, dj_cdeb1cb76162: DOG_FREE_PARK, // August-Lütgens-Park
  dj_01c754f97e40: DOG_FREE_PARK, // Fischers Park
  dj_d83365e9f902: DOG_FREE_GUIDE, dj_78f75f5720b9: DOG_FREE_GUIDE, // Unna-Park
  dj_399c801cd62f: DOG_FREE_PARK, // Schulgarten im Harburger Stadtpark
  dj_361a1dcba9a3: tl('Auf den staatlichen Friedhöfen sind Hunde verboten, außer Blindenführhunde.'), // Ohlsdorf
  dj_682b8f959c84: tl('Tiere sind hier nicht erlaubt, außer Blindenführhunde.'), // Loki-Schmidt-Garten
};
// green areas the city's register of public green spaces (Grünplan, Oct 2026) lists only as a playground, with no park polygon
// around: the whole area is a playground, so dogs may not come (Grünanlagenverordnung). Places by id (OSM parks inside them).
const DOG_PLAY_AREAS = new Set('dj_004fb52e2cf7 dj_006364389d1d dj_0983230429c7 dj_0e8fa4ec777d dj_0efcdb0121ef dj_0f257f4e7718 dj_11dd53f01f80 dj_31d111c8c26f dj_36054e534f61 dj_3f0fe747197e dj_45094578c57d dj_4911fc7885a3 dj_559c566ab2a2 dj_58ef9c11a136 dj_5cc2139ba29f dj_5ddc6ce7dee2 dj_6159fb03fda1 dj_6599a53a59ce dj_6d96f5635dd3 dj_6eebda256509 dj_713aa3e5da29 dj_736f0ec94f0f dj_7fe75a5e2cdf dj_8045e58f1608 dj_822ca44d7c84 dj_82cd07a600c0 dj_8384da02f677 dj_83fc21d4e246 dj_86cc01994fec dj_894c9ef122e5 dj_91130137711b dj_94ec95f94447 dj_9668353fba12 dj_971d2adccf23 dj_98b4265d4aac dj_9d03ace88bb2 dj_9e57023b8f8b dj_a1d11a421016 dj_ad08744c046f dj_b0b7a629c3b7 dj_bfaa32bfd866 dj_c7a7a8c0f4d6 dj_c9927f0054c0 dj_caf7263438d7 dj_d0aa8b9e81b4 dj_d430c89ff51c dj_d592664f8ea9 dj_d9560c4c7732 dj_dcc0f8b88f74 dj_e03cdccbeb0a dj_e40048bdeb36 dj_effd6c8c08a9 dj_faf6ff1fed5f dj_fec6e32ba636'.split(' '));
function markDogRuns() {
  for (const id of DOG_PLAY_AREAS) { const p = byId.get(id); if (p && !p.f.dog_rule) { p.f.dog = ['no']; p.f.dog_rule = [tl('Die ganze Fläche ist bei der Stadt als Spielplatz eingetragen. Auf Spielplätzen sind Hunde verboten.')]; } }
  for (const [id, rule] of Object.entries(DOG_BANS)) { const p = byId.get(id); if (p) { p.f.dog = ['no']; p.f.dog_rule = [rule]; } }
  // Bäderland: animals may not come in (Badeordnung § 4 Abs. 6)
  for (const p of places) if (p.cat === 'baden' && isBaederland(p) && !p.f.dog) p.f.dog = ['no'];
  const runs = places.filter(isDogRun);
  for (const p of places) {
    if (!DOG_RUN_PLAY.has(p.cat) && !DOG_RUN_EAT.has(p.cat) && !isBeach(p)) continue;
    let best = null, bd = 1000;
    for (const r of runs) { if (Math.abs(r.lat - p.lat) > 0.01 || Math.abs(r.lon - p.lon) > 0.016) continue; const d = dist([p.lat, p.lon], [r.lat, r.lon]); if (d < bd) { bd = d; best = r; } }
    if (best) p.dogRun = [best.id, Math.round(bd)];
  }
}
function nameLifts() {
  const named = cat => places.filter(p => p.cat === cat && p.named);
  const rail = named('bahnhof'), stops = named('haltestelle');
  const nearest = (p, list, max) => { let best = null, bd = max; for (const s of list) { if (Math.abs(s.lat - p.lat) > 0.004 || Math.abs(s.lon - p.lon) > 0.007) continue; const d = dist([p.lat, p.lon], [s.lat, s.lon]); if (d < bd) { bd = d; best = s; } } return best; };
  for (const p of places) {
    if (p.cat !== 'aufzug') continue;
    const s = nearest(p, rail, 300) || nearest(p, stops, 150); if (!s) continue;
    const station = s.name.replace(/^Hamburg[\s-]+(?=\S)/, '') || s.name;
    const plat = ((p.f.description?.[0] || '').match(/(?:Bahnsteig|Gleis)[^/;,]*/) || [''])[0].trim();
    if (!p.named) p.name = `${tl('Aufzug')} ${station}${plat ? ' · ' + plat : ''}`;
    else if (!words(station).some(w => w.length > 3 && words(p.name).includes(w))) p.name = `${p.name} · ${station}`;
    p.named = true; p.station = s.id;
    (s.lifts || (s.lifts = [])).push(p.id);
  }
}
// Places people added: this phone's own, the approved ones of everyone, and own ones that wait for the check (only on the
// sender's phone). Rebuilt on every call, as entries get approved, removed or sent. Approved opening hours replace the data's.
const HOURS_SET = new Map(); // place id -> the data's own opening hours, while approved ones are shown
function addUserPlaces() {
  SI = null;
  for (let i = places.length - 1; i >= 0; i--) if (places[i].user) { byId.delete(places[i].id); places.splice(i, 1); }
  const add = (c, mine) => {
    if (byId.has(c.placeId) || !c.cat) return;
    const p = { id: c.placeId, name: c.name, named: true, cat: c.cat, lat: c.lat, lon: c.lon, district: nearestDistrict(c.lat, c.lon) || '', f: {}, srcs: [], tags: new Set([c.cat]), mine, user: true, pending: !!c.pending };
    if (c.hours) { p.hoursRaw = c.hours; p.oh = parseOH(c.hours); }
    places.push(p); byId.set(p.id, p);
  };
  for (const c of store.contributions) if (c.isNew) add(c, true);
  if (typeof commNewPlaces === 'function') for (const c of commNewPlaces()) add(c, !!c.mine);
  const hours = typeof commHours === 'function' ? commHours() : new Map();
  for (const [id, raw] of HOURS_SET) if (!hours.has(id)) { const p = byId.get(id); if (p) { p.hoursRaw = raw || undefined; p.oh = raw ? parseOH(raw) : undefined; delete p.hoursUser; } HOURS_SET.delete(id); }
  for (const [id, x] of hours) {
    const p = byId.get(id); if (!p || p.user) continue;
    if (!HOURS_SET.has(id)) HOURS_SET.set(id, p.hoursRaw || '');
    p.hoursRaw = x.h; p.oh = parseOH(x.h); p.hoursUser = true;
  }
}

// ---------- Offers: courses, groups, events (data/offers.json) ----------
let OFFERS = [];
const OFFER_BY_ID = new Map();
const offersByPlace = new Map();
const TOPIC_LABEL = {
  geburtsvorbereitung: tl('Geburtsvorbereitung'), rueckbildung: tl('Rückbildung'), pekip: tl('PEKiP & Bewegung'), babymassage: tl('Babymassage'),
  schwimmen: tl('Schwimmen'), musik: tl('Musik'), krabbelgruppe: tl('Krabbel- & Spielgruppe'), eltern_cafe: tl('Eltern-Café'), beratung: tl('Beratung'),
  erste_hilfe: tl('Erste Hilfe am Kind'), kreativ: tl('Basteln'), lesen: tl('Vorlesen'), spiele: tl('Spielen & Medien'), theater: tl('Theater, Kino & Zirkus'),
  flohmarkt: tl('Flohmarkt & Basar'), feste: tl('Feste & Laternen'), kochen: tl('Kochen & Backen'), sport: tl('Sport & Toben'), eltern_thema: tl('Elternthemen'), wissen: tl('Forschen & Wissen'), sonstiges: tl('Angebot'),
};
const WD = I18N_DAYS;
// offer title in the chosen language: translated on the server each night (title_en ...), else the provider's German title
const titleOf = o => (LANG !== 'de' && o['title_' + LANG]) || o.title;
function loadOffers(data) {
  const cols = data.cols;
  HAS_REPEAT = cols.includes('repeat'); // older files without the column: a group or course with a weekday counts as weekly
  OFFERS = data.offers.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  OFFER_BY_ID.clear(); for (const o of OFFERS) OFFER_BY_ID.set(o.id, o);
  offersByPlace.clear();
  for (const o of OFFERS) if (o.place_id) (offersByPlace.get(o.place_id) || offersByPlace.set(o.place_id, []).get(o.place_id)).push(o);
  SERIES_N = null; EVB.clear(); TODAY_C.key = ''; // rarity, Termine lists and the map card follow the new data
  NEW_C.ok = OFFERS.filter(o => seenAgo(o) < NEW_DAYS).length <= OFFERS.length * 0.6; // ~100 % = the day tracking began
}
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The rhythm of an offer (offers.json `repeat`): 'weekly', 'biweekly', 'monthly' ("jeden letzten Samstag"), 'once', or null
// = not known: then only the provider's own text and first date are shown, no dates are worked out and no calendar series.
// Older data without the column: a group or course with a weekday is weekly, one with a period only is 'period' (daily).
let HAS_REPEAT = false;
const REPEATS = ['weekly', 'biweekly', 'monthly', 'once'];
function repeatOf(o) {
  if (o.kind === 'termin' || o.sessions === 1 || (o.start_date && o.start_date === o.end_date)) return 'once';
  if (!HAS_REPEAT) return o.weekday != null ? 'weekly' : 'period';
  const r = REPEATS.includes(o.repeat) ? o.repeat : null;
  if (r === 'once') return r;
  if (!r || o.weekday == null) return null;
  if (r === 'biweekly' && !o.start_date) return null; // every 2 weeks needs the first date to count from
  return r === 'monthly' && !monthRule(o) ? null : r; // monthly: which week of the month must be known
}
const seriesRepeat = r => r === 'weekly' || r === 'biweekly' || r === 'monthly';
// the first session: the first weekday of the offer on or after its start
const firstOcc = o => { const s = new Date(o.start_date + 'T00:00'); return addDays(s, (o.weekday - dayIdx(s) + 7) % 7); };
// which weekday of the month a monthly offer meets: as the provider says it ("jeden 1. Freitag", "letzten Samstag"), else the
// same "n-th weekday" as its first date (a fifth weekday, or one in the last week the provider calls "letzte": the last one);
// null when neither is known ("monatlich" without a date: only the provider's text is shown)
function monthRule(o) {
  if (o._mr !== undefined) return o._mr;
  const s = o.schedule || '', said = s.match(/(?:jeden|jede[nm]?|am|every)?\s*([1-4])\.\s*(?:mo|di|mi|do|fr|sa|so)[a-z]*/i);
  if (/\bletzte[nm]?\b|\blast\b/i.test(s)) return o._mr = { n: 5, last: true };
  if (said && !/\bund\b|\band\b|,\s*[1-4]\./i.test(s)) return o._mr = { n: +said[1], last: false };
  if (!o.start_date) return o._mr = null;
  const a = firstOcc(o), n = Math.ceil(a.getDate() / 7);
  return o._mr = { n, last: n === 5 };
}
const monthHit = (o, d) => { const r = monthRule(o); return r.last ? addDays(d, 7).getMonth() !== d.getMonth() : Math.ceil(d.getDate() / 7) === r.n; };
// the last day a series can meet: its end date, else the last of its known number of sessions (weekly, every 2 weeks)
function lastSession(o, rp = repeatOf(o)) {
  if (o.end_date) return new Date(o.end_date + 'T00:00');
  if (o.sessions > 1 && o.start_date && (rp === 'weekly' || rp === 'biweekly')) return addDays(firstOcc(o), (o.sessions - 1) * (rp === 'biweekly' ? 14 : 7));
  return null;
}
// no dates known: a group or course whose rhythm the provider does not say clearly (shown with its own text, no date)
const undated = o => o.kind !== 'termin' && repeatOf(o) === null && !(o.start_date && o.start_date >= ymd(today0()));
// Next date this offer takes place from day t on (today included), or null. A show or exhibition that started earlier
// and is still running takes place today; an offer without known dates counts as running (see undated).
function nextDate(o, t = today0()) {
  const start = o.start_date ? new Date(o.start_date + 'T00:00') : null;
  const end = o.end_date ? new Date(o.end_date + 'T00:00') : null;
  const rp = repeatOf(o);
  if (rp === 'once') return start && start >= t ? start : start && end && end >= t ? new Date(t) : null;
  if (seriesRepeat(rp)) {
    let d = new Date(start && start > t ? start : t); d.setDate(d.getDate() + ((o.weekday - dayIdx(d) + 7) % 7));
    if (rp === 'biweekly' && Math.round((d - firstOcc(o)) / 6048e5) % 2) d = addDays(d, 7);
    if (rp === 'monthly') { let i = 0; while (!monthHit(o, d) && i < 6) { d = addDays(d, 7); i++; } if (!monthHit(o, d)) return null; }
    const last = lastSession(o, rp);
    return last && d > last ? null : d;
  }
  if (start && start >= t) return start;
  if (rp === 'period') return end && end >= t ? new Date(t) : null;
  return !end || end >= t ? new Date(t) : null;
}
const hmMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
// an event over several days (exhibition, festival week): open until the evening of each day
const multiDay = o => repeatOf(o) === 'once' && !!o.start_date && !!o.end_date && o.end_date > o.start_date;
// minutes after midnight when the offer is over today: its end, else one hour after the start (an event over several days:
// the evening), else the end of the day
const endMin = o => o.time_to && hmMin(o.time_to) > (o.time_from ? hmMin(o.time_from) : 0) ? hmMin(o.time_to) : multiDay(o) ? 20 * 60 : o.time_from ? hmMin(o.time_from) + 60 : 24 * 60;
// the next date that is not over yet: a session that ended today moves on (a weekly group to next week)
function nextAfterNow(o) {
  const t = today0(), d = nextDate(o, t);
  if (!d || +d !== +t || undated(o)) return d;
  const now = new Date();
  if (endMin(o) > now.getHours() * 60 + now.getMinutes()) return d;
  const tm = new Date(t); tm.setDate(tm.getDate() + 1);
  return nextDate(o, tm);
}
// one unit per range: "6–18 Mon.", "1–5 J.", "2–5 J."; only a start under one year mixes them ("6 Mon.–5 J.")
function ageLabel(min, max) {
  if (min == null && max == null) return '';
  const y = m => Math.floor(m / 12), f = m => m < 24 ? `${m} ${tl('Mon.')}` : tl('{n} J.', { n: y(m) });
  if (max == null) return tl('ab {age}', { age: f(min) });
  if (!min) return tl('bis {age}', { age: f(max - 1) });
  if (min < 24 && max <= 25) return `${min}–${max - 1} ${tl('Mon.')}`;
  return min >= 12 ? tl('{n} J.', { n: `${y(min)}–${y(max - 1)}` }) : `${f(min)}–${f(max - 1)}`;
}
// the age of an offer; when the provider names none, Djuu may estimate it from the provider and kind of offer (age_guess 1),
// a family event is "für alle Altersgruppen" (age_guess 2)
const allAges = o => o.age_guess === 2;
const offerAge = o => { if (allAges(o)) return tl('für alle Altersgruppen'); const l = ageLabel(o.age_min_m, o.age_max_m); return l && o.age_guess ? `${l} ${tl('(geschätzt)')}` : l; };
// who it is for, in one short tag: the children's age, "für Erwachsene", or a parents' course with the child's age
const whoTag = o => o.audience !== 'erwachsene' ? offerAge(o) : o.for_parents && ageLabel(o.age_min_m, o.age_max_m) ? tl('für Eltern, Kind {age}', { age: offerAge(o) }) : tl('für Erwachsene');
// "neu": first seen in the data within the last 14 days. When most offers (over 60 %) look new at once (the first day of
// tracking, a rebuilt history), the mark says nothing and stays off.
const NEW_DAYS = 14;
const NEW_C = { ok: true };
const seenAgo = o => o.first_seen ? (today0() - new Date(String(o.first_seen).slice(0, 10) + 'T00:00')) / 864e5 : Infinity;
const isNewOffer = o => NEW_C.ok && seenAgo(o) < NEW_DAYS;
// A child's age in months, always worked out from the birth date (never stored, so it grows by itself).
// The birth date is "YYYY", "YYYY-MM" or "YYYY-MM" plus a day. With the year only, the child may have been born
// in any month of that year: the age is a range from min to max months and counts as approximate.
// Helpers get no birth date, only the range from the server (ageMin, ageMax).
function kidAge(k) {
  if (k.ageMin != null) return { min: k.ageMin, max: k.ageMax, approx: k.ageMin !== k.ageMax };
  if (!k.ym) return null;
  const now = new Date(), [y, m] = String(k.ym).split('-').map(Number);
  if (!y) return null;
  const base = (now.getFullYear() - y) * 12 + now.getMonth() + 1;
  if (!m) return { min: Math.max(0, base - 12), max: Math.max(0, base - 1), approx: true };
  let months = base - m;
  if (k.d && now.getDate() < +k.d) months--; // birthday this month not reached yet
  return { min: months, max: months, approx: !!k.approx };
}
function familyAges() {
  return store.profile.kids.map(k => { const a = kidAge(k); return a && { name: k.name || tl('Kind'), ...a, months: Math.round((a.min + a.max) / 2) }; }).filter(Boolean);
}
// does a child (exact age or a range) fall into [from, to) months
const ageIn = (a, from, to) => a.max >= from && a.min < to;
const unit = (n, one, many) => `${n} ${n === 1 ? tl(one) : tl(many)}`;
// under 1: months; 1 to under 3: years and months; from 3: years; year only: "ca."
function ageText(a) {
  if (!a) return tl('Alter fehlt');
  if (a.approx) { const m = Math.round((a.min + a.max) / 2); return a.max < 12 ? tl('unter 1 Jahr') : `${tl('ca.')} ${unit(Math.max(1, Math.floor(m / 12)), 'Jahr', 'Jahre')}`; }
  const m = a.min;
  if (m < 0) return tl('unterwegs');
  if (m < 1) return tl('unter 1 Monat');
  if (m < 12) return unit(m, 'Monat', 'Monate');
  if (m < 36) return unit(Math.floor(m / 12), 'Jahr', 'Jahre') + (m % 12 ? `, ${unit(m % 12, 'Monat', 'Monate')}` : '');
  return unit(Math.floor(m / 12), 'Jahr', 'Jahre');
}
function kidLabel(m) { return ageText({ min: m, max: m }); }
const hasFamily = () => store.profile.kids.some(k => kidAge(k)) || !!store.profile.expecting;
// Dogs of the Wir (Wir › Personen › Hunde). Without a dog, no dog hints, filters or symbols are shown anywhere.
const hasDog = () => (store.profile.dogList || []).length > 0;
const DOG_TEXT = { auch: tl('Auch mit Hund'), ja: tl('Hunde erlaubt'), leine: tl('Nur an der Leine'), nein: tl('Hunde nicht erlaubt') };
// a place: what people told us, else OpenStreetMap (dog=yes / leashed / no ...); unknown -> null
function dogOf(p) {
  if (!p) return null;
  const v = (userAnswers(p.id, 'hund')[0]?.v || p.f?.dog?.[0] || '').toLowerCase();
  return /leash/.test(v) ? 'leine' : /^(yes|outside|offleash|unleashed)/.test(v) ? 'ja' : v === 'no' ? 'nein' : null;
}
// an event: marked by hand (offers.dogs), or what was entered with an own event, else the rule of its place
function offerDog(o) {
  if (o.dogs) return o.dogs;
  if (o.own) { const v = o.attrs?.hund; return v === 'leashed' ? 'leine' : v === 'yes' ? 'ja' : v === 'no' ? 'nein' : null; }
  return dogOf(o.place_id && byId.get(o.place_id));
}
const dogChip = v => hasDog() && v ? `<span class="dogchip ${v}">${svg('paw')}${esc(DOG_TEXT[v])}</span>` : '';
// true = fits one of the children (or the pregnancy), false = fits none, null = no profile / no age info
// Parents' courses (for_parents) with a child's age (first aid for babies, Babyschlaf) fit by that age, a pregnancy fits those
// from birth on; without an age they fit babies, toddlers and expecting parents. Other adult offers fit none of the children.
// A family event for all ages says as little as no age (null). Termine › Für euch (evPersonal) uses exactly this.
function offerFits(o) {
  if (!hasFamily()) return null;
  if (allAges(o)) return null;
  const known = o.age_min_m != null || o.age_max_m != null;
  if (o.for_parents && !known) return !!store.profile.expecting || familyAges().some(a => a.min < 3);
  if (!known) return o.audience === 'erwachsene' ? false : null;
  return familyAges().some(a => ageIn(a, o.age_min_m ?? 0, o.age_max_m ?? 999)) || (!!o.for_parents && !!store.profile.expecting && !o.age_min_m);
}
const fmtDay = d => {
  const t = today0(), diff = Math.round((d - t) / 864e5);
  return diff === 0 ? tl('Heute') : diff === 1 ? tl('Morgen') : `${WD[dayIdx(d)]} ${d.getDate()}.${d.getMonth() + 1}.`;
};
// minutes after midnight; offers without a time (counselling hours, exhibitions) at the end of their day
const timeKey = o => o.time_from ? +o.time_from.slice(0, 2) * 60 + +o.time_from.slice(3, 5) : 24 * 60;
const dayHead = d => { const diff = Math.round((d - today0()) / 864e5), long = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }); return diff === 0 ? tl('Heute · ') + long : diff === 1 ? tl('Morgen · ') + long : long; };
// a sorted [[date, offer], ...] list with a heading per day: Heute, Morgen, Samstag, 14. November
function dayListHtml(list) {
  let out = '', cur = null;
  for (const [d, o] of list) {
    const k = ymd(d);
    if (k !== cur) { out += `${cur ? '</ol>' : ''}<h4 class="dayhead">${esc(dayHead(d))}</h4><ol class="list">`; cur = k; }
    out += evRowHtml(o, d);
  }
  return cur ? out + '</ol>' : '';
}
const byDayTime = (a, b) => a[0] - b[0] || timeKey(a[1]) - timeKey(b[1]);
const saveBtn = o => o.id ? `<button type="button" class="savebtn${isSaved(o.id) ? ' on' : ''}" data-saveoffer="${o.id}" data-inline="1" aria-pressed="${isSaved(o.id)}" aria-label="${isSaved(o.id) ? tl('Nicht mehr merken') : tl('Merken')}">${svg('heart')}</button>` : '';
function offerItem(o, nd, opts = {}) {
  const place = o.place_id && byId.get(o.place_id);
  const d = state.me && ((o.lat && o.lon) || place) ? dist(origin(), place ? [place.lat, place.lon] : [o.lat, o.lon]) : null;
  const fits = offerFits(o);
  const tags = [whoTag(o), o.free ? tl('kostenlos') : o.price, o.kind === 'gruppe' ? (isRecurring(o) ? tl('regelmäßig') : undated(o) ? tl('Termine beim Anbieter') : tl('offenes Treffen')) : o.kind === 'kurs' ? (o.sessions > 1 ? `${tl('Kurs,')} ${o.sessions}×` : tl('Kurs')) : '',
    o.status === 'ausgebucht' ? tl('Ausgebucht') : '', opts.more ? (opts.more === 1 ? tl('+1 weiterer Termin') : tl('+{n} weitere Termine', { n: opts.more })) : '']
    .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
  const box = opts.timeOnly
    ? (o.time_from ? `<span class="datebox time"><b>${esc(o.time_from)}</b><span>${o.time_to ? tl('bis') + ' ' + esc(o.time_to) : tl('Uhr')}</span></span>` : `<span class="datebox time"><span>${tl('ganztags')}</span></span>`)
    : `<span class="datebox"><b>${nd && !undated(o) ? esc(fmtDay(nd)) : '–'}</b><span>${esc(o.time_from || '')}</span></span>`;
  const inner = `${box}
    <span><h3>${esc(titleOf(o))}</h3><span class="meta">${esc(TOPIC_LABEL[o.topic] || '')}${o.venue ? ' · ' + esc(o.venue) : ''}${d != null ? ' · ' + fmtDist(d) : ''}</span>
    <span class="mini${fits === true ? ' fit' : ''}">${fits === true ? `<span class="fitchip">${tl('passt zu euch')}</span>` : ''}${tags}</span></span><span></span>`;
  return o.id ? `<li class="offrow"><button type="button" class="item offer" data-offer="${o.id}">${inner}</button>${saveBtn(o)}</li>` : `<li><div class="item offer">${inner}</div></li>`;
}

// ---------- Map ----------
// Hamburg and the Umland (about 100 km): where places may be added. One box for the app, community.js, mod.js and the
// server (server/pb_hooks/djuu_community.js BOUNDS): [[south, west], [north, east]]
const AREA_BOX = [[52.65, 8.48], [54.45, 11.51]];
const inAreaBox = (lat, lon) => lat > AREA_BOX[0][0] && lat < AREA_BOX[1][0] && lon > AREA_BOX[0][1] && lon < AREA_BOX[1][1];
// wide enough for the Umland highlights (up to 100 km: Heide Park, Hansa-Park, Walsrode …) and for Neuwerk
const map = L.map('map', { zoomControl: false, minZoom: 8, maxZoom: 19, maxBounds: [[52.6, 8.3], [54.4, 11.2]] }).setView([53.5600, 9.9800], 13);
// Simplified, Google-like vector basemap from OpenFreeMap (free, no key). Always the light style (dark was too dark).
// Free basemaps without an API key. Vector styles load by URL, raster tiles through a small style object.
const OSM_C = `© <a href="https://www.openstreetmap.org/copyright">${tl('OpenStreetMap')}</a>`;
const OFM = id => ({ url: `https://tiles.openfreemap.org/styles/${id}`, attr: `${OSM_C} · <a href="https://openfreemap.org">${tl('OpenFreeMap')}</a>` });
const VT = id => ({ url: `https://tiles.versatiles.org/assets/styles/${id}/style.json`, attr: `${OSM_C} · <a href="https://versatiles.org">${tl('VersaTiles')}</a>` });
const BM = id => ({ url: `https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/${id}.json`, attr: `${tl('© GeoBasis-DE /')} <a href="https://www.bkg.bund.de">BKG</a> (${new Date().getFullYear()}) <a href="https://creativecommons.org/licenses/by/4.0/">${tl('CC BY 4.0')}</a>` });
const RT = (tiles, maxzoom, attr) => ({ raster: { tiles, maxzoom }, attr });
const MAP_STYLES = [
  { sec: tl('Für jeden Tag') },
  { id: 'liberty', label: tl('Standard'), ...OFM('liberty') }, { id: 'bright', label: tl('Kräftig'), ...OFM('bright') }, { id: 'positron', label: tl('Sehr ruhig'), ...OFM('positron') },
  { id: 'colorful', label: tl('Bunt'), ...VT('colorful') }, { id: 'natural', label: tl('Natur'), ...VT('natural') }, { id: 'muted', label: tl('Gedämpft'), ...VT('muted') }, { id: 'gray', label: tl('Grau'), ...VT('gray') },
  { sec: tl('Amtliche Karte') },
  { id: 'bm_col', label: tl('basemap.de Farbe'), ...BM('bm_web_col') }, { id: 'bm_top', label: tl('basemap.de Relief'), ...BM('bm_web_top') }, { id: 'bm_gry', label: tl('basemap.de Grau'), ...BM('bm_web_gry') },
  { sec: tl('Klassisch und speziell') },
  { id: 'osm', label: tl('OpenStreetMap'), ...RT(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], 19, OSM_C) },
  { id: 'hot', label: tl('Humanitär'), ...RT(['https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'], 19, `${OSM_C} ${tl('· Stil:')} <a href="https://www.hotosm.org">HOT</a>`) },
  { id: 'cyclosm', label: tl('Fahrrad'), ...RT(['https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', 'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'], 19, `${OSM_C} ${tl('· Stil:')} <a href="https://www.cyclosm.org">${tl('CyclOSM')}</a>`) },
  { id: 'topo', label: tl('Topografisch'), ...RT(['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png'], 17, `${OSM_C}${tl(', SRTM · Stil: ©')} <a href="https://opentopomap.org">${tl('OpenTopoMap')}</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">${tl('CC BY-SA')}</a>)`) },
  { id: 'toner', label: tl('Schwarz-Weiß'), ...VT('toner') },
  { id: 'satellite', label: tl('Satellit'), url: 'https://tiles.versatiles.org/assets/styles/satellite/style.json', attr: `${OSM_C} · <a href="https://versatiles.org/sources/">${tl('VersaTiles-Quellen')}</a>` },
  { sec: tl('Dunkel') },
  { id: 'colorful-dark', label: tl('Bunt dunkel'), ...VT('colorful-dark') }, { id: 'gray-dark', label: tl('Grau dunkel'), ...VT('gray-dark') }, { id: 'fiord', label: tl('Blaugrau'), ...OFM('fiord') }, { id: 'dark', label: tl('Dunkel'), ...OFM('dark') },
];
const mapStyle = () => MAP_STYLES.find(m => m.id && m.id === store.mapStyle) || MAP_STYLES[1];
const styleUrl = (m = mapStyle()) => m.url || ({ version: 8, sources: { r: { type: 'raster', tiles: m.raster.tiles, tileSize: 256, maxzoom: m.raster.maxzoom } }, layers: [{ id: 'r', type: 'raster', source: 'r' }] });
const attrText = m => `${m.attr} ${tl('· Quellen je Ort')}`;
// Djuu colours for the default style only; the other styles keep their own look.
function tintMap(gl) {
  gl.on('style.load', () => {
    if (mapStyle().id !== 'liberty') return;
    for (const l of gl.getStyle().layers) {
      const set = (prop, v) => gl.setPaintProperty(l.id, prop, v);
      if (l.id === 'background') set('background-color', '#F5F1E8');
      else if (l.id === 'landuse_residential') set('fill-color', '#F5F1E8');
      else if (l.id === 'water') set('fill-color', '#CDE8F2');
      else if (/^waterway/.test(l.id) && l.type === 'line') set('line-color', '#CDE8F2');
      else if (['park', 'landcover_wood', 'landcover_grass'].includes(l.id)) set('fill-color', '#D4ECC9');
      else if (l.id === 'park_outline') set('line-color', '#D4ECC9');
      else if (/(road|bridge|tunnel)_(motorway|trunk_primary|secondary_tertiary)_casing$/.test(l.id)) set('line-color', '#FFFFFF');
      else if (/(road|bridge|tunnel)_(motorway|trunk_primary|secondary_tertiary)$/.test(l.id)) set('line-color', '#FBE3A0');
    }
  });
}
const baseLayer = L.maplibreGL({ style: styleUrl() }).addTo(map);
tintMap(baseLayer.getMaplibreMap());
map.attributionControl.setPosition('bottomleft').setPrefix(false).addAttribution(attrText(mapStyle()));
function setMapStyle(id) {
  const old = mapStyle();
  store.mapStyle = id; save();
  map.attributionControl.removeAttribution(attrText(old)).addAttribution(attrText(mapStyle()));
  baseLayer.getMaplibreMap().setStyle(styleUrl(), { diff: false });
}
const cluster = L.markerClusterGroup({
  // group markers only when the whole city is in view; from district level on every place is its own (smaller) dot
  chunkedLoading: true, showCoverageOnHover: false, disableClusteringAtZoom: 16, spiderfyOnMaxZoom: false,
  maxClusterRadius: z => z <= 13 ? 50 : 34,
  iconCreateFunction: c => {
    const n = c.getChildCount(), size = n < 50 ? '' : n < 300 ? 'm' : 'l';
    return L.divIcon({ html: `<div class="mkhit"><div class="cluster ${size}" aria-hidden="true">${n < 1000 ? n : Math.round(n / 100) / 10 + 'k'}</div><span class="sr">${esc(tl('{n} Orte', { n: nf.format(n) }))}</span></div>`, className: '', iconSize: [44, 44] });
  },
});
map.addLayer(cluster);
// compact markers until street level, so single dots stay readable without clustering
const zoomClass = () => { const c = map.getContainer().classList; c.toggle('zs', map.getZoom() < 15); c.toggle('zd', map.getZoom() < 14); };
map.on('zoomend', zoomClass); zoomClass();
const iconCache = {};
// events on the map carry their date (the first one in the chosen time) on the pin
let offerDate = new Map();
const pinDate = d => `${d.getDate()}.${d.getMonth() + 1}.`;
function iconFor(p, unknown, og) {
  const date = og?.id === 'events' && offerDate.get(p.id) ? pinDate(offerDate.get(p.id)) : '';
  // live state on the pin: a lift out of order (red, crossed), a pharmacy on emergency duty (green ring)
  const bad = !og && p.lift?.[0] === 'ausser_betrieb', duty = !og && !!dutyNow(p);
  const g = og || groupOf(p), icon = og ? og.icon : iconOf(p), tip = !!p.f.tipp, k = g.id + icon + (unknown ? 'u' : '') + (p.mine ? 'm' : '') + (tip ? 't' : '') + (bad ? 'b' : '') + (duty ? 'd' : '') + date;
  return iconCache[k] || (iconCache[k] = L.divIcon({ className: '', iconSize: [44, 44], html: `<div class="mkhit"><div class="mk${unknown ? ' unk' : ''}${p.mine ? ' mine' : ''}${tip ? ' tip' : ''}${bad ? ' bad' : ''}${duty ? ' duty' : ''}" style="--c:${bad ? '#C92A2A' : tip ? '#0E8F84' : g.color}"><svg viewBox="0 0 24 24">${ICON[icon]}</svg>${tip ? `<span class="star">${svg('star', '')}</span>` : ''}${bad ? `<span class="badx">${svg('close', '')}</span>` : ''}</div>${date ? `<span class="mkdate">${date}</span>` : ''}</div>` }));
}
function markerFor(p, unknown, og) {
  if (!p.marker) { p.marker = L.marker([p.lat, p.lon], { title: p.name, alt: p.name }); p.marker.on('click', () => showPlace(p.id, true)); }
  const icon = iconFor(p, unknown, og);
  if (p.marker.options.icon !== icon) p.marker.setIcon(icon);
  return p.marker;
}
const WX_LABEL = { dry: '', fog: tl('Nebel'), rain: tl('Regen'), sleet: tl('Schneeregen'), snow: tl('Schnee'), hail: tl('Hagel'), thunderstorm: tl('Gewitter') };
let WX = null;
async function loadWeather() {
  try {
    const r = await fetch('https://api.brightsky.dev/current_weather?lat=53.55&lon=10.0', { referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!r.ok) return;
    const w = (await r.json()).weather;
    WX = { temp: Math.round(w.temperature), cond: w.condition };
    if (view().type === 'list') renderPanel();
  } catch (e) { /* weather is optional */ }
}
function wxHtml() {
  if (!WX) return '';
  const wet = ['rain', 'sleet', 'snow', 'hail', 'thunderstorm'].includes(WX.cond), hot = WX.temp >= 26;
  const label = `${WX.temp}°${WX_LABEL[WX.cond] ? ' ' + WX_LABEL[WX.cond] : ''}`;
  if (wet) return `<button type="button" class="tool wx${state.preset === 'regen' ? ' on' : ''}" data-wx="rain"><span>${esc(label)} ${tl('· Drinnen zeigen')}</span></button>`;
  if (hot) return `<button type="button" class="tool wx" data-wx="hot"><span>${esc(label)} ${tl('· Wasser zeigen')}</span></button>`;
  return `<span class="tool wx plain"><span>${esc(label)}</span></span>`;
}
let meMarker = null;
map.on('click', e => {
  if (state.picking) { state.picking = false; setArea({ type: 'radius', r: state.area.type === 'radius' ? state.area.r : 1000, center: [e.latlng.lat, e.latlng.lng] }); stack = [{ type: 'list' }]; go({ type: 'area' }, 'half'); return; }
  if (state.drawing) { state.drawing.push([e.latlng.lat, e.latlng.lng]); drawArea(); renderPanel(); renderTop(); return; }
  if (view().type === 'card') return home('peek');
  if (!desktop() && view().type === 'list') setSize('peek');
});
map.on('moveend', () => { if (view().type === 'list') renderPanel(); });

// ---------- Filtering ----------
// ---------- Area (Gebiet): all Hamburg, district, radius around me or a point, drawn polygon ----------
// places outside Hamburg's border carry the district 'Umland' (set by db/export.py): their own region, not part of 'Ganz Hamburg'
const UMLAND = 'Umland', dLabel = d => d === UMLAND ? tl(UMLAND) : d;
// a radius can sit around me, a point, or one of the family's saved places (Zuhause, Arbeit …): center 'place:<id>'
const savedPlaces = () => (store.places || []).filter(p => p.lat && p.lon);
const areaPlace = a => typeof a.center === 'string' && a.center.startsWith('place:') ? savedPlaces().find(p => p.id === a.center.slice(6)) : null;
const areaCenter = a => { if (a.center === 'me') return state.me || [map.getCenter().lat, map.getCenter().lng]; if (typeof a.center === 'string') { const p = areaPlace(a); return p ? [p.lat, p.lon] : [map.getCenter().lat, map.getCenter().lng]; } return a.center; };
function inPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function areaOk(p) {
  const a = state.area;
  if (a.type === 'district') return dNames(a).includes(p.district);
  if (a.type === 'radius') { const c = areaCenter(a); return Math.abs(p.lat - c[0]) < a.r / 1e5 && dist(c, [p.lat, p.lon]) <= a.r; }
  if (a.type === 'poly') return inPoly([p.lat, p.lon], a.pts);
  return p.district !== UMLAND; // 'Ganz Hamburg': the Umland is its own region
}
const fmtR = r => r < 1000 ? r + ' m' : nf.format(r / 1000) + ' km';
const dNames = a => a.names || (a.name ? [a.name] : []);
// Radius slider: 500 m to 20 km without steps, finer at the short end (the first half covers about 500 m to 5 km)
const R_MIN = 500, R_MAX = 20000;
const posToR = pos => { const x = pos / 1000, m = R_MIN + (R_MAX - R_MIN) * x * x; return m < 2000 ? Math.round(m / 100) * 100 : m < 10000 ? Math.round(m / 500) * 500 : Math.round(m / 1000) * 1000; };
const rToPos = m => Math.round(Math.sqrt(Math.max(0, Math.min(1, (m - R_MIN) / (R_MAX - R_MIN)))) * 1000);
// without a chosen center the slider starts around the default saved place, else me, else the map's middle
const defaultCenter = () => { const d = savedPlaces().find(p => p.def) || savedPlaces()[0]; return d ? 'place:' + d.id : state.me ? 'me' : [map.getCenter().lat, map.getCenter().lng]; };
const AREA_UI = { distOpen: false, dq: '' };
function areaLabel(a = state.area) {
  if (a.type === 'district') { const n = dNames(a).map(dLabel); return n.slice(0, 2).join(', ') + (n.length > 2 ? ` +${n.length - 2}` : ''); }
  if (a.type === 'radius') { const pl = areaPlace(a); return `${fmtR(a.r)} ${tl('um')} ${a.center === 'me' ? tl('dich') : pl ? tl(pl.name) : tl('Punkt')}`; }
  if (a.type === 'poly') return tl('Eigenes Gebiet');
  return tl('Ganz Hamburg');
}
let areaLayer = null;
function drawArea() {
  if (areaLayer) { map.removeLayer(areaLayer); areaLayer = null; }
  const a = state.area, style = { color: '#6B4EE6', weight: 2, dashArray: '6 6', fillColor: '#6B4EE6', fillOpacity: .06, interactive: false };
  if (state.drawing) {
    areaLayer = L.layerGroup([state.drawing.length > 2 ? L.polygon(state.drawing, style) : L.polyline(state.drawing, style)]
      .concat(state.drawing.map(pt => L.circleMarker(pt, { radius: 5, color: '#6B4EE6', fillColor: '#FFD166', fillOpacity: 1, weight: 2, interactive: false }))));
  } else if (a.type === 'radius') areaLayer = L.circle(areaCenter(a), { radius: a.r, ...style });
  else if (a.type === 'poly') areaLayer = L.polygon(a.pts, style);
  if (areaLayer) areaLayer.addTo(map);
}
function setArea(a, fit = true) {
  state.area = a; store.area = a; save();
  drawArea(); state.listLimit = 40; refresh();
  if (!fit) return;
  if (areaLayer && areaLayer.getBounds) map.fitBounds(areaLayer.getBounds(), { padding: [30, 30] });
  else if (a.type === 'district') { const ns = dNames(a), pts = places.filter(p => ns.includes(p.district)).map(p => [p.lat, p.lon]); if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); }
}
let DISTRICTS = [];
function districtList() {
  if (!DISTRICTS.length) { const n = {}; for (const p of places) if (p.district) n[p.district] = (n[p.district] || 0) + 1; DISTRICTS = Object.keys(n).sort((a, b) => (a === UMLAND) - (b === UMLAND) || a.localeCompare(b, 'de')); }
  return DISTRICTS;
}

// the one selected sub-category (tags only apply then), or null
const soleGroup = () => state.groups.size === 1 ? GROUP[[...state.groups][0]] : null;
const offerGroup = () => { const g = soleGroup(); return g && g.offers ? g : null; };
// the tags that belong to a group: its sub-categories and the place tags they stand for (Museen & Kultur = museum, kultur …)
const groupTagIds = g => new Set((TAGS[g.id] || []).flatMap(t => [t.id, ...(t.of || [])]));
// selected tags of a group, split into alternatives (any) and properties (all), plus the audience of offers.
// Kinds widen the choice (Café or Restaurant or Eis); properties (p: 1, e.g. Vegan, Draußen sitzen, Wasserspiel) must hold in addition.
// only: with several groups chosen (quick questions), a group looks only at the tags that belong to it
function tagSel(g, only) {
  const list = TAGS[g.id] || [], sel = list.filter(t => state.tags.has(t.id));
  // tags chosen elsewhere (quick questions, search) that are not a sub-category of their own count as alternatives too
  let loose = [...state.tags].filter(t => !t.startsWith('aud:') && !list.some(x => x.id === t));
  if (only) loose = loose.filter(t => only.has(t));
  const kinds = sel.filter(t => !t.id.startsWith('aud:') && !t.p);
  return { any: kinds.flatMap(t => t.of || [t.id]).concat(loose), all: sel.filter(t => t.p).map(t => t.id), aud: sel.filter(t => t.id.startsWith('aud:')).map(t => t.id.slice(4)) };
}
function tagsOk(tags, g, only) {
  const s = tagSel(g, only);
  return (!s.any.length || s.any.some(t => tags.has(t))) && s.all.every(t => tags.has(t));
}
// offers of an offer group (next 8 weeks) that pass the selected tags
function groupOffers(g) {
  const s = tagSel(g), t0 = today0(), r = g.id === 'events' && state.evRange;
  // opened from Termine ("Karte"): exactly the offers the Termine list showed
  const ev = state.evIds?.g === g.id ? state.evIds.ids : null;
  return OFFERS.filter(o => g.offers.includes(o.kind) && (!ev || ev.has(o.id)) && (!s.aud.length || s.aud.includes(o.audience)) && (!s.any.length || s.any.includes(o.topic)))
    .map(o => [r ? firstIn(o, r[0], r[1]) : nextAfterNow(o), o]).filter(([d]) => d && (ev || d - t0 < 56 * 864e5)); // events without a date never reach the map
}
let offerPlaces = new Map(); // group id -> Set of place ids with matching offers (rebuilt in compute)
function memberOf(p, g) {
  if (g.virtual) return !!p.f.tipp;
  if (g.offers) return offerPlaces.get(g.id)?.has(p.id) || false;
  return g.cats.includes(p.cat) || !!(g.extra && g.extra(p));
}
// Drinnen: only places we know are indoors; Draußen: outdoor places and those without the information
const ioOk = p => !state.io || (state.io === 'drinnen' ? p.tags.has('drinnen') : p.tags.has('draussen') || !p.tags.has('drinnen'));
// Kitas are not places to drop in: on the map and in lists only when asked for (sub-category Kitas, a search, a saved one,
// a course or event there). Kitas with an Eltern-Kind-Zentrum are open to every family with small children: always shown.
const kitaWanted = () => state.tags.has('kita') || state.cats.has('kita') || !!state.q.trim() || [...state.groups].some(id => GROUP[id].offers);
const kitaShown = p => p.cat !== 'kita' || truthy(p.f.ekiz?.[0] || '') === 'yes' || kitaWanted() || state.onlyPlace === p.id || store.favorites.includes(p.id);
// Stops, stations and lifts are not where families go, they are how they get there: shown with Mobilität (or one of its
// sub-categories), a search or a saved one; every place and event page names its station and the state of its lifts
const TRANSIT_CATS = new Set(['haltestelle', 'bahnhof', 'aufzug']);
const transitShown = p => !TRANSIT_CATS.has(p.cat) || state.groups.has('mobil') || state.cats.has(p.cat) || !!state.q.trim() || state.onlyPlace === p.id || store.favorites.includes(p.id);
function inSelection(p) {
  if (!ioOk(p) || !areaOk(p) || !kitaShown(p) || !transitShown(p)) return false;
  if (!state.groups.size && !state.cats.size) return true;
  if (state.cats.has(p.cat)) return true;
  const several = state.groups.size > 1;
  for (const id of state.groups) {
    const g = GROUP[id];
    if (!memberOf(p, g)) continue;
    if (g.offers) return true;
    // several groups (quick questions like "Es ist heiß"): each group is checked against its own tags; a group without any of
    // the chosen tags counts as a whole
    const own = several ? groupTagIds(g) : null;
    if (several && ![...state.tags].some(t => own.has(t))) return true;
    if (tagsOk(p.tags, g, own)) return true;
  }
  return false;
}
function compute() {
  offerPlaces = new Map();
  offerDate = new Map();
  for (const id of state.groups) if (GROUP[id].offers) {
    const list = groupOffers(GROUP[id]);
    offerPlaces.set(id, new Set(list.map(([, o]) => o.place_id).filter(Boolean)));
    if (id === 'events') for (const [d, o] of list) if (o.place_id && (!offerDate.has(o.place_id) || d < offerDate.get(o.place_id))) offerDate.set(o.place_id, d);
  }
  const q = state.q.trim().toLowerCase();
  const qHits = q ? new Set(searchPlaces(q).map(r => r.p.id)) : null;
  const fs = [...state.filters];
  const res = { match: [], unknown: [] };
  AGE_MAYBE.clear();
  for (const p of places) {
    if (!inSelection(p)) continue;
    if (qHits && !qHits.has(p.id)) continue;
    let unk = false, ok = true, maybe = false;
    for (const f of fs) {
      const v = filterVal(p, f);
      if (v === null || v === undefined) unk = true;
      else if (v === false) { ok = false; break; }
      else if (v === 'maybe') maybe = true;
    }
    if (!ok) continue;
    if (maybe && !unk) AGE_MAYBE.add(p.id);
    (unk ? res.unknown : res.match).push(p);
  }
  return res;
}
// places that pass an age filter only as "passt vermutlich" (see ageFilter): listed after the sure ones
const AGE_MAYBE = new Set();
const maybeLast = (d, p) => d + (AGE_MAYBE.has(p.id) ? 1e8 : 0);
let last = { match: [], unknown: [] };
const shownList = () => state.showUnknown ? last.match.concat(last.unknown) : last.match;
let onlyMarker = null, shownMk = new Set();
function refresh() {
  last = compute();
  if (onlyMarker) { map.removeLayer(onlyMarker); onlyMarker = null; }
  const og = offerGroup(), only = state.onlyPlace && byId.get(state.onlyPlace), want = new Set();
  if (only) {
    // "Nur dieser Ort": one big pin with its name, the others are hidden
    onlyMarker = L.marker([only.lat, only.lon], { zIndexOffset: 1000, title: only.name, icon: L.divIcon({ className: '', iconSize: [52, 52], iconAnchor: [26, 26], html: `<div class="mkhit"><div class="mk big" style="--c:${groupOf(only).color}">${svg(iconOf(only), '')}</div><span class="mklabel">${esc(only.name)}</span></div>` }) })
      .on('click', () => showPlace(only.id, true));
    if (!state.drawing) onlyMarker.addTo(map);
  } else {
    for (const p of last.match) want.add(markerFor(p, false, og));
    if (state.showUnknown) for (const p of last.unknown) want.add(markerFor(p, true, og));
  }
  // only the difference goes in and out of the cluster layer (a full rebuild of 22,000 markers took ~170 ms per tap)
  const drop = [], add = [];
  for (const m of shownMk) if (!want.has(m)) drop.push(m);
  for (const m of want) if (!shownMk.has(m)) add.push(m);
  if (drop.length > shownMk.size / 2) { cluster.clearLayers(); cluster.addLayers([...want]); }
  else { if (drop.length) cluster.removeLayers(drop); if (add.length) cluster.addLayers(add); }
  shownMk = want;
  renderTop();
  if (['list', 'filters'].includes(view().type) || (view().type === 'search' && (ASK.wo || ASK.fi) && !state.sq && !ASK.u)) renderPanel();
}

// ---------- Top bar ----------
function topTitle() {
  if (state.q) return `„${state.q}“`;
  if (state.preset) return PRESETS.find(x => x.id === state.preset).label;
  const g = soleGroup();
  // "Gastro · Café, Eis +2"
  if (g) { const t = (TAGS[g.id] || []).filter(x => state.tags.has(x.id)).map(x => x.label).concat([...state.tags].filter(x => !(TAGS[g.id] || []).some(y => y.id === x)).map(x => TAG_LABEL[x] || x)); return t.length ? `${g.label} · ${t.slice(0, 2).join(', ')}${t.length > 2 ? ` +${t.length - 2}` : ''}` : g.label; }
  return state.groups.size ? tl('Mehrere Kategorien') : tl('Alle Orte');
}
// Under the search bar: the choice as one chip ("✓ Spielen & Toben ✕"), then its sub-categories. Nothing chosen: nothing here.
function selectionHtml() {
  const g = soleGroup(), x = svg('close');
  // drawing an own area: the pins are hidden, "Fertig" floats under the search bar
  if (state.drawing) { const n = state.drawing.length; return `<div class="row selrow drawrow"><button type="button" class="chip selchip" data-drawdone="1"${n >= 3 ? '' : ' disabled'}>${svg('check')}${n >= 3 ? tl('Fertig') : tl('Mindestens 3 Ecken')} · ${n}</button><button type="button" class="chip subsel" data-drawcancel="1">${tl('Abbrechen')}</button></div>`; }
  const only = state.onlyPlace && byId.get(state.onlyPlace);
  if (only) return `<div class="row selrow"><button type="button" class="chip selchip" data-clearonly="1">${svg('check')}${tl('Nur dieser Ort')} ${x}</button></div>`;
  const label = state.q ? `„${state.q}“` : state.preset ? PRESETS.find(p => p.id === state.preset).label : state.groups.size ? (g ? g.label : tl('Mehrere Kategorien')) : '';
  if (!label && !state.io) return '';
  // one row: the category (its name opens it in Suchen, ✕ removes it with everything), then only the chosen sub-categories
  const canOpen = g && TAGS[g.id] && !g.offers && !state.q && !state.preset;
  const cat = !label ? '' : canOpen
    ? `<span class="chip selchip split"><button type="button" class="selname" data-opencat="${g.id}" aria-label="${tl('{name} in Suchen ändern', { name: label })}">${svg(g.icon)}${esc(label)}</button><button type="button" class="selx" data-clearsel="1" aria-label="${esc(label)} ${tl('entfernen')}">${x}</button></span>`
    : `<button type="button" class="chip selchip" data-clearsel="1" aria-label="${esc(label)} ${tl('entfernen')}">${svg(g && !state.q && !state.preset ? g.icon : 'check')}${esc(label)} ${x}</button>`;
  const chosen = g && TAGS[g.id] && !g.offers ? TAGS[g.id].filter(t => state.tags.has(t.id)) : [];
  const shown = chosen.slice(0, 3), rest = chosen.length - shown.length; // more than three: the others as "+N"
  const subs = shown.map(t => `<span class="chip subsel"><span>${svg('check')}${esc(t.label)}</span><button type="button" class="selx" data-tagx="${t.id}" aria-label="${esc(t.label)} ${tl('entfernen')}">${x}</button></span>`).join('')
    + (rest ? `<button type="button" class="chip subsel plusn" data-opencat="${g.id}" aria-label="${tl('{n} weitere Unterkategorien', { n: rest })}">+${rest}</button>` : '');
  const io = state.io ? `<button type="button" class="chip selchip" data-io="${state.io}">${svg('check')}${esc(TAG_LABEL[state.io])} ${x}</button>` : '';
  return `<div class="row selrow">${cat}${subs}${io}</div>`;
}
// One level at a time: 0 = Erleben or Service, 1 = categories of that mode, 2 = tags of the chosen category (old top row, unused on the map now).
function rowHtml() {
  const g = soleGroup();
  const q = state.q ? `<button type="button" class="chip on" data-clearq="1">„${esc(state.q)}“ ${svg('close')}</button>` : '';
  if (state.level === 2 && g && TAGS[g.id]) return q + `<button type="button" class="chip up" data-level="1" style="--c:${g.color}" aria-label="${tl('Andere Kategorie wählen')}">${svg('back')}<span class="ic">${svg(g.icon, '')}</span>${esc(g.short)}</button>` +
    tagCounts(g).map(([t]) => `<button type="button" class="chip tag${state.tags.has(t.id) ? ' on' : ''}" data-tag="${t.id}">${esc(t.label)}</button>`).join('');
  if (state.level >= 1) return q + `<button type="button" class="chip up" data-level="0" style="--c:var(--brand)" aria-label="${tl('Zurück zu Erleben oder Service')}">${svg('back')}${esc(MODES.find(m => m.id === state.mode).label)}</button>` +
    GROUPS.filter(x => x.mode === state.mode).map(x => `<button type="button" class="chip kat${state.groups.has(x.id) ? ' on' : ''}" data-group="${x.id}" style="--c:${x.color}"><span class="ic">${svg(x.icon, '')}</span>${esc(x.short)}</button>`).join('');
  return q + MODES.map(m => `<button type="button" class="chip kat${state.mode === m.id ? ' on' : ''}" data-mode="${m.id}">${m.label}</button>`).join('');
}
function renderTop() {
  const nf_ = state.filters.size + (state.io ? 1 : 0), bar = $('#mapbar');
  if (!bar.childElementCount) {
    // the same search as in "Suchen": a tap opens it with the keyboard, the microphone starts speaking
    bar.innerHTML = `<div class="searchbar"><button type="button" class="sbmain" data-opensearch="1">${svg('sparkle')}<span>${tl('Suchen oder frag Djuu')}</span></button>
      ${Speech ? `<button type="button" class="sbmic" data-opensearch="voice" aria-label="${tl('Spracheingabe starten')}">${svg('mic')}</button>` : ''}</div>
      <button type="button" class="roundbtn" id="mapFilter" data-open="filters" aria-label="${tl('Filter')}"></button>
      <button type="button" class="roundbtn bellbtn" id="bell" data-opennews="1" hidden></button>`;
  }
  const f = $('#mapFilter');
  f.innerHTML = svg('sliders') + (nf_ ? `<span class="pallina sun">${nf_}</span>` : '');
  f.setAttribute('aria-label', nf_ ? tl('Filter, {n} aktiv', { n: nf_ }) : tl('Filter'));
  $('#ctx').innerHTML = selectionHtml();
  if (typeof updateBell === 'function') updateBell();
}
// tags of a group that occur at least once, in their defined order
const tagCountCache = new Map();
function tagCounts(g) {
  if (g.offers) {
    const n = {};
    for (const o of OFFERS) if (g.offers.includes(o.kind)) { n['aud:' + o.audience] = (n['aud:' + o.audience] || 0) + 1; n[o.topic] = (n[o.topic] || 0) + 1; }
    return TAGS[g.id].map(t => [t, n[t.id] || 0]).filter(([, c]) => c);
  }
  if (!tagCountCache.has(g.id)) {
    const n = {};
    for (const p of places) if (memberOf(p, g)) {
      for (const t of p.tags) n[t] = (n[t] || 0) + 1;
      for (const t of TAGS[g.id]) if (t.of && t.of.some(x => p.tags.has(x))) n[t.id] = (n[t.id] || 0) + 1;
    }
    if (!places.length) return [];
    tagCountCache.set(g.id, TAGS[g.id].map(t => [t, n[t.id] || 0]).filter(([, c]) => c));
  }
  return tagCountCache.get(g.id).filter(([t]) => !t.hide || state.tags.has(t.id));
}

// Panel header: where (Gebiet) and how (Filter), plus the active filters as removable chips.
const ioAllowed = () => state.mode === 'erleben' && (!state.groups.size || [...state.groups].every(id => IO_GROUPS.includes(id)));
function toolsHtml(withFilter = true) {
  const nf_ = state.filters.size + (state.io ? 1 : 0);
  const active = (state.io ? [`<button type="button" class="chip on" data-io="${state.io}">${esc(TAG_LABEL[state.io])} ${svg('close')}</button>`] : [])
    .concat([...state.filters].map(id => `<button type="button" class="chip on" data-filter="${id}">${esc(FILTER_LABEL[id])} ${svg('close')}</button>`));
  return `<div class="tools"><button type="button" class="tool${state.area.type !== 'all' ? ' on' : ''}" data-open="area">${svg('pin')}<span>${esc(areaLabel())}</span></button>
    ${withFilter ? `<button type="button" class="tool${nf_ ? ' on' : ''}" data-open="filters">${svg('filter')}<span>${tl('Filter')}${nf_ ? ' · ' + nf_ : ''}</span></button>` : ''}${wxHtml()}</div>
    ${withFilter && active.length ? `<div class="active">${active.join('')}</div>` : ''}`;
}

// ---------- Panel: one stack of views ----------
let stack = [{ type: 'list' }];
const view = () => stack[stack.length - 1];
// Hardware back closes what is open before it leaves the app: one spare history entry stands in front of the page.
let armed = false;
const canClose = () => stack.length > 1 || !!state.drawing || !!state.picking || (!desktop() && $('#panel').dataset.size !== 'peek');
function arm() { if (!armed && canClose()) { history.pushState({ djuu: 1 }, ''); armed = true; } }
function closeTop() {
  const v = view();
  if (state.picking) { state.picking = false; return setSize(desktop() ? 'full' : 'half'); }
  if (state.drawing) { endDrawing(); return back(); }
  if (v.type === 'wizard' && wiz.step > 1) { keepFields(); wiz.step--; return renderWizard(); }
  if (stack.length === 1) return setSize('peek');
  if (stack.length === 2 && ['card', 'search', 'events', 'favs', 'me', 'sos'].includes(v.type)) return home(desktop() ? 'full' : 'peek');
  back();
}
window.addEventListener('popstate', () => {
  armed = false;
  if (!canClose()) return history.back(); // the spare entry was left over: leave for real
  closeTop(); arm();
});
function go(v, size) { if (view().type === v.type && !['detail', 'wir', 'person'].includes(v.type)) stack.pop(); stack.push(v); renderPanel(); setSize(size || 'full'); }
function back() { stack.pop(); if (!stack.length) stack = [{ type: 'list' }]; clearSel(); renderPanel(); if (view().type === 'list') setSize(desktop() ? 'full' : 'half'); else if (view().type === 'card') setSize('card'); if (view().type === 'list') setTab('map'); arm(); }
function home(size = 'peek') { stack = [{ type: 'list' }]; clearSel(); renderPanel(); $('#panelBody').scrollTop = 0; setSize(size); setTab('map'); }
function setSize(s) {
  if (desktop()) s = 'full';
  $('#panel').dataset.size = s; $('#app').dataset.size = s; arm();
}
function clearSel() { if (state.selected) { byId.get(state.selected)?.marker?._icon?.classList.remove('sel'); state.selected = null; } if (wiz.map) { wiz.map.remove(); wiz.map = null; } }
const head = (title, sub = '', canBack = true) => `<div class="ph">${canBack ? `<button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button>` : ''}
  <h2>${title}${sub ? `<span class="sub">${sub}</span>` : ''}</h2>${canBack ? `<button type="button" class="round" data-home="1" aria-label="${tl('Schließen')}">${svg('close')}</button>` : ''}</div>`;

let stayType = null; // a view that renders again keeps its scroll position (filter chips), a new view starts at the top
async function renderPanel() {
  const v = view(), body = $('#panelBody');
  if (rec && v.type !== 'search') rec.abort();
  if (v.type !== 'wizard' && wiz.map) { wiz.map.remove(); wiz.map = null; }
  if (areaMini) { areaMini.map.remove(); areaMini = null; }
  if (v.type === 'list') body.innerHTML = listView();
  else if (v.type === 'detail') { const html = await detailView(v.id); if (view() !== v) return; body.innerHTML = html; bindDetail(v.id); }
  else if (v.type === 'card') body.innerHTML = cardView(v.id);
  else if (v.type === 'filters') body.innerHTML = filtersView();
  else if (v.type === 'area') { body.innerHTML = areaView(); bindAreaMini(); }
  else if (v.type === 'ferien') body.innerHTML = ferienView();
  else if (v.type === 'draw') body.innerHTML = drawView();
  else if (v.type === 'search') { body.innerHTML = searchView(); if ($('#radMini')) bindAreaMini(); }
  else if (v.type === 'sos') body.innerHTML = sosView(v.kind);
  else if (v.type === 'events') body.innerHTML = eventsView();
  else if (['favs', 'me', 'wir', 'person'].includes(v.type)) body.innerHTML = wirRender(v);
  else if (v.type === 'offer') body.innerHTML = offerView(v.id);
  else if (v.type === 'evfilters') body.innerHTML = evFiltersView();
  else if (v.type === 'evtopics') body.innerHTML = evTopicsView();
  else if (v.type === 'evdistricts') body.innerHTML = evDistrictsView();
  else if (v.type === 'evplace') body.innerHTML = evPlaceView();
  else if (v.type === 'evsettings') body.innerHTML = evSettingsView();
  else if (v.type === 'evseries') body.innerHTML = evSeriesView(v.key);
  else if (v.type === 'rate') { body.innerHTML = rateView(v.id); bindRate(v.id); }
  else if (v.type === 'report') body.innerHTML = reportView(v.id);
  else if (v.type === 'wizard') { renderWizard(); return; }
  else if (v.type === 'thanks') body.innerHTML = v.html;
  decorateEmpty(body);
  if (v.type !== 'detail' && v.type !== 'rate' && v.type !== 'list' && !(stayType === v.type && ['evfilters', 'evtopics', 'events', 'evsettings', 'evplace'].includes(v.type))) body.scrollTop = 0;
  stayType = v.type;
}

// the head of the panel on the map: the whole bar can be dragged, a tap folds and unfolds it
const panelHead = title => `<div class="panelhead" data-drag="1"><h2>${title}</h2><span class="showlist">${svg('up')}${tl('Liste anzeigen')}</span></div>`;
// list (the home view)
function listView() {
  if (offerGroup()) return offerListView(offerGroup());
  const o = origin(), only = state.onlyPlace && byId.get(state.onlyPlace);
  const shown = only ? [only] : shownList(); // "Nur dieser Ort": the list says what the map shows
  const sorted = shown.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => maybeLast(a[0], a[1]) - maybeLast(b[0], b[1]));
  const u = only ? 0 : last.unknown.length;
  const sub = state.filters.size && !only
    ? `${nf.format(last.match.length)} ${tl('passen sicher')}${u ? ` · ${nf.format(u)} ${tl('ohne Angabe')} <button type="button" data-unk="1">${state.showUnknown ? tl('ausblenden') : tl('auch zeigen')}</button>` : ''}`
    : `${tl('Nächste zuerst,')} ${state.area.type === 'radius' ? tl('ab Mittelpunkt') : state.me ? tl('von dir aus') : tl('ab Kartenmitte')}`;
  // offline: one calm line (the places work from the stored copy, the map background needs the network)
  const offline = navigator.onLine === false ? `<p class="note offline">${tl('Offline: Orte und Öffnungszeiten gehen, die Karte lädt erst wieder mit Netz.')}</p>` : '';
  // today for the family: counted exactly as Termine › Für euch shows it, a tap opens that view
  const tc = hasFamily() && OFFERS.length ? todayCounts() : { ev: 0, wk: 0 }, todayFits = tc.ev + tc.wk;
  const todayText = [tc.ev && (tc.ev === 1 ? tl('1 Event') : tl('{n} Events', { n: tc.ev })), tc.wk && (tc.wk === 1 ? tl('1 Gruppe oder Kurs') : tl('{n} Gruppen und Kurse', { n: tc.wk }))].filter(Boolean).join(' · ');
  const breakCard = ferienCard(21);
  const famCard = breakCard || todayFits && !state.filters.size ? breakCard + (!todayFits || state.filters.size ? '' : `<button type="button" class="askcard" data-evtodaycard="1" style="width:100%;border:0;text-align:left;margin:0 0 8px"><div><b>${esc(tl('Heute passend: {what}', { what: todayText }))}</b><span>${tl('für')} ${esc(familyAges().map(k => k.name).join(', ') || tl('euch'))}</span></div>${svg('cal')}</button>`) : '';
  const chosen = state.groups.size || state.q || state.preset;
  return `${panelHead(`${nf.format(shown.length)} ${shown.length === 1 ? tl('Ort') : tl('Orte')}${only ? ' · ' + tl('Nur dieser Ort') : chosen ? ' · ' + esc(topTitle()) : ''}`)}<p class="sub panelsub">${sub}</p>${offline}${toolsHtml()}${famCard}
    ${sorted.length ? `<ol class="list">${sorted.slice(0, state.listLimit).map(([d, p]) => itemHtml(p, d)).join('')}</ol>
    ${sorted.length > state.listLimit ? `<button type="button" class="more" data-more="1">${tl('Mehr anzeigen')}</button>` : ''}`
    : `<div class="empty"><b>${tl('Hier ist nichts dabei.')}</b>${state.area.type !== 'all' ? tl('Probier ein größeres Gebiet oder weniger Filter.') : tl('Probier weniger Filter oder zoom raus.')}</div>`}`;
}
// Kurse & Gruppen / Events on the map: the offers themselves, nearest first
function offerListView(g) {
  const o0 = origin();
  const near = o => { const pl = o.place_id && byId.get(o.place_id); return pl ? dist(o0, [pl.lat, pl.lon]) : o.lat ? dist(o0, [o.lat, o.lon]) : 9e9; };
  const list = groupOffers(g).filter(([, o]) => offerInArea(o) && (!o.place_id || !byId.get(o.place_id) || inSelection(byId.get(o.place_id))))
    .map(([d, o]) => [near(o), d, o]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const fromEv = state.evIds?.g === g.id, r = g.id === 'events' && state.evRange;
  const when = fromEv ? tl('wie in Termine gefiltert') : r ? rangeText(r) : tl('in den nächsten 8 Wochen');
  const unit = g.id === 'events' ? (list.length === 1 ? tl('Event') : tl('Events')) : (list.length === 1 ? tl('Angebot') : tl('Angebote'));
  return `${panelHead(`${nf.format(list.length)} ${unit} · ${esc(topTitle())}`)}<p class="sub panelsub">${esc(when)}${fromEv && r ? ' · ' + esc(rangeText(r)) : ''}, ${state.me ? tl('von dir aus') : tl('ab Kartenmitte')}</p>${toolsHtml(false)}
    ${list.length ? `<ol class="list">${list.slice(0, state.listLimit).map(([, d, o]) => offerItem(o, d)).join('')}</ol>
    ${list.length > state.listLimit ? `<button type="button" class="more" data-more="1">${tl('Mehr anzeigen')}</button>` : ''}`
    : `<div class="empty"><b>${tl('Hier ist nichts dabei.')}</b>${tl('Probier andere Tags.')}</div>`}
    <p class="note">${tl('Anmeldung und aktuelle Infos beim Anbieter. Alle Termine nach Datum: Tab „Termine“.')}</p>`;
}
function offerInArea(o) {
  if (state.area.type === 'all') return true;
  const pl = o.place_id && byId.get(o.place_id);
  return pl ? areaOk(pl) : o.lat ? areaOk({ lat: o.lat, lon: o.lon, district: null }) : false;
}
const PROP_TAGS = new Set(Object.values(TAGS).flat().filter(t => t.p).map(t => t.id).concat('groessere'));
// opts.hours: say "Öffnungszeiten unbekannt" when nothing is known (Dringend)
function itemHtml(p, d, opts = {}) {
  const yes = liveChip(p) + [...p.tags].filter(t => PROP_TAGS.has(t)).slice(0, 2).map(t => `<span>${esc(TAG_LABEL[t])}</span>`)
    .concat(dogChip(dogOf(p)) || [])
    .concat(chipAttrs(p).map(a => `<span>${esc(a.label)}</span>`)).join('');
  const ot = openText(p) || (opts.hours ? `<span class="muted">${tl('Öffnungszeiten unbekannt')}</span>` : '');
  const maybe = AGE_MAYBE.has(p.id) ? `<span class="maybe">${tl('Alter: passt vermutlich')}</span>` : '';
  return `<li><button type="button" class="item" data-id="${p.id}">${badge(p)}
    <span><h3>${esc(p.name)}${p.f.tipp ? ` <span class="tipdot" title="${tl('Djuu-Tipp')}">${svg('star', '')}</span>` : ''}</h3><span class="meta">${esc(CAT_LABEL[p.cat] || '')}${ot ? ' · ' + ot : ''}</span>${yes || maybe ? `<span class="mini">${yes}${maybe}</span>` : ''}</span>
    <span class="dist">${fmtDist(d)}</span></button></li>`;
}

// detail
function showPlace(id, fromMap) {
  const p = byId.get(id); if (!p) return;
  if (fromMap && view().type === 'detail') stack.pop();
  if (fromMap && !desktop()) { go({ type: 'card', id }, 'card'); map.panInside([p.lat, p.lon], { paddingTopLeft: [24, 70], paddingBottomRight: [70, 210] }); }
  else go({ type: 'detail', id }, desktop() ? 'full' : 'half');
  if (state.selected) byId.get(state.selected)?.marker?._icon?.classList.remove('sel');
  state.selected = id;
  setTimeout(() => p.marker?._icon?.classList.add('sel'), 50);
}
// small card for a tapped pin: the map stays visible, a tap opens the full page
function cardView(id) {
  const p = byId.get(id), d = dist(origin(), [p.lat, p.lon]), fav = store.favorites.includes(id), ot = openText(p);
  const yes = liveChip(p) + [...p.tags].filter(t => PROP_TAGS.has(t)).slice(0, 2).map(t => `<span>${esc(TAG_LABEL[t])}</span>`).concat(dogChip(dogOf(p)) || [])
    .concat(chipAttrs(p).map(a => `<span>${esc(a.label)}</span>`)).concat(!TRANSIT_CATS.has(p.cat) && liftWarn([p.lat, p.lon]) ? [`<span class="livechip bad">${tl('Aufzug außer Betrieb')}</span>`] : []).join('');
  return `<div class="pincard"><button type="button" class="pinmain" data-detail="${id}">${badge(p)}
      <span><h3>${esc(p.name)}${p.f.tipp ? ` <span class="tipdot" title="${tl('Djuu-Tipp')}">${svg('star', '')}</span>` : ''}</h3>
      <span class="meta">${esc(CAT_LABEL[p.cat] || '')}${ot ? ' · ' + ot : ''}${state.me ? ' · ' + fmtDist(d) : ''}</span>${yes ? `<span class="mini">${yes}</span>` : ''}</span></button>
    <button type="button" class="round" data-home="peek" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    <div class="pinacts"><a class="btn primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${svg('route')}${tl('Route')}</a>
      <button type="button" class="btn${fav ? ' on' : ''}" data-fav="${id}" aria-label="${fav ? tl('Gemerkt') : tl('Merken')}">${svg('heart')}</button>
      <button type="button" class="btn" data-detail="${id}">${tl('Details')}</button></div>`;
}
const CUISINE = { italian: tl('Italienisch'), pizza: tl('Pizza'), pasta: tl('Pasta'), asian: tl('Asiatisch'), german: tl('Deutsch'), regional: tl('Regional'), kebab: tl('Döner'), burger: tl('Burger'), sushi: tl('Sushi'), vietnamese: tl('Vietnamesisch'), greek: tl('Griechisch'), turkish: tl('Türkisch'), indian: tl('Indisch'), chinese: tl('Chinesisch'), japanese: tl('Japanisch'), korean: tl('Koreanisch'), thai: tl('Thailändisch'), coffee_shop: tl('Kaffee'), cake: tl('Kuchen'), ice_cream: tl('Eis'), sandwich: tl('Sandwiches'), fish: tl('Fisch'), seafood: tl('Meeresfrüchte'), portuguese: tl('Portugiesisch'), french: tl('Französisch'), spanish: tl('Spanisch'), mexican: tl('Mexikanisch'), international: tl('International'), breakfast: tl('Frühstück'), steak_house: tl('Steak'), salad: tl('Salat'), mediterranean: tl('Mediterran'), american: tl('Amerikanisch'), arab: tl('Arabisch'), persian: tl('Persisch'), bagel: tl('Bagels'), crepe: tl('Crêpes'), tapas: tl('Tapas') };
const SPORT = { soccer: tl('Fußball'), basketball: tl('Basketball'), multi: tl('Mehrere Sportarten'), table_tennis: tl('Tischtennis'), tennis: tl('Tennis'), swimming: tl('Schwimmen'), climbing: tl('Klettern'), equestrian: tl('Reiten'), gymnastics: tl('Turnen'), handball: tl('Handball'), volleyball: tl('Volleyball'), beachvolleyball: tl('Beachvolleyball'), athletics: tl('Leichtathletik'), hockey: tl('Hockey'), skateboard: tl('Skaten'), rowing: tl('Rudern'), sailing: tl('Segeln'), canoe: tl('Kanu') };
const sportText = v => (v || '').split(';').map(c => SPORT[c.trim().toLowerCase()]).filter(Boolean).join(', ');
const cuisineText = v => (v || '').split(';').map(c => CUISINE[c.trim().toLowerCase()]).filter(Boolean).join(', ');
// photos: ids in this phone's photo store, or addresses of approved photos on the Djuu server (community.js checks them);
// those of others can be reported ("Melden"), a reported one is gone on this phone at once
async function photoTags(ids) {
  const out = [];
  for (const id of ids || []) {
    if (/^https?:\/\//.test(id)) {
      if (store.reports.some(x => x.targetId === id)) continue;
      out.push(`<figure class="uphoto"><img src="${esc(id)}" alt="${tl('Foto von Nutzer')}" loading="lazy"><button type="button" class="linkbtn" data-reportphoto="${esc(id)}">${tl('Melden')}</button></figure>`); continue;
    }
    try { const d = await photoDB.get(id); if (d) out.push(`<img src="${d}" alt="${tl('Foto von Nutzer')}" loading="lazy">`); } catch (e) { /* ignore */ }
  }
  return out.join('');
}
// reviews show the month only, never a name
const fmtMonth = t => new Date(t).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
// for families with a dog: playgrounds say that dogs stay outside, and where the nearest dog run is; cafés name a dog run close by
function dogRunLine(p) {
  const r = p.dogRun && byId.get(p.dogRun[0]);
  const run = r ? `${tl('Nächste Hundewiese:')} <button type="button" class="linkbtn dogrun" data-detail="${esc(r.id)}">${esc(r.name)}</button> (${fmtDist(p.dogRun[1])})` : '';
  if (DOG_RUN_PLAY.has(p.cat)) return DOG_BANS[p.id] ? run : `<b>${tl('Hunde dürfen nicht auf den Spielplatz.')}</b>${run ? ' ' + run : ''}`;
  return DOG_RUN_EAT.has(p.cat) && run && p.dogRun[1] <= dogRunMax(p) && dogOf(p) !== 'nein' ? run : '';
}
// bathing places, for everyone (some parents look for a beach without dogs): what the rules say, and a dog run next to it
function dogBathLine(p) {
  if (p.cat !== 'baden') return '';
  const rule = isBaederland(p) ? tl('Hunde: nicht erlaubt. Tiere dürfen nicht mit ins Bad (Badeordnung von Bäderland).')
    : p.f.water_status ? tl('Hunde dürfen an dieser Badestelle nicht baden (Regel der Stadt für alle offiziellen Badestellen).') : '';
  const r = isBeach(p) && p.dogRun && p.dogRun[1] <= dogRunMax(p) && byId.get(p.dogRun[0]);
  const near = r ? `${r.f.dog_offleash?.[0] === 'alle' ? tl('Hier in der Nähe dürfen alle Hunde frei laufen:') : r.f.dog_offleash?.[0] === 'gepruefte' ? tl('Hier in der Nähe dürfen geprüfte Hunde frei laufen:') : tl('Nächste Hundewiese:')} <button type="button" class="linkbtn dogrun" data-detail="${esc(r.id)}">${esc(r.name)}</button> (${fmtDist(p.dogRun[1])})` : '';
  return [rule, near].filter(Boolean).join('<br>');
}
// families with a dog: one tap tells whether dogs may come (cafés, museums, outings, beaches without a known rule)
function dogAskHtml(p) {
  if (!hasDog() || dogOf(p) || isDogRun(p) || isPool(p) || DOG_BANS[p.id] || p.f.water_status || p.user) return '';
  if (!DOG_RUN_EAT.has(p.cat) && groupOf(p).id !== 'entdecken') return '';
  if (typeof commMineOf === 'function' && commMineOf(p.id).some(c => c.attrs?.hund)) return '';
  const b = (v, l) => `<button type="button" class="chip" data-dogans="${esc(p.id)}|${v}">${l}</button>`;
  return `<div class="sec"><h4>${tl('Dürfen Hunde hierher?')}</h4><p class="muted text">${tl('Wenn du es weißt, hilf anderen Familien mit Hund.')}</p>
    <div class="fgrid">${b('yes', tl('Ja'))}${b('leashed', tl('Nur an der Leine'))}${b('no', tl('Nein'))}</div></div>`;
}
async function answerDog(pid, v) {
  const p = byId.get(pid); if (!p || !['yes', 'leashed', 'no'].includes(v)) return;
  if (typeof commSignedIn === 'function' && commSignedIn()) {
    try { await commSendEntry(pid, { isNew: false, attrs: { hund: v }, ages: [], hours: '', photos: [] }, null); toast(tl('Danke! Nach einer kurzen Prüfung sehen es alle.')); }
    catch (e) { toast(e.why || tl('Das konnte gerade nicht gesendet werden.')); return; }
  } else {
    store.contributions.push({ id: uid('c_'), placeId: pid, isNew: false, type: '', cat: p.cat, name: p.name, lat: p.lat, lon: p.lon, attrs: { hund: v }, ages: [], hours: '', photoIds: [], createdAt: Date.now() });
    save();
    toast((typeof commLocalHint === 'function' && commLocalHint()) || tl('Danke! Gespeichert auf diesem Gerät.'));
  }
  if (view().type === 'detail' && view().id === pid) renderPanel();
}
// the nearest rail station (U, S, A, regional) within 1 km of a place or event, and what its lifts do now (hvv live data).
// Bus stops are at street level: not asked.
const nearStationCache = new Map();
function nearStation(pos) {
  if (!pos) return null;
  const key = pos[0].toFixed(5) + ',' + pos[1].toFixed(5);
  if (nearStationCache.has(key)) return nearStationCache.get(key);
  let best = null, bd = 1000;
  for (const st of places) {
    if (st.cat !== 'bahnhof' || Math.abs(st.lat - pos[0]) > 0.01 || Math.abs(st.lon - pos[1]) > 0.016) continue;
    const d = dist(pos, [st.lat, st.lon]); if (d < bd) { bd = d; best = st; }
  }
  const r = best ? [best, Math.round(bd)] : null;
  nearStationCache.set(key, r);
  return r;
}
function stationLifts(st) {
  const lifts = (st.liftSum ? st.liftSum[5] : st.lifts || []).map(i => byId.get(i)).filter(Boolean);
  const live = lifts.filter(x => x.lift);
  const ok = st.liftSum ? st.liftSum[0] : live.filter(x => x.lift[0] === 'in_betrieb').length;
  const bad = st.liftSum ? st.liftSum[1] : live.filter(x => x.lift[0] === 'ausser_betrieb').length;
  return { n: lifts.length, ok, bad, step: truthy(st.f.wheelchair?.[0] || '') };
}
// "Mit Bahn und Kinderwagen: U Feldstraße (350 m): Aufzug in Betrieb"
function stationLine(pos, selfId) {
  const ns = nearStation(pos); if (!ns || ns[0].id === selfId) return '';
  const [st, d] = ns, L = stationLifts(st);
  const lines = (st.f.transit?.[0] || '').split(/,\s*/).filter(x => /^(U|S|A|RB|RE)\d/.test(x)).slice(0, 4).join(', ');
  const state_ = L.bad ? `<span class="badtext">${L.bad >= L.n ? tl('Aufzug außer Betrieb') : tl('{bad} von {n} Aufzügen außer Betrieb', { bad: L.bad, n: L.n })}</span>`
    : L.ok ? (L.ok > 1 ? tl('{n} Aufzüge in Betrieb', { n: L.ok }) : tl('Aufzug in Betrieb'))
    : L.n ? tl('Aufzug, Status gerade unbekannt')
    : L.step === 'yes' ? tl('stufenlos') : L.step === 'no' ? tl('kein Aufzug, nicht stufenlos') : '';
  return `<b>${tl('Mit Bahn und Kinderwagen:')}</b> <button type="button" class="linkbtn dogrun" data-detail="${esc(st.id)}">${esc(st.name)}${lines ? ' · ' + esc(lines) : ''}</button> (${fmtDist(d)})${state_ ? ': ' + state_ : ''}`;
}
// a quiet warning on cards and event rows, only when no lift of the nearest station works (events: the next 3 days);
// one broken lift of many (Hauptbahnhof) is told on the page itself
const liftWarn = pos => { const ns = nearStation(pos); if (!ns) return false; const L = stationLifts(ns[0]); return L.bad > 0 && L.ok === 0; };
const liftWarnChip = () => `<span class="tag reg">${tl('Aufzug außer Betrieb')}</span>`;
async function detailView(id) {
  const p = byId.get(id), f = p.f;
  const d = dist(origin(), [p.lat, p.lon]);
  const fav = store.favorites.includes(id);
  const known = [];
  // facts on the page: no dog (own chip), no "Haltestelle in der Nähe" (its own line below), no "Kein Notdienst" on every pharmacy
  const factOk = (a, r) => r.v && a.id !== 'hund' && !a.nofact && a.id !== 'hst_nahe' && !(a.id === 'notdienst' && r.v === 'no');
  for (const a of relevantAttrs(p)) { const r = attrVal(p, a.id); if (factOk(a, r)) known.push([a, r]); }
  for (const a of ATTRS) if (!relevantAttrs(p).includes(a)) { const r = attrVal(p, a.id); if (factOk(a, r)) known.push([a, r]); }
  const hasWickel = known.some(([a, r]) => a.id === 'wickeltisch' && r.v === 'yes');
  // a station: the status of its lifts (hvv), broken ones named
  const lifts = (p.liftSum ? p.liftSum[5] : p.lifts || []).map(i => byId.get(i)).filter(x => x && x.lift), broken = lifts.filter(x => x.lift[0] === 'ausser_betrieb');
  const nOk = p.liftSum ? p.liftSum[0] : lifts.filter(x => x.lift[0] === 'in_betrieb').length;
  const cabin = p.liftSum && p.liftSum[3] ? ` · ${tl('kleinste Kabine {cm} cm breit, Tür {door} cm', { cm: p.liftSum[3], door: p.liftSum[4] || '?' })}` : '';
  const liftLine = lifts.length || p.liftSum ? `<b>${tl('Aufzüge hier:')}</b> ${tl('{n} in Betrieb', { n: nOk })}${broken.length ? `, <span class="badtext">${tl('{n} außer Betrieb', { n: broken.length })}</span> (${broken.map(x => esc(x.name)).join(', ')})` : ''}${cabin} <span class="muted">(${tl('laut hvv')})</span>` : '';
  const phone = f.phone?.[0] ? f.phone[0].split(/[;,]/)[0].trim() : '', tel = phone.replace(/[^+\d]/g, '');
  const dog = dogChip(dogOf(p));
  const reviews = reviewsOf(id).filter(r => !store.reports.some(x => x.targetId === r.id)), mine = contribsOf(id);
  const avg = reviews.filter(r => r.stars).length ? (reviews.reduce((s, r) => s + (r.stars || 0), 0) / reviews.filter(r => r.stars).length).toFixed(1).replace('.', ',') : null;
  const ages = [...new Set(mine.flatMap(c => c.ages || []))];
  const addr = f.address?.[0] || [f.street?.[0], f.housenumber?.[0]].filter(Boolean).join(' ');
  const web = placeSite(p); // never a host Djuu does not link (hamburg.de, Facebook …)
  const cm = (f.image?.[0] || '').match(/commons(?:\.m)?\.wikimedia\.org\/wiki\/(?:Special:FilePath\/|File:)(.+)$/i) || (f.image?.[0] || '').match(/^File:(.+)$/);
  const stars = f.rating ? Math.round(+f.rating[0] / 2) / 10 : null;
  const photos = await photoTags(mine.flatMap(c => c.photoIds || [])); // review photos stay with their review
  const extra = [
    f.description && esc(f.description[0]),
    hasDog() && f.dog_rule && `<b>${esc(f.dog_rule[0])}</b>`,
    hasDog() && dogRunLine(p),
    dogBathLine(p),
    f.water_status && `<b>${tl('Wasserqualität:')}</b> ${esc(f.water_status[0])}`,
    f.age_groups && !f.krippe && !f.elementar && `<b>${tl('Für Altersgruppen:')}</b> ${esc(f.age_groups[0])} ${tl('Jahre')}`, // a Kita says it with Krippe / Elementar
    f.care_types && !f.krippe && !f.elementar && `${tl('Betreuung:')} ${esc(f.care_types[0])}`,
    f.baby_swimming_courses && `<b>${tl('Babyschwimmen:')}</b> ${esc(String(f.baby_swimming_courses[0]).slice(0, 280))}`,
    f.ekiz && truthy(f.ekiz[0]) === 'yes' && tl('Mit Eltern-Kind-Zentrum'),
    hasDog() && f.dog_offleash && `<b>${f.dog_offleash[0] === 'alle' ? tl('Freilauf für alle Hunde') : f.dog_offleash[0] === 'gepruefte' ? tl('Freilauf nur für geprüfte Hunde (§ 9)') : tl('Nur an der Leine')}</b>`,
    f.services && esc(f.services[0]).slice(0, 280),
    f.transit && p.cat === 'haltestelle' && `<b>${tl('Linien:')}</b> ${esc(f.transit[0])}`,
    // hvv tariff (from 3 Nov 2026): dogs need no ticket. On stops for families with a dog, on dog runs for everyone (visitors too)
    ((hasDog() && (p.cat === 'haltestelle' || p.cat === 'bahnhof')) || isDogRun(p)) && tl('Hunde fahren im HVV ohne Ticket mit: an der Leine und nicht auf den Sitzen (einige Rassen sind ausgeschlossen).'),
    !TRANSIT_CATS.has(p.cat) && stationLine([p.lat, p.lon], p.id),
    f.stop_near && `${tl('Nächste Haltestelle:')} ${esc(f.stop_near[0].split('|')[1])} (${esc(f.stop_near[0].split('|')[0])} m)`,
    sportText(f.sport?.[0]) && `<b>${tl('Sport:')}</b> ${esc(sportText(f.sport[0]))}`,
    f.season && `<b>${tl('Saison:')}</b> ${esc(f.season[0])}`,
    f.fee_text && `<b>${tl('Preis:')}</b> ${esc(f.fee_text[0])}`,
    cuisineText(f.cuisine?.[0]) && `<b>${tl('Küche:')}</b> ${esc(cuisineText(f.cuisine[0]))}`,
    f.device_count && +f.device_count[0] > 1 && `${esc(f.device_count[0])} ${tl('Spielgeräte')}`,
    f.area_ha && +f.area_ha[0] >= 1 && `${tl('Größe:')} ${esc(String(Math.round(+f.area_ha[0] * 10) / 10).replace('.', ','))} ${tl('Hektar')}`,
    liftLine,
    p.lift && `<b>${tl('Aufzug:')}</b> ${p.lift[0] === 'in_betrieb' ? tl('in Betrieb') : p.lift[0] === 'ausser_betrieb' ? `<span class="badtext">${tl('außer Betrieb')}</span>` : tl('Status unbekannt')}${p.lift[2] ? ' – ' + esc(p.lift[2]) : ''} <span class="muted">(${LIVE.at ? tl('laut hvv, geprüft {time}', { time: esc(fmtStamp(LIVE.at)) }) : `${tl('laut hvv, Stand')} ${esc(fmtStamp(p.lift[1]))}`})</span>`,
    f.cabin_width_cm && `${tl('Kabine:')} ${esc(f.cabin_length_cm?.[0] || '?')} × ${esc(f.cabin_width_cm[0])} cm${f.door_width_cm ? `, ${tl('Tür')} ${esc(f.door_width_cm[0])} cm` : ''}`,
    p.duty && p.duty.length && `<b>${tl('Notdienst:')}</b> ${p.duty.map(([a, b]) => esc(fmtStamp(a)) + ' – ' + esc(fmtStamp(b))).join(', ')} <span class="muted">(${tl('laut aponet.de, bitte vorher anrufen')})</span>`,
    f.kinder_notinsel && `<b>${tl('Kinder-Notinsel:')}</b> ${tl('Hier bekommen Kinder Hilfe, wenn sie sich bedroht fühlen oder verlaufen haben.')}`,
    f.operator && p.cat !== 'aufzug' && `<span class="muted">${tl('Betreiber:')} ${esc(f.operator[0])}</span>`,
  ].filter(Boolean);
  const today = dayIdx(new Date());
  const factChip = ([a, r]) => a.id === 'aufzug_ok' && r.v === 'no' ? `<span class="fact bad">${esc(NO_LABEL.aufzug_ok)}</span>` : `<span class="fact${r.v === 'no' ? ' no' : r.v === 'limited' ? ' lim' : ''}">${r.v === 'no' ? '' : svg('check')}${esc(r.v === 'no' ? NO_LABEL[a.id] || tl('Kein ') + a.label : a.label)}${r.v === 'limited' ? tl(' (eingeschränkt)') : ''}</span>`;
  return `
    <div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><span style="flex:1"></span>
      <button type="button" class="round" data-home="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    <div class="hero">${badge(p)}<div style="min-width:0">
      <h2 style="margin:0;font:800 23px/1.15 var(--font-display);letter-spacing:-.02em;text-wrap:balance">${esc(p.name)}</h2>
      <div class="status-line"><span>${esc(CAT_LABEL[p.cat] || '')}${p.district ? ' · ' + esc(dLabel(p.district)) : ''}</span></div>
      <div class="status-line">${openText(p)}${distLine(d)}${avg ? `<span class="stars-read">★ ${avg}</span>` : ''}</div>
    </div></div>
    <div class="acts">
      <a class="act primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${svg('route')}${tl('Route')}</a>
      <button type="button" class="act${fav ? ' on' : ''}" data-fav="${id}">${svg('heart')}${fav ? tl('Gemerkt') : tl('Merken')}</button>
      <button type="button" class="act" data-share="${id}">${svg('share')}${tl('Teilen')}</button>
      <button type="button" class="act" data-addinfo="${id}">${svg('edit')}${tl('Ergänzen')}</button>
    </div>
    ${f.tipp ? `<div class="tipbanner">${svg('star')}<div><b>${tl('Djuu-Tipp')}</b>${esc(f.tipp[0])}</div></div>` : ''}
    ${p.cat === 'kurs' && !offersByPlace.has(id) ? `<p class="note">${tl('Für diesen Ort haben wir noch keine Kurszeiten. Schau auf die Webseite.')}</p>` : ''}
    ${cm ? `<figure class="heroimg"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/${esc(cm[1])}?width=640" alt="" loading="lazy" onerror="this.parentNode.remove()"><figcaption><a href="https://commons.wikimedia.org/wiki/File:${esc(cm[1])}" target="_blank" rel="noopener">${tl('Foto: Urheber und Lizenz auf Wikimedia Commons')}</a></figcaption></figure>` : ''}
    ${stars ? `<div class="sec"><h4>${tl('Bewertung')}</h4><p class="text"><b class="stars-read">★ ${String(stars).replace('.', ',')}</b> ${tl('von 5')}${f.review_text ? `</p><p class="text">„${esc(f.review_text[0].slice(0, 280))}“` : ''}</p><p class="note">${tl('Von Nutzern über Mangrove, einer offenen Bewertungsplattform.')}</p></div>` : ''}
    ${photos ? `<div class="photos" style="margin-top:12px">${photos}</div>` : ''}
    <div class="sec"><h4>${tl('Auf einen Blick')}</h4>
      ${known.length || dog || p.gear || ages.length || p.tags.size ? `<div class="facts">${dog}${known.map(factChip).join('')}
        ${[...p.tags].filter(t => t !== p.cat && TAG_LABEL[t] && !(t === 'wickeln' && hasWickel)).map(t => `<span class="fact neutral">${esc(TAG_LABEL[t])}</span>`).join('')}
        ${p.gear ? GEAR.filter(g => p.gear.has(g.id)).map(g => `<span class="fact neutral">${esc(g.label)}</span>`).join('') : ''}
        ${ages.map(a => `<span class="fact neutral">${esc(AGES.find(x => x.id === a)?.label || a)}</span>`).join('')}</div>`
      : `<p class="muted text">${tl('Zu diesem Ort wissen wir noch wenig.')}</p>`}
    </div>
    ${placeOffersHtml(id)}
    ${extra.length ? `<div class="sec">${extra.map(x => `<p class="text">${x}</p>`).join('')}</div>` : ''}
    <div class="sec"><h4>${tl('Kontakt')}</h4>${addr ? `<p class="text"><a class="contact" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank" rel="noopener">${svg('pin')}${esc(addr)}</a></p>` : ''}
      ${phone && tel.length >= 5 ? `<p class="text"><a class="contact" href="tel:${esc(tel)}">${svg('phone')}${esc(phone)}</a></p>` : phone ? `<p class="text">${tl('Telefon:')} ${esc(phone)}</p>` : ''}
      ${web ? `<p class="text"><a class="contact" href="${esc(web)}" target="_blank" rel="noopener">${svg('globe')}${tl('Webseite öffnen')}</a></p>` : ''}
      <button type="button" class="btn" data-onlyplace="${p.id}">${svg('pin')}${tl('Auf der Karte zeigen')}</button></div>
    ${p.hoursRaw ? `<details class="fold"><summary>${tl('Öffnungszeiten')}</summary>${!p.oh ? `<p>${esc(ohReadable(p.hoursRaw)).replace(/\n/g, '<br>')}</p><p class="note">${tl('So steht es in den Kartendaten.')}</p>` : p.oh.always ? `<p>${tl('Rund um die Uhr')}</p>` :
      '<table class="hours">' + p.oh.week.map((r, i) => `<tr class="${i === today ? 'today' : ''}"><td>${DAY_DE[i]}</td><td>${r.length ? r.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : tl('geschlossen')}</td></tr>`).join('') + '</table>' + (p.hoursUser ? `<p class="note">${tl('Von Eltern eingetragen und geprüft.')}</p>` : '') + (p.oh.ph ? `<p class="note">${tl('An Feiertagen:')} ${p.oh.ph.length ? p.oh.ph.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : tl('geschlossen')}</p>` : `<p class="note">${tl('An Feiertagen wie sonntags, soweit nichts anderes bekannt ist.')}</p>`)}</details>` : ''}
    <details class="fold"${reviews.length ? ' open' : ''}><summary>${tl('Bewertungen')}${reviews.length ? ` (${reviews.length})` : ''}</summary>
      <div style="margin-top:8px">${reviews.length ? '' : `<p class="muted text">${tl('Noch keine Bewertung.')}</p>`}
      ${(await Promise.all(reviews.sort((a, b) => b.at - a.at).map(async r => `<div class="review">${r.stars ? `<b class="stars-read">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</b> ` : ''}<span class="muted">${esc(fmtMonth(r.at))}</span>
        ${r.text ? `<div>${esc(r.text)}</div>` : ''}${r.photoIds?.length ? `<div class="photos">${await photoTags(r.photoIds)}</div>` : ''}
        <button type="button" class="linkbtn" data-report="${r.id}">${tl('Melden')}</button></div>`))).join('')}
      <button type="button" class="btn" data-rate="${id}" style="margin-top:8px">${tl('Bewerten')}</button></div></details>
    <details class="fold"><summary>${tl('Woher stammen die Infos?')}</summary><div style="margin-top:8px">
      ${known.map(([a, r]) => `<div class="srcrow"><b>${esc(a.label)}</b><span>${r.v === 'yes' ? tl('Ja') : r.v === 'no' ? tl('Nein') : tl('Eingeschränkt')}</span>
        <span class="s">${r.method === 'user' ? (r.confirmations[0].remote ? tl('Von Eltern eingetragen und geprüft ({n}×, zuletzt {date})', { n: r.confirmations.length, date: fmtDate(r.confirmations[0].at) }) : tl('Von Nutzern bestätigt ({n}×, zuletzt {date}, auf diesem Gerät)', { n: r.confirmations.length, date: fmtDate(r.confirmations[0].at) })) : r.method === 'website' ? `${tl('Webseite des Ortes, automatisch gelesen (')}${Math.round((r.conf || .6) * 100)} % sicher)` : r.method === 'computed' ? tl('Aus Kartendaten berechnet') : esc(r.src || '')}</span>
        ${r.evidence ? `<q>${esc(r.evidence)}</q>` : ''}</div>`).join('')}
      ${f.near_name ? `<p class="note">${tl('Der Name ist nur eine Orientierung: abgeleitet aus dem Park oder der nächsten Straße.')}</p>` : ''}<p class="note">${tl('Datensätze:')} ${p.srcs.map(i => esc(SOURCES[i]?.[1]) + ' (' + esc(SOURCES[i]?.[2]) + ')').join(' · ') || (p.user && !p.mine ? tl('von Eltern eingetragen und geprüft') : p.pending ? tl('von dir eingetragen, wartet auf Prüfung') : tl('von dir eingetragen'))}</p></div></details>
    ${dogAskHtml(p)}
    ${typeof commPlaceHtml === 'function' ? commPlaceHtml(id) : ''}
    ${CONTACT.email || (typeof commSignedIn === 'function' && commSignedIn()) ? `<button type="button" class="linkbtn" data-reportplace="${esc(id)}" style="margin-top:16px">${tl('Stimmt etwas nicht? Ort melden')}</button>` : ''}
    <p class="note" style="margin-top:12px">${typeof commFootNote === 'function' ? commFootNote() : tl('Was du hier einträgst, bleibt auf diesem Gerät.')}</p>`;
}
// events, groups and courses at a place: what is over today is gone, one row per series (a cinema shows a film many times)
function placeOffersHtml(id) {
  const list = (offersByPlace.get(id) || []).map(o => [nextAfterNow(o), o]).filter(([d]) => d).sort(byDayTime);
  if (!list.length) return '';
  const by = new Map();
  for (const x of list) { const k = crossKey(x[1]); (by.get(k) || by.set(k, []).get(k)).push(x); }
  const groups = [...by.values()].sort((a, b) => (offerFits(b[0][1]) === true) - (offerFits(a[0][1]) === true) || undated(a[0][1]) - undated(b[0][1]) || a[0][0] - b[0][0]); // without known dates: last
  const kinds = new Set(list.map(([, o]) => o.kind === 'termin' ? 't' : 'k'));
  const title = kinds.size > 1 ? tl('Termine, Gruppen & Kurse') : kinds.has('t') ? tl('Termine') : tl('Gruppen & Kurse');
  return `<div class="sec"><h4>${title}</h4><ol class="list">${groups.slice(0, 8).map(g => offerItem(g[0][1], g[0][0], { more: g.length - 1 })).join('')}</ol>
    ${groups.length > 8 ? `<p class="note">${tl('und {n} weitere', { n: groups.length - 8 })}</p>` : ''}<p class="note">${tl('Anmeldung und aktuelle Infos beim Anbieter.')}</p></div>`;
}
function bindDetail(id) { /* actions handled by the global click handler */ }

// rating
function rateView(id) {
  const p = byId.get(id);
  return `${head(tl('Bewerten'), esc(p.name))}
    <form id="rateForm"><div class="stars" role="group" aria-label="${tl('Sterne')}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${tl('{n} Sterne', { n })}">★</button>`).join('')}</div>
    <div class="field"><label for="revText">${tl('Kommentar')}</label><textarea id="revText" maxlength="500" placeholder="${tl('Was sollten andere Eltern wissen?')}"></textarea></div>
    <div class="field"><label for="revPhoto">${tl('Foto (optional)')}</label><input id="revPhoto" type="file" accept="image/*"><p class="hint-kids">${tl('Bitte keine Gesichter von Kindern fotografieren.')}</p></div>
    <p class="error" id="revErr" hidden></p>
    <div class="sticky-bar"><button type="submit" class="btn big sun">${tl('Speichern')}</button></div></form>`;
}
function bindRate(id) {
  let stars = 0;
  const body = $('#panelBody');
  body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { stars = +b.dataset.star; body.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= stars)); });
  $('#rateForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#revErr');
    if (!stars) { err.textContent = tl('Bitte vergib 1 bis 5 Sterne.'); err.hidden = false; return; }
    const photoIds = [], file = $('#revPhoto').files[0], text = $('#revText').value.trim();
    let photo = null;
    if (file) {
      if (!file.type.startsWith('image/')) { err.textContent = tl('Bitte wähle ein Bild aus (JPG oder PNG).'); err.hidden = false; return; }
      try { photo = await compressPhoto(file); } catch (x) { err.textContent = tl('Das Foto konnte nicht gelesen werden. Versuch ein anderes.'); err.hidden = false; return; }
    }
    // signed in: to the Djuu server, checked before others see it; without an account (or when that fails) on this phone
    const btn = e.submitter || $('#rateForm [type=submit]'); if (btn) btn.disabled = true;
    let why = '';
    if (typeof commSignedIn === 'function' && commSignedIn()) {
      try { await commSendEntry(id, null, { stars, text, photos: photo ? [photo] : [] }); toast(tl('Danke! Wird kurz geprüft.')); back(); return; }
      catch (x) { why = x.why || ''; }
    }
    if (photo) {
      try { const pid = uid('ph_'); await photoDB.put(pid, photo); photoIds.push(pid); }
      catch (x) { err.textContent = tl('Das Foto konnte nicht gespeichert werden. Versuch es ohne Foto.'); err.hidden = false; if (btn) btn.disabled = false; return; }
    }
    store.reviews.push({ id: uid('r_'), placeId: id, stars, text, photoIds, at: Date.now() });
    save();
    const once = !why && typeof commLocalHint === 'function' && commLocalHint(), hint = why ? `${why} ${tl('Auf diesem Gerät gespeichert.')}` : once ? `${tl('Bewertung auf diesem Gerät gespeichert.')} ${once}` : '';
    if (hint) { back(); setTimeout(() => toastLong(hint), 50); } else { toast(tl('Bewertung gespeichert.')); back(); }
  };
}

// report a wrong place: an e-mail the user sees before it goes out, nothing is sent in the background
const REPORT_REASONS = [tl('Geschlossen oder gibt es nicht mehr'), tl('Öffnungszeiten stimmen nicht'), tl('Angaben stimmen nicht'), tl('Doppelt eingetragen'), tl('Etwas anderes')];
function reportView(id) {
  const p = byId.get(id), v = view();
  return `${head(tl('Ort melden'), esc(p.name))}
    <div class="fgrid">${REPORT_REASONS.map(r => `<button type="button" class="chip${v.reason === r ? ' on' : ''}" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <div class="field"><label for="repText">${tl('Was stimmt nicht? (freiwillig)')}</label><textarea id="repText" maxlength="500"></textarea></div>
    <p class="error" id="repErr" hidden>${tl('Bitte wähle aus, was nicht stimmt.')}</p>
    ${reportOnline() ? `<p class="note">${tl('Djuu sieht sich das an und korrigiert den Eintrag.')}</p>
    <div class="sticky-bar"><button type="button" class="btn big primary" data-reportsend="1">${tl('Melden')}</button></div>`
    : `<p class="note">${tl('Dein E-Mail-Programm öffnet sich. Du siehst alles, bevor du es abschickst.')}</p>
    <div class="sticky-bar"><button type="button" class="btn big primary" data-reportsend="1">${tl('E-Mail vorbereiten')}</button></div>`}`;
}
// signed in, a report goes to the moderators on the Djuu server; otherwise an e-mail draft
const reportOnline = () => typeof commSignedIn === 'function' && commSignedIn();
async function sendPlaceReport() {
  const v = view(), p = byId.get(v.id);
  if (!v.reason) { $('#repErr').hidden = false; return; }
  const text = $('#repText').value.trim();
  if (reportOnline()) {
    const b = $('[data-reportsend]'); if (b) b.disabled = true;
    if (await commReportPlace(p.id, [v.reason, text].filter(Boolean).join(': '))) { toast(tl('Danke! Wird kurz geprüft.')); back(); }
    else if (b) b.disabled = false;
    return;
  }
  if (!CONTACT.email) return;
  const body = [`${tl('Ort:')} ${p.name}`, `${tl('Kennung:')} ${p.id}`, `${tl('Grund:')} ${v.reason}`, text].filter(Boolean).join('\n');
  location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent('Djuu: Ort melden')}&body=${encodeURIComponent(body)}`;
  back();
}

// filters
// a chip shows when it is on, when it finds at least RARE_BELOW places in the selection, or when it is a core family fact
// (or a live value: 8 pharmacies on duty) that finds any place; the rest is left out
const RARE_BELOW = 10;
const CORE_FILTERS = new Set(['jetzt', 'sonntag', 'wickeltisch', 'hochstuhl', 'spielecke', 'kindermenue', 'kinderwagen', 'toilette', 'kleinkind', 'eingezaeunt', 'hund', 'notdienst', 'aufzug_ok', 'aufzug_kaputt']);
// without a category: only facts that mean the same everywhere (no Kita, playground or age chips)
const UNIVERSAL_FILTERS = new Set(['wickeltisch', 'kinderwagen', 'toilette', 'hund']);
// pool facts (Kinderbecken, Wasserrutsche, Babyschwimmen) only make sense once "Wasser & Schwimmen" or bathing places are chosen
const poolChosen = () => state.tags.has('e_wasser') || state.tags.has('baden') || state.cats.has('baden');
function filtersView() {
  return `${head(tl('Filter'), state.groups.size ? tl('für ') + [...state.groups].map(g => GROUP[g].label).join(', ') : tl('für alle Orte'))}
    ${filtersBody()}
    <div class="sticky-bar"><button type="button" class="btn" data-reset="1">${tl('Zurücksetzen')}</button><button type="button" class="btn big primary" data-home="peek">${nf.format(shownTotal())} ${tl('Orte zeigen')}</button></div>`;
}
const shownTotal = () => last.match.length + (state.showUnknown ? last.unknown.length : 0);
// the filter chips themselves: on the Filter page and folded into Suchen
function filtersBody() {
  const gs = [...state.groups];
  const fits = a => !gs.length ? UNIVERSAL_FILTERS.has(a.id) : (!a.groups || gs.some(g => a.groups.includes(g))) && !(a.nochipIn && gs.every(g => a.nochipIn.includes(g)));
  const sel = places.filter(inSelection), counts = new Map();
  const count = id => { if (!counts.has(id)) { let n = 0; for (const p of sel) if (filterVal(p, id) === true) n++; counts.set(id, n); } return counts.get(id); };
  const chipFor = x => `<button type="button" class="chip${state.filters.has(x.id) ? ' on' : ''}" data-filter="${x.id}">${esc(x.label)} <span class="n">${nf.format(count(x.id))}</span></button>`;
  const block = (title, all, sorted = false) => {
    const main = all.filter(x => state.filters.has(x.id) || count(x.id) >= RARE_BELOW || (CORE_FILTERS.has(x.id) && count(x.id) > 0));
    if (sorted) main.sort((a, b) => (hasDog() ? (b.id === 'hund') - (a.id === 'hund') : 0) || CORE_FILTERS.has(b.id) - CORE_FILTERS.has(a.id) || count(b.id) - count(a.id));
    return main.length ? `<div class="sec"><h4>${title}</h4><div class="fgrid">${main.map(chipFor).join('')}</div></div>` : '';
  };
  // stations and lifts have no opening hours of their own, Kitas and advice centres hardly publish any
  const timeBlock = gs.length && gs.every(g => g === 'mobil' || g === 'familie') && !TIME_FILTERS.some(f => state.filters.has(f.id)) ? '' : block(tl('Öffnungszeiten'), TIME_FILTERS);
  if (!hasDog()) for (const a of ATTRS) if (dogFact(a)) state.filters.delete(a.id);
  // hidden: facts without data yet (hide), duplicates or dead ones (nofilter), facts shown only on place pages (nochip),
  // pool facts outside "Wasser & Schwimmen"; an active filter always keeps its chip, so it can be switched off
  const attrBlock = block(tl('Ausstattung'), ATTRS.filter(a => state.filters.has(a.id) || (fits(a) && !a.hide && !a.nofilter && !a.nochip && (!a.pool || poolChosen()) && (!a.kitaOnly || state.tags.has('kita') || state.cats.has('kita')) && (!dogFact(a) || hasDog()))), true);
  // ages of places are mostly unknown (most "0–3" hits were Kitas): Krippe/Elementar and "Für Kleinkinder" say it better.
  // Age chips appear only when a question set one (Suchen), so it can be switched off.
  const ageBlock = block(tl('Alter'), AGE_FILTERS.filter(a => state.filters.has(a.id)));
  const gearBlock = state.groups.has('spielen') || GEAR.some(g => state.filters.has(g.id)) ? block(tl('Spielgeräte'), GEAR.filter(g => !g.hide || state.filters.has(g.id)), true) : '';
  return `<p class="muted text">${tl('Die Zahl zeigt, bei wie vielen Orten wir es sicher wissen. Es können mehr sein.')}</p>
    ${ioAllowed() ? `<div class="sec"><h4>${tl('Drinnen oder draußen')}</h4><div class="fgrid">${[['drinnen', 'house', tl('Drinnen')], ['draussen', 'tree', tl('Draußen')]].map(([id, ic, l]) => `<button type="button" class="chip${state.io === id ? ' on' : ''}" data-io="${id}">${svg(ic)}${l}</button>`).join('')}</div></div>` : ''}
    ${timeBlock}${attrBlock}${ageBlock}${gearBlock}
    <label class="switch" for="unkSwitch">${tl('Orte ohne Angabe blass zeigen')} <input type="checkbox" id="unkSwitch" ${state.showUnknown ? 'checked' : ''}></label>`;
}
// area
function areaView() {
  const a = state.area, n = last.match.length;
  const chip = (attrs, on, label) => `<button type="button" class="chip${on ? ' on' : ''}" ${attrs}>${label}</button>`;
  return `${head(tl('Gebiet'), tl('Wo sollen wir suchen?'))}
    ${areaBody()}
    <div class="sticky-bar"><button type="button" class="btn big primary" data-home="peek">${nf.format(n)} ${tl('Orte zeigen')}</button></div>`;
}
// the Gebiet choices themselves: on the Gebiet page and folded into Suchen
function areaBody() {
  const a = state.area;
  const chip = (attrs, on, label) => `<button type="button" class="chip${on ? ' on' : ''}" ${attrs}>${label}</button>`;
  return `<div class="fgrid">${chip('data-area="all"', a.type === 'all', tl('Ganz Hamburg'))}</div>
    ${radiusHtml()}
    <div class="sec"><h4>${tl('Eigenes Gebiet')}</h4>
      <button type="button" class="btn${a.type === 'poly' ? ' primary' : ''}" data-draw="1">${svg('edit')}${a.type === 'poly' ? tl('Neu einzeichnen') : tl('Auf der Karte einzeichnen')}</button></div>
    ${districtHtml()}`;
}
function radiusHtml() {
  const a = state.area, on = a.type === 'radius', c = on ? a.center : defaultCenter(), r = on ? a.r : 2000;
  const pl = typeof c === 'string' && c.startsWith('place:') ? savedPlaces().find(p => 'place:' + p.id === c) : null;
  const who = c === 'me' ? tl('dich') : pl ? tl(pl.name) : tl('Punkt');
  const chip = (attrs, sel, label) => `<button type="button" class="chip${sel ? ' on' : ''}" ${attrs}>${label}</button>`;
  return `<div class="sec"><h4>${tl('Umkreis um')}</h4>
      <div class="fgrid">${savedPlaces().map(p => chip(`data-center="place:${esc(p.id)}"`, on && a.center === 'place:' + p.id, svg(typeof placeIcon === 'function' ? placeIcon(p.name) : 'pin') + esc(tl(p.name)))).join('')}${chip('data-center="me"', on && a.center === 'me', svg('locate') + tl('mich'))}${chip('data-center="pick"', on && Array.isArray(a.center), svg('pin') + tl('Punkt auf der Karte'))}</div>
      <div class="radmini${on ? '' : ' off'}" id="radMini" aria-hidden="true"></div>
      <div class="radrow"><span>${tl('Umkreis um {name}', { name: esc(who) })}</span><b id="radVal">${fmtR(r)}</b></div>
      <input id="radRange" class="radrange" type="range" min="0" max="1000" step="1" value="${rToPos(r)}" style="--p:${rToPos(r) / 10}%" aria-label="${tl('Umkreis')}, ${fmtR(r)}">
      <div class="radends"><span>500 m</span><span>20 km</span></div></div>`;
}
let areaMini = null;
function bindAreaMini() {
  if (areaMini) { areaMini.map.remove(); areaMini = null; }
  const el = $('#radMini'); if (!el) return;
  const a = state.area, on = a.type === 'radius', r = on ? a.r : 2000, c = areaCenter(on ? a : { center: defaultCenter() });
  const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0 }).setView(c, 13);
  tintMap(L.maplibreGL({ style: styleUrl(), attribution: '', interactive: false }).addTo(m).getMaplibreMap());
  const circle = L.circle(c, { radius: r, color: '#6B4EE6', weight: 2, fillColor: '#6B4EE6', fillOpacity: .12, interactive: false }).addTo(m);
  const pl = on ? areaPlace(a) : savedPlaces().find(p => 'place:' + p.id === defaultCenter());
  L.marker(c, { interactive: false, icon: L.divIcon({ className: '', iconSize: [28, 28], html: `<div class="radpin">${svg(pl && typeof placeIcon === 'function' ? placeIcon(pl.name) : a.center === 'me' ? 'locate' : 'pin')}</div>` }) }).addTo(m);
  areaMini = { map: m, circle };
  // fit only once the panel has its size (an empty container would give an endless zoom)
  const fit = () => { if (areaMini?.map !== m || !el.clientWidth) return; m.invalidateSize(); m.fitBounds(circle.getBounds(), { padding: [14, 14], animate: false }); };
  areaMini.fit = fit; fit(); setTimeout(fit, 250); setTimeout(fit, 600);
}
function districtHtml() {
  const n = state.area.type === 'district' ? dNames(state.area) : [];
  const label = n.length ? esc(n.slice(0, 2).map(dLabel).join(', ')) + (n.length > 2 ? ` +${n.length - 2}` : '') : tl('Stadtteile wählen');
  return `<div class="sec"><h4>${tl('Stadtteil')}</h4>
      <button type="button" class="ddsel${n.length ? ' has' : ''}" data-distopen="1" aria-expanded="${AREA_UI.distOpen}"><span id="distLabel">${label}</span>${svg('up')}</button>
      ${AREA_UI.distOpen ? `<div class="ddpanel"><div class="field" style="margin:0"><input id="distQ" type="search" value="${esc(AREA_UI.dq)}" placeholder="${tl('Suchen, z. B. Ottensen')}" autocomplete="off"></div>
        <div class="ddlist" id="distList">${districtOpts()}</div></div>` : ''}</div>`;
}
function districtOpts() {
  const q = norm(AREA_UI.dq.trim()), sel = state.area.type === 'district' ? dNames(state.area) : [];
  const list = districtList().filter(d => !q || norm(d).includes(q));
  const ordered = q ? list : sel.filter(d => list.includes(d)).concat(list.filter(d => !sel.includes(d)));
  return ordered.slice(0, q ? 60 : 300).map(d => `<label class="ddopt"><input type="checkbox" data-dsel="${esc(d)}"${sel.includes(d) ? ' checked' : ''}><span>${esc(dLabel(d))}</span></label>`).join('') || `<p class="muted text">${tl('Kein Stadtteil gefunden.')}</p>`;
}
function areaCountBtn() { const b = $('#panelBody .sticky-bar .primary'); if (b) b.textContent = `${nf.format(view().type === 'search' ? shownTotal() : last.match.length)} ${tl('Orte zeigen')}`; }
function drawView() {
  const n = state.drawing.length;
  return `<p class="text drawhint"><b>${tl('Tippe auf die Ecken des Gebiets.')}</b> ${n ? `${n} ${n === 1 ? tl('Ecke gesetzt.') : tl('Ecken gesetzt.')}` : ''}${n && n < 3 ? tl(' Mindestens 3 nötig.') : ''}</p>
    <div class="pinacts"><button type="button" class="btn" data-drawundo="1" ${n ? '' : 'disabled'}>${svg('undo')}${tl('Zurück')}</button>
      <button type="button" class="btn" data-drawcancel="1">${tl('Abbrechen')}</button>
      <button type="button" class="btn primary" data-drawdone="1" ${n >= 3 ? '' : 'disabled'}>${tl('Fertig')}</button></div>`;
}

// search
// ---------- Search: words, tags, similar terms and typos, all on the device ----------
const norm = s => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const STOP = new Set('und oder in im am an auf mit ohne fuer der die das den dem des ein eine einen einem einer wo ist sind gibt es naehe nah bei was zum zur von vom wir ich suche suchen finden machen will wollen moechte hier heute irgendwas etwas nach hamburg hh stadt'.split(' '));
// Similar terms: search word -> words that exist in names, categories and tags. Earlier words count more.
const SYN = {
  zoo: ['tierpark', 'hagenbeck', 'tiere'], tiergarten: ['tierpark', 'tiere'], tierpark: ['hagenbeck', 'tiere'], wildpark: ['tiere'], streichelzoo: ['tiere'], bauernhof: ['tiere', 'hof'], kinderbauernhof: ['tiere', 'hof'], aquarium: ['tiere'],
  klo: ['toilette'], toiletten: ['toilette'], wc: ['toilette'], pipi: ['toilette'], wickeln: ['wickelplatz', 'wickeltisch'], wickelraum: ['wickelplatz', 'wickeltisch'], stillraum: ['stillen', 'stillmoeglichkeit'], stillen: ['stillmoeglichkeit'],
  windeln: ['drogerie', 'supermarkt', 'spaeti'], pampers: ['drogerie', 'supermarkt'], babynahrung: ['drogerie', 'supermarkt'], einkaufen: ['supermarkt', 'drogerie'], kiosk: ['spaeti'], spielsachen: ['spielzeug'], klamotten: ['kinderkleidung', 'secondhand'], kleidung: ['kinderkleidung'], schuhe: ['kinderkleidung'], buch: ['buecher', 'buecherhallen'],
  arzt: ['kinderarzt'], aerztin: ['kinderarzt'], doktor: ['kinderarzt'], kinderaerztin: ['kinderarzt'], krankenhaus: ['klinik'], notaufnahme: ['klinik'], notfall: ['klinik', 'apotheke'], fieber: ['kinderarzt', 'apotheke'], zahnaerztin: ['zahnarzt'], zaehne: ['zahnarzt'], frauenaerztin: ['frauenarzt'], gynaekologe: ['frauenarzt'], ohren: ['hno'], augen: ['augenarzt'], krankengymnastik: ['physiotherapie'], physio: ['physiotherapie'], logopaedie: ['logopaedie'], ergo: ['ergotherapie'], psychologe: ['kinderpsychologie'], geburt: ['geburtshaus', 'hebamme'],
  schwimmbad: ['baden', 'schwimmbad'], hallenbad: ['hallenbad', 'baden'], freibad: ['freibad', 'baden'], schwimmen: ['baden', 'schwimmbad'], planschen: ['wasserspiel', 'baden'], badestelle: ['baden'], strand: ['baden'], see: ['baden', 'natur'],
  playground: ['spielplatz'], spielplaetze: ['spielplatz'], rutschen: ['rutsche'], schaukeln: ['schaukel'], sandkiste: ['sandkasten'], indoor: ['indoorspielplatz', 'drinnen'], indoorspielplatz: ['indoorspielplatz', 'indoor'], kinderbecken: ['kinderbecken', 'planschbecken'], spielecke: ['spielecke', 'kindercafe'], regen: ['indoorspielplatz', 'spielhaus', 'museen', 'drinnen'], toben: ['spielplatz', 'indoorspielplatz', 'trampolin'], kindergeburtstag: ['indoorspielplatz', 'trampolin', 'kindercafe'], bouldern: ['klettern'], fussball: ['bolzplatz'], bolzen: ['bolzplatz'], basketball: ['bolzplatz'], ping: ['tischtennis'], sport: ['sportanlagen', 'sportvereine'], turnen: ['sportvereine'], pferde: ['reiten'], ponyhof: ['reiten'], schlitten: ['rodeln'], rodelberg: ['rodeln'],
  cafe: ['cafe'], kaffee: ['cafe'], kuchen: ['kuchen', 'cafe'], eisdiele: ['eis'], eiscafe: ['eis'], essen: ['restaurant', 'imbiss', 'cafe'], restaurants: ['restaurant'], fruehstuecken: ['fruehstueck'], brunch: ['fruehstueck'], pommes: ['imbiss'], doener: ['imbiss'], pizzeria: ['pizza'], spielcafe: ['kindercafe'], familiencafe: ['kindercafe'], vegetarier: ['vegetarisch'], terrasse: ['draussensitzen'], draussensitzen: ['draussensitzen'],
  kultur: ['museen', 'kultur'], ausstellung: ['museen', 'museum'], theater: ['theater'], kino: ['theater', 'kino'], bibliothek: ['buecherhallen', 'buecherhalle'], buecherei: ['buecherhallen', 'buecherhalle'], wald: ['natur', 'park'], wiese: ['park', 'natur'], natur: ['natur', 'park'], gruenanlage: ['park'], ausflug: ['ausflugsziele', 'tiere', 'museen'], faehre: ['faehren', 'faehranleger'], boot: ['bootsverleih'], grillen: ['picknick'],
  hund: ['hunde', 'hundeauslauf'], hunde: ['hunde', 'hundeauslauf'], gassi: ['hundeauslauf'], kindergarten: ['kita'], kitas: ['kita'], krippe: ['kita'], treffpunkt: ['treffpunkte', 'familienzentren'], grundschule: ['schule'], schulen: ['schule'], musikunterricht: ['musikschulen'], tanzen: ['tanzschulen'], ballett: ['tanzschulen'], beratungsstelle: ['beratung'], familienzentrum: ['familienzentren'], elternschule: ['elternschulen'],
  krabbelgruppe: ['krabbel', 'spielgruppe'], babykurs: ['babymassage', 'pekip', 'krabbel'], kurs: ['kurs'], kurse: ['kurs'], babyschwimmen: ['babyschwimmen'], geburtsvorbereitung: ['geburtsvorbereitung'], flohmarkt: ['flohmarkt', 'basar'], basar: ['flohmarkt', 'basar'], laterne: ['laternenumzug'], vorlesen: ['vorlesen', 'bilderbuch'],
  kinderwagen: ['stufenlos'], barrierefrei: ['stufenlos'], notdienst: ['apotheke'], notapotheke: ['apotheke'], notdienstapotheke: ['apotheke'], fahrstuhl: ['aufzug'], lift: ['aufzug'], bus: ['haltestelle'], bahn: ['haltestelle', 'bahnhof'], ubahn: ['haltestelle', 'bahnhof'], sbahn: ['haltestelle', 'bahnhof'], station: ['haltestelle', 'bahnhof'],
};
const PHRASES = { 'u bahn': 'ubahn', 's bahn': 'sbahn', 'ice cream': 'eis', 'wc anlage': 'wc', 'spiel platz': 'spielplatz', 'kinder arzt': 'kinderarzt', 'kinder cafe': 'kindercafe' };
// Places with this tag are what the word really means, not those that merely share a word with its synonyms.
const INTENT = { zoo: 'tiere', tierpark: 'tiere', tiergarten: 'tiere', wildpark: 'tiere', streichelzoo: 'tiere', bauernhof: 'tiere', kinderbauernhof: 'tiere', aquarium: 'tiere', regen: 'drinnen', ubahn: 'bahnhof', sbahn: 'bahnhof', bahn: 'bahnhof' };
const OPEN_WORDS = new Set(['offen', 'geoeffnet', 'jetzt']);
const SUNDAY_WORDS = new Set(['sonntag', 'sonntags']);
// emergency pharmacy: only the pharmacies on duty right now (data/live.json)
const DUTY_WORDS = new Set(['notdienst', 'notapotheke', 'notdienstapotheke', 'apothekennotdienst']);
// Places that are rarely what someone means by a word in their name.
const LOW_RANK = new Set(['haltestelle', 'bahnhof', 'aufzug', 'spielstrasse', 'faehre']);
let SI = null;
function searchIndex() {
  if (SI) return SI;
  const name = new Map(), meta = new Map(), low = new Map();
  const put = (m, w, i) => { let l = m.get(w); if (!l) m.set(w, l = []); if (l[l.length - 1] !== i) l.push(i); };
  const add = (m, text, i) => { for (const w of words(text)) put(m, w, i); };
  // labels also as one word, so "indoorspielplatz" finds "Indoor-Spielplatz" and "draussensitzen" finds "Draußen sitzen"
  const addLabel = (text, i) => { const ws = words(text); for (const w of ws) put(meta, w, i); if (ws.length > 1) put(meta, ws.join(''), i); };
  places.forEach((p, i) => {
    if (p.named) add(name, p.name, i);
    if (p.cat !== 'windeln') addLabel(CAT_LABEL[p.cat], i); // its tags say which kind of shop it is
    for (const t of p.tags) addLabel(TAG_LABEL[t], i);
    if (p.gear) for (const g of GEAR) if (p.gear.has(g.id)) addLabel(g.label, i);
    for (const a of ATTRS) if (!a.id.endsWith('_nahe') && !a.live && attrVal(p, a.id).v === 'yes') addLabel(a.label, i); // live values change during the day
    add(meta, cuisineText(p.f.cuisine?.[0]), i); add(meta, sportText(p.f.sport?.[0]), i);
    add(low, p.district, i); add(low, p.f.street?.[0], i); add(low, p.f.near_name?.[0], i);
  });
  return SI = { fields: [[name, 3], [meta, 3], [low, 1]], offers: null };
}
// Edit distance with swapped letters, gives up beyond max.
function typoDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let p2 = null, p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const c = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      c.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    p2 = p; p = c;
  }
  return p[b.length];
}
const typoMax = w => w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
function parseQuery(q) {
  let n = words(q).join(' ');
  for (const [k, v] of Object.entries(PHRASES)) n = n.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  const all = n.split(' ').filter(Boolean), open = all.some(w => OPEN_WORDS.has(w)), sunday = all.some(w => SUNDAY_WORDS.has(w)), duty = all.some(w => DUTY_WORDS.has(w));
  const tokens = all.filter(w => !STOP.has(w) && !OPEN_WORDS.has(w) && !SUNDAY_WORDS.has(w) && !DUTY_WORDS.has(w));
  if (duty && !tokens.some(t => t.startsWith('apothek'))) tokens.push('apotheke');
  return { tokens, open, sunday, duty };
}
// Place index -> score for one search word. Exact word > start of word > part of word > similar spelling.
function tokenHits(tok, state) {
  const idx = searchIndex(), hits = new Map();
  const put = (list, s) => { for (const i of list) if (s > (hits.get(i) || 0)) hits.set(i, s); };
  const scan = (w, f) => {
    for (const [m, wt] of idx.fields) {
      const exact = m.get(w);
      if (exact) put(exact, 10 * wt * f);
      if (w.length < 3) continue;
      for (const [v, list] of m) if (v !== w) {
        if (v.startsWith(w)) put(list, 7 * wt * f);
        else if (w.length >= 4 && v.includes(w)) put(list, 5 * wt * f);
      }
    }
  };
  scan(tok, 1);
  (SYN[tok] || []).forEach((w, j) => scan(w, 1.2 - j * .1));
  if (hits.size) return hits;
  const max = typoMax(tok);
  if (!max) return hits;
  state.fuzzy = true;
  for (const k of Object.keys(SYN)) if (typoDist(tok, k, max) <= max) SYN[k].forEach((w, j) => scan(w, .9 - j * .1));
  for (const [m, wt] of idx.fields) for (const [v, list] of m) {
    const d = v.length > 2 ? typoDist(tok, v, max) : 9;
    if (d <= max) put(list, (4 - d) * wt);
  }
  return hits;
}
// All matching places, best first: every search word must match.
function searchPlaces(q, o = origin()) {
  const { tokens, open, sunday, duty } = parseQuery(q), st = { fuzzy: false };
  let scores = null;
  for (const t of tokens) {
    const h = tokenHits(t, st);
    if (!scores) { scores = h; continue; }
    const next = new Map();
    for (const [i, s] of scores) if (h.has(i)) next.set(i, s + h.get(i));
    scores = next;
  }
  const nq = tokens.join(' ');
  let list;
  if (scores) list = [...scores];
  else if (open || sunday) list = places.map((_, i) => [i, 1]);
  else list = [];
  const res = [];
  for (const [i, s0] of list) {
    const p = places[i];
    if (open && openNow(p) !== true) continue;
    if (sunday && opensSunday(p.oh) !== true) continue;
    if (duty && (p.cat !== 'apotheke' || (LIVE.ok && !dutyNow(p)))) continue;
    let s = s0 + (p.f.tipp ? 4 : 0) + (p.named ? 0 : -3);
    if (tokens.some(t => p.tags.has(INTENT[t]))) s += 25;
    if (tokens.some(t => [t, ...(SYN[t] || [])].some(w => words(CAT_LABEL[p.cat]).includes(w)))) s += 12;
    const n = norm(p.name);
    if (nq && n === nq) s += 40; else if (nq && words(p.name).join(' ').startsWith(nq + ' ')) s += 15;
    if (LOW_RANK.has(p.cat) && !tokens.some(t => t.includes(p.cat) || (SYN[t] || []).includes(p.cat))) s *= .4;
    res.push({ p, s, d: dist(o, [p.lat, p.lon]) });
  }
  res.sort(duty ? (a, b) => a.d - b.d : (a, b) => b.s - a.s || a.d - b.d); // on-duty pharmacies: the nearest first
  res.fuzzy = st.fuzzy;
  return res;
}
// courses and events for the search words (synonyms, close spellings, word stems: see queryTerms); what is over today is gone
function searchOffers(q) {
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const out = [];
  for (const o of OFFERS) {
    if (isHidden(o) || !terms.every(ts => ts.some(w => offerText(o).includes(w)))) continue;
    const d = nextAfterNow(o); if (d) out.push([d, o]);
  }
  return out.sort(byDayTime);
}
// Category and tag shortcuts for the search words.
function searchChips(tokens) {
  const terms = new Set(tokens.flatMap(t => [t, ...(SYN[t] || [])]));
  const hit = label => { const n = norm(label), ws = words(label); return [...terms].some(w => w.length > 3 ? n.includes(w) : ws.includes(w)); };
  return { gs: GROUPS.filter(g => hit(g.label)), ts: Object.entries(TAGS).flatMap(([gid, list]) => list.filter(t => hit(t.label)).map(t => [gid, t])).slice(0, 8), fs: ATTRS.filter(a => a.q && !a.hide && !a.nofilter && hit(a.label)).slice(0, 4), ds: districtList().filter(d => tokens.some(t => t.length > 2 && norm(d).includes(t))).slice(0, 4) };
}

// (startVoice: the 'Ich höre zu' sheet, see voice.js)
// Voice input with the browser's own speech service; the button only appears where the browser offers one.
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function searchResults() {
  const q = state.sq.trim().toLowerCase();
  if (!q) return '';
  const { tokens } = parseQuery(q);
  const { gs, ts, fs, ds } = searchChips(tokens);
  const found = searchPlaces(q), ps = found.slice(0, 25).map(r => [r.d, r.p]), offers = searchOffers(q);
  return `${gs.length || fs.length || ts.length || ds.length ? `<div class="fgrid" style="margin:12px 0 10px">${gs.map(g => `<button type="button" class="chip" data-group-only="${g.id}">${esc(g.label)}</button>`).join('')}${ts.map(([gid, t]) => `<button type="button" class="chip" data-gtag="${gid}|${t.id}">${esc(GROUP[gid].label)}: ${esc(t.label)}</button>`).join('')}${ds.map(d => `<button type="button" class="chip" data-sdistrict="${esc(d)}">${svg('pin')}${esc(d)}</button>`).join('')}${fs.map(a => `<button type="button" class="chip" data-filter-only="${a.id}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    ${found.fuzzy && ps.length ? `<p class="note" style="margin:8px 0 0">${tl('Ähnliche Schreibweisen gezeigt.')}</p>` : ''}
    ${ps.length ? `<ol class="list">${ps.map(([d, p]) => itemHtml(p, d)).join('')}</ol>` : offers.length ? '' : `<div class="empty"><b>${tl('Keine Orte mit diesem Namen.')}</b>${tl('Versuch einen anderen Begriff.')}</div>`}
    ${offersBlock(offers, state.sq)}`;
}
// matching courses and events under the places (text search and Frag Djuu)
// "und 56 weitere im Tab Termine" opens Termine with the same search words
const offersBlock = (offers, q = '') => offers.length ? `<div class="sec"><h4>${tl('Kurse und Termine')}</h4><ol class="list">${offers.slice(0, 6).map(([d, o]) => offerItem(o, d)).join('')}</ol>${offers.length > 6 ? `<button type="button" class="morelink" data-evsearch="${esc(q)}">${esc(tl('und {n} weitere im Tab Termine', { n: nf.format(offers.length - 6) }))} ${svg('back')}</button>` : ''}</div>` : '';

// urgent
// Nappies: a drugstore is the surest bet, then supermarket, petrol station, pharmacy; a kiosk only maybe (penalty in metres per step)
const NAPPY_RANK = p => p.cat === 'apotheke' ? 3 : p.tags.has('drogerie') ? 0 : p.tags.has('supermarkt') ? 1 : p.tags.has('tankstelle') ? 2 : p.tags.has('spaeti') ? 4 : 2;
const SOS = [
  { id: 'wc', label: tl('Toilette'), title: tl('Nächste Toilette'), icon: 'toilet', color: '#0C8599', test: p => (p.cat === 'wc' || attrVal(p, 'toilette').v === 'yes') && openNow(p) !== false, hint: tl('öffentlich oder im Café') },
  { id: 'wickeln', label: tl('Wickeltisch'), title: tl('Nächster Wickeltisch'), icon: 'baby', color: '#0CA678', test: p => attrVal(p, 'wickeltisch').v === 'yes' && openNow(p) !== false, hint: tl('sicher bekannte Plätze') },
  { id: 'windeln', label: tl('Windeln'), title: tl('Windeln: nächster offener Laden'), icon: 'bag', color: '#1971C2', test: p => (p.cat === 'windeln' || p.cat === 'apotheke') && openNow(p) === true, rank: NAPPY_RANK, hint: tl('jetzt geöffnet') },
  // pharmacies: open now or on emergency duty, searched in the whole city (at night the nearest one on duty can be 5 to 8 km away)
  { id: 'apotheke', label: tl('Apotheke'), title: tl('Nächste offene Apotheke'), icon: 'pill', color: '#E03131', test: p => p.cat === 'apotheke' && openNow(p) === true, all: true, hint: tl('offen oder Notdienst') },
];
function sosView(kind) {
  const calls = `<div class="calls"><b style="font-family:var(--font-display)">${tl('Medizinischer Notfall')}</b>
    <span>${tl('Notruf:')} <a href="tel:112"><b>112</b></a></span><span>${tl('Kinderärztlicher Bereitschaftsdienst:')} <a href="tel:116117"><b>116 117</b></a></span><span>${tl('Giftnotruf Nord:')} <a href="tel:+4955119240"><b>0551 19240</b></a></span>
    <span>${tl('Apotheken-Notdienst:')} <a href="tel:08000022833"><b>0800 00 22833</b></a> ${tl('oder')} <a href="https://www.aponet.de/apotheke/notdienstsuche/20095" target="_blank" rel="noopener">${tl('aktuelle Liste bei aponet.de')}</a></span></div>`;
  if (!kind) return `${head(tl('Was braucht ihr jetzt?'), state.me ? tl('Ab deinem Standort') : tl('Ab Kartenmitte · Standort freigeben für genauere Wege'))}
    <div class="sosgrid">${SOS.map(s => `<button type="button" class="sostile" data-sos="${s.id}"><span class="ic" style="--c:${s.color}">${svg(s.icon)}</span><span>${s.label}<small>${s.hint}</small></span></button>`).join('')}</div>${calls}`;
  const s = SOS.find(x => x.id === kind), o = origin();
  const near = [];
  for (const p of places) {
    if (!s.all && (Math.abs(p.lat - o[0]) > 0.03 || Math.abs(p.lon - o[1]) > 0.05)) continue;
    if (s.test(p)) near.push([dist(o, [p.lat, p.lon]), p]);
  }
  // honest order: places we know are open first, then those without opening hours; within that by (weighted) distance
  const key = ([d, p]) => (openNow(p) === true ? 0 : 1e7) + d + (s.rank ? s.rank(p) * 400 : 0);
  near.sort((a, b) => key(a) - key(b));
  if (!near.length) return `${head(s.label)}<div class="empty"><b>${tl('Nichts in der Nähe bekannt.')}</b>${tl('Zoom raus oder versuch eine andere Kachel.')}</div>${calls}`;
  const [d, p] = near[0], duty = dutyNow(p);
  // further ones: the next known-open places, plus closer ones whose hours we do not know (marked as such), nearest first
  const more = near.slice(1).filter(([, x]) => openNow(x) === true).slice(0, 3).concat(near.filter(([dd, x]) => openNow(x) !== true && dd < d).slice(0, 2)).sort((a, b) => a[0] - b[0]);
  const ph = (p.f.phone?.[0] || '').split(/[;,]/)[0].trim(), tel = ph.replace(/[^+\d]/g, '');
  const status = openText(p) || `<span class="muted">${tl('Öffnungszeiten unbekannt')}</span>`;
  const maybe = kind === 'windeln' && NAPPY_RANK(p) === 4 ? `<span class="muted">${tl('Kiosk: Windeln gibt es dort nicht immer.')}</span>` : '';
  return `${head(s.title, state.me ? tl('Ab deinem Standort') : tl('Ab Kartenmitte'))}
    <div class="best"><span class="muted">${esc(CAT_LABEL[p.cat] || '')}</span><b style="font-size:18px">${esc(p.name)}</b>
      <span class="mins">${walkMin(d)} ${tl('Min.')}</span><span class="muted">${fmtDist(d)} ${tl('zu Fuß')} · ${status}</span>${maybe}
      ${duty ? `<span class="muted">${tl('Notdienst laut aponet.de, bitte vorher anrufen.')}</span>` : ''}
      <a class="btn big primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${svg('route')}${tl('Route starten')}</a>
      <div class="pinacts">${tel.length >= 5 ? `<a class="btn" href="tel:${esc(tel)}">${svg('phone')}${tl('Anrufen')}</a>` : ''}<button type="button" class="btn" data-id="${p.id}">${tl('Details')}</button></div></div>
    ${more.length ? `<div class="sec"><h4>${tl('Weitere in der Nähe')}</h4><ol class="list">${more.map(([dd, pp]) => itemHtml(pp, dd, { hours: true })).join('')}</ol></div>` : ''}${calls}`;
}

// events
function nextDow(dow, plusWeeks = 0) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7) + plusWeeks * 7); return d; }
const EXAMPLE_EVENTS = [
  { d: nextDow(6), time: '10:00–13:00', title: tl('Kinderflohmarkt von Eltern für Eltern'), where: tl('Eimsbüttel'), kind: tl('Flohmarkt') },
  { d: nextDow(3), time: '16:00', title: tl('Bilderbuchkino ab 3 Jahren'), where: tl('Bücherhalle'), kind: tl('Lesen') },
  { d: nextDow(0), time: '11:00', title: tl('Familienkonzert: Klassik für Kleine'), where: tl('Konzertsaal'), kind: tl('Musik') },
  { d: nextDow(6, 1), time: '09:00–14:00', title: tl('Kinderkleiderbasar Herbst/Winter'), where: tl('Winterhude'), kind: tl('Flohmarkt') },
];
// ---------- Termine: two pages (Einmalig, Wiederkehrend), two views (Für euch, Alle), search, one filter sheet ----------
// Einmalig: single events with a date (standard: the next 7 days). Wiederkehrend: courses, groups and meetups.
// "Für euch": the children's ages, the home area and what the family hid, ranked, one entry per series.
// "Alle": every offer that passes the filter sheet, by time. EV is kept while the app is open (a look at one offer does
// not reset the list); what is remembered lives in store.ev on this device and, with an account, in the account
// (window.djuuSavePref / window.djuuPrefs, see sync.js). The home postcode of a guest never leaves the device.
// fmt: Kurs / Gruppe / Treff; reg: '' | 'ohne' | 'mit'; open: folded sections that were opened; today: only today (map card).
const EV = { page: 'einmalig', mode: '', q: '', when: '7', from: '', to: '', days: new Set(), f: new Set(), topics: new Set(), fmt: new Set(), reg: '', limit: 60, open: new Set(), today: false, menu: null };
const EV_PAGES = [['einmalig', tl('Einmalig')], ['wiederkehrend', tl('Wiederkehrend')]];
const EV_UNIT = { einmalig: [tl('Event'), tl('Events')], wiederkehrend: [tl('Angebot'), tl('Angebote')] };
const EV_TIME_KEYS = ['vormittag', 'mittag', 'nachmittag', 'abend'];
store.ev = Object.assign({ mode: '', place: null, placeSet: false, home: null, onlyFit: true, hide: {}, like: {}, days: [], time: [], at: 0 }, store.ev || {});
store.ev.hide = Object.assign({ topics: [], providers: [], series: [] }, store.ev.hide || {});
store.ev.like = Object.assign({ topics: [], providers: [] }, store.ev.like || {});
// a meetup (Treff): an open group without registration, or a café-like meeting; every other group is a "Gruppe"
const isTreff = o => o.kind === 'gruppe' && (o.registration === 'offen' || o.topic === 'eltern_cafe' || /treff|caf[eé]|frühstück/i.test(o.title || ''));
const FORMATS = [['kurs', tl('Kurs'), o => o.kind === 'kurs'], ['gruppe', tl('Gruppe'), o => o.kind === 'gruppe' && !isTreff(o)], ['treff', tl('Treff'), isTreff]];
const unitOf = n => { const u = EV_UNIT[EV.page][n === 1 ? 0 : 1]; return LANG === 'de' ? u : u.toLowerCase(); }; // German nouns keep their capital
const cardPage = () => EV.page === 'wiederkehrend';
const WD_LONG = I18N_DAYS_LONG;
const MON_SHORT = I18N_MONTHS_SHORT;
const fmtShort = d => `${WD[dayIdx(d)]}, ${d.getDate()}. ${MON_SHORT[d.getMonth()]}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLong = d => d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
// the chosen "Wann" as a day range, or null for the next 8 weeks
function rangeOf(id = EV.when) {
  if (cardPage()) return null;
  const t = today0(), w = dayIdx(t);
  if (id === 'heute') return [t, t];
  if (id === 'morgen') return [addDays(t, 1), addDays(t, 1)];
  if (id === 'wochenende') return w === 6 ? [t, t] : [addDays(t, 5 - Math.min(w, 5)), addDays(t, 6 - w)];
  if (id === 'woche') return [t, addDays(t, 6 - w)];
  if (id === '7') return [t, addDays(t, 6)];
  if (id === '30') return [t, addDays(t, 29)];
  if (id === 'datum' && (EV.from || EV.to)) {
    // "bis" alone counts from today; "bis" before "von" is one day
    const a0 = EV.from ? new Date(EV.from + 'T00:00') : t, a = a0 < t ? t : a0;
    const b0 = EV.to ? new Date(EV.to + 'T00:00') : a, b = b0 < a ? a : b0;
    return [a, b];
  }
  return null;
}
const rangeText = r => +r[0] === +r[1] ? fmtShort(r[0]) : `${fmtShort(r[0])} – ${fmtShort(r[1])}`;
// first day in [a, b] the offer takes place
function firstIn(o, a, b) {
  for (let d = new Date(a), i = 0; d <= b && i < 200; d.setDate(d.getDate() + 1), i++) if (occursOn(o, d)) return new Date(d);
  return null;
}
// series with more than one date: weekly, every 2 weeks or monthly (a group that meets once, or whose rhythm is not known, is not)
const isRecurring = o => o.kind !== 'termin' && seriesRepeat(repeatOf(o));
// "jeden Mittwoch", "alle 2 Wochen mittwochs", "jeden letzten Samstag im Monat", "jeden 1. Mittwoch im Monat"
function rhythmText(o) {
  const rp = repeatOf(o), day = WD_LONG[o.weekday];
  if (rp === 'biweekly') return tl('alle 2 Wochen am {day}', { day });
  if (rp === 'monthly') { const r = monthRule(o); return r.last ? tl('jeden letzten {day} im Monat', { day }) : tl('jeden {n}. {day} im Monat', { n: r.n, day }); }
  return tl('jeden {day}', { day });
}
const hourOf = o => o.time_from ? +o.time_from.slice(0, 2) : null;
const ageIs = (x, y) => o => (o.age_min_m != null || o.age_max_m != null) && (o.age_min_m ?? 0) < y && (o.age_max_m ?? 999) > x;
const fitNames = () => familyAges().filter(k => k.months >= 0).map(k => `${k.name} (${ageText(k).replace(' Jahre', ' J.').replace(' Jahr', ' J.').replace(' Monate', tl(' Mon.'))})`).join(', ');
// a course that started before today (one usually cannot join it any more), a group one can just join
const started = o => o.kind === 'kurs' && !!o.start_date && o.start_date < ymd(today0()) && (!o.end_date || o.end_date >= ymd(today0()));
const rolling = o => o.kind === 'gruppe' && isRecurring(o) && o.registration === 'offen';
// Filter sections: inside one section any choice may match, across sections all must. Order as in the sheet (Thema sits between Alter and Preis).
const offerWithDog = o => ['auch', 'ja', 'leine'].includes(offerDog(o));
let dogOffers = { n: -1, any: false };
const anyOfferWithDog = () => { if (dogOffers.n !== OFFERS.length) dogOffers = { n: OFFERS.length, any: OFFERS.some(offerWithDog) }; return dogOffers.any; };
const EV_SECTIONS = [
  { id: 'time', title: tl('Uhrzeit'), any: true, two: true, items: [['vormittag', tl('Vormittag'), o => hourOf(o) != null && hourOf(o) < 12], ['mittag', tl('Mittag'), o => hourOf(o) >= 12 && hourOf(o) < 15],
    ['nachmittag', tl('Nachmittag'), o => hourOf(o) >= 15 && hourOf(o) < 18], ['abend', tl('Abend'), o => hourOf(o) >= 18]] },
  { id: 'aud', title: tl('Für wen'), any: true, items: [['kinder', tl('Für Kinder'), o => o.audience === 'kinder'], ['erwachsene', tl('Für Erwachsene'), o => o.audience === 'erwachsene'],
    ['hund', tl('Mit Hund'), offerWithDog, () => hasDog() && anyOfferWithDog()]] },
  { id: 'age', title: tl('Alter'), any: true, two: true, note: tl('Nur Termine mit Altersangabe, auch geschätzter.'),
    items: [['fit', () => tl('Passt zu ') + fitNames(), o => offerFits(o) === true, () => hasFamily() && familyAges().some(k => k.months >= 0)],
      ['a0', tl('bis 1'), ageIs(0, 12)], ['a1', '1–2', ageIs(12, 36)], ['a3', '3–5', ageIs(36, 72)], ['a6', '6–9', ageIs(72, 120)], ['a10', '10+', ageIs(120, 216)]] },
  { id: 'price', title: tl('Preis & Anmeldung'), items: [['frei', tl('kostenlos'), o => o.free === 1]] },
];
// when a filter cannot be answered for an offer (detail not given): which heading it is listed under
const NO_PRICE = tl('Preis nicht angegeben'), NO_REG = tl('Anmeldung nicht angegeben'), NO_AGE = tl('Alter nicht angegeben');
const noAge = o => o.age_min_m == null && o.age_max_m == null;
const EV_UNKNOWN = { frei: [o => o.free == null, NO_PRICE], fit: [noAge, NO_AGE], a0: [noAge, NO_AGE], a1: [noAge, NO_AGE], a3: [noAge, NO_AGE], a6: [noAge, NO_AGE], a10: [noAge, NO_AGE] };
// the folded line under the list: "18 weitere ohne Altersangabe"
const FOLD_TEXT = { [NO_AGE]: n => tl('{n} weitere ohne Altersangabe', { n: nf.format(n) }), [NO_PRICE]: n => tl('{n} weitere ohne Preisangabe', { n: nf.format(n) }), [NO_REG]: n => tl('{n} weitere ohne Angabe zur Anmeldung', { n: nf.format(n) }) };
// registration, one control with three states: Alle / ohne Anmeldung (drop in) / mit Anmeldung (nötig, Warteliste, Tickets)
const REG_MODES = [['', tl('Alle')], ['ohne', tl('Ohne Anmeldung')], ['mit', tl('Mit Anmeldung')]];
const regOk = o => EV.reg === 'ohne' ? o.registration === 'offen' : o.registration !== 'offen';
const regHtml = () => `<div class="segs evreg" role="group" aria-label="${tl('Anmeldung')}">${REG_MODES.map(([id, l]) => `<button type="button" class="${EV.reg === id ? 'on' : ''}" data-evreg="${id || 'alle'}" aria-pressed="${EV.reg === id}">${l}</button>`).join('')}</div>`;
// 1 = fits the filter sheet, 0 = does not, or the heading of the detail that is missing
function evFit(o) {
  if (o.own) return 1;
  let missing = '';
  for (const sec of EV_SECTIONS) {
    if (!sectionOn(sec)) continue;
    const on = sec.items.filter(it => EV.f.has(it[0]) && itemOn(it));
    if (!on.length) continue;
    const known = on.filter(it => !(EV_UNKNOWN[it[0]] && EV_UNKNOWN[it[0]][0](o)));
    const ok = sec.any ? known.some(it => it[2](o)) : known.every(it => it[2](o));
    if (ok && (sec.any || known.length === on.length)) continue;
    const unk = on.find(it => EV_UNKNOWN[it[0]] && EV_UNKNOWN[it[0]][0](o));
    if (unk && (sec.any ? true : known.every(it => it[2](o)))) { missing = missing || EV_UNKNOWN[unk[0]][1]; continue; }
    return 0;
  }
  if (EV.topics.size && !EV.topics.has(o.topic)) return 0;
  if (EV.reg) { if (!o.registration) missing = missing || NO_REG; else if (!regOk(o)) return 0; }
  if (cardPage() && EV.fmt.size && !FORMATS.some(([id, , fn]) => EV.fmt.has(id) && fn(o))) return 0;
  return missing || 1;
}
const itemLabel = l => typeof l === 'function' ? l() : l;
const sectionOn = sec => !sec.show || sec.show();
const itemOn = it => !it[3] || it[3]();
const TOPIC_FAMILIES = [
  [tl('Vorlesen & Theater'), 'book', '#D6336C', ['lesen', 'theater']],
  [tl('Spielen & Bewegung'), 'blocks', '#0E8F84', ['krabbelgruppe', 'spiele', 'pekip', 'sport', 'schwimmen']],
  [tl('Kreativ, Musik & Wissen'), 'scissors', '#CC6A00', ['kreativ', 'musik', 'wissen', 'kochen']],
  [tl('Für Eltern'), 'people', '#6B4EE6', ['beratung', 'eltern_cafe', 'babymassage', 'geburtsvorbereitung', 'rueckbildung', 'eltern_thema', 'erste_hilfe']],
  [tl('Feste & Märkte'), 'star', '#B07D00', ['feste', 'flohmarkt']],
];
const topicFam = t => TOPIC_FAMILIES.find(f => f[3].includes(t)) || [tl('Angebot'), 'cal', '#6B4EE6', []];
function evPass(o, skip) {
  for (const sec of EV_SECTIONS) {
    if (sec.id === skip || !sectionOn(sec)) continue;
    const on = sec.items.filter(it => EV.f.has(it[0]) && itemOn(it));
    if (on.length && !(sec.any ? on.some(it => it[2](o)) : on.every(it => it[2](o)))) return false;
  }
  if (EV.reg && o.registration && !regOk(o)) return false;
  return skip === 'topic' || !EV.topics.size || EV.topics.has(o.topic);
}
// search words with synonyms, close spellings and compound stems ("schwimmkurs" finds "Schwimmen")
function queryTerms(q) {
  const { tokens } = parseQuery(q || '');
  const typoKeys = t => { const m = typoMax(t); return m && !SYN[t] ? Object.keys(SYN).filter(k => typoDist(t, k, m) <= m).flatMap(k => SYN[k]) : []; };
  const stem = t => { const m = t.match(/^(.{4,}?)(kurse?|gruppen?|treffs?|angebote?|termine?|stunden?)$/); return m ? [m[1]] : []; };
  // words without a wish of their own ("meine", "für", "Kinder", "my", ask.js FILLER) never filter the list
  return tokens.filter(t => typeof FILLER === 'undefined' || !FILLER.has(t)).map(t => [t, ...(SYN[t] || []), ...typoKeys(t), ...stem(t)]);
}
// the text an offer is searched in: titles, topic, venue, provider, its Stadtteil and Bezirk ("Krabbelgruppe Altona")
function offerText(o) {
  if (o._t) return o._t;
  const d = offerDistrict(o), t = norm([o.title, titleOf(o), TOPIC_LABEL[o.topic], o.venue, o.provider, d, d && GEO_BEZ[d]].filter(Boolean).join(' '));
  if (GEO.stadtteile.length) o._t = t; // kept once the Bezirke are known
  return t;
}
// offers of the current page as [date, offer]: day pages one row per date in the range (or next 8 weeks), card pages one card per offer.
// raw = without Wann/Wochentag, Ort and search (for which topics exist on this page at all). Cached per minute and state.
const EVB = new Map();
function evBase(raw = false, skipPlace = false) {
  const A = skipPlace || raw ? null : evArea();
  const key = [raw, skipPlace, EV.page, raw ? '' : [EV.when, EV.from, EV.to, [...EV.days].join(), EV.q, EV.today].join('|'),
    A ? [A.mode, A.km, A.c, A.d && [...A.d].join()].join('|') : '', Math.floor(Date.now() / 6e4), OFFERS.length, store.events.length].join('~');
  if (EVB.has(key)) return EVB.get(key);
  const t = today0(), r = raw ? null : rangeOf(), p = EV.page, card = cardPage(), tomorrow = addDays(t, 1), win = (card ? 120 : 56) * 864e5;
  const own = p === 'einmalig' ? store.events.map(e => ({ title: e.title, kind: 'termin', start_date: e.date, time_from: e.time, lat: e.lat, lon: e.lon, venue: tl('von dir eingetragen'), topic: 'sonstiges', own: true, attrs: e.attrs })) : [];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  let list = [];
  for (const o of own.length ? OFFERS.concat(own) : OFFERS) {
    if (p === 'einmalig' ? o.kind !== 'termin' : o.kind !== 'kurs' && o.kind !== 'gruppe') continue;
    let d = r ? firstIn(o, r[0], r[1]) : nextDate(o);
    // what is over today moves to its next date (a weekly group, a show that runs for weeks), a single event drops out
    if (d && +d === +t && endMin(o) <= nowMin && !undated(o)) d = r ? (r[1] >= tomorrow ? firstIn(o, tomorrow, r[1]) : null) : nextDate(o, tomorrow);
    if (!d || (!r && d - t >= win)) continue;
    list.push([d, o]);
  }
  if (!raw) {
    if (card && EV.days.size) list = list.filter(([, o]) => EV.days.has(o.weekday));
    if (card && EV.today) list = list.filter(([d, o]) => +d === +t && !undated(o)); // "Nur heute": what really meets today
    if (A) list = list.filter(([, o]) => evPlaceOk(o, A));
    const terms = queryTerms(EV.q);
    if (terms.length) list = list.filter(([, o]) => { const n = offerText(o); return terms.every(ts => ts.some(w => n.includes(w))); });
  }
  if (EVB.size > 24) EVB.clear();
  EVB.set(key, list);
  return list;
}
// run with some EV fields changed (counts for other views), then put them back
function evWith(patch, fn) { const old = {}; for (const k of Object.keys(patch)) { old[k] = EV[k]; EV[k] = patch[k]; } try { return fn(); } finally { Object.assign(EV, old); } }

// ---------- Für euch: personal layer, ranking, series ----------
const kidsKnown = () => familyAges().some(k => k.months >= 0);
const canPersonal = () => hasFamily() || !!homeOf();
const evMode = () => EV.mode || store.ev.mode || (canPersonal() ? 'fuer' : 'alle');
const forYou = () => evMode() === 'fuer' && canPersonal();
// series across venues: same provider and title (the export's `series` also holds the venue)
const crossKey = o => o._ck || (o._ck = norm(o.provider || '') + '|' + norm(o.title || ''));
const isHidden = o => { if (o.own) return false; const H = store.ev.hide; return H.topics.includes(o.topic) || H.providers.includes(o.provider) || H.series.some(x => x.k === crossKey(o)); };
const babyOrExpecting = () => !!store.profile.expecting || familyAges().some(a => a.min < 3);
// Für euch: 'in', 'unk' (the provider gives no age) or 'out' (fits none of the children, adults only, fully booked)
function evPersonal(o) {
  if (o.own) return 'in';
  if (o.status === 'ausgebucht') return 'out';
  if (!store.ev.onlyFit || !hasFamily()) return 'in';
  if (allAges(o)) return 'in'; // a family event for all ages
  const f = offerFits(o); // parents' courses and other adult offers: see offerFits
  return f === true ? 'in' : f === false ? 'out' : 'unk';
}
// 1 = in the list, a heading = folded at the end (a detail is not given), 0 = out. What the family hid is out in both views.
function evClass(o) {
  if (o.status === 'abgesagt' || isHidden(o)) return 0;
  const f = evFit(o);
  if (f === 0) return 0;
  if (forYou()) { const p = evPersonal(o); if (p === 'out') return 0; if (p === 'unk' && f === 1) return NO_AGE; }
  return f;
}
const evResults = () => evBase().filter(([, o]) => evClass(o) === 1);
// offers that fit except for a detail that is not given, by that detail
function evMissing() {
  const out = new Map();
  for (const x of evBase()) { const f = evClass(x[1]); if (typeof f === 'string') (out.get(f) || out.set(f, []).get(f)).push(x); }
  return out;
}
// what a row's score depends on, worked out once per list
function evCtx() {
  const A = evArea(), savedProv = new Set();
  for (const s of store.savedOffers) { const o = OFFER_BY_ID.get(s.id) || s.snap; if (o?.provider) savedProv.add(o.provider); }
  return { kids: familyAges().filter(k => k.months >= 0), c: A.c || radiusOrigin() || state.me, savedProv, savedPlace: new Set(store.favorites),
    likeT: new Set(store.ev.like.topics), likeP: new Set(store.ev.like.providers), t: today0() };
}
// how many dates a series has in the next 30 days (a weekly offer counts 4): the rarer, the higher
let SERIES_N = null;
function seriesN(o) {
  if (!SERIES_N) {
    SERIES_N = new Map();
    const e = addDays(today0(), 29);
    const per = { weekly: 4, biweekly: 2, monthly: 1 };
    for (const x of OFFERS) { const d = nextDate(x); if (d && d <= e) SERIES_N.set(crossKey(x), (SERIES_N.get(crossKey(x)) || 0) + (per[repeatOf(x)] || (x.kind === 'termin' ? 1 : 2))); }
  }
  return SERIES_N.get(crossKey(o)) || 1;
}
// 1 = an age band that fits, 0.6 = open "ab X" within 3 years, 0.4 = open and far, 0.3 = no age given, 0 = fits none
function ageScore(o, kids) {
  if (noAge(o) || allAges(o)) return o.for_parents ? 0.6 : 0.3; // "für alle Altersgruppen" counts like no age
  let best = 0;
  for (const k of kids) {
    const lo = o.age_min_m ?? 0, hi = o.age_max_m ?? 999;
    if (!ageIn(k, lo, hi)) continue;
    best = Math.max(best, o.age_max_m != null ? (hi - lo <= 72 ? 1 : 0.8) : (k.min - lo <= 36 ? 0.6 : 0.4));
  }
  return best;
}
// relevance: age fit, distance, known places and providers, Djuu-Tipp, rarity, new, "Mehr wie das"; minus courses already running
function evScore(o, X) {
  const why = [];
  let s = 0;
  if (X.kids.length) {
    const a = ageScore(o, X.kids); s += 3 * a;
    const k = a >= 0.6 && !noAge(o) && !allAges(o) && X.kids.find(k => ageIn(k, o.age_min_m ?? 0, o.age_max_m ?? 999));
    if (k) why.push(tl('passt zu {name}', { name: k.name }));
  } else s += 1.5;
  const p = offerPos(o);
  if (o.online) { s += 1; why.push(tl('online')); }
  else if (p && X.c) { const m = dist(X.c, p); s += 2 * Math.exp(-m / 3000); why.push(fmtDist(m)); }
  if (o.place_id && X.savedPlace.has(o.place_id)) { s += 1.5; why.push(tl('gemerkter Ort')); }
  else if (o.provider && X.savedProv.has(o.provider)) { s += 1.5; why.push(tl('kennt ihr schon')); }
  if (o.tip) { s += 1; why.push(tl('Djuu-Tipp')); }
  const n = seriesN(o); s += 0.8 / n;
  if (o.kind === 'termin' && n <= 2 && !o.own) why.push(tl('selten'));
  if (isNewOffer(o)) { s += 0.5; why.push(tl('neu')); }
  if (X.likeT.has(o.topic) || X.likeP.has(o.provider)) { s += 0.7; why.push(tl('mehr davon')); }
  if (started(o)) s -= 2;
  if (o.status === 'ausgebucht') s -= 3;
  return { s, why: why.slice(0, 3) };
}
// one entry per series: the nearest venue's first date leads (several venues), else the first date
function evGroups(list, X) {
  const by = new Map();
  for (const x of list) { const k = x[1].own ? 'own:' + x[1].title + ymd(x[0]) : crossKey(x[1]); (by.get(k) || by.set(k, []).get(k)).push(x); }
  const out = [];
  for (const items of by.values()) {
    items.sort(byDayTime);
    const sc = items.map(([d, o]) => [d, o, evScore(o, X)]);
    const venues = new Set(items.map(([, o]) => o.venue || '')).size;
    let lead = sc[0];
    if (venues > 1 && X.c) { let best = Infinity; for (const x of sc) { const p = offerPos(x[1]), m = p ? dist(X.c, p) : 9e9; if (m < best - 1) { best = m; lead = x; } } }
    // sooner is better: a block that starts in two months ranks below one that runs next week
    const soon = d => Math.min(1.5, Math.max(0, (d - X.t) / 864e5 - 7) / 30);
    out.push({ d: lead[0], o: lead[1], why: lead[2].why, sc: Math.max(...sc.map(x => x[2].s - soon(x[0]))), items, venues });
  }
  return out;
}
// the series line: "9 Termine: Sa 21.11. 12:15, 13:30 · So 22.11. 14:30 …", "22 Termine an 14 Orten", "auch Do 16:00"
function seriesText(g) {
  const items = g.items, n = items.length;
  if (g.venues > 1) return tl('{n} Termine an {v} Orten', { n: nf.format(n), v: nf.format(g.venues) });
  if (g.o.kind !== 'termin') {
    const own = `${WD[g.o.weekday] ?? ''} ${g.o.time_from || ''}`.trim();
    const more = [...new Set(items.map(([, o]) => `${WD[o.weekday] ?? ''} ${o.time_from || ''}`.trim()))].filter(x => x && x !== own);
    return more.length ? tl('auch: {list}', { list: more.slice(0, 4).join(', ') + (more.length > 4 ? ' …' : '') }) : tl('{n} Gruppen', { n });
  }
  const parts = [];
  for (const [d, o] of items.slice(0, 3)) { const l = fmtDay(d), last = parts[parts.length - 1]; if (last && last.l === l) last.t.push(o.time_from || ''); else parts.push({ l, t: [o.time_from || ''] }); }
  return `${tl('{n} Termine', { n: nf.format(n) })}: ${parts.map(x => `${x.l} ${x.t.filter(Boolean).join(', ')}`.trim()).join(' · ')}${n > 3 ? ' …' : ''}`;
}
// Highlights der Woche: up to 5 of the next 7 days, Djuu-Tipps first, then rare, fitting, near and weekend ones
function evHighlights(X) {
  const rows = evWith({ when: '7', q: '' }, () => evResults());
  const gs = evGroups(rows, X).map(g => ({ ...g, h: (g.o.tip ? 10 : 0) + 2.4 / seriesN(g.o) + g.sc + ([5, 6].includes(dayIdx(g.d)) ? 0.5 : 0) }));
  return gs.sort((a, b) => b.h - a.h).slice(0, 5);
}
const hlHtml = gs => gs.length < 2 ? '' : `<div class="sec evhl"><h4>${svg('star')}${tl('Highlights der Woche')}</h4><div class="hlrow">${gs.map(g => `<button type="button" class="hlcard${g.o.tip ? ' tip' : ''}" ${g.items.length > 1 ? `data-evseries="${esc(crossKey(g.o))}"` : `data-offer="${esc(g.o.id)}"`}>
    <b>${esc(titleOf(g.o))}</b><span>${esc(fmtDay(g.d))}${g.o.time_from ? ' · ' + esc(g.o.time_from) : ''}${g.items.length > 1 ? ' · ' + esc(tl('{n} Termine', { n: g.items.length })) : ''}</span><span class="v">${esc(g.o.venue || '')}</span>${g.o.tip ? `<span class="tipline">${svg('star', '')}${tl('Djuu-Tipp')}</span>` : ''}</button>`).join('')}</div></div>`;

// ---------- remembered settings ----------
EV.place = { mode: 'all', districts: new Set(), km: 5, gps: null, placeId: null };
EV.placeTab = ''; // the tab of the Ort control that is open ('' = the one in use)
EV.pending = new Set(); EV.dq = '';
function evRestore() {
  const s = store.ev, p = s.place;
  if (p && typeof p === 'object') Object.assign(EV.place, { mode: ['all', 'districts', 'radius', 'online'].includes(p.mode) ? p.mode : 'all', km: Math.min(20, Math.max(1, +p.km || 5)), placeId: p.placeId || null, districts: new Set(Array.isArray(p.districts) ? p.districts : []) });
  EV.days = new Set((s.days || []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6));
  for (const k of EV_TIME_KEYS) EV.f.delete(k);
  for (const k of s.time || []) if (EV_TIME_KEYS.includes(k)) EV.f.add(k);
}
evRestore();
// the copy for the account: everything but the guest's home postcode (that stays on this phone)
const evPrefsOut = () => { const s = store.ev; return { mode: s.mode, place: s.place, placeSet: s.placeSet, onlyFit: s.onlyFit, hide: s.hide, like: s.like, days: s.days, time: s.time, at: s.at }; };
function saveEv() {
  const P = EV.place, s = store.ev;
  s.place = { mode: P.mode, km: P.km, placeId: P.placeId || null, districts: [...P.districts].slice(0, 40) };
  s.days = [...EV.days]; s.time = [...EV.f].filter(k => EV_TIME_KEYS.includes(k)); s.at = Date.now();
  for (const k of ['topics', 'providers']) { s.hide[k] = s.hide[k].slice(-50); s.like[k] = s.like[k].slice(-50); }
  s.hide.series = s.hide.series.slice(-200);
  save();
  try { window.djuuSavePref?.('ev', evPrefsOut()); } catch (e) { /* the copy on this device is enough */ }
}
// the account's copy wins when it is newer (the same person changed it on another phone)
function adoptEvPrefs() {
  const a = window.djuuPrefs?.ev;
  if (!a || typeof a !== 'object' || !(+a.at > +store.ev.at)) return false;
  const s = store.ev, strs = (x, n) => Array.isArray(x) ? x.filter(v => typeof v === 'string').slice(-n) : [];
  if (['', 'fuer', 'alle'].includes(a.mode)) s.mode = a.mode;
  if (a.place && typeof a.place === 'object') s.place = a.place;
  s.placeSet = !!a.placeSet; s.onlyFit = a.onlyFit !== false;
  s.hide = { topics: strs(a.hide?.topics, 50), providers: strs(a.hide?.providers, 50), series: Array.isArray(a.hide?.series) ? a.hide.series.filter(x => x && typeof x.k === 'string').map(x => ({ k: x.k, t: String(x.t || '').slice(0, 80) })).slice(-200) : [] };
  s.like = { topics: strs(a.like?.topics, 50), providers: strs(a.like?.providers, 50) };
  s.days = Array.isArray(a.days) ? a.days.filter(Number.isInteger) : []; s.time = strs(a.time, 4); s.at = +a.at;
  save(); evRestore(); EVB.clear(); return true;
}
// after a change of settings: lists and counts follow
function afterEvChange() { EVB.clear(); TODAY_C.key = ''; if (['events', 'evsettings', 'evseries', 'evfilters', 'evplace', 'offer'].includes(view().type)) renderPanel(); }
function evActiveCount() {
  let n = (cardPage() ? EV.days.size + EV.fmt.size + (EV.today ? 1 : 0) : (EV.when && EV.when !== '7' ? 1 : 0)) + EV.topics.size + (EV.reg ? 1 : 0) + (EV.place.mode !== 'all' ? 1 : 0);
  for (const sec of EV_SECTIONS) if (sectionOn(sec)) n += sec.items.filter(it => EV.f.has(it[0]) && itemOn(it)).length;
  return n;
}

// ---------- the page ----------
const WHEN_CHIPS = [['heute', tl('Heute')], ['morgen', tl('Morgen')], ['wochenende', tl('Wochenende')], ['7', tl('7 Tage')], ['30', tl('30 Tage')]];
function eventsView() {
  adoptEvPrefs();
  const nf_ = evActiveCount(), mode = evMode(), r = rangeOf();
  const dateChip = !cardPage() && EV.when === 'datum' && r ? `<button type="button" class="chip on" data-evwhen="datum" aria-pressed="true" aria-label="${tl('Zeitraum entfernen')}">${svg('cal')}${esc(rangeText(r))} ${svg('close')}</button>` : '';
  const quick = cardPage()
    ? `<div class="row evquick">${EV.today ? `<button type="button" class="chip on" data-evtodayx="1" aria-label="${tl('Nur heute entfernen')}">${svg('check')}${tl('Nur heute')} ${svg('close')}</button>` : ''}${FORMATS.map(([id, l]) => `<button type="button" class="chip${EV.fmt.has(id) ? ' on' : ''}" data-evfmt="${id}" aria-pressed="${EV.fmt.has(id)}">${EV.fmt.has(id) ? svg('check') : ''}${l}</button>`).join('')}${EV.reg ? `<button type="button" class="chip on" data-evreg="alle" aria-label="${tl('Anmeldung: Auswahl entfernen')}">${svg('check')}${EV.reg === 'ohne' ? tl('Ohne Anmeldung') : tl('Mit Anmeldung')} ${svg('close')}</button>` : ''}</div>`
    : `<div class="row evquick">${WHEN_CHIPS.map(([id, l]) => `<button type="button" class="chip${EV.when === id ? ' on' : ''}" data-evwhen="${id}" aria-pressed="${EV.when === id}">${EV.when === id ? svg('check') : ''}${l}</button>`).join('')}${dateChip}</div>`;
  const modes = `<div class="segs evmode" role="tablist" aria-label="${tl('Ansicht')}">${[['fuer', tl('Für euch')], ['alle', tl('Alle')]].map(([id, l]) => `<button type="button" role="tab" aria-selected="${mode === id}" class="${mode === id ? 'on' : ''}" data-evmode="${id}">${l}</button>`).join('')}</div>`;
  const where = mode === 'fuer' ? evStatusHtml() : `<button type="button" class="placechip" data-open="evplace">${svg('pin')}<span>${esc(evPlaceLabel())}</span><small>${tl('Ändern')}</small></button>`;
  // compact: title, the two pages, Für euch / Alle with its line, search and filter, quick chips – then the first event
  return `<div class="ph evhead"><h2>${tl('Termine')}</h2>
      <button type="button" class="pillbtn" data-evmap="1">${svg('map')}${tl('Karte')}</button></div>
    <div class="evtabs two" role="tablist">${EV_PAGES.map(([id, l]) => `<button type="button" role="tab" aria-selected="${EV.page === id}" class="${EV.page === id ? 'on' : ''}" data-evpage="${id}">${l}</button>`).join('')}</div>
    ${modes}${where}
    <div class="evbar"><label class="evsearch">${svg('search')}<input id="evQ" type="search" placeholder="${tl('Suchen')}" value="${esc(EV.q)}" autocomplete="off" aria-label="${tl('Termine durchsuchen')}"></label>
      <button type="button" class="evfilterbtn${nf_ ? ' on' : ''}" data-open="evfilters">${svg('filter')}${tl('Filter')}${nf_ ? ` <span class="count">${nf_}</span>` : ''}</button></div>
    ${quick}
    <div id="evList">${evListHtml()}</div>
    <button type="button" class="btn" data-addevent="1" style="margin-top:14px">${svg('plus')}${tl('Veranstaltung eintragen')}</button>
    <p class="note">${tl('Quellen: Eltern-Kind-Zentren, Elternschulen, Familienbildung, Bücherhallen, Bäderland u. a. Anmeldung immer beim Anbieter.')}</p>`;
}
// "Für Mia (2 J.) · bis 5 km von Zuhause · Ändern"
function evStatusHtml() {
  if (!canPersonal()) return `<button type="button" class="evstatus" data-evsettings="1">${svg('people')}<span>${tl('Für euch: Kinder im Wir oder ein Zuhause eintragen')}</span><small>${tl('Ändern')}</small></button>`;
  const parts = [store.ev.onlyFit && kidsKnown() ? tl('Für {names}', { names: fitNames() }) : store.ev.onlyFit && store.profile.expecting ? tl('Für werdende Eltern') : tl('Für euch'), evAreaText()];
  const H = store.ev.hide, nh = H.topics.length + H.providers.length + H.series.length;
  if (nh) parts.push(tl('{n} ausgeblendet', { n: nh }));
  return `<button type="button" class="evstatus" data-evsettings="1">${svg('people')}<span>${esc(parts.join(' · '))}</span><small>${tl('Ändern')}</small></button>`;
}
function evAreaText() {
  const A = evArea();
  if (A.mode === 'radius') return EV.place.mode === 'radius' && EV.place.gps ? tl('bis {km} vom Standort', { km: kmText(A.km) }) : tl('bis {km} von {place}', { km: kmText(A.km), place: homeOf()?.name || tl('Zuhause') });
  if (A.mode === 'districts') return evPlaceLabel();
  if (A.mode === 'online') return tl('Online');
  return tl('ganz Hamburg');
}
function evListHtml() {
  const fy = forYou(), list = evResults(), t = today0(), r = rangeOf();
  const fresh = DATA_AT.offers ? ` · <span class="freshinline">${svg('check')}${esc(tl('{when} aktualisiert', { when: freshText() }))}</span>` : '';
  const hol = cardPage() && schoolHoliday(r?.[0] || t);
  let body, count = list.length;
  if (fy) {
    const X = evCtx(), gs = evGroups(list, X);
    if (cardPage()) gs.sort((a, b) => b.sc - a.sc || a.d - b.d); else gs.sort((a, b) => a.d - b.d || b.sc - a.sc);
    // highlights only when the list is long enough to need them; what they show is left out of the list below (never twice)
    const hl = !cardPage() && !EV.q && gs.length > 6 ? evHighlights(X) : [], hk = new Set(hl.map(g => crossKey(g.o)));
    const rest = hk.size ? gs.filter(g => !hk.has(crossKey(g.o))) : gs, shown = rest.slice(0, EV.limit);
    count = gs.length; // one entry per series, as shown
    const alle = evWith({ mode: 'alle' }, () => evResults().length);
    body = hlHtml(hl) + (gs.length ? (cardPage() ? `<ol class="list evcards">${shown.map(g => evCardHtml(g.o, g.d, g)).join('')}</ol>` : groupDayList(shown))
      + (rest.length > EV.limit ? `<button type="button" class="more" data-emore="1">${tl('Mehr anzeigen')}</button>` : '')
      : `<div class="empty"><b>${tl('Für euch ist hier gerade nichts dabei.')}</b>${tl('Probier eine längere Zeit, ein größeres Gebiet oder „Alle“.')}</div>`)
      + (alle > list.length ? `<button type="button" class="btn wide evall" data-evmode="alle">${tl('Alle {n} {unit} zeigen', { n: nf.format(alle), unit: unitOf(alle) })}</button>` : '');
  } else {
    const o0 = origin();
    const near = o => { const p = offerPos(o); return p ? dist(o0, p) : 9e9; };
    list.sort((a, b) => undated(a[1]) - undated(b[1]) || byDayTime(a, b) || near(a[1]) - near(b[1])); // without known dates: last
    // Wiederkehrend: the same offer at the same place at several times is one card with its times in one line
    const cards = cardPage() ? alleCards(list) : null, n = cards ? cards.length : list.length;
    count = n;
    body = list.length ? (cards ? `<ol class="list evcards">${cards.slice(0, EV.limit).map(g => evCardHtml(g.o, g.d, g.times ? g : undefined)).join('')}</ol>` : dayListHtml(list.slice(0, EV.limit)))
      + (n > EV.limit ? `<button type="button" class="more" data-emore="1">${tl('Mehr anzeigen')}</button>` : '')
      : `<div class="empty"><b>${OFFERS.length ? tl('Nichts gefunden.') : tl('Noch keine Termine geladen.')}</b>${OFFERS.length ? tl('Probier eine andere Suche oder weniger Filter.') : ''}</div>`;
    const H = store.ev.hide, nh = H.topics.length + H.providers.length + H.series.length;
    if (nh) body += `<p class="note">${esc(tl('{n} ausgeblendet', { n: nh }))} · <button type="button" class="linkbtn" data-evsettings="1">${tl('Verwalten')}</button></p>`;
  }
  // today's groups and courses on the Heute page (the map card counts the same)
  const wkToday = !cardPage() && EV.when === 'heute' ? evWith({ page: 'wiederkehrend', today: true }, () => evResults().length) : 0;
  // the first event comes right after one count line; the holiday card waits at the end of the list
  return `<p class="evcount">${nf.format(count)} ${unitOf(count)}${fresh}</p>
    ${hol ? `<p class="note" style="margin:0 0 10px">${esc(hol)}${tl(': Viele Kurse pausieren, bitte beim Anbieter nachsehen.')}</p>` : ''}
    ${wkToday ? `<button type="button" class="foldrow" data-evtoday="1">${svg('repeat')}<span>${esc(wkToday === 1 ? tl('Heute außerdem: 1 Gruppe oder Kurs') : tl('Heute außerdem: {n} Gruppen und Kurse', { n: nf.format(wkToday) }))}</span>${svg('next')}</button>` : ''}
    ${body}
    ${cardPage() ? '' : ferienCard(14, true)}
    ${[...evMissing()].map(([label, items]) => { const open = EV.open.has(label); items.sort(byDayTime);
      return `<div class="sec missing"><button type="button" class="foldrow" data-evfold="${esc(label)}" aria-expanded="${open}"><span>${esc((FOLD_TEXT[label] || (n => `${label} (${n})`))(items.length))}</span>${svg(open ? 'up' : 'next')}</button>
      ${open ? (cardPage() ? `<ol class="list evcards">${items.slice(0, 60).map(([d, o]) => evCardHtml(o, d)).join('')}</ol>` : dayListHtml(items.slice(0, 60))) + (items.length > 60 ? `<p class="note">${tl('und {n} weitere', { n: nf.format(items.length - 60) })}</p>` : '') : ''}</div>`; }).join('')}`;
}
// Alle › Wiederkehrend: one card per offer and place, its times in one line ("Mi 09:30, 11:00 · Do 10:00"); list order kept
function alleCards(list) {
  const by = new Map();
  for (const x of list) { const k = crossKey(x[1]) + '|' + norm(x[1].venue || ''); (by.get(k) || by.set(k, []).get(k)).push(x); }
  return [...by.values()].map(items => {
    // series by weekday ("Sa 13:00, 13:40"), single dates by day ("Sa 21.11. 12:00"); one entry only says nothing: no line
    const days = new Map(), once = [];
    for (const [d, o] of items) {
      if (undated(o)) continue;
      if (isRecurring(o)) (days.get(o.weekday) || days.set(o.weekday, new Set()).get(o.weekday)).add(o.time_from || '');
      else once.push(`${fmtDay(d)}${o.time_from ? ' ' + o.time_from : ''}`);
    }
    const parts = [...days].sort((a, b) => a[0] - b[0]).map(([d, ts]) => `${WD[d]} ${[...ts].filter(Boolean).sort().join(', ')}`.trim()).concat([...new Set(once)]);
    const n = [...days.values()].reduce((s, ts) => s + Math.max(1, ts.size), 0) + new Set(once).size;
    return { o: items[0][1], d: items[0][0], items, venues: 1, times: items.length > 1 && n > 1 ? parts.slice(0, 6).join(' · ') + (parts.length > 6 ? ' …' : '') : '' };
  });
}
// Für euch on a day page: a heading per day, ranked inside the day
function groupDayList(gs) {
  let out = '', cur = null;
  for (const g of gs) {
    const k = ymd(g.d);
    if (k !== cur) { out += `${cur ? '</ol>' : ''}<h4 class="dayhead">${esc(dayHead(g.d))}</h4><ol class="list">`; cur = k; }
    out += evRowHtml(g.o, g.d, g);
  }
  return cur ? out + '</ol>' : '';
}
// the place setting in words: Ganz Hamburg, the Stadtteile, the radius or Online
function evPlaceLabel() {
  const P = EV.place, A = evArea();
  if (A.mode === 'districts') { const d = [...P.districts].map(dLabel); return d.length > 2 ? `${d.slice(0, 2).join(', ')} +${d.length - 2}` : d.join(', '); }
  if (A.mode === 'radius') return `${tl('Umkreis')} ${kmText(A.km)}`;
  if (A.mode === 'online') return tl('Online');
  return tl('Ganz Hamburg');
}
// Ort as its own small page: Ganz Hamburg, Stadtteil, Umkreis or Online, one tap to change
function evPlaceView() {
  return `<div class="ph sheethead"><h2>${tl('Ort')}</h2><button type="button" class="round" data-back="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>${evPlaceHtml(false)}${evSheetFoot()}`;
}
// tags under a title: age, recurring, registration, price, status
const soonOffer = o => { const d = nextAfterNow(o); return !!d && d - Date.now() < 3 * 864e5; };
function evTags(o, withRecurring, why) {
  const kids = whoTag(o);
  const fits = !why?.length && offerFits(o) === true; // in Für euch the reason line says it (and "neu")
  return [fits && `<span class="fitchip">${tl('passt zu euch')}</span>`,
    isNewOffer(o) && !why?.includes(tl('neu')) && `<span class="tag new">${tl('neu')}</span>`,
    o.status === 'ausgebucht' && `<span class="tag reg">${tl('Ausgebucht')}</span>`,
    kids && `<span>${esc(kids)}</span>`,
    withRecurring && isRecurring(o) && `<span class="tag rec">${svg('repeat')}${o.kind === 'kurs' ? tl('Kurs') : tl('Gruppe')} · ${esc(rhythmText(o))}</span>`,
    started(o) && `<span class="tag">${esc(tl('läuft seit {date}', { date: fmtD(new Date(o.start_date + 'T00:00')) }))}</span>`,
    rolling(o) ? `<span class="tag ok">${svg('check')}${tl('Einstieg jederzeit')}</span>` : o.registration === 'offen' && `<span class="tag ok">${svg('check')}${tl('ohne Anmeldung')}</span>`,
    o.registration === 'nötig' && `<span class="tag reg">${svg('edit')}${tl('Anmeldung nötig')}</span>`,
    o.registration === 'Warteliste' && `<span class="tag reg">${tl('Warteliste')}</span>`,
    o.registration === 'Tickets' && `<span>${tl('Tickets')}</span>`,
    o.online && `<span class="tag ok">${tl('Online')}</span>`,
    o.free === 1 && `<span>${tl('kostenlos')}</span>`, dogChip(offerDog(o)),
    !o.online && soonOffer(o) && liftWarn(offerPos(o)) && liftWarnChip()].filter(Boolean).join('');
}
const timeRange = o => o.time_from ? `${o.time_from}${o.time_to ? '–' + o.time_to : ''}` : '';
const evMenuBtn = o => o.id ? `<button type="button" class="evmenubtn" data-evmenu="${esc(o.id)}" aria-label="${tl('Mehr Möglichkeiten')}">${svg('more')}</button>` : '';
// one row in a day list (Einmalig, Gemerkt); g = its series in Für euch (reason line, other dates)
function evRowHtml(o, d, g, opts = {}) {
  const fam = topicFam(o.topic), tags = evTags(o, true, g?.why), multi = g && g.items.length > 1;
  const dx = opts.from && offerPos(o) ? ' · ' + fmtDist(dist(opts.from, offerPos(o))) : g ? '' : evDistText(o);
  const inner = `<span class="evtime">${o.time_from ? esc(o.time_from) : `<small>${tl('ganztags')}</small>`}</span>
    <span><h3>${esc(titleOf(o))}</h3><span class="meta"><span class="ticon" style="--c:${fam[2]}">${svg(fam[1])}</span>${esc(TOPIC_LABEL[o.topic] || tl('Angebot'))}${o.venue ? ' · ' + esc(o.venue) : ''}${dx}</span>
    ${g?.why?.length ? `<span class="why">${esc(g.why.join(' · '))}</span>` : ''}${multi ? `<span class="serline">${svg('repeat')}${esc(seriesText(g))}</span>` : ''}
    ${tags ? `<span class="mini">${tags}</span>` : ''}</span>`;
  const act = multi ? `data-evseries="${esc(crossKey(o))}"` : `data-offer="${esc(o.id)}"`;
  return o.id ? `<li class="offrow hasmenu"><button type="button" class="item evrow" ${act}>${inner}</button>${saveBtn(o)}${evMenuBtn(o)}</li>` : `<li><div class="item evrow">${inner}</div></li>`;
}
// one card on the Wiederkehrend page
function evCardHtml(o, nd, g) {
  const fam = topicFam(o.topic), time = timeRange(o), multi = g && g.items.length > 1;
  const rd = rhythmText(o), un = undated(o);
  const rec = isRecurring(o) ? `${rd.charAt(0).toUpperCase() + rd.slice(1)}${time ? ' · ' + time : ''}`
    : un ? (o.schedule ? tl('Laut Anbieter: {text}', { text: o.schedule }) : tl('Termine beim Anbieter'))
    : o.start_date && o.end_date && o.start_date !== o.end_date ? `${fmtShort(new Date(o.start_date + 'T00:00'))} ${tl('bis')} ${fmtShort(new Date(o.end_date + 'T00:00'))}${time ? ' · ' + time : ''}`
    : `${tl('Einmal')}${time ? ' · ' + time : ''}`;
  const act = multi ? `data-evseries="${esc(crossKey(o))}"` : `data-offer="${esc(o.id)}"`;
  return `<li class="offrow hasmenu"><button type="button" class="evcard" ${act}>
      <span class="evicon" style="--c:${fam[2]}">${svg(fam[1])}</span>
      <span class="evcbody"><h3>${esc(titleOf(o))}</h3><span class="meta">${esc(TOPIC_LABEL[o.topic] || tl('Angebot'))}${o.venue ? ' · ' + esc(o.venue) : ''}${g ? '' : evDistText(o)}</span>
        ${g?.why?.length ? `<span class="why">${esc(g.why.join(' · '))}</span>` : ''}
        <span class="rec">${svg('repeat')}${esc(rec)}</span>
        ${multi && !g.times ? `<span class="serline">${esc(seriesText(g))}</span>` : ''}
        ${un ? '' : `<span class="next">${tl('Nächster Termin:')} ${esc(fmtShort(nd))}${o.sessions > 1 ? ` · ${tl('{n} Termine', { n: o.sessions })}` : ''}</span>`}
        ${g?.times ? `<span class="serline">${svg('clock')}${esc(g.times)}</span>` : ''}
        <span class="mini">${evTags(o, false, g?.why)}</span></span></button>${saveBtn(o)}${evMenuBtn(o)}</li>`;
}
// all dates of one series (same provider and title), nearest venue first in its day
function evSeriesView(key) {
  const X = evCtx(), list = OFFERS.filter(o => crossKey(o) === key).map(o => [nextAfterNow(o), o]).filter(([d]) => d).sort(byDayTime);
  const o = list[0]?.[1];
  if (!o) return `${head(tl('Termine'))}<div class="empty"><b>${tl('Diesen Termin finden wir nicht mehr.')}</b>${tl('Vielleicht ist er vorbei oder wurde abgesagt.')}</div>`;
  const venues = new Set(list.map(([, x]) => x.venue)).size;
  return `${head(esc(titleOf(o)), esc([o.provider, venues > 1 ? tl('an {v} Orten', { v: venues }) : o.venue].filter(Boolean).join(' · ')))}
    <div class="acts"><button type="button" class="act" data-evmenu="${esc(o.id)}">${svg('more')}${tl('Mehr Möglichkeiten')}</button></div>
    ${o.kind === 'termin' ? (() => { let out = '', cur = null; for (const [d, x] of list.slice(0, 120)) { const k = ymd(d); if (k !== cur) { out += `${cur ? '</ol>' : ''}<h4 class="dayhead">${esc(dayHead(d))}</h4><ol class="list">`; cur = k; } out += evRowHtml(x, d, null, { from: X.c }); } return cur ? out + '</ol>' : ''; })()
      : `<ol class="list evcards">${list.slice(0, 120).map(([d, x]) => evCardHtml(x, d)).join('')}</ol>`}`;
}

// ---------- the "…" menu: Merken, Mehr wie das, hide a series, a provider or a topic ----------
function evMenuOpen(id) {
  const o = OFFER_BY_ID.get(id); if (!o) return;
  closeEvMenu(); EV.menu = id;
  const topic = o.topic && o.topic !== 'sonstiges' ? TOPIC_LABEL[o.topic] : '';
  const el = document.createElement('div');
  el.id = 'evmenu'; el.className = 'lockwrap';
  el.innerHTML = `<div class="lockbg" data-evmenuclose="1"></div><div class="locksheet evmenu" role="dialog" aria-modal="true" aria-labelledby="evmT"><i class="lockgrip"></i>
    <h3 id="evmT">${esc(titleOf(o))}</h3>${o.provider ? `<p class="muted">${esc(o.provider)}</p>` : ''}
    <button type="button" class="menurow" data-saveoffer="${esc(o.id)}">${svg('heart')}<span>${isSaved(o.id) ? tl('Nicht mehr merken') : tl('Merken')}</span></button>
    <button type="button" class="menurow" data-evlike="1">${svg('star')}<span>${tl('Mehr wie das')}</span></button>
    <button type="button" class="menurow" data-evhide="series">${svg('eye')}<span>${tl('Diese Reihe ausblenden')}</span></button>
    ${o.provider ? `<button type="button" class="menurow" data-evhide="provider">${svg('eye')}<span>${esc(tl('{name} ausblenden', { name: o.provider }))}</span></button>` : ''}
    ${topic ? `<button type="button" class="menurow" data-evhide="topic">${svg('eye')}<span>${esc(tl('Thema „{name}“ ausblenden', { name: topic }))}</span></button>` : ''}
    <button type="button" class="menurow" data-evsettings="1">${svg('gear')}<span>${tl('Termine-Einstellungen')}</span></button>
    <button type="button" class="linkbtn center" data-evmenuclose="1">${tl('Abbrechen')}</button></div>`;
  document.body.appendChild(el);
  el.querySelector('.menurow')?.focus();
}
function closeEvMenu() { document.getElementById('evmenu')?.remove(); }
const undoToast = (msg, undo) => typeof toastAction === 'function' ? toastAction(msg, tl('Rückgängig'), () => { undo(); saveEv(); afterEvChange(); }) : toast(msg);
function evHide(kind) {
  const o = OFFER_BY_ID.get(EV.menu); closeEvMenu(); if (!o) return;
  const H = store.ev.hide;
  let msg, undo;
  if (kind === 'series') { const k = crossKey(o); if (!H.series.some(x => x.k === k)) H.series.push({ k, t: String(o.title || '').slice(0, 80) }); msg = tl('„{name}“ ausgeblendet.', { name: o.title }); undo = () => { H.series = H.series.filter(x => x.k !== k); }; }
  else if (kind === 'provider') { if (!H.providers.includes(o.provider)) H.providers.push(o.provider); msg = tl('{name} ausgeblendet.', { name: o.provider }); undo = () => { H.providers = H.providers.filter(x => x !== o.provider); }; }
  else { if (!H.topics.includes(o.topic)) H.topics.push(o.topic); msg = tl('Thema „{name}“ ausgeblendet.', { name: TOPIC_LABEL[o.topic] || o.topic }); undo = () => { H.topics = H.topics.filter(x => x !== o.topic); }; }
  saveEv(); afterEvChange(); undoToast(msg, undo);
}
function evLike() {
  const o = OFFER_BY_ID.get(EV.menu); closeEvMenu(); if (!o) return;
  const L = store.ev.like, t = o.topic !== 'sonstiges' && !L.topics.includes(o.topic) ? o.topic : null, p = o.provider && !L.providers.includes(o.provider) ? o.provider : null;
  if (t) L.topics.push(t);
  if (p) L.providers.push(p);
  saveEv(); afterEvChange();
  undoToast(tl('Mehr davon: {name}', { name: [t && TOPIC_LABEL[t], p].filter(Boolean).join(', ') || o.title }), () => { L.topics = L.topics.filter(x => x !== t); L.providers = L.providers.filter(x => x !== p); });
}

// ---------- Termine-Einstellungen: Standard-Ansicht, Gebiet, Alter, Ausgeblendet, Mehr wie das ----------
function evSettingsView() {
  const s = store.ev, H = s.hide, L = s.like, mode = s.mode || (canPersonal() ? 'fuer' : 'alle'), kids = familyAges().filter(k => k.months >= 0);
  const guest = typeof auth === 'undefined' || !auth?.family;
  const chips = (list, kind, label = x => x) => list.map((x, i) => `<button type="button" class="chip on" data-evunhide="${kind}|${i}" aria-label="${esc(label(x))} ${tl('entfernen')}">${esc(label(x))} ${svg('close')}</button>`).join('');
  const group = (title, html) => html ? `<p class="muted small">${title}</p><div class="fgrid">${html}</div>` : '';
  const hidden = group(tl('Themen'), chips(H.topics, 'topics', t => TOPIC_LABEL[t] || t)) + group(tl('Anbieter'), chips(H.providers, 'providers')) + group(tl('Reihen'), chips(H.series, 'series', x => x.t));
  const liked = group(tl('Themen'), chips(L.topics, 'ltopics', t => TOPIC_LABEL[t] || t)) + group(tl('Anbieter'), chips(L.providers, 'lproviders'));
  return `${head(tl('Termine-Einstellungen'), tl('Für die Ansicht „Für euch“'))}
    <div class="sec"><h4>${tl('Standard-Ansicht')}</h4><div class="segs">${[['fuer', tl('Für euch')], ['alle', tl('Alle')]].map(([id, l]) => `<button type="button" class="${mode === id ? 'on' : ''}" data-evdefmode="${id}" aria-pressed="${mode === id}">${l}</button>`).join('')}</div></div>
    <div class="sec"><h4>${tl('Gebiet')}</h4>${evPlaceHtml(false)}
      ${guest && s.home ? `<p class="text">${esc(tl('Zuhause: {name}', { name: s.home.label }))} <button type="button" class="linkbtn" data-evhomex="1">${tl('Entfernen')}</button></p><p class="note">${tl('Nur auf diesem Gerät gespeichert.')}</p>` : ''}</div>
    <div class="sec"><h4>${tl('Alter')}</h4><p class="text">${kids.length ? esc(kids.map(k => `${k.name}, ${ageText(k)}`).join(' · ')) : store.profile.expecting ? tl('Ihr erwartet ein Kind.') : tl('Noch keine Kinder eingetragen.')}</p>
      <label class="tgl"><span><b>${tl('Nur passende Termine')}</b><small>${tl('Ohne Altersangabe: eingeklappt am Ende der Liste')}</small></span><input type="checkbox" role="switch" data-evonlyfit="1"${s.onlyFit ? ' checked' : ''}></label>
      <button type="button" class="linkbtn" data-tab="me" style="margin-top:8px">${tl('Kinder im Wir eintragen oder ändern')}</button></div>
    <div class="sec"><h4>${tl('Ausgeblendet')}</h4>${hidden || `<p class="muted text">${tl('Nichts ausgeblendet. Über „…“ bei einem Termin kannst du Reihen, Anbieter oder Themen ausblenden.')}</p>`}</div>
    <div class="sec"><h4>${tl('Mehr wie das')}</h4>${liked || `<p class="muted text">${tl('Noch nichts gewählt.')}</p>`}</div>
    <button type="button" class="btn" data-evprefsreset="1" style="margin-top:12px">${tl('Alles zurücksetzen')}</button>
    <p class="note">${guest ? tl('Gespeichert auf diesem Gerät. Niemand sonst sieht das.') : tl('Gespeichert auf diesem Gerät und in deinem Konto. Niemand sonst sieht das.')}</p>`;
}

// ---------- the filter sheet ----------
const chipCls = (on, n) => `chip${on ? ' on' : ''}${!on && n === 0 ? ' zero' : ''}`;
const chipInner = (on, label, n) => `${on ? svg('check') : ''}<span>${esc(label)}</span>${n != null ? ` <span class="n">${nf.format(n)}</span>` : ''}`;
function evSheetFoot() {
  const n = evResults().length;
  return `<div class="sticky-bar"><button type="button" class="btn" data-evreset="1">${tl('Zurücksetzen')}</button><button type="button" class="btn big primary" data-evshow="1">${tl('{n} {unit} zeigen', { n: nf.format(n), unit: unitOf(n) })}</button></div>`;
}
// topics of this page (at least one result without filters) with live counts under the other filters
function evTopicCounts() {
  const page = {}, live = {};
  for (const [, o] of evBase(true)) if (!o.own && o.topic && o.topic !== 'sonstiges') page[o.topic] = (page[o.topic] || 0) + 1;
  for (const [, o] of evBase()) if (!o.own && evPass(o, 'topic') && page[o.topic]) live[o.topic] = (live[o.topic] || 0) + 1;
  return { page, live };
}
function evFiltersView() {
  const base = evBase().filter(([, o]) => !o.own);
  const count = (sec, fn) => base.filter(([, o]) => evPass(o, sec.id) && fn(o)).length;
  const section = (sec, extra = '') => {
    if (!sectionOn(sec)) return '';
    const chip = it => { const on = EV.f.has(it[0]), n = count(sec, it[2]); return `<button type="button" class="${chipCls(on, n)}" data-evf="${it[0]}" aria-pressed="${on}"${!on && n === 0 ? ' disabled' : ''}>${chipInner(on, itemLabel(it[1]), n)}</button>`; };
    const items = sec.items.filter(itemOn), wide = items.filter(it => it[0] === 'fit'), row = items.filter(it => it[0] !== 'fit');
    // time and age: one row of equal boxes as in the design; "Passt zu Mia" gets its own line
    return `<div class="sec"><h4>${sec.title}</h4>${wide.length ? `<div class="fgrid" style="margin-bottom:8px">${wide.map(chip).join('')}</div>` : ''}
      <div class="fgrid${sec.two ? ' two' : ''}"${sec.two ? ` style="grid-template-columns:repeat(${row.length},1fr)"` : ''}>${row.map(chip).join('')}</div>${extra}${sec.note ? `<p class="note">${sec.note}</p>` : ''}</div>`;
  };
  const when = cardPage()
    ? `<div class="sec"><h4>${tl('Wochentag')}</h4><div class="fgrid days">${WD.map((l, i) => `<button type="button" class="chip round${EV.days.has(i) ? ' on' : ''}" data-evday="${i}" aria-pressed="${EV.days.has(i)}" aria-label="${WD_LONG[i]}">${EV.days.has(i) ? svg('check') : ''}${l}</button>`).join('')}</div><p class="note">${tl('Wochentage und Uhrzeit merkt sich Djuu für das nächste Mal.')}</p></div>`
    : `<div class="sec"><h4>${tl('Wann')}</h4><div class="fgrid when">${WHEN_CHIPS.map(([id, l]) => `<button type="button" class="chip${EV.when === id ? ' on' : ''}" data-evwhen="${id}" aria-pressed="${EV.when === id}">${chipInner(EV.when === id, l)}</button>`).join('')}
        <button type="button" class="chip round${EV.when === 'datum' ? ' on' : ''}" data-evwhen="datum" aria-pressed="${EV.when === 'datum'}" aria-label="${tl('Zeitraum wählen')}">${svg('cal')}</button></div>
        ${EV.when === 'datum' ? `<div class="evrange"><label>${tl('von')} <input id="evFrom" type="date" value="${esc(EV.from)}" min="${ymd(today0())}"></label><label>${tl('bis')} <input id="evTo" type="date" value="${esc(EV.to)}" min="${esc(EV.from || ymd(today0()))}"></label></div>` : ''}</div>`;
  const { page, live } = evTopicCounts(), all = Object.keys(page);
  const top = all.sort((a, b) => page[b] - page[a]).slice(0, 4);
  for (const t of EV.topics) if (page[t] && !top.includes(t)) top.push(t);
  const topic = all.length ? `<div class="sec"><div class="sechead"><h4>${tl('Thema')}</h4><span>${EV.topics.size ? `${EV.topics.size} ${tl('gewählt')}` : tl('Mehrere möglich')}</span></div>
      <div class="fgrid">${top.map(t => topicChip(t, live[t] || 0)).join('')}</div>
      ${all.length > top.length ? `<button type="button" class="morelink" data-open="evtopics">${tl('Alle')} ${all.length} ${tl('Themen')} ${svg('back')}</button>` : ''}</div>` : '';
  return `<div class="ph sheethead"><h2>${tl('Filter')}</h2><button type="button" class="round" data-back="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    ${forYou() ? `<p class="note">${tl('„Für euch“ gilt dazu: Alter, Gebiet und Ausgeblendetes aus den Termine-Einstellungen.')}</p>` : ''}
    ${when}${section(EV_SECTIONS[0])}${section(EV_SECTIONS[1])}${section(EV_SECTIONS[2])}${topic}${section(EV_SECTIONS[3], regHtml())}${evPlaceHtml()}
    ${evSheetFoot()}`;
}
const topicChip = (t, n) => { const on = EV.topics.has(t); return `<button type="button" class="${chipCls(on, n)}" data-evtopic="${t}" aria-pressed="${on}"${!on && n === 0 ? ' disabled' : ''}>${chipInner(on, TOPIC_LABEL[t], n)}</button>`; };
function evTopicsView() {
  const { page, live } = evTopicCounts();
  const fams = TOPIC_FAMILIES.map(([name, icon, color, ts]) => [name, icon, color, ts.filter(t => page[t])]).filter(f => f[3].length);
  return `<div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><h2>${tl('Thema')}<span class="sub">${tl('Mehrere möglich')}</span></h2></div>
    ${fams.map(([name, icon, color, ts]) => { const k = ts.filter(t => EV.topics.has(t)).length; return `<div class="sec topicfam"><div class="sechead"><h4><span class="ticon big" style="--c:${color}">${svg(icon)}</span>${esc(name)}</h4>${k ? `<span>${k} ${tl('gewählt')}</span>` : ''}</div>
      <div class="fgrid">${ts.map(t => topicChip(t, live[t] || 0)).join('')}</div></div>`; }).join('')}
    ${evSheetFoot()}`;
}
// ---------- Ort for the Termine filter: own setting, independent of the map ----------
// Ganz Hamburg, several Stadtteile (by the coordinates of the offer), a radius around home (or, for one search, the current
// position), or Online. Online offers count in every Ort. Home is a saved place (Meine Orte) with an account, else a
// postcode kept on this phone only.
let GEO = { stadtteile: [], plz: [] };
const GEO_BEZ = {}, GEO_POS = {};
async function loadGeo() {
  try { GEO = await (await fetch('data/geo.json')).json(); } catch (e) { return; }
  for (const [n, bz, la, lo] of GEO.stadtteile) { GEO_BEZ[n] = bz; GEO_POS[n] = [la, lo]; }
}
const BEZIRKE = ['Hamburg-Mitte', 'Altona', 'Eimsbüttel', 'Hamburg-Nord', 'Wandsbek', 'Bergedorf', 'Harburg'];
const DISTRICT_ALIAS = { Altstadt: 'Hamburg-Altstadt', Stove: 'Kirchwerder' }; // OSM names on places -> official names
const offerPos = o => { const pl = o.place_id && byId.get(o.place_id); return pl ? [pl.lat, pl.lon] : o.lat ? [o.lat, o.lon] : null; };
const offerDistrict = o => { if (o.district) return o.district; const pl = o.place_id && byId.get(o.place_id); return pl?.district ? DISTRICT_ALIAS[pl.district] || pl.district : null; };
const KMS = [1, 2, 5, 10, 20];
// the place the radius is measured from: chosen in the filter, else the one marked "Standard für Suchen", else the first
const searchPlace = () => { if (typeof auth === 'undefined' || !auth?.family) return null; const ps = (store.places || []).filter(p => p.lat); return ps.find(p => p.id === EV.place.placeId) || ps.find(p => p.def) || ps[0] || null; };
const homeOf = () => { const p = searchPlace(); if (p) return { name: tl(p.name), label: `${tl(p.name)}${p.plz ? ` (${p.plz})` : ''}`, lat: p.lat, lon: p.lon }; const h = store.ev.home; return h && h.lat ? { name: tl('Zuhause'), label: h.label, lat: h.lat, lon: h.lon, device: true } : null; };
const radiusOrigin = () => EV.place.gps || (homeOf() ? [homeOf().lat, homeOf().lon] : null);
// the area in use: the chosen one; in "Für euch" without an own choice 5 km around home
function evArea() {
  const P = EV.place;
  if (P.mode === 'radius') { const c = radiusOrigin(); if (c) return { mode: 'radius', km: P.km, c }; }
  else if (P.mode === 'districts' && P.districts.size) return { mode: 'districts', d: P.districts };
  else if (P.mode === 'online') return { mode: 'online' };
  else if (!store.ev.placeSet && forYou()) { const c = radiusOrigin(); if (c) return { mode: 'radius', km: 5, c, auto: true }; }
  return { mode: 'all' };
}
function evPlaceOk(o, A = evArea()) {
  if (o.online) return true; // online offers fit every Ort
  if (A.mode === 'online') return false;
  if (A.mode === 'districts') return A.d.has(offerDistrict(o));
  if (A.mode === 'radius') { const p = offerPos(o); return !!p && dist(A.c, p) <= A.km * 1000; }
  return offerDistrict(o) !== UMLAND;
}
const kmText = km => String(km).replace('.', ',') + ' km';
// distance shown in lists and cards while the radius is on
const evDistText = o => { const A = evArea(); if (A.mode !== 'radius') return ''; const p = offerPos(o); return p ? ' · ' + fmtDist(dist(A.c, p)) : ''; };

// "20535", "Hamm" or an address with a postcode in it -> the centre of that postcode or Stadtteil
function parseHome(text) {
  const t = String(text || '').trim();
  const plz = (t.match(/\b(2[0-2]\d{3})\b/) || [])[1];
  if (plz) { const p = GEO.plz.find(x => x[0] === plz); return p ? { label: `${p[0]} ${p[3]}`, lat: p[1], lon: p[2] } : null; }
  const n = norm(t.replace(/\s*\(.*\)$/, ''));
  const s = GEO.stadtteile.find(x => norm(x[0]) === n) || GEO.stadtteile.find(x => norm(x[0]).startsWith(n) && n.length >= 3);
  return s ? { label: s[0], lat: s[2], lon: s[3] } : null;
}
function homeFieldHtml(id) {
  const h = homeOf(), guest = typeof auth === 'undefined' || !auth?.family;
  return `<div class="field"><label for="${id}">${tl('Zuhause')}</label>
    <input id="${id}" data-home="1" list="homeList" autocomplete="off" placeholder="${tl('PLZ oder Stadtteil, z. B. 20535')}" value="${esc(h?.label || '')}">
    <datalist id="homeList">${GEO.plz.map(p => `<option value="${p[0]} (${esc(p[3])})"></option>`).join('')}${GEO.stadtteile.map(s => `<option value="${esc(s[0])}"></option>`).join('')}</datalist>
    <p class="note">${guest ? tl('PLZ oder Stadtteil reicht. Bleibt nur auf diesem Gerät.') : tl('PLZ oder Stadtteil reicht. Wird als „Zuhause“ unter Wir › Meine Orte gespeichert.')}</p></div>`;
}
function setHome(value) {
  if (!String(value || '').trim()) return;
  const h = parseHome(value);
  if (!h) return toast(tl('Nicht gefunden. Bitte eine Hamburger PLZ oder einen Stadtteil eingeben.'));
  // a postcode (a Stadtteil gets its nearest postcode)
  const plz = (h.label.match(/\b\d{5}\b/) || [])[0] || GEO.plz.map(x => [dist([h.lat, h.lon], [x[1], x[2]]), x[0]]).sort((a, b) => a[0] - b[0])[0]?.[1] || '';
  const g = GEO.plz.find(x => x[0] === plz) || [plz, h.lat, h.lon];
  if (typeof auth !== 'undefined' && auth?.family) {
    // with an account it becomes "Zuhause" in Meine Orte
    store.places = store.places || [];
    store.places.push({ id: pbId(), name: tl('Zuhause'), plz, address: '', lat: g[1], lon: g[2], shared: false, def: !store.places.some(p => p.def), mine: true });
  } else store.ev.home = { label: h.label, plz, lat: g[1], lon: g[2] }; // guests: only on this phone
  if (EV.placeTab === 'umkreis' || EV.place.mode === 'radius') { setKm(EV.place.km); store.ev.placeSet = true; }
  saveEv(); EVB.clear();
  toast(`${tl('Zuhause:')} ${h.label}`);
  renderPanel();
}

// the Ort section of the filter sheet (and of the Ort page and the Termine-Einstellungen)
function evPlaceHtml(titled = true) {
  const P = EV.place, origin = radiusOrigin(), A = evArea();
  const mode = EV.placeTab === 'umkreis' ? 'radius' : EV.placeTab === 'stadtteil' ? 'districts' : EV.placeTab === 'online' ? 'online' : A.mode === 'radius' && A.auto ? 'radius' : P.mode;
  const seg = `<div class="segs four" role="tablist" aria-label="${tl('Ort wählen über')}">${[['all', tl('Ganz Hamburg')], ['districts', tl('Stadtteil')], ['radius', tl('Umkreis')], ['online', tl('Online')]].map(([id, l]) =>
    `<button type="button" role="tab" aria-selected="${mode === id}" class="${mode === id ? 'on' : ''}" data-evplacemode="${id}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (mode === 'districts') {
    body = `<div class="fgrid">${[...P.districts].map(d => `<button type="button" class="chip on" data-evdistrictx="${esc(d)}" aria-label="${esc(dLabel(d))} ${tl('entfernen')}">${svg('check')}${esc(dLabel(d))} ${svg('close')}</button>`).join('')}
      <button type="button" class="chip" data-open="evdistricts">${svg('pin')}${P.districts.size ? tl('Weitere wählen') : tl('Stadtteil wählen')}</button></div>`;
  } else if (mode === 'online') {
    body = `<p class="note">${tl('Nur Angebote, die online stattfinden. Online-Angebote sind auch bei jedem anderen Ort dabei.')}</p>`;
  } else if (mode === 'radius' && !origin) {
    body = `${homeFieldHtml('evHome')}
      <button type="button" class="btn" data-evgps="1">${svg('locate')}${tl('Aktuellen Standort verwenden')}</button>
      <p class="note">${tl('Der aktuelle Standort gilt nur für diese Suche und wird nicht gespeichert.')}</p>`;
  } else if (mode === 'radius') {
    const km = A.mode === 'radius' ? A.km : P.km;
    body = `<div class="kmrow"><input id="evKmRange" type="range" min="1" max="20" step="1" value="${Math.min(20, Math.max(1, Math.round(km)))}" aria-label="${tl('Umkreis in Kilometern,')} ${kmText(km)}"><b>${kmText(km)}</b></div>
      ${!P.gps && (store.places || []).filter(x => x.lat).length > 1 && typeof auth !== 'undefined' && auth?.family ? `<div class="fgrid fromrow"><span class="muted">${tl('Von:')}</span>${store.places.filter(x => x.lat).map(x => `<button type="button" class="chip${searchPlace() === x ? ' on' : ''}" data-evorigin="${x.id}">${searchPlace() === x ? svg('check') : svg('pin')}${esc(tl(x.name))}</button>`).join('')}</div>` : ''}
      <p class="note">${tl('Luftlinie,')} ${P.gps ? tl('vom aktuellen Standort') : `${tl('von')} ${esc(homeOf().label)}`}.
        ${P.gps ? (homeOf() ? ` <button type="button" class="linkbtn" data-evgpsoff="1">${tl('Zuhause verwenden')}</button>` : '') : ` <button type="button" class="linkbtn" data-evgps="1">${tl('Aktuellen Standort verwenden')}</button>`}</p>
      ${A.auto ? `<p class="note">${tl('„Für euch“ nimmt ohne eigene Wahl 5 km um Zuhause.')}</p>` : ''}`;
  }
  return `<div class="sec">${titled ? `<h4>${tl('Ort')}</h4>` : ''}${seg}${body}</div>`;
}
function setKm(v) {
  const km = Math.min(50, Math.max(0.5, Math.round(parseFloat(String(v).replace(',', '.')) * 2) / 2));
  if (!km) return;
  EV.place.km = km; EV.place.mode = 'radius'; EV.place.districts.clear();
}

// the Stadtteil page: every Stadtteil with results on this page, by Bezirk, several at once (a 0 never blocks the choice)
function evDistrictCounts() {
  const page = {}, live = {};
  for (const [, o] of evBase(true)) { const d = offerDistrict(o); if (d) page[d] = (page[d] || 0) + 1; }
  for (const [, o] of evBase(false, true)) if (!o.own && evPass(o)) { const d = offerDistrict(o); if (d) live[d] = (live[d] || 0) + 1; }
  return { page, live };
}
function districtListHtml() {
  const { page, live } = evDistrictCounts(), q = norm(EV.dq.trim());
  const regions = BEZIRKE.map(bz => [bz, GEO.stadtteile.filter(s => s[1] === bz).map(s => s[0])]).concat([[UMLAND, [UMLAND]]]);
  const out = regions.map(([bz, all]) => {
    const names = all.filter(n => page[n] && (!q || norm(n).includes(q) || norm(bz).includes(q)));
    if (!names.length) return '';
    const allOn = names.every(n => EV.pending.has(n));
    return `<fieldset class="bezirk"><legend>${esc(dLabel(bz))}</legend>
      ${bz === UMLAND ? '' : `<label class="drow all${allOn ? ' on' : ''}"><input type="checkbox" data-dall="${esc(bz)}"${allOn ? ' checked' : ''}><span class="dname">${tl('Alle in')} ${esc(bz)}</span></label>`}
      ${names.map(n => { const on = EV.pending.has(n), c = live[n] || 0;
        return `<label class="drow${on ? ' on' : ''}${!on && !c ? ' zero' : ''}"><input type="checkbox" data-dname="${esc(n)}"${on ? ' checked' : ''}><span class="dname">${esc(dLabel(n))}</span><span class="n" aria-label="${c} ${tl('Ergebnisse')}">${nf.format(c)}</span></label>`; }).join('')}
    </fieldset>`;
  }).join('');
  return out || `<div class="empty"><b>${tl('Kein Stadtteil gefunden.')}</b>${tl('Versuch einen anderen Namen.')}</div>`;
}
const districtApplyText = () => `${tl('Übernehmen (')}${EV.pending.size} ${tl('gewählt)')}`;
function evDistrictsView() {
  return `<div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><h2>${tl('Stadtteil')}<span class="sub">${tl('Mehrere möglich')}</span></h2></div>
    <label class="evsearch dsearch">${svg('search')}<input id="dq" type="search" placeholder="${tl('Stadtteil suchen')}" value="${esc(EV.dq)}" autocomplete="off" aria-label="${tl('Stadtteil suchen')}"></label>
    <div id="dlist">${districtListHtml()}</div>
    <div class="sticky-bar"><button type="button" class="btn" data-evdreset="1">${tl('Zurücksetzen')}</button><button type="button" class="btn big primary" data-evdapply="1">${districtApplyText()}</button></div>`;
}
function refreshDistrictList() { const l = $('#dlist'); if (l) l.innerHTML = districtListHtml(); const b = $('[data-evdapply]'); if (b) b.textContent = districtApplyText(); }

function evShow() { while (stack.length > 1 && !['events'].includes(view().type)) stack.pop(); EV.limit = 60; renderPanel(); setSize('full'); }
function evReset() {
  EV.when = '7'; EV.from = ''; EV.to = ''; EV.days.clear(); EV.f.clear(); EV.topics.clear(); EV.fmt.clear(); EV.reg = ''; EV.today = false;
  Object.assign(EV.place, { mode: 'all', gps: null }); EV.place.districts.clear(); store.ev.placeSet = false;
  saveEv(); EVB.clear(); renderPanel();
}
// the map list's card: today's events and groups for the family, counted exactly as Termine › Für euch › Heute shows them
const TODAY_C = { key: '', ev: 0, wk: 0 };
function todayCounts() {
  const key = [Math.floor(Date.now() / 6e4), OFFERS.length, JSON.stringify(store.profile.kids), store.profile.expecting, store.ev.at, (homeOf() || {}).lat, EV.f.size, EV.topics.size, EV.reg, EV.days.size].join('~');
  if (TODAY_C.key !== key) Object.assign(TODAY_C, { key, ev: evWith({ mode: 'fuer', page: 'einmalig', when: 'heute', q: '', today: false }, () => evResults().length), wk: evWith({ mode: 'fuer', page: 'wiederkehrend', q: '', today: true }, () => evResults().length) });
  return TODAY_C;
}

// Merken for offers; a snapshot keeps a saved offer readable after it leaves the data.
const isSaved = id => store.savedOffers.some(x => x.id === id);
function toggleSaved(id) {
  const i = store.savedOffers.findIndex(x => x.id === id);
  if (i >= 0) store.savedOffers.splice(i, 1);
  else { const o = OFFER_BY_ID.get(id); store.savedOffers.push({ id, at: Date.now(), by: typeof meId === 'function' ? meId() : null, snap: { title: o.title, url: o.url, venue: o.venue, address: o.address, provider: o.provider, kind: o.kind, weekday: o.weekday, time_from: o.time_from, time_to: o.time_to, start_date: o.start_date, end_date: o.end_date } }); }
  save(); toast(i >= 0 ? tl('Nicht mehr gemerkt.') : tl('Gemerkt. Du findest es unter „Gemerkt“.'));
}
// all dates in the next months, for the offer page
function upcoming(o, max = 6) {
  const out = [], t = nextAfterNow(o) || today0(); // a session that is over today is not listed
  for (let d = new Date(t), i = 0; i < 200 && out.length < max; d.setDate(d.getDate() + 1), i++) if (occursOn(o, d)) out.push(new Date(d));
  return out;
}
const REG_TEXT = { 'nötig': tl('Anmeldung nötig'), offen: tl('Ohne Anmeldung'), Warteliste: tl('Warteliste'), Tickets: tl('Tickets'), geschlossen: tl('Anmeldung geschlossen') };
// the provider's own wording next to ours, when it says more ("nötig (über den Stadtbereich)")
const regText = o => o.registration ? (REG_TEXT[o.registration] || o.registration) + (o.registration_text && o.registration_text !== o.registration ? ` (${o.registration_text})` : '') : '';
function offerView(id) {
  const o = OFFER_BY_ID.get(id);
  if (!o) {
    const s = store.savedOffers.find(x => x.id === id);
    return `${head(tl('Termin'))}<div class="empty"><b>${tl('Diesen Termin finden wir nicht mehr.')}</b>${tl('Vielleicht ist er vorbei oder wurde abgesagt.')}</div>
      ${s ? `<p class="text">${esc(s.snap.title)}</p>${safeUrl(s.snap.url) ? `<a class="btn" href="${esc(safeUrl(s.snap.url))}" target="_blank" rel="noopener">${tl('Beim Anbieter nachsehen')}</a>` : ''}
      <button type="button" class="btn" data-saveoffer="${esc(id)}" style="margin-top:8px">${tl('Nicht mehr merken')}</button>` : ''}`;
  }
  const v = view(), place = o.place_id && byId.get(o.place_id), dates = upcoming(o), saved = isSaved(id), fits = offerFits(o);
  const d = state.me && (place || o.lat) ? dist(origin(), place ? [place.lat, place.lon] : [o.lat, o.lon]) : null;
  const time = o.time_from ? `${o.time_from}${o.time_to ? '–' + o.time_to : ''} ${tl('Uhr')}` : tl('Uhrzeit beim Anbieter');
  const who = allAges(o) ? tl('Für alle Altersgruppen') : o.audience === 'erwachsene' ? (o.for_parents && ageLabel(o.age_min_m, o.age_max_m) ? tl('Für Eltern, Kind {age}', { age: offerAge(o) }) : tl('Für Erwachsene')) : offerAge(o) ? tl('Für Kinder ') + offerAge(o) : tl('Alter beim Anbieter nachsehen');
  const un = undated(o), rd = rhythmText(o);
  // no usable link of the offer (none, relative, or a host Djuu never links): the place's website, its phone, or the place page
  const pWeb = placeSite(place), pTel = placePhone(place).replace(/[^+\d]/g, '');
  const go_ = safeUrl(o.url) ? `<a class="btn big primary" href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener" style="margin-top:16px">${tl('Zum Anbieter')}${o.registration === 'nötig' ? tl(' und anmelden') : ''}</a>`
    : pWeb ? `<a class="btn big primary" href="${esc(pWeb)}" target="_blank" rel="noopener" style="margin-top:16px">${tl('Webseite des Ortes')}</a><p class="note">${esc(tl('Anmeldung und Infos direkt bei {name}.', { name: o.provider || o.venue || place.name }))}</p>`
    : pTel.length >= 5 ? `<a class="btn big primary" href="tel:${esc(pTel)}" style="margin-top:16px">${svg('phone')}${tl('Anrufen')}</a><p class="note">${esc(tl('Anmeldung und Infos direkt bei {name}.', { name: o.provider || o.venue || place.name }))}</p>`
    : place ? `<button type="button" class="btn big primary" data-id="${esc(place.id)}" style="margin-top:16px">${svg('pin')}${tl('Zum Ort')}</button><p class="note">${esc(tl('Anmeldung und Infos direkt bei {name}.', { name: o.provider || o.venue || place.name }))}</p>`
    : `<p class="text" style="margin-top:16px">${tl('Anmeldung und Infos direkt beim Anbieter:')} <b>${esc(o.provider || o.venue || '')}</b></p>`;
  return `<div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><span style="flex:1"></span>
      <button type="button" class="round" data-home="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    <div class="hero"><span class="datebox"><b>${dates[0] && !un ? esc(fmtDay(dates[0])) : '–'}</b><span>${esc(o.time_from || '')}</span></span><div style="min-width:0">
      <h2 style="margin:0;font:600 23px/1.15 var(--font-display);text-wrap:balance">${esc(titleOf(o))}</h2>${titleOf(o) !== o.title ? `<p class="note orig" lang="de">${esc(o.title)}</p>` : ''}
      <div class="status-line"><span>${esc(TOPIC_LABEL[o.topic] || '')}${o.provider ? ' · ' + esc(o.provider) : ''}</span>${isNewOffer(o) ? `<span class="newmark">${tl('neu')}</span>` : ''}</div></div></div>
    <div class="acts">
      <button type="button" class="act${saved ? ' on' : ''}" data-saveoffer="${id}">${svg('heart')}${saved ? tl('Gemerkt') : tl('Merken')}</button>
      <button type="button" class="act${v.cal ? ' on' : ''}" data-calmenu="1">${svg('cal')}${tl('Kalender')}</button>
      <button type="button" class="act" data-shareoffer="${id}">${svg('share')}${tl('Teilen')}</button>
      <button type="button" class="act" data-evmenu="${esc(id)}" aria-label="${tl('Mehr Möglichkeiten')}">${svg('more')}${tl('Mehr')}</button>
    </div>
    ${o.status === 'ausgebucht' ? `<p class="note">${tl('Laut Anbieter ausgebucht. Manchmal gibt es eine Warteliste.')}</p>` : ''}
    ${started(o) ? `<p class="note">${esc(tl('Der Kurs läuft seit {date}. Ob ein Einstieg noch geht, weiß der Anbieter.', { date: fmtD(new Date(o.start_date + 'T00:00')) }))}</p>` : ''}
    ${v.cal ? `<div class="calmenu">${un ? `<p class="note">${tl('Die Termine stehen nur beim Anbieter. Djuu trägt keine erfundenen Termine ein.')}</p>` : `${typeof calEdit === 'function' && calSee() && calEdit() ? `<button type="button" class="btn primary" data-calfromoffer="${esc(id)}">${svg('cal')}${tl('In unseren Familienkalender')}</button>` : ''}<button type="button" class="btn" data-ics="${id}">${svg('cal')}${tl('Kalender-Datei (iPhone, Outlook, Android)')}</button>
      <a class="btn" href="${esc(gcalUrl(o))}" target="_blank" rel="noopener">${svg('cal')}${tl('Google Kalender')}</a>
      <p class="note">${tl('Tipp: Lege in deinem Kalender einen Kalender „Familie“ an und wähle ihn beim Eintragen aus. Djuu speichert dabei nichts.')}</p>`}</div>` : ''}
    <div class="sec"><h4>${tl('Wann')}</h4><p class="text"><b>${esc(time)}</b>${isRecurring(o) ? ' · ' + esc(rd) : ''}${o.kind === 'gruppe' ? (isRecurring(o) ? tl(' · Gruppe') : un ? '' : tl(' · offenes Treffen')) : o.kind === 'kurs' ? ` ${tl('· Kurs')}${o.sessions > 1 ? ', ' + tl('{n} Termine', { n: o.sessions }) : ''}` : ''}</p>
      ${un ? `<p class="text">${o.schedule ? `${tl('Laut Anbieter:')} <b>${esc(o.schedule)}</b>` : tl('Die genauen Termine stehen beim Anbieter.')}</p>`
      : `${dates.length ? `<p class="text">${dates.map(x => esc(fmtLong(x))).join('<br>')}${isRecurring(o) && dates.length === 6 ? `<br>${tl('und weitere')}` : ''}</p>` : `<p class="muted text">${tl('Keine weiteren Termine bekannt.')}</p>`}
      ${o.schedule ? `<p class="note">${tl('Laut Anbieter:')} ${esc(o.schedule)}</p>` : ''}`}</div>
    <div class="sec"><h4>${tl('Wo')}</h4><p class="text">${o.online ? `<b>${tl('Online')}</b><br>` : ''}${esc(o.venue || '')}${o.address ? `<br>${esc(o.address)}` : ''}${d != null ? `<br><span class="muted">${fmtDist(d)} ${tl('von dir')}</span>` : ''}</p>
      ${!o.online && stationLine(offerPos(o)) ? `<p class="text">${stationLine(offerPos(o))}</p>` : ''}
      ${place ? `<button type="button" class="btn" data-onlyplace="${place.id}">${svg('pin')}${tl('Auf der Karte')}</button>` : ''}</div>
    <div class="sec"><h4>${tl('Für wen')}</h4><p class="text">${esc(who)}${fits === true ? ` · <b class="yes">${tl('passt zu euch')}</b>` : ''}</p>${o.age_guess === 1 && ageLabel(o.age_min_m, o.age_max_m) ? `<p class="note">${tl('Alter geschätzt nach Anbieter und Art des Angebots. Genaues beim Anbieter.')}</p>` : ''}${dogChip(offerDog(o)) ? `<div class="facts">${dogChip(offerDog(o))}</div>` : ''}</div>
    <div class="sec"><h4>${tl('Kosten und Anmeldung')}</h4><p class="text">${o.free ? tl('Kostenlos') : o.price ? esc(o.price) : tl('Preis beim Anbieter')}${o.registration ? ' · ' + esc(regText(o)) : ''}</p></div>
    ${go_}
    <p class="note">${tl('Angaben vom Anbieter, ohne Gewähr. Änderungen und Absagen erfährst du dort.')}</p>
    ${similarHtml(o)}`;
}
// "Ähnliches in der Nähe": the same topic for a fitting age within 5 km (online: other online offers), in the next 14 days,
// one per series, at most 5, nearest first. Hidden topics, providers and series stay hidden; running courses are left out.
function similarNearby(o, max = 5) {
  const pos = offerPos(o);
  if (o.topic === 'sonstiges' || (!pos && !o.online)) return [];
  const t = today0(), end = addDays(t, 14), own = crossKey(o), fam = hasFamily();
  const ageOk = c => fam ? offerFits(c) !== false
    : noAge(o) || noAge(c) || ((c.age_min_m ?? 0) < (o.age_max_m ?? 999) && (c.age_max_m ?? 999) > (o.age_min_m ?? 0));
  const out = [];
  for (const c of OFFERS) {
    if (c.topic !== o.topic || c.id === o.id || crossKey(c) === own || !!c.online !== !!o.online) continue;
    if (c.status === 'abgesagt' || c.status === 'ausgebucht' || isHidden(c) || started(c) || (c.audience || '') !== (o.audience || '') || !ageOk(c)) continue;
    const cp = offerPos(c), m = o.online ? 0 : cp ? dist(pos, cp) : Infinity;
    if (m > 5000) continue;
    const d = nextAfterNow(c);
    if (!d || d > end) continue;
    out.push([m, d, c]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const seen = new Set(), res = [];
  for (const x of out) { const k = crossKey(x[2]); if (seen.has(k)) continue; seen.add(k); res.push(x); if (res.length >= max) break; }
  return res;
}
function similarHtml(o) {
  const list = similarNearby(o);
  return list.length ? `<div class="sec similar"><h4>${tl('Ähnliches in der Nähe')}</h4><ol class="list">${list.map(([, d, c]) => offerItem(c, d)).join('')}</ol></div>` : '';
}

// Calendar: a file any calendar app can import, or Google's own form. Weekly groups repeat, at most 12 weeks.
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const compact = d => ymd(d).replace(/-/g, '');
// An event over several days is one entry over all its days (from today on while it runs). A series repeats in its own rhythm
// (weekly, every 2 weeks, monthly) up to its end, its known number of sessions (COUNT), else 12 weeks (monthly: 6 months).
// Offers without known dates get no calendar entry at all (the offer page says so).
function calParts(o) {
  const day = nextAfterNow(o) || today0(), hm = s => s.replace(':', '') + '00', rp = repeatOf(o), where = [o.venue, o.address].filter(Boolean).join(', ');
  const end = o.time_to && o.time_to > (o.time_from || '') ? o.time_to : o.time_from ? `${String(Math.min(23, +o.time_from.slice(0, 2) + 1)).padStart(2, '0')}${o.time_from.slice(2)}` : null;
  const info = note => [o.provider, o.free ? tl('Kostenlos') : o.price, regText(o), safeUrl(o.url), note, tl('Ohne Gewähr, bitte beim Anbieter prüfen.')].filter(Boolean).join('\n');
  if (multiDay(o)) {
    const last = new Date(o.end_date + 'T00:00'), times = timeRange(o);
    return { day, start: compact(day), end: compact(addDays(last, 1)), timed: false, rrule: null, desc: info(times ? tl('Täglich {time} Uhr', { time: times }) : ''), where };
  }
  let rrule = null, note = '';
  if (isRecurring(o)) {
    const by = rp === 'monthly' ? (monthRule(o).last ? '-1' : monthRule(o).n) + BYDAY[o.weekday] : BYDAY[o.weekday];
    let limit;
    if (o.sessions > 1 && !o.end_date && rp !== 'monthly') {
      const step = rp === 'biweekly' ? 14 : 7, passed = o.start_date ? Math.max(0, Math.round((day - firstOcc(o)) / 864e5 / step)) : 0;
      limit = `COUNT=${Math.max(1, o.sessions - passed)}`;
    } else {
      const cap = rp === 'monthly' ? addDays(day, 183) : addDays(day, 7 * 11), e = o.end_date ? new Date(o.end_date + 'T00:00') : null, capped = !(e && e < cap);
      if (capped) note = rp === 'monthly' ? tl('Wiederholung von Djuu auf 6 Monate begrenzt.') : tl('Wiederholung von Djuu auf 12 Wochen begrenzt.');
      limit = `UNTIL=${compact(capped ? cap : e)}${o.time_from ? 'T225959Z' : ''}`;
    }
    rrule = `FREQ=${rp === 'monthly' ? 'MONTHLY' : 'WEEKLY'}${rp === 'biweekly' ? ';INTERVAL=2' : ''};BYDAY=${by};${limit}`;
  }
  return { day, start: o.time_from ? `${compact(day)}T${hm(o.time_from)}` : compact(day), end: end ? `${compact(day)}T${hm(end)}` : compact(addDays(day, 1)), timed: !!o.time_from, rrule, desc: info(note), where };
}
function gcalUrl(o) {
  const c = calParts(o), q = new URLSearchParams({ action: 'TEMPLATE', text: titleOf(o), dates: `${c.start}/${c.end}`, details: c.desc, location: c.where });
  if (c.timed) q.set('ctz', 'Europe/Berlin');
  if (c.rrule) q.set('recur', 'RRULE:' + c.rrule);
  return 'https://calendar.google.com/calendar/render?' + q;
}
function icsFile(list, alarm) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  // lines of at most 75 octets (RFC 5545), never inside a character; a continuation line starts with a space
  const enc = new TextEncoder();
  const fold = l => { const out = []; let cur = '', n = 0; for (const ch of l) { const b = enc.encode(ch).length; if (n + b > 75) { out.push(cur); cur = ' '; n = 1; } cur += ch; n += b; } out.push(cur); return out.join('\r\n'); };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Djuu//Termine//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  for (const o of list) {
    const c = calParts(o), tz = c.timed ? ';TZID=Europe/Berlin' : ';VALUE=DATE';
    lines.push('BEGIN:VEVENT', `UID:${o.id}@djuu`, `DTSTAMP:${stamp}`, `DTSTART${tz}:${c.start}`, `DTEND${tz}:${c.end}`, `SUMMARY:${icsText(titleOf(o))}`,
      `LOCATION:${icsText(c.where)}`, `DESCRIPTION:${icsText(c.desc)}`, ...(safeUrl(o.url) ? [`URL:${safeUrl(o.url)}`] : []));
    if (c.rrule) lines.push('RRULE:' + c.rrule);
    if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(titleOf(o))}`, `TRIGGER:-${alarm}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
function downloadIcs(list, name, alarm) {
  const url = URL.createObjectURL(new Blob([icsFile(list, alarm)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(tl('Kalender-Datei erstellt. Öffne sie, um die Termine einzutragen.'));
}
// only http(s) links of the providers; anything else (empty, relative, javascript:, data:) is not shown as a link, and hosts
// Djuu never links (hamburg.de and all its subdomains, hamburg-tourism.de, Facebook, Instagram, TikTok, X/Twitter) neither
const BLOCKED_HOST = /(^|\.)(hamburg\.de|hamburg-tourism\.de|facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|twitter\.com|x\.com)\.?$/i;
const blockedUrl = u => { try { return BLOCKED_HOST.test(new URL(u).hostname); } catch (e) { return true; } };
function safeUrl(u) { return typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u) && !blockedUrl(u) ? u : ''; }
// a place's own website ("www.x.de" too), only when it may be linked
function placeSite(p) {
  const w = p?.f?.website?.[0];
  return w && /^(https?:\/\/|www\.)\S+$|^\S+\.[a-z]{2,}(\/\S*)?$/i.test(w) ? safeUrl(/^https?:/i.test(w) ? w : 'https://' + w) : '';
}
const placePhone = p => (p?.f?.phone?.[0] || '').split(/[;,]/)[0].trim();
function shareOffer(id) {
  const o = OFFER_BY_ID.get(id), d = nextAfterNow(o), url = location.origin + location.pathname + '#o=' + id;
  // a real date ("Sa, 21. Nov."), not "Heute": the message may be read tomorrow
  const text = `${titleOf(o)}${d && !undated(o) ? ', ' + fmtShort(d) : ''}${o.time_from ? ' ' + o.time_from + tl(' Uhr') : ''}${o.venue ? ', ' + o.venue : ''}`;
  if (navigator.share) navigator.share({ title: titleOf(o), text, url }).catch(() => {});
  else navigator.clipboard?.writeText(text + ' ' + url).then(() => toast(tl('Link kopiert.')), () => toast(url));
}
// does the offer take place on this day? (single date, weekly group within its run, or course period)
// (a weekly, fortnightly or monthly series within its run; a course period day by day in older data; an offer whose rhythm
// is not known only on the provider's first date)
function occursOn(o, day) {
  const k = ymd(day), s = o.start_date, e = o.end_date, rp = repeatOf(o);
  if (rp === 'once') return s === k || (!!e && !!s && s <= k && k <= e);
  if (seriesRepeat(rp)) {
    if (o.weekday !== dayIdx(day) || (s && k < s)) return false;
    const last = lastSession(o, rp); if (last && day > last) return false;
    if (rp === 'biweekly') return Math.round((day - firstOcc(o)) / 6048e5) % 2 === 0;
    return rp === 'monthly' ? monthHit(o, day) : true;
  }
  if (rp === 'period') return !!s && s <= k && (!e ? s === k : k <= e);
  return !!s && s === k;
}
function favsView() {
  const o = origin();
  const ps = store.favorites.map(id => byId.get(id)).filter(Boolean);
  const offers = store.savedOffers.map(s => [OFFER_BY_ID.get(s.id), s]);
  const live = offers.filter(([x]) => x && nextDate(x)).map(([x]) => [nextDate(x), x]).sort(byDayTime);
  const gone = offers.filter(([x]) => !x || !nextDate(x));
  return `${head(tl('Gemerkt'), typeof auth !== 'undefined' && auth?.family ? tl('Gemeinsam mit der Familie') : tl('Nur auf diesem Gerät gespeichert'), false)}
    ${!ps.length && !offers.length ? `<div class="empty"><b>${tl('Noch nichts gemerkt.')}</b>${tl('Tippe bei Terminen und Orten auf das Herz, dann sammelt sich hier alles Interessante.')}</div>` : ''}
    ${live.length ? `<div class="sec"><h4>${tl('Termine')}</h4>${dayListHtml(live)}
      ${live.length > 1 ? `<button type="button" class="btn" data-ics="saved" style="margin-top:8px">${svg('cal')}${tl('Alle')} ${live.length} ${tl('in den Kalender')}</button>` : ''}</div>` : ''}
    ${gone.length ? `<div class="sec"><h4>${tl('Vorbei oder nicht mehr gefunden')}</h4><ol class="list">${gone.map(([x, s]) => `<li><button type="button" class="item offer" data-offer="${esc(s.id)}"><span class="datebox"><b>–</b></span><span><h3>${esc(s.snap.title)}</h3><span class="meta">${esc(s.snap.venue || '')}</span></span><span></span></button></li>`).join('')}</ol></div>` : ''}
    ${ps.length ? `<div class="sec"><h4>${tl('Orte')}</h4><ol class="list">${ps.map(p => itemHtml(p, dist(o, [p.lat, p.lon]))).join('')}</ol></div>` : ''}`;
}
// ---------- Holiday ideas: what fits the next school break, the season and the children's ages ----------
const fmtD = d => d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
const kidNames = () => familyAges().filter(k => k.months >= 0).map(k => `${k.name} (${ageText(k)})`);
function ferienCard(within, forAll = false) {
  const b = nextBreak();
  if (!b || (!b.running && b.days > within)) return '';
  // on the map only families with school children see it; Kita children are not bound to the dates
  if (!forAll && within < 30 && !familyAges().some(k => k.months >= 72)) return '';
  const when = b.running ? `${tl('Noch bis')} ${fmtD(b.to)}` : b.days === 1 ? tl('Ab morgen') : `${tl('In')} ${b.days} ${tl('Tagen, ab')} ${fmtD(b.from)}`;
  return `<button type="button" class="askcard ferien" data-open="ferien"><div><b>${esc(b.name)}: ${esc(when)}</b><span>${kidNames().length ? tl('Ideen für ') + esc(familyAges().filter(k => k.months >= 0).map(k => k.name).join(', ')) : tl('Ideen für die freien Tage')}</span></div>${svg('star')}</button>`;
}
const SEASON_IDEAS = m => m >= 5 && m <= 7 ? [[tl('Baden und Wasser'), ['entdecken', 'baden'], ['spielen', 'wasserspiel']], [tl('Toben und Bauen'), ['spielen', 'abenteuer']], [tl('Tiere und Natur'), ['entdecken', 'tiere']], [tl('Falls es regnet'), ['spielen', 'indoorspielplatz'], ['entdecken', 'museum']]]
  : m >= 8 && m <= 10 ? [[tl('Wenn es nass und kalt wird'), ['spielen', 'indoorspielplatz'], ['spielen', 'spielhaus']], [tl('Museen und Kultur'), ['entdecken', 'museum'], ['entdecken', 'theater']], [tl('Tiere und Natur'), ['entdecken', 'tiere']], [tl('Toben und Bauen'), ['spielen', 'abenteuer']]]
  : m === 11 || m <= 1 ? [[tl('Drinnen toben'), ['spielen', 'indoorspielplatz'], ['spielen', 'spielhaus'], ['spielen', 'klettern']], [tl('Museen und Kultur'), ['entdecken', 'museum'], ['entdecken', 'theater']], [tl('Eislaufen'), ['spielen', 'eislaufen']], [tl('Tiere'), ['entdecken', 'tiere']]]
  : [[tl('Toben und Bauen'), ['spielen', 'abenteuer']], [tl('Tiere und Natur'), ['entdecken', 'tiere']], [tl('Museen und Kultur'), ['entdecken', 'museum']], [tl('Falls es regnet'), ['spielen', 'indoorspielplatz']]];
// Nearby ideas for a list of [group, tag] pairs: fits the children's ages, Djuu-Tipps first.
function ideaPlaces(pairs, kids) {
  const o = origin(), young = kids.length && kids.every(k => k.months < 72);
  const fits = p => { if (young && p.tags.has('groessere')) return false; const s = agesOf(p); return !kids.length || !s || kids.some(k => s.some(([a, z]) => ageIn(k, a, z))); };
  return places.filter(p => pairs.some(([g, t]) => p.tags.has(t) && memberOf(p, GROUP[g])) && p.named && fits(p) && areaOk(p))
    .map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => (!!b[1].f.tipp - !!a[1].f.tipp) || a[0] - b[0]).slice(0, 4);
}
function ferienView() {
  const b = nextBreak();
  if (!b) return `${head(tl('Ferien'))}<div class="empty"><b>${breaksFailed ? tl('Die Ferientermine ließen sich gerade nicht laden.') : tl('Keine Ferientermine bekannt.')}</b></div>`;
  const kids = familyAges().filter(k => k.months >= 0), school = kids.filter(k => k.months >= 72), small = kids.filter(k => k.months < 72);
  const state = STATES[store.profile.state || 'DE-HH'];
  const range = `${fmtD(b.from)} ${tl('bis')} ${fmtD(b.to)}`;
  const offers = OFFERS.filter(o => (o.kind === 'termin' || o.kind === 'kurs') && o.audience !== 'erwachsene' && offerFits(o) !== false && offerInArea(o)).map(o => {
    for (let d = new Date(Math.max(b.from, today0())); d <= b.to; d.setDate(d.getDate() + 1)) if (occursOn(o, d)) return [new Date(d), o];
    return null;
  }).filter(Boolean).sort((x, y) => x[0] - y[0]);
  const sections = SEASON_IDEAS(b.from.getMonth()).map(([title, ...pairs]) => [title, ideaPlaces(pairs, kids)]).filter(([, l]) => l.length);
  return `${head(esc(b.name), `${esc(range)} · ${esc(state)}`)}
    ${school.length ? `<p class="text">${tl('Schulfrei für')} ${esc(school.map(k => k.name).join(', '))}.${small.length ? ` ${esc(small.length === 1 ? tl('{names} ist noch nicht in der Schule: Prüft die Schließzeiten eurer Kita.', { names: small[0].name }) : tl('{names} sind noch nicht in der Schule: Prüft die Schließzeiten eurer Kita.', { names: small.map(k => k.name).join(', ') }))}` : ''}</p>` : small.length ? `<p class="text">${tl('Noch kein Schulkind dabei, aber Ausflugsziele werden voller und viele Kurse pausieren. Prüft die Schließzeiten eurer Kita.')}</p>` : ''}
    <div class="sec"><h4>${tl('Termine in dieser Zeit')}</h4>${offers.length ? `<ol class="list">${offers.slice(0, 6).map(([d, o]) => offerItem(o, d)).join('')}</ol>${offers.length > 6 ? `<p class="note">${tl('und {n} weitere', { n: nf.format(offers.length - 6) })}</p>` : ''}` : `<p class="muted text">${tl('Noch keine Termine bekannt. Viele Anbieter veröffentlichen ihr Ferienprogramm erst kurz vorher.')}</p>`}</div>
    ${sections.map(([title, list]) => `<div class="sec"><h4>${esc(title)}</h4><ol class="list">${list.map(([d, p]) => itemHtml(p, d)).join('')}</ol></div>`).join('')}
    <p class="note">${state === 'Hamburg' ? '' : tl('Die Ferien gelten für euer Bundesland, die Orte liegen in Hamburg. ')}${tl('Sortiert nach Djuu-Tipps und Entfernung')}${kids.length ? tl(', passend zum Alter, soweit bekannt') : ''}.</p>`;
}
const DATA_AT = { offers: null };
// "Termine heute aktualisiert": the day the events were last collected (no time: it runs every night at 4)
function freshText() {
  if (!DATA_AT.offers) return '';
  const d = new Date(DATA_AT.offers), days = Math.round((today0() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return days === 0 ? tl('heute') : days === 1 ? tl('gestern') : tl('am {date}', { date: d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' }) });
}
const freshHtml = () => DATA_AT.offers ? `<p class="fresh">${svg('check')}${esc(tl('Termine {when} aktualisiert', { when: freshText() }))}</p>` : '';
function saveProfileField(el) {
  const pr = store.profile;
  if (el.dataset.kid != null) pr.kids[+el.dataset.kid][el.dataset.k] = el.value.trim();
  if (el.id === 'expecting') pr.expecting = el.value;
  save(); renderTop();
}

// ---------- Add-place wizard (3 steps, one-handed) ----------
const WIZ_TYPES = [
  { id: 'spielplatz', group: 'spielen', label: tl('Spielplatz'), cat: 'spielplatz', icon: 'playground', attrs: ['kleinkind', 'eingezaeunt', 'schatten', 'wc_nahe', 'wasser'] },
  { id: 'essen', group: 'gastro', label: tl('Café / Restaurant'), cat: 'cafe', icon: 'cup', attrs: ['hochstuhl', 'wickeltisch', 'spielecke', 'kindermenue', 'kinderwagen'] },
  { id: 'laden', group: 'laeden', label: tl('Laden'), cat: 'windeln', icon: 'bag', attrs: ['windeln', 'sonntag_user'] },
  { id: 'service', group: 'sanitaer', label: tl('Wickeln, Stillen, WC'), cat: 'wickel', icon: 'baby', attrs: ['wickeltisch', 'stillen', 'toilette'] },
  { id: 'event', label: tl('Veranstaltung'), cat: 'event', icon: 'cal', attrs: [] },
];
const COMMON_ATTRS = ['drinnen', 'kinderwagen', 'hund', 'kostenlos'];
const EXTRA_ATTR = { sonntag_user: { id: 'sonntag_user', label: tl('Sonntags geöffnet') } };
const wizAttr = id => ATTR[id] || EXTRA_ATTR[id];
const wiz = { step: 1, data: null, map: null };
// "Ergänzen" on a place: no type grid, the questions that fit its group (only those the server takes: a question, no computed,
// counted or live value; pool questions only at bathing places). A new place: the questions of the chosen type.
function infoAttrs(p) {
  const g = groupOf(p).id, pool = p.cat === 'baden' || p.tags.has('baden');
  return ATTRS.filter(a => a.q && (!a.groups || a.groups.includes(g)) && !a.live && !a.count && !['wc_nahe', 'hst_nahe'].includes(a.id) && !COMMON_ATTRS.includes(a.id) && (!a.pool || pool)).map(a => a.id);
}
const wizOwnAttrs = d => !d.isNew && byId.get(d.placeId) ? infoAttrs(byId.get(d.placeId)) : WIZ_TYPES.find(t => t.id === d.type)?.attrs || [];

function startWizard({ place, type } = {}) {
  clearSel();
  const t = place ? (WIZ_TYPES.find(w => w.group === groupOf(place).id || w.cat === place.cat) || null) : null;
  wiz.data = { placeId: place?.id || null, isNew: !place, type: type || t?.id || (place ? 'service' : null), name: place?.name || '',
               lat: place?.lat ?? map.getCenter().lat, lon: place?.lon ?? map.getCenter().lng, attrs: {}, ages: [], comment: '',
               stars: 0, hours: '', photo: null, eventDate: '', eventTime: '', locating: !place };
  wiz.step = 1;
  go({ type: 'wizard' }, 'full');
  if (!place && navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => {
    if (!wiz.data || !wiz.data.locating) return;
    wiz.data.lat = pos.coords.latitude; wiz.data.lon = pos.coords.longitude; wiz.data.locating = false;
    if (wiz.map) { wiz.map.setView([wiz.data.lat, wiz.data.lon], 18); wiz.pin.setLatLng([wiz.data.lat, wiz.data.lon]); }
    const n = $('#wizLocNote'); if (n) n.textContent = tl('Per GPS gesetzt. Zieh den Pin, falls er nicht genau stimmt.');
  }, () => { if (wiz.data) wiz.data.locating = false; const n = $('#wizLocNote'); if (n) n.textContent = tl('Kein GPS. Zieh den Pin an die richtige Stelle.'); }, { enableHighAccuracy: true, timeout: 8000 });
}
const wizHeader = () => `<div class="progress"><span>${tl('Schritt')} ${Math.min(wiz.step, 3)} ${tl('von 3')}</span><div class="bar"><i style="width:${Math.min(wiz.step, 3) / 3 * 100}%"></i></div></div>`;
function triRow(id) {
  if (id === 'hund' && !hasDog()) return '';
  const a = wizAttr(id), v = wiz.data.attrs[id] || 'unknown';
  const answers = id === 'hund' ? [['yes', tl('Ja')], ['leashed', tl('Leine')], ['no', tl('Nein')], ['unknown', tl('Weiß nicht')]] : [['yes', tl('Ja')], ['no', tl('Nein')], ['unknown', tl('Weiß nicht')]];
  return `<div class="tri"><span class="tri-label">${esc(a.label)}</span><span class="seg" role="radiogroup" aria-label="${esc(a.label)}">
    ${answers.map(([k, l]) => `<button type="button" role="radio" aria-checked="${v === k}" class="${v === k ? 'on ' + k : ''}" data-tri="${id}" data-v="${k}">${l}</button>`).join('')}
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
    html = `${head(d.isNew ? tl('Ort hinzufügen') : tl('Infos ergänzen'), d.isNew ? '' : esc(d.name))}${wizHeader()}
      ${d.isNew ? `<div class="minimap" id="wizMap" aria-label="${tl('Position auf der Karte')}"></div>
        <p class="note" id="wizLocNote">${d.locating ? tl('Suche deine Position …') : tl('Zieh den Pin an die richtige Stelle.')}</p>` : ''}
      ${d.isNew ? `<div class="sec"><h4>${tl('Was ist es?')}</h4>
      <div class="typegrid">${WIZ_TYPES.map(t => `<button type="button" class="typebtn${d.type === t.id ? ' on' : ''}" data-type="${t.id}">${svg(t.icon)}<span>${esc(t.label)}</span></button>`).join('')}</div></div>` : ''}
      ${d.isNew ? `<div class="field"><label for="wizName">${tl('Name')}</label><input id="wizName" autocomplete="off" value="${esc(d.name)}" placeholder="${tl('z. B. Spielplatz am Weiher')}" maxlength="80">
        <div class="suggest" id="wizSuggest"></div></div>` : ''}
      ${d.type === 'event' ? `<div class="row2"><div class="field"><label for="wizDate">${tl('Datum')}</label><input id="wizDate" type="date" value="${esc(d.eventDate)}"></div>
        <div class="field"><label for="wizTime">${tl('Uhrzeit')}</label><input id="wizTime" type="time" value="${esc(d.eventTime)}"></div></div>` : ''}
      <div class="field"><label for="wizPhoto">${tl('Foto (optional)')}</label><input id="wizPhoto" type="file" accept="image/*" capture="environment">
        ${d.photo ? `<img class="preview" src="${d.photo}" alt="${tl('Vorschau')}">` : ''}<p class="hint-kids">${tl('Bitte keine Gesichter von Kindern zeigen.')}</p></div>`;
  } else if (wiz.step === 2) {
    const own = wizOwnAttrs(d), place = !d.isNew && byId.get(d.placeId);
    html = `${head(tl('Was gibt es hier?'), tl('Nur antippen, was du sicher weißt'))}${wizHeader()}
      ${own.length ? `<div class="sec"><h4>${esc(place ? CAT_LABEL[place.cat] || place.name : type.label)}</h4>${own.map(triRow).join('')}</div>` : ''}
      <div class="sec"><h4>${tl('Für alle Orte')}</h4>${COMMON_ATTRS.filter(a => !own.includes(a)).map(triRow).join('')}</div>`;
  } else if (wiz.step === 3) {
    html = `${head(tl('Noch etwas?'), tl('Alles freiwillig'))}${wizHeader()}
      <div class="sec"><h4>${tl('Für welches Alter passt es am besten?')}</h4>
      <div class="agegrid">${AGES.map(a => `<button type="button" class="chip${d.ages.includes(a.id) ? ' on' : ''}" data-age="${a.id}">${a.label}</button>`).join('')}</div></div>
      <div class="sec"><h4>${tl('Bewertung')}</h4>
      <div class="stars" role="group" aria-label="${tl('Sterne')}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-wstar="${n}" class="${n <= d.stars ? 'on' : ''}" aria-label="${tl('{n} Sterne', { n })}">★</button>`).join('')}</div></div>
      <div class="field"><label for="wizComment">${tl('Kurzer Kommentar')}</label><input id="wizComment" maxlength="140" value="${esc(d.comment)}" placeholder="${tl('z. B. Toller Sandkasten, wenig Schatten')}"></div>
      ${d.type !== 'event' ? `<div class="field"><label for="wizHours">${tl('Öffnungszeiten (nur wenn bekannt)')}</label><input id="wizHours" value="${esc(d.hours)}" placeholder="Mo-Fr 09:00-18:00; Sa 10:00-16:00"></div>` : ''}`;
  } else {
    const ans = Object.entries(d.attrs).filter(([, v]) => v !== 'unknown');
    html = `${head(tl('Alles richtig?'))}
      <dl class="summary">
        <dt>${tl('Art')}</dt><dd>${esc(type?.label || '–')}</dd><dt>${tl('Name')}</dt><dd>${esc(d.name || '–')}</dd>
        ${d.type === 'event' ? `<dt>${tl('Termin')}</dt><dd>${esc(d.eventDate)} ${esc(d.eventTime)}</dd>` : ''}
        <dt>${tl('Angaben')}</dt><dd>${ans.length ? ans.map(([k, v]) => `${esc(wizAttr(k).label)}: <b>${v === 'yes' ? tl('Ja') : v === 'leashed' ? tl('Leine') : tl('Nein')}</b>`).join('<br>') : tl('keine')}</dd>
        ${d.ages.length ? `<dt>${tl('Alter')}</dt><dd>${d.ages.map(a => esc(AGES.find(x => x.id === a).label)).join(', ')}</dd>` : ''}
        ${d.stars ? `<dt>${tl('Bewertung')}</dt><dd>${'★'.repeat(d.stars)}</dd>` : ''}
        ${d.comment ? `<dt>${tl('Kommentar')}</dt><dd>${esc(d.comment)}</dd>` : ''}
        ${d.hours ? `<dt>${tl('Öffnungszeiten')}</dt><dd>${esc(d.hours)}</dd>` : ''}
        ${d.photo ? `<dt>${tl('Foto')}</dt><dd><img class="preview" src="${d.photo}" alt="${tl('Vorschau')}"></dd>` : ''}
      </dl>`;
  }
  html += `<p class="error" id="wizErr" hidden></p>
    <div class="sticky-bar">
      ${wiz.step > 1 ? `<button type="button" class="btn" id="wizBack">${tl('Zurück')}</button>` : ''}
      ${wiz.step === 2 || wiz.step === 3 ? `<button type="button" class="btn ghost" id="wizSkip">${tl('Überspringen')}</button>` : ''}
      <button type="button" class="btn big sun" id="wizNext">${wiz.step === 4 ? tl('Speichern') : tl('Weiter')}</button></div>`;
  $('#panelBody').innerHTML = html;
  $('#panelBody').scrollTop = 0;
  bindWizard();
}
function bindWizard() {
  const d = wiz.data;
  if (wiz.step === 1 && d.isNew) {
    wiz.map = L.map('wizMap', { zoomControl: false, attributionControl: false, maxZoom: 19 }).setView([d.lat, d.lon], 17);
    tintMap(L.maplibreGL({ style: styleUrl(), attribution: '' }).addTo(wiz.map).getMaplibreMap());
    wiz.pin = L.marker([d.lat, d.lon], { draggable: true, icon: L.divIcon({ className: '', iconSize: [30, 30], html: `<div class="mk" style="--c:#FFD166;background:#FFD166;color:#1F1B4D">${svg('plus', '')}</div>` }) }).addTo(wiz.map);
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
        d.type = d.type || WIZ_TYPES.find(w => w.group === groupOf(p).id)?.id || 'service';
        toast(tl('Den Ort gibt es schon. Du ergänzt jetzt seine Infos.'));
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
    if (!file.type.startsWith('image/')) return wizError(tl('Bitte wähle ein Bild aus (JPG oder PNG).'));
    try { keepFields(); d.photo = await compressPhoto(file); renderWizard(); } catch (e) { wizError(tl('Das Foto konnte nicht gelesen werden. Versuch ein anderes.')); }
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
    if (!d.type) return wizError(tl('Bitte wähle aus, was für ein Ort es ist.'));
    if (d.isNew && d.name.trim().length < 2) return wizError(tl('Bitte gib einen Namen ein (mindestens 2 Zeichen).'));
    if (d.isNew && !inAreaBox(d.lat, d.lon)) return wizError(tl('Der Pin liegt außerhalb von Hamburg und Umgebung. Bitte verschieb ihn.'));
    if (d.type === 'event') {
      if (!d.eventDate) return wizError(tl('Bitte gib das Datum der Veranstaltung an.'));
      if (new Date(d.eventDate) < new Date(new Date().toDateString())) return wizError(tl('Das Datum liegt in der Vergangenheit.'));
    }
  }
  if (wiz.step === 3 && d.hours.trim() && !parseOH(d.hours.trim())) return wizError(tl('Die Öffnungszeiten verstehe ich nicht. Zum Beispiel: Mo-Fr 09:00-18:00; Sa 10:00-16:00'));
  if (wiz.step < 4) { wiz.step++; return renderWizard(); }
  saveWizard();
}
async function saveWizard() {
  const d = wiz.data, type = WIZ_TYPES.find(t => t.id === d.type);
  for (const a of wizOwnAttrs(d).concat(COMMON_ATTRS)) if (!d.attrs[a]) d.attrs[a] = 'unknown'; // "Weiß nicht" stored explicitly
  // signed in: a place entry goes to the Djuu server and is checked there; the own event stays on this phone (as before)
  let why = '';
  if (d.type !== 'event' && typeof commSignedIn === 'function' && commSignedIn()) {
    const btn = $('#wizNext'); if (btn) btn.disabled = true;
    const c = { isNew: d.isNew, type: d.type, cat: type.cat, name: d.name.trim(), lat: d.lat, lon: d.lon, attrs: d.attrs, ages: d.ages, hours: d.hours.trim(), photos: d.photo ? [d.photo] : [] };
    const rv = d.stars || d.comment.trim() ? { stars: d.stars || 0, text: d.comment.trim() } : null;
    try {
      const r = commPayloads(c, rv).length ? await commSendEntry(d.placeId, c, rv) : null;
      return wizThanks(r ? r.placeId || d.placeId : d.placeId, r ? 'sent' : 'nothing');
    } catch (e) {
      if (e.partial) { // the place went up, the review did not: the review stays on this phone
        if (rv) { store.reviews.push({ id: uid('r_'), placeId: e.partial.newId || d.placeId, stars: rv.stars, text: rv.text, photoIds: [], at: Date.now() }); save(); }
        return wizThanks(e.partial.newId || d.placeId, 'sent', e.why);
      }
      why = e.why || '';
    }
  }
  const photoIds = [];
  if (d.photo) { try { const id = uid('ph_'); await photoDB.put(id, d.photo); photoIds.push(id); } catch (e) { toast(tl('Foto konnte nicht gespeichert werden.')); } }
  if (d.type === 'event') {
    store.events.push({ id: uid('e_'), title: d.name.trim(), date: d.eventDate, time: d.eventTime, lat: d.lat, lon: d.lon, attrs: d.attrs, ages: d.ages, comment: d.comment.trim(), photoIds, createdAt: Date.now() });
  } else {
    const placeId = d.placeId || uid('u_');
    store.contributions.push({ id: uid('c_'), placeId, isNew: d.isNew, type: d.type, cat: type.cat, name: d.name.trim(), lat: d.lat, lon: d.lon, attrs: d.attrs, ages: d.ages, hours: d.hours.trim(), photoIds, createdAt: Date.now() });
    if (d.stars || d.comment.trim()) store.reviews.push({ id: uid('r_'), placeId, stars: d.stars || 0, text: d.comment.trim(), photoIds: [], at: Date.now() });
    d.placeId = placeId;
  }
  save();
  wizThanks(d.placeId, 'local', why);
}
// the page after saving: sent (checked before others see it), nothing new to send, or kept on this phone
function wizThanks(placeId, mode, why = '') {
  const d = wiz.data;
  addUserPlaces();
  const p = placeId && byId.get(placeId), area = p?.district || nearestDistrict(d.lat, d.lon);
  wiz.data = null;
  refresh();
  stack = [{ type: 'list' }];
  const where = area ? ' ' + tl('in {area}', { area: esc(dLabel(area)) }) : '';
  const hint = mode === 'local' && !why && typeof commLocalHint === 'function' ? commLocalHint() : '';
  const text = mode === 'sent' ? `${tl('Wird kurz geprüft. Bis dahin siehst nur du deinen Beitrag.')}${why ? ' ' + esc(why) : ''}`
    : mode === 'nothing' ? tl('Es gab nichts Neues zu senden.')
    : `${tl('Dein Eintrag')}${where} ${tl('ist auf diesem Gerät gespeichert.')}${why ? ' ' + esc(why) : ''}${hint ? ' ' + esc(hint) : ''}`;
  go({ type: 'thanks', html: `<div class="thanks">${BALLS_THANKS}<svg viewBox="0 0 24 24" width="64" height="64" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#0E8F84"/><path d="M7 12.5l3.2 3L17 9" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>${mode === 'local' ? tl('Gespeichert') : tl('Danke!')}</h2><p>${text}</p>
    <div style="display:flex;gap:8px;margin-top:10px">${p ? `<button type="button" class="btn primary" data-id="${esc(p.id)}">${tl('Ort ansehen')}</button>` : ''}<button type="button" class="btn" data-home="peek">${tl('Fertig')}</button></div></div>` }, desktop() ? 'full' : 'half');
}
function nearestDistrict(la, lo) {
  let best = null, bd = 1500;
  for (const p of places) if (p.district && Math.abs(p.lat - la) < 0.01 && Math.abs(p.lon - lo) < 0.015) { const m = dist([la, lo], [p.lat, p.lon]); if (m < bd) { bd = m; best = p.district; } }
  return best;
}

// ---------- Tabs ----------
const TABS = [
  { id: 'map', label: tl('Karte'), icon: 'map' },
  { id: 'search', label: tl('Suchen'), icon: 'search' },
  { id: 'events', label: tl('Termine'), icon: 'cal' },
  { id: 'favs', label: tl('Gemerkt'), icon: 'heart' },
  { id: 'me', label: tl('Wir'), icon: 'user' },
];
function setTab(id) {
  state.tab = id;
  if (typeof updateBell === 'function') setTimeout(updateBell);
  $('#tabs').innerHTML = TABS.map(t => `<button type="button" class="${t.cls || ''}${state.tab === t.id ? ' on' : ''}" data-tab="${t.id}">${svg(t.icon)}${t.label}</button>`).join('');
}

// ---------- Global interaction ----------
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
// leave the drawing mode: the pins come back
function endDrawing() { state.drawing = null; $('#app').classList.remove('drawing'); map.doubleClickZoom.enable(); drawArea(); map.addLayer(cluster); if (onlyMarker) onlyMarker.addTo(map); renderTop(); }
// a quick question: its groups, sub-categories and filters on the map; "Krabbelgruppen & Kurse" opens Termine › Wiederkehrend instead
function applyPreset(id) {
  const p = PRESETS.find(x => x.id === id); if (!p) return;
  if (p.termine) {
    EV.page = p.termine.page; EV.topics = new Set([p.termine.topic]); EV.limit = 60;
    stack = [{ type: 'list' }]; go({ type: 'events' }, 'full'); setTab('events'); return;
  }
  state.evIds = null; state.preset = p.id; state.groups = new Set(p.groups); state.cats = new Set(p.cats || []); state.tags = new Set(p.tags || []); state.io = p.io || null; state.filters = new Set(p.filters);
  if (p.groups[0]) state.mode = GROUP[p.groups[0]].mode;
  state.level = 2; state.q = ''; state.sq = ''; state.listLimit = 40; state.onlyPlace = null; refresh(); home(desktop() ? 'full' : 'peek');
}
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  const ds = t.dataset;
  if (ds.mode) { state.mode = ds.mode; state.level = 1; renderTop(); }
  else if (ds.level) { state.level = +ds.level; renderTop(); }
  else if (ds.groupAll) { state.evIds = null; state.groups.clear(); state.cats.clear(); state.tags.clear(); state.preset = null; state.level = 0; refresh(); home('peek'); }
  else if (ds.group) { state.evIds = null; const same = state.groups.size === 1 && state.groups.has(ds.group); if (!same) { state.groups = new Set([ds.group]); state.cats.clear(); state.tags.clear(); state.preset = null; if (!IO_GROUPS.includes(ds.group)) state.io = null; state.listLimit = 40; } state.mode = GROUP[ds.group].mode; state.level = TAGS[ds.group] ? 2 : 1; refresh(); if (view().type !== 'list') home('peek'); }
  else if (ds.tag) { toggle(state.tags, ds.tag); state.preset = null; state.listLimit = 40; refresh(); if (view().type !== 'list') home('peek'); }
  else if (ds.io) { state.io = state.io === ds.io ? null : ds.io; state.preset = null; refresh(); }
  else if (ds.detail) go({ type: 'detail', id: ds.detail }, 'full');
  else if (ds.sdistrict) { state.sq = ''; setArea({ type: 'district', names: [ds.sdistrict] }); home('peek'); }
  else if (ds.gtag) { state.evIds = null; const [gid, tg] = ds.gtag.split('|'); state.groups = new Set([gid]); state.tags = new Set([tg]); state.cats.clear(); state.mode = GROUP[gid].mode; state.level = 2; state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.groupOnly) { state.evIds = null; state.groups = new Set([ds.groupOnly]); state.tags.clear(); state.cats.clear(); state.mode = GROUP[ds.groupOnly].mode; state.level = 2; state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.filterOnly) { state.filters.add(ds.filterOnly); state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.filter) { toggle(state.filters, ds.filter); state.preset = null; refresh(); }
  else if (ds.preset) applyPreset(ds.preset);
  else if (ds.open === 'filters') go({ type: 'filters' });
  else if (ds.open === 'area') go({ type: 'area' });
  else if (ds.open === 'evfilters') { EV.placeTab = ''; go({ type: 'evfilters' }); }
  else if (ds.open === 'evtopics') go({ type: 'evtopics' });
  else if (ds.open === 'evplace') { EV.placeTab = ''; go({ type: 'evplace' }); }
  else if (ds.open === 'evdistricts') { EV.pending = new Set(EV.place.districts); EV.dq = ''; go({ type: 'evdistricts' }); }
  else if (ds.open === 'ferien') go({ type: 'ferien' });
  else if (ds.area === 'all') { setArea({ type: 'all' }, false); renderPanel(); }
  else if (ds.radius) { const a = state.area; setArea({ type: 'radius', r: +ds.radius, center: a.type === 'radius' ? a.center : state.me ? 'me' : [map.getCenter().lat, map.getCenter().lng] }); renderPanel(); }
  else if (ds.center === 'me') { locate(false); setArea({ type: 'radius', r: state.area.r || 2000, center: 'me' }); renderPanel(); if (!state.me) toast(tl('Wir suchen deinen Standort …')); }
  else if (ds.center?.startsWith('place:')) { setArea({ type: 'radius', r: state.area.r || 2000, center: ds.center }); renderPanel(); }
  else if (ds.center === 'pick') { state.picking = true; setSize('peek'); toast(tl('Tippe auf die Karte, um den Mittelpunkt zu setzen.')); }
  else if (ds.district) { setArea({ type: 'district', names: [ds.district] }); renderPanel(); }
  else if (ds.distopen) { AREA_UI.distOpen = !AREA_UI.distOpen; renderPanel(); if (AREA_UI.distOpen) setTimeout(() => $('#distQ')?.focus(), 50); }
  else if (ds.draw) { state.drawing = []; $('#app').classList.add('drawing'); map.doubleClickZoom.disable(); map.removeLayer(cluster); if (onlyMarker) map.removeLayer(onlyMarker); drawArea(); renderTop(); go({ type: 'draw' }, 'card'); }
  else if (ds.drawundo) { state.drawing.pop(); drawArea(); renderPanel(); renderTop(); }
  else if (ds.drawcancel) { endDrawing(); if (view().type === 'draw') back(); }
  else if (ds.drawdone) { const pts = state.drawing; if (!pts || pts.length < 3) return; endDrawing(); setArea({ type: 'poly', pts }); stack = [{ type: 'list' }]; renderPanel(); setSize(desktop() ? 'full' : 'half'); }
  else if (ds.evpage) { EV.page = ds.evpage; EV.limit = 60; EV.today = false; renderPanel(); $('#panelBody').scrollTop = 0; }
  else if (ds.evmode) { EV.mode = ds.evmode; EV.limit = 60; if (ds.evmode === 'fuer' && !canPersonal()) { EV.placeTab = 'umkreis'; go({ type: 'evsettings' }); } else { renderPanel(); $('#panelBody').scrollTop = 0; } }
  else if (ds.evdefmode) { store.ev.mode = ds.evdefmode; EV.mode = ds.evdefmode; saveEv(); afterEvChange(); }
  else if (ds.evsettings) { closeEvMenu(); EV.placeTab = ''; go({ type: 'evsettings' }); }
  else if (ds.evmenu) evMenuOpen(ds.evmenu);
  else if (ds.evmenuclose) { closeEvMenu(); EV.menu = null; }
  else if (ds.evhide) evHide(ds.evhide);
  else if (ds.evlike) evLike();
  else if (ds.evunhide) {
    const [kind, i] = ds.evunhide.split('|'), list = { topics: store.ev.hide.topics, providers: store.ev.hide.providers, series: store.ev.hide.series, ltopics: store.ev.like.topics, lproviders: store.ev.like.providers }[kind];
    if (list) { list.splice(+i, 1); saveEv(); afterEvChange(); }
  }
  else if (ds.evprefsreset) {
    const before = JSON.parse(JSON.stringify(store.ev)), mode0 = EV.mode, gps0 = EV.place.gps; // undo brings the view back as it was
    Object.assign(store.ev, { mode: '', placeSet: false, onlyFit: true, hide: { topics: [], providers: [], series: [] }, like: { topics: [], providers: [] }, days: [], time: [] });
    EV.mode = ''; Object.assign(EV.place, { mode: 'all', gps: null, km: 5 }); EV.place.districts.clear(); EV.days.clear(); for (const k of EV_TIME_KEYS) EV.f.delete(k);
    saveEv(); afterEvChange();
    undoToast(tl('Termine-Einstellungen zurückgesetzt.'), () => { Object.assign(store.ev, before); evRestore(); EV.mode = mode0; EV.place.gps = gps0; });
  }
  else if (ds.evhomex) { store.ev.home = null; saveEv(); afterEvChange(); }
  else if (ds.evseries != null) go({ type: 'evseries', key: ds.evseries }, 'full');
  else if (ds.evfold) { toggle(EV.open, ds.evfold); const l = $('#evList'); if (l) l.innerHTML = evListHtml(); }
  else if (ds.evtoday) { EV.page = 'wiederkehrend'; EV.today = true; EV.limit = 60; renderPanel(); $('#panelBody').scrollTop = 0; }
  else if (ds.evtodayx) { EV.today = false; renderPanel(); }
  else if (ds.evtodaycard) {
    // the map card: the same view it counted (today, Für euch)
    const c = todayCounts();
    Object.assign(EV, c.ev ? { mode: 'fuer', page: 'einmalig', when: 'heute', q: '', today: false } : { mode: 'fuer', page: 'wiederkehrend', q: '', today: true });
    EV.limit = 60; stack = [{ type: 'list' }]; go({ type: 'events' }, 'full'); setTab('events');
  }
  else if (ds.evsearch != null) {
    // from Suchen: the same words in Termine, on the page with more hits, every offer (not only "Für euch")
    const q = ds.evsearch, found = searchOffers(q), nT = found.filter(([, o]) => o.kind === 'termin').length;
    Object.assign(EV, { q, page: nT * 2 >= found.length ? 'einmalig' : 'wiederkehrend', mode: 'alle', when: '30', today: false, limit: 60 });
    stack = [{ type: 'list' }]; go({ type: 'events' }, 'full'); setTab('events');
  }
  else if (ds.evwhen) { EV.when = EV.when === ds.evwhen ? '7' : ds.evwhen; if (EV.when === 'datum' && !EV.from) EV.from = ymd(today0()); EV.limit = 60; renderPanel(); }
  else if (ds.evday) { toggle(EV.days, +ds.evday); saveEv(); renderPanel(); }
  else if (ds.evf) { toggle(EV.f, ds.evf); EV.limit = 60; if (EV_TIME_KEYS.includes(ds.evf)) saveEv(); renderPanel(); }
  else if (ds.evtopic) { toggle(EV.topics, ds.evtopic); EV.limit = 60; renderPanel(); }
  else if (ds.evreg) { EV.reg = ds.evreg === 'alle' ? '' : ds.evreg; EV.limit = 60; renderPanel(); }
  else if (ds.evplacetab) { EV.placeTab = ds.evplacetab; renderPanel(); }
  else if (ds.evplacemode) {
    const m = ds.evplacemode;
    if (m === 'all') { Object.assign(EV.place, { mode: 'all', gps: null }); EV.place.districts.clear(); EV.placeTab = ''; store.ev.placeSet = true; saveEv(); }
    else if (m === 'districts') { EV.placeTab = 'stadtteil'; if (EV.place.districts.size) { EV.place.mode = 'districts'; store.ev.placeSet = true; saveEv(); } }
    else if (m === 'online') { EV.placeTab = 'online'; Object.assign(EV.place, { mode: 'online', gps: null }); store.ev.placeSet = true; saveEv(); }
    else { EV.placeTab = 'umkreis'; if (radiusOrigin()) { setKm(EV.place.km); store.ev.placeSet = true; saveEv(); } }
    renderPanel();
  }
  else if (ds.evfmt) { toggle(EV.fmt, ds.evfmt); EV.limit = 60; renderPanel(); }
  else if (ds.evmap) {
    // the Termine list on the map: exactly its offers (Für euch or Alle, all filters), events with their date on the pin
    const g = cardPage() ? 'kurse' : 'events';
    state.evIds = { g, ids: new Set(evResults().map(([, o]) => o.id).filter(Boolean)) };
    state.groups = new Set([g]); state.tags.clear(); state.cats.clear(); state.preset = null; state.q = ''; state.evRange = cardPage() ? null : rangeOf(); state.onlyPlace = null;
    stack = [{ type: 'list' }]; setTab('map'); refresh(); renderPanel(); setSize('half');
  }
  else if (ds.evplace) { Object.assign(EV.place, { mode: 'all', gps: null }); EV.place.districts.clear(); saveEv(); renderPanel(); }
  else if (ds.evdistrictx) { EV.place.districts.delete(ds.evdistrictx); if (!EV.place.districts.size) EV.place.mode = 'all'; saveEv(); renderPanel(); }
  else if (ds.evkm) { setKm(ds.evkm); store.ev.placeSet = true; saveEv(); renderPanel(); }
  else if (ds.evgps) {
    if (!navigator.geolocation) toast(tl('Dieses Gerät kann den Standort nicht bestimmen.'));
    else navigator.geolocation.getCurrentPosition(p => { EV.place.gps = [p.coords.latitude, p.coords.longitude]; EV.placeTab = 'umkreis'; setKm(EV.place.km); store.ev.placeSet = true; saveEv(); renderPanel(); },
      () => toast(tl('Standort nicht verfügbar. Bitte im Browser erlauben.')), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }
  else if (ds.evgpsoff) { EV.place.gps = null; renderPanel(); }
  else if (ds.evorigin) { EV.place.placeId = ds.evorigin; EV.place.gps = null; saveEv(); renderPanel(); }
  else if (ds.evdreset) { EV.pending.clear(); refreshDistrictList(); }
  else if (ds.evdapply) { EV.place.districts = new Set(EV.pending); EV.place.mode = EV.pending.size ? 'districts' : 'all'; if (EV.pending.size) EV.place.gps = null; store.ev.placeSet = true; saveEv(); back(); }
  else if (ds.evreset) evReset();
  else if (ds.evshow) evShow();
  else if (ds.offer) go({ type: 'offer', id: ds.offer }, 'full');
  else if (ds.saveoffer) {
    toggleSaved(ds.saveoffer);
    if (ds.inline) { const on = isSaved(ds.saveoffer); document.querySelectorAll(`.savebtn[data-saveoffer="${ds.saveoffer}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? tl('Nicht mehr merken') : tl('Merken')); }); }
    else renderPanel();
  }
  else if (ds.calmenu) { view().cal = !view().cal; renderPanel(); }
  else if (ds.calfromoffer) { const o = OFFER_BY_ID.get(ds.calfromoffer), nd = o && nextDate(o); calAddFromOffer(ds.calfromoffer, nd ? `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}` : ''); }
  else if (ds.ics) { const list = ds.ics === 'saved' ? store.savedOffers.map(s => OFFER_BY_ID.get(s.id)).filter(o => o && nextDate(o) && !undated(o)) : [OFFER_BY_ID.get(ds.ics)]; downloadIcs(list, ds.ics === 'saved' ? 'djuu-gemerkte-termine.ics' : 'djuu-termin.ics'); }
  else if (ds.shareoffer) shareOffer(ds.shareoffer);
  else if (ds.clearq) { state.q = ''; state.sq = ''; refresh(); }
  else if (ds.clearsel) { state.evRange = null; state.evIds = null; state.groups.clear(); state.cats.clear(); state.tags.clear(); state.preset = null; state.q = ''; state.sq = ''; state.io = null; state.level = 0; state.listLimit = 40; refresh(); }
  else if (ds.clearonly) { state.onlyPlace = null; refresh(); }
  else if (ds.tagx) { state.tags.delete(ds.tagx); state.preset = null; state.listLimit = 40; refresh(); if (view().type === 'list') renderPanel(); }
  else if (ds.opencat) { ASK.open = ds.opencat; ASK.u = null; state.sq = ''; stack = [{ type: 'list' }]; go({ type: 'search' }, 'full'); setTab('search'); setTimeout(() => document.querySelector('.subcard')?.scrollIntoView({ block: 'center' }), 60); }
  else if (ds.onlyplace) { const p = byId.get(ds.onlyplace); state.onlyPlace = p.id; stack = [{ type: 'list' }]; setTab('map'); refresh(); renderPanel(); setSize('peek'); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16)); }
  else if (ds.opensearch) { stack = [{ type: 'list' }]; go({ type: 'search' }, 'full'); setTab('search'); if (ds.opensearch === 'voice') startVoice(); else setTimeout(() => $('#q')?.focus(), 60); }
  else if (ds.unk) { state.showUnknown = !state.showUnknown; refresh(); }
  else if (ds.reset) { state.filters.clear(); state.io = null; state.preset = null; state.showUnknown = false; refresh(); renderPanel(); }
  else if (ds.more) { state.listLimit += 40; renderPanel(); }
  else if (ds.id) { const p = byId.get(ds.id); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16)); showPlace(p.id); }
  else if (ds.back) back();
  else if (ds.home) home(ds.home === '1' ? (desktop() ? 'full' : 'peek') : ds.home);
  else if (ds.tab) {
    if (ds.tab === 'map') home(desktop() ? 'full' : 'peek');
    else if (ds.tab === 'add') startWizard();
    else { stack = [{ type: 'list' }]; go({ type: ds.tab }, 'full'); setTab(ds.tab); }
  }
  else if (ds.fav) { const i = store.favorites.indexOf(ds.fav); if (i >= 0) { store.favorites.splice(i, 1); delete store.favBy[ds.fav]; } else { store.favorites.push(ds.fav); store.favBy[ds.fav] = meId(); } save(); toast(i >= 0 ? tl('Nicht mehr gemerkt.') : tl('Gemerkt. Du findest es unter „Gemerkt“.')); renderPanel(); }
  else if (ds.share) {
    const p = byId.get(ds.share), url = location.origin + location.pathname + '#' + p.id;
    if (navigator.share) navigator.share({ title: p.name, text: p.name + tl(' auf Djuu'), url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast(tl('Link kopiert.')), () => toast(url));
  }
  else if (ds.addinfo) startWizard({ place: byId.get(ds.addinfo) });
  else if (ds.dogans) { const [pid, v] = ds.dogans.split('|'); answerDog(pid, v); }
  else if (ds.addevent) startWizard({ type: 'event' });
  else if (ds.rate) go({ type: 'rate', id: ds.rate });
  else if (ds.reportplace) go({ type: 'report', id: ds.reportplace });
  else if (ds.reason) { view().reason = ds.reason; $('#panelBody').querySelectorAll('[data-reason]').forEach(b => b.classList.toggle('on', b === t)); $('#repErr').hidden = true; }
  else if (ds.reportsend) sendPlaceReport();
  else if (ds.emore) { EV.limit += 60; $('#evList') ? ($('#evList').innerHTML = evListHtml()) : renderPanel(); }
  else if (ds.offerurl) window.open(ds.offerurl, '_blank', 'noopener');
  else if (ds.mapstyle) { setMapStyle(ds.mapstyle); state.styleOpen = false; renderPanel(); toast(`${tl('Kartenstil:')} ${mapStyle().label}`); }
  else if (ds.wx) { if (ds.wx === 'rain') { if (state.preset === 'regen') { state.preset = null; state.groups.clear(); state.cats.clear(); state.tags.clear(); state.io = null; refresh(); } else applyPreset('regen'); } else applyPreset('hitze'); }
  else if (ds.addkid) { store.profile.kids.push({ id: pbId(), name: '', ym: '' }); save(); renderPanel(); setTimeout(() => $('#kidYm' + (store.profile.kids.length - 1))?.focus(), 50); }
  else if (ds.delkid) { store.profile.kids.splice(+ds.delkid, 1); save(); renderPanel(); }
  else if (ds.report) {
    // hidden here at once; a review of others also goes to the moderators when signed in
    store.reports.push({ targetType: 'review', targetId: ds.report, at: Date.now() }); save(); renderPanel();
    const sent = typeof commReportReview === 'function' ? commReportReview(ds.report) : Promise.resolve(false);
    sent.then(ok => { if (ok) toast(tl('Danke! Wird kurz geprüft.')); else if (ok === false) toast(tl('Auf diesem Gerät ausgeblendet.')); });
  }
  else if (ds.reportphoto) {
    // a photo of others: hidden here at once; signed in it also goes to the moderators (community.js)
    const url = ds.reportphoto;
    store.reports.push({ targetType: 'photo', targetId: url, at: Date.now() }); save(); renderPanel();
    const sent = typeof commReportPhoto === 'function' ? commReportPhoto(url) : Promise.resolve(false);
    sent.then(ok => { if (ok) toast(tl('Danke! Wird kurz geprüft.')); else if (ok === false) toast(tl('Auf diesem Gerät ausgeblendet.')); });
  }
  else if (ds.sos) go({ type: 'sos', kind: ds.sos });
});
document.addEventListener('click', e => { if (e.target.closest('#evmenu [data-saveoffer]')) setTimeout(closeEvMenu); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('evmenu')) closeEvMenu(); });
document.addEventListener('click', e => { if (e.target.matches?.('#evmenu .lockbg')) closeEvMenu(); }); // a tap beside the sheet
document.addEventListener('input', e => {
  if (e.target.id === 'dq') { EV.dq = e.target.value; refreshDistrictList(); return; }
  if (e.target.id === 'evKmRange') { const l = e.target.previousElementSibling, b = e.target.nextElementSibling; if (l) l.value = String(e.target.value); if (b) b.textContent = kmText(+e.target.value); e.target.setAttribute('aria-label', `${tl('Umkreis in Kilometern,')} ${kmText(+e.target.value)}`); return; }
  if (e.target.id === 'evQ') { EV.q = e.target.value; EV.limit = 60; clearTimeout(document.evqt); document.evqt = setTimeout(() => { const l = $('#evList'); if (l) l.innerHTML = evListHtml(); }, 150); return; }
  if (e.target.id === 'distQ') { AREA_UI.dq = e.target.value; $('#distList').innerHTML = districtOpts(); }
  if (e.target.id === 'radRange') {
    const r = posToR(+e.target.value);
    e.target.style.setProperty('--p', e.target.value / 10 + '%'); e.target.setAttribute('aria-label', `${tl('Umkreis')}, ${fmtR(r)}`);
    $('#radVal').textContent = fmtR(r);
    if (areaMini) { areaMini.circle.setRadius(r); areaMini.fit(); }
    if (state.area.type === 'radius' && areaLayer?.setRadius) areaLayer.setRadius(r);
  } });
document.addEventListener('change', e => {
  if (e.target.matches('[data-kid], #expecting')) saveProfileField(e.target);
  if (e.target.id === 'fedState') { store.profile.state = e.target.value; save(); loadBreaks().then(renderPanel); }
  if (e.target.id === 'langSel') { store.lang = e.target.value; save(); location.reload(); }
  if (e.target.dataset.home) setHome(e.target.value);
  if (e.target.id === 'evKm' && e.target.value) { setKm(e.target.value); store.ev.placeSet = true; saveEv(); renderPanel(); }
  if (e.target.id === 'evKmRange') { setKm(e.target.value); store.ev.placeSet = true; saveEv(); renderPanel(); }
  if (e.target.id === 'radRange') {
    const was = state.area.type === 'radius', r = posToR(+e.target.value);
    setArea({ type: 'radius', r, center: was ? state.area.center : defaultCenter() });
    if (was) areaCountBtn(); else renderPanel();
  }
  if (e.target.dataset.dsel) {
    const d = e.target.dataset.dsel, cur = state.area.type === 'district' ? dNames(state.area) : [];
    const names = e.target.checked ? cur.concat(cur.includes(d) ? [] : [d]) : cur.filter(x => x !== d);
    if (names.length) setArea({ type: 'district', names }); else setArea({ type: 'all' }, false);
    const n = names, l = $('#distLabel');
    if (l) l.textContent = n.length ? n.slice(0, 2).map(dLabel).join(', ') + (n.length > 2 ? ` +${n.length - 2}` : '') : tl('Stadtteile wählen');
    $('.ddsel')?.classList.toggle('has', !!n.length);
    areaCountBtn();
    if (cur.length === 0 || names.length === 0) { const sc = $('#panelBody').scrollTop; renderPanel(); $('#panelBody').scrollTop = sc; } // radius chips switch off/on
  }
  if (e.target.dataset.dname) { e.target.checked ? EV.pending.add(e.target.dataset.dname) : EV.pending.delete(e.target.dataset.dname); refreshDistrictList(); }
  if (e.target.dataset.dall) {
    const { page } = evDistrictCounts(), q = norm(EV.dq.trim()), bz = e.target.dataset.dall;
    const names = GEO.stadtteile.filter(s => s[1] === bz && page[s[0]] && (!q || norm(s[0]).includes(q) || norm(bz).includes(q))).map(s => s[0]);
    for (const n of names) e.target.checked ? EV.pending.add(n) : EV.pending.delete(n);
    refreshDistrictList();
  }
  if (e.target.dataset.evonlyfit) { store.ev.onlyFit = e.target.checked; saveEv(); afterEvChange(); }
  // "bis" before "von" becomes the same day, so the field always shows what the list uses
  if (e.target.id === 'evFrom') { EV.from = e.target.value; if (EV.to && EV.from && EV.to < EV.from) EV.to = EV.from; renderPanel(); }
  if (e.target.id === 'evTo') { EV.to = e.target.value; if (EV.to && EV.from && EV.to < EV.from) EV.to = EV.from; renderPanel(); }
});
$('#sos').innerHTML = `${svg('bolt')}<span>${tl('Dringend')}</span>`;
$('#sos').onclick = () => { stack = [{ type: 'list' }]; go({ type: 'sos' }, 'full'); locate(false); };
$('#locate').innerHTML = svg('locate');
$('#addFab').innerHTML = svg('plus');
$('#locate').onclick = () => locate(true);
document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  state.sq = e.target.value;
  clearTimeout(document.qt);
  document.qt = setTimeout(() => { $('#searchRes').innerHTML = searchResults(); decorateEmpty($('#searchRes')); $('#searchHome').hidden = !!state.sq.trim(); }, 150);
});
// Enter in the search field: see ask.js (a question becomes filters, else the normal search)

// drag the sheet by its grip (phone)
(() => {
  let y0 = null;
  const order = ['peek', 'half', 'full'];
  const down = e => { const h = e.target.closest('#grip, [data-drag]'); if (!h || desktop()) return; y0 = e.clientY; h.setPointerCapture?.(e.pointerId); };
  const up = e => {
    if (y0 === null) return;
    const dy = e.clientY - y0, size = $('#panel').dataset.size, i = order.indexOf(size);
    y0 = null;
    if (size === 'card') { if (view().type !== 'card') return; return dy > 8 ? home('peek') : go({ type: 'detail', id: view().id }, 'full'); }
    if (Math.abs(dy) < 8) return setSize(size === 'peek' ? 'half' : 'peek'); // a tap: folded <-> open
    setSize(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1) * (Math.abs(dy) > 220 ? 2 : 1)))]);
  };
  $('#panel').addEventListener('pointerdown', down);
  $('#panel').addEventListener('pointerup', up);
  $('#panel').addEventListener('pointercancel', () => { y0 = null; });
})();

function locate(center) {
  if (!navigator.geolocation) { if (center) toast(tl('Standort wird von diesem Gerät nicht unterstützt.')); return; }
  if (locate.watching) { if (center && state.me) map.setView(state.me, 16); return; }
  let first = true;
  navigator.geolocation.watchPosition(pos => {
    locate.watching = true;
    state.me = [pos.coords.latitude, pos.coords.longitude];
    $('#locate').classList.add('on');
    if (first && center) map.setView(state.me, 16);
    if (!meMarker) meMarker = L.marker(state.me, { interactive: false, icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="me-dot"></div>' }) }).addTo(map);
    else meMarker.setLatLng(state.me);
    if (state.area.type === 'radius' && state.area.center === 'me') { drawArea(); refresh(); }
    if (first || ['list', 'sos'].includes(view().type)) renderPanel();
    first = false;
  }, () => { if (center) toast(tl('Standort nicht verfügbar. Bitte im Browser erlauben.')); }, { enableHighAccuracy: true, maximumAge: 30000 });
}
setInterval(() => { if ([...state.filters].some(f => f === 'jetzt' || ATTR[f]?.live)) refresh(); }, 60000); // opening hours and duty windows move on
new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', $('#topbar').offsetHeight + 'px')).observe($('#topbar'));
window.addEventListener('resize', () => setSize($('#panel').dataset.size));

// ---------- Boot ----------
for (const el of document.querySelectorAll('#map, #ctx, #fabs > button, #panel, #tabs')) el.setAttribute('aria-label', tl(el.getAttribute('aria-label')));
const splashShown = Date.now();
function hideSplash() {
  setTimeout(() => { const s = $('#splash'); s.classList.add('out'); setTimeout(() => s.remove(), 300); }, Math.max(0, 900 - (Date.now() - splashShown)));
}
setTab('map');
setSize(desktop() ? 'full' : 'peek');
loadWeather();
// ---------- Live values (elevators, emergency pharmacies) from the server, refreshed during the day ----------
const fmtStamp = s => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
// fetch with a time limit, so a slow server never holds up the map
const fetchJson = (url, ms = 8000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).finally(() => clearTimeout(t)); };
const LIVE = { ok: false, at: null }; // ok: live.json was read (then a pharmacy without a duty window is "not on duty")
const liveUrl = () => (window.DJUU_API || '') + '/data/live.json?t=' + Math.floor(Date.now() / 600000);
function applyLive(live) {
  const nowMs = Date.now(), at = live.generated && Date.parse(live.generated);
  // a file older than three days says nothing rather than something wrong
  if (at && nowMs - at > 3 * 864e5) { LIVE.ok = false; return; }
  for (const p of places) if (p.lift || p.duty || p.liftSum) { delete p.lift; delete p.duty; delete p.liftSum; delete p.f.elevator_status; }
  for (const [id, v] of Object.entries(live.aufzug || {})) {
    const p = byId.get(id); if (!p) continue;
    if (v[1] && nowMs - Date.parse(v[1]) > 7 * 864e5) continue; // hvv's own time stamp: only bumped when a status changes
    p.lift = v; p.f.elevator_status = [v[0], -1, 'live'];
  }
  for (const [id, ws] of Object.entries(live.notdienst || {})) {
    const p = byId.get(id); if (!p) continue;
    p.duty = ws.filter(([, b]) => Date.parse(b) > nowMs);
  }
  // stations: [in Betrieb, außer Betrieb, unbekannt, smallest cabin width cm, smallest door cm, [lift ids]]
  for (const [id, v] of Object.entries(live.stationen || {})) { const p = byId.get(id); if (p && Array.isArray(v)) p.liftSum = v; }
  LIVE.ok = true; LIVE.at = live.generated || null;
  for (const k of Object.keys(iconCache)) delete iconCache[k]; // pins show the live state
}
async function loadLive(pending) {
  try { applyLive(await (pending || fetchJson(liveUrl()))); return true; } catch (e) { return false; }
}
// live values change during the day: read them again every 10 minutes and when the app comes back to the screen
let liveAt = 0;
async function reloadLive() {
  if (Date.now() - liveAt < 60000 || !places.length) return;
  liveAt = Date.now();
  if (!await loadLive()) return;
  const live = [...state.filters].some(f => ATTR[f]?.live) || ['gesundheit', 'mobil'].some(g => state.groups.has(g));
  if (live) refresh(); else { for (const p of last.match) if (p.marker && (p.lift || p.duty)) markerFor(p, false, offerGroup()); }
  if (['detail', 'sos', 'card'].includes(view().type)) renderPanel();
}
setInterval(reloadLive, 600000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reloadLive(); });
window.addEventListener('online', () => { reloadLive(); if (view().type === 'list') renderPanel(); });
window.addEventListener('offline', () => { if (view().type === 'list') renderPanel(); });
loadBreaks().then(() => { if (['list', 'me', 'events'].includes(view().type)) renderPanel(); });
renderTop();
$('#panelBody').innerHTML = `<div class="ph"><h2>${tl('Lade Orte …')}</h2></div>`;
(async () => {
  try {
    // events and live values come from the Djuu server; they load next to the places and never hold up the map
    const offersP = (window.DJUU_API ? fetchJson(window.DJUU_API + '/data/offers.json') : Promise.reject()).catch(() => fetchJson('data/offers.json'));
    const liveP = fetchJson(liveUrl());
    liveP.catch(() => {});
    const res = await fetch('data/places.json');
    if (!res.ok) throw new Error('places.json ' + res.status);
    const data = await res.json();
    SOURCES = data.sources;
    for (const row of data.places) { const p = buildPlace(row); places.push(p); byId.set(p.id, p); }
    nameLifts();
    markDogRuns();
    if (typeof commStart === 'function') commStart(); // approved entries of everyone (kept copy at once, news from the server later)
    addUserPlaces();
    if (store.area && store.area.type) { state.area = store.area; drawArea(); if (state.area.center === 'me') locate(false); }
    refresh();
    renderPanel();
    hideSplash();
    loadGeo();
    (window.requestIdleCallback || setTimeout)(searchIndex); // first search answers at once
    const hash = location.hash.slice(1);
    if (byId.has(hash)) { const p = byId.get(hash); map.setView([p.lat, p.lon], 17); showPlace(hash); }
    liveAt = Date.now();
    loadLive(liveP).then(ok => { if (!ok) return; refresh(); if (['detail', 'sos', 'card'].includes(view().type)) renderPanel(); });
    // the shipped copy of the events is the fallback when the server is slow or away
    offersP.then(od => {
      DATA_AT.offers = od.generated; loadOffers(od); if (SI) SI.offers = null;
      adoptEvPrefs();
      refresh();
      if (['detail', 'events', 'search', 'favs'].includes(view().type)) renderPanel();
      if (hash.startsWith('o=')) { setTab('events'); stack = [{ type: 'list' }, { type: 'events' }]; go({ type: 'offer', id: hash.slice(2) }, 'full'); }
    }).catch(() => { /* offers optional */ });
  } catch (err) {
    hideSplash();
    $('#panelBody').innerHTML = `<div class="empty"><b>${tl('Daten konnten nicht geladen werden.')}</b>${tl('Bitte Seite neu laden.')}</div>`;
    console.error(err);
  }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // a new version takes over right away; reload once if that happens while the app is just opening, else on the next start
  const hadWorker = !!navigator.serviceWorker.controller, openedAt = Date.now();
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker && !window.djuuReloading && Date.now() - openedAt < 15000) { window.djuuReloading = true; location.reload(); }
  });
}
