/* Djuu v0.31 – family map for Hamburg.
   The map owns the screen: one chip row floats on top, map buttons on the right, the sheet starts as a slim bar.
   The chip row drills down one level at a time: Erleben or Service, then categories, then the tags of a category.
   A tapped pin opens a small card; search and favorites live in the bottom bar. Default view: playgrounds.
   for list, place details, filters, urgent help, events, saved places and the add-place wizard.
   Data: data/places.json (db/export.py); every value carries its source.
   User input is stored on this device only until the server exists (server-ready shape, see STORE). */
'use strict'; // i18n-skip

const VERSION = '0.35';
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
  { id: 'kurse', mode: 'erleben', label: tl('Kurse & Gruppen'), short: tl('Kurse & Gruppen'), icon: 'group', color: '#C2255C', cats: [], offers: ['kurs', 'gruppe'] },
  { id: 'events', mode: 'erleben', label: tl('Events'), short: tl('Events'), icon: 'cal', color: '#D9480F', cats: [], offers: ['termin'] },
  { id: 'gesundheit', mode: 'service', label: tl('Notfall & Gesundheit'), short: tl('Notfall & Gesundheit'), icon: 'cross', color: '#E03131', cats: ['kinderarzt', 'klinik', 'apotheke', 'babyklappe', 'hebamme', 'geburtshaus', 'zahnarzt', 'frauenarzt', 'hno', 'augenarzt', 'kinderpsychologie', 'physio', 'therapie'] },
  { id: 'sanitaer', mode: 'service', label: tl('Sanitär'), short: tl('Sanitär'), icon: 'baby', color: '#0C8599', cats: ['wc', 'wickel', 'familienfreundlich', 'trinkwasser'], extra: p => p.tags.has('wickeln') || p.tags.has('stillen') },
  { id: 'laeden', mode: 'service', label: tl('Läden'), short: tl('Läden'), icon: 'bag', color: '#1971C2', cats: ['windeln', 'laden', 'wochenmarkt'] },
  { id: 'familie', mode: 'service', label: tl('Familie & Beratung'), short: tl('Familie & Beratung'), icon: 'people', color: '#6741D9', cats: ['treffpunkt', 'beratung', 'kita', 'kurs', 'schule', 'musikschule', 'tanzschule', 'sprachschule', 'kreativschule', 'nachhilfe', 'jugend', 'pfadfinder'] },
  { id: 'mobil', mode: 'service', label: tl('Mobilität'), short: tl('Mobilität'), icon: 'elevator', color: '#5C677D', cats: ['haltestelle', 'bahnhof', 'aufzug'] },
];
const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
// Tags inside a sub-category. Plain tags are alternatives (Café or Restaurant); p: 1 marks a property that must hold
// in addition (Café and vegan). Offer tags 'aud:*' (who takes part) form their own dimension.
const T = (id, label, p) => ({ id, label, p: p ? 1 : 0 });
const TAGS = {
  spielen: [T('spielplatz', tl('Spielplatz')), T('abenteuer', tl('Abenteuerspielplatz')), T('indoorspielplatz', tl('Indoor-Spielplatz')), T('klettern', tl('Klettern & Bouldern')),
    T('trampolin', tl('Trampolin')), T('spielhaus', tl('Spielhaus')), T('spielstrasse', tl('Spielstraße')), T('bolzplatz', tl('Bolzplatz')), T('tischtennis', tl('Tischtennis')), T('sportstaette', tl('Sportanlagen')), T('sportverein', tl('Sportvereine')), T('reiten', tl('Reiten')), T('rodeln', tl('Rodeln')), T('minigolf', tl('Minigolf')), T('skaten', tl('Skaten')), T('eislaufen', tl('Eislaufen')),
    T('bewegung', tl('Sport & Bewegung')), T('wasserspiel', tl('Wasserspiel'), 1)],
  gastro: [T('cafe', tl('Café')), T('restaurant', tl('Restaurant')), T('imbiss', tl('Imbiss')), T('eis', tl('Eis')), T('kindercafe', tl('Kindercafé'), 1),
    T('fruehstueck', tl('Frühstück'), 1), T('kuchen', tl('Kuchen'), 1), T('vegan', tl('Vegan'), 1), T('vegetarisch', tl('Vegetarisch'), 1), T('terrasse', tl('Draußen sitzen'), 1),
    T('italienisch', tl('Pizza & Pasta'), 1), T('asiatisch', tl('Asiatisch'), 1), T('burger', tl('Burger'), 1)],
  entdecken: [T('natur', tl('Natur')), T('kultur', tl('Kultur')), T('tiere', tl('Tiere')), T('baden', tl('Baden')), T('museum', tl('Museen')), T('theater', tl('Theater & Kino')),
    T('buecherei', tl('Bücherhallen')), T('picknick', tl('Picknick & Grillen')), T('hundeauslauf', tl('Hundeauslauf')), T('aussicht', tl('Aussicht')), T('brunnen', tl('Brunnen')), T('buecherschrank', tl('Bücherschränke')), T('faehre', tl('Fähren')), T('bootsverleih', tl('Boot fahren')), T('camping', tl('Camping')), T('ausflugsziel', tl('Ausflugsziele'))],
  gesundheit: [T('kinderarzt', tl('Kinderarzt')), T('apotheke', tl('Apotheke')), T('klinik', tl('Klinik')), T('hebamme', tl('Hebamme')), T('geburtshaus', tl('Geburtshaus')), T('zahnarzt', tl('Zahnarzt')), T('frauenarzt', tl('Frauenarzt')), T('hno', 'HNO'), T('augenarzt', tl('Augenarzt')), T('kinderpsychologie', tl('Kinderpsychologie')), T('physio', tl('Physiotherapie')), T('therapie', tl('Logopädie & Ergotherapie')), T('babyklappe', tl('Babyklappe'))],
  sanitaer: [T('wc', tl('Toilette')), T('wickeln', tl('Wickelplatz')), T('stillen', tl('Stillen')), T('trinkwasser', tl('Trinkwasser'))],
  laeden: [T('drogerie', tl('Drogerie')), T('supermarkt', tl('Supermarkt')), T('spaeti', tl('Späti & Kiosk')), T('tankstelle', tl('Tankstelle')), T('baby', tl('Babyausstattung')),
    T('wochenmarkt', tl('Wochenmarkt')), T('kinderkleidung', tl('Kinderkleidung')), T('spielzeug', tl('Spielzeug')), T('buecher', tl('Bücher')), T('secondhand', tl('Secondhand'))],
  familie: [T('familienzentrum', tl('Familienzentren')), T('elternschule', tl('Elternschulen')), T('beratung', tl('Beratung')), T('kita', tl('Kitas')), T('schule', tl('Schulen')), T('musikschule', tl('Musikschulen')), T('tanzschule', tl('Tanzschulen')), T('sprachschule', tl('Sprachschulen')), T('kreativschule', tl('Kreativschulen')), T('nachhilfe', tl('Nachhilfe')), T('jugend', tl('Jugendhilfe')), T('pfadfinder', tl('Pfadfinder'))],
  mobil: [T('haltestelle', tl('Haltestellen')), T('bahnhof', tl('Bahnhöfe')), T('aufzug', tl('Aufzüge'))],
  kurse: [T('aud:kinder', tl('Für Kinder')), T('aud:erwachsene', tl('Für Erwachsene')), T('krabbelgruppe', tl('Krabbel- & Spielgruppe')), T('pekip', tl('PEKiP & Bewegung')),
    T('musik', tl('Musik')), T('schwimmen', tl('Babyschwimmen')), T('babymassage', tl('Babymassage')), T('kreativ', tl('Kreativ')), T('spiele', tl('Spielen & Medien')),
    T('sport', tl('Sport & Toben')), T('eltern_thema', tl('Elternthemen')), T('eltern_cafe', tl('Eltern-Café')), T('geburtsvorbereitung', tl('Geburtsvorbereitung')), T('rueckbildung', tl('Rückbildung')), T('erste_hilfe', tl('Erste Hilfe')), T('beratung', tl('Beratung'))],
  events: [T('aud:kinder', tl('Für Kinder')), T('aud:erwachsene', tl('Für Erwachsene')), T('lesen', tl('Vorlesen')), T('kreativ', tl('Basteln')), T('spiele', tl('Spielen & Medien')),
    T('theater', tl('Theater, Kino & Zirkus')), T('musik', tl('Musik')), T('feste', tl('Feste & Laternen')), T('wissen', tl('Forschen & Wissen')), T('sport', tl('Sport & Toben')), T('kochen', tl('Kochen & Backen')), T('eltern_thema', tl('Elternthemen')), T('flohmarkt', tl('Flohmarkt & Basar'))],
};
const TAG_LABEL = {};
for (const list of Object.values(TAGS)) for (const t of list) TAG_LABEL[t.id] = TAG_LABEL[t.id] || t.label;
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
  { id: 'wickeltisch', label: tl('Wickeltisch'), keys: ['changing_table'], groups: INDOOR, q: tl('Gibt es hier einen Wickeltisch?') },
  { id: 'stillen', label: tl('Stillmöglichkeit'), keys: ['baby_feeding'], groups: INDOOR, q: tl('Kann man hier in Ruhe stillen?') },
  { id: 'hochstuhl', label: tl('Hochstuhl'), keys: ['highchair'], groups: ['gastro'], q: tl('Gibt es Hochstühle?') },
  { id: 'spielecke', label: tl('Spielecke'), keys: ['kids_area'], groups: ['gastro', 'laeden', 'entdecken', 'gesundheit', 'familie'], q: tl('Gibt es eine Spielecke?') },
  { id: 'kindermenue', label: tl('Kindermenü'), keys: ['kids_menu'], groups: ['gastro'], q: tl('Gibt es ein Kindermenü?') },
  { id: 'windeln', label: tl('Windeln / Babynahrung'), keys: [], groups: ['laeden'], q: tl('Gibt es hier Windeln oder Babynahrung?') },
  { id: 'kleinkind', label: tl('Für Kleinkinder'), keys: ['for_baby', 'for_toddler'], groups: ['spielen'], q: tl('Gibt es einen Bereich für Kleinkinder?') },
  { id: 'eingezaeunt', label: tl('Eingezäunt'), keys: ['fenced'], groups: ['spielen'], q: tl('Ist der Spielplatz eingezäunt?') },
  { id: 'schatten', label: tl('Schatten'), keys: ['shade'], groups: ['spielen'], q: tl('Gibt es Schatten?') },
  { id: 'wc_nahe', label: tl('WC in der Nähe'), keys: ['wc_near'], groups: ['spielen'], q: tl('Gibt es ein WC in der Nähe?') },
  { id: 'wasser', label: tl('Wasserspiel'), keys: ['water_play'], groups: ['spielen'], q: tl('Gibt es ein Wasserspiel?') },
  { id: 'kinderwagen', label: tl('Kinderwagen'), keys: ['stroller', 'wheelchair'], q: tl('Kommt man gut mit dem Kinderwagen hin?') },
  { id: 'toilette', label: tl('Toilette'), keys: ['toilets'], groups: ['gastro', 'entdecken', 'spielen', 'laeden'], q: tl('Gibt es eine Toilette?') },
  { id: 'drinnen', label: tl('Drinnen'), keys: ['indoor'], groups: ['spielen', 'entdecken', 'familie'], q: tl('Ist es drinnen oder überdacht?') },
  { id: 'hund', label: tl('Hunde erlaubt'), keys: ['dog'], q: tl('Sind Hunde erlaubt?') },
  { id: 'hst_nahe', label: tl('Haltestelle in der Nähe'), keys: ['stop_near'], groups: ['spielen', 'gastro', 'entdecken', 'gesundheit', 'familie'] },
  { id: 'baenke', label: tl('Sitzbänke'), keys: ['bench_count'], count: 1, groups: ['spielen', 'entdecken'] },
  { id: 'trinkwasser', label: tl('Trinkwasser'), keys: ['drinking_water'], groups: ['spielen', 'entdecken', 'gastro', 'sanitaer'] },
  { id: 'babyccino', label: tl('Babyccino'), keys: ['babyccino'], groups: ['gastro'] },
  { id: 'kinder_wc', label: tl('Kindertoilette'), keys: ['toilets_children'], groups: INDOOR },
  { id: 'kostenlos', label: tl('Kostenlos'), keys: ['fee'], invert: true, groups: ['spielen', 'entdecken', 'sanitaer', 'familie'], q: tl('Ist es kostenlos?') },
];
const ATTR = Object.fromEntries(ATTRS.map(a => [a.id, a]));
const NO_LABEL = { stillen: tl('Keine Stillmöglichkeit'), spielecke: tl('Keine Spielecke'), kleinkind: tl('Nicht für Kleinkinder'), eingezaeunt: tl('Nicht eingezäunt'), schatten: tl('Wenig Schatten'), kinderwagen: tl('Nicht stufenlos'), toilette: tl('Keine Toilette'), drinnen: tl('Draußen'), hund: tl('Keine Hunde'), baenke: tl('Keine Sitzbänke'), kinder_wc: tl('Keine Kindertoilette'), kostenlos: tl('Kostenpflichtig'), windeln: tl('Keine Windeln') };
function normValue(attr, v) {
  if (v == null || v === '') return null;
  if (attr.id === 'hund') return /yes|leashed|outside|offleash/.test(v) ? 'yes' : v === 'no' ? 'no' : null;
  if (attr.id === 'wc_nahe' || attr.id === 'hst_nahe') return 'yes';
  if (attr.count) return +v > 0 ? 'yes' : null;
  if (attr.id === 'trinkwasser') return v === 'no' ? 'no' : 'yes';
  if (attr.invert) { const t = truthy(v); return t === 'yes' ? 'no' : t === 'no' ? 'yes' : null; }
  return truthy(v);
}
const GEAR = [
  { id: 'schaukel', label: tl('Schaukel'), re: /swing/ },
  { id: 'rutsche', label: tl('Rutsche'), re: /slide/ },
  { id: 'sand', label: tl('Sandkasten'), re: /sand/ },
  { id: 'klettern', label: tl('Klettern'), re: /climb|structure|rope|net/ },
  { id: 'seilbahn', label: tl('Seilbahn'), re: /zipwire|zip_line|cableway/ },
  { id: 'wippe', label: tl('Wippe'), re: /seesaw|springy/ },
  { id: 'trampolin', label: tl('Trampolin'), re: /trampoline/ },
];
const TIME_FILTERS = [{ id: 'jetzt', label: tl('Jetzt offen') }, { id: 'sonntag', label: tl('Sonntags offen') }];
const AGE_FILTERS = [{ id: 'age_fit', label: tl('Passt zu unseren Kindern'), family: 1 }, { id: 'age_0', label: tl('0–3 Jahre'), from: 0, to: 36 }, { id: 'age_3', label: tl('3–6 Jahre'), from: 36, to: 84 }, { id: 'age_6', label: tl('ab 6 Jahre'), from: 72, to: 216 }];
const FILTER_LABEL = Object.fromEntries([...TIME_FILTERS, ...ATTRS, ...GEAR, ...AGE_FILTERS].map(f => [f.id, f.label]));
const AGES = [{ id: '0-2', label: tl('0–2 Jahre') }, { id: '3-6', label: tl('3–6 Jahre') }, { id: '7+', label: tl('ab 7 Jahre') }];
const PRESETS = [
  { id: 'windeln-jetzt', label: tl('Jetzt Windeln kaufen'), icon: 'bag', groups: ['laeden'], cats: ['apotheke'], filters: ['jetzt'] },
  { id: 'windeln-sonntag', label: tl('Windeln am Sonntag'), icon: 'bag', groups: ['laeden'], cats: ['apotheke'], filters: ['sonntag'] },
  { id: 'tipps', label: tl('Djuu-Tipps: was Eltern lieben'), icon: 'star', groups: ['tipps'], filters: [] },
  { id: 'kurse', label: tl('Krabbelgruppen & Kurse'), icon: 'group', groups: ['kurse'], filters: [] },
  { id: 'wickeln', label: tl('Wickeln unterwegs'), icon: 'baby', groups: ['sanitaer'], tags: ['wickeln'], filters: [] },
  { id: 'regen', label: tl('Es regnet: drinnen spielen und entdecken'), icon: 'house', groups: ['spielen', 'entdecken'], io: 'drinnen', filters: [] },
  { id: 'kindercafe', label: tl('Kindercafé'), icon: 'cup', groups: ['gastro'], tags: ['kindercafe'], filters: [] },
  { id: 'kleinkind', label: tl('Spielplatz für die Kleinen'), icon: 'playground', groups: ['spielen'], tags: ['spielplatz'], filters: ['kleinkind'] },
  { id: 'wasser', label: tl('Wasserspielplatz'), icon: 'waves', groups: ['spielen'], tags: ['wasserspiel'], filters: [] },
  { id: 'hitze', label: tl('Es ist heiß: Baden und Wasser'), icon: 'waves', groups: ['spielen', 'entdecken'], tags: ['wasserspiel', 'baden'], filters: [] },
  { id: 'refill', label: tl('Wasserflasche auffüllen'), icon: 'cup', groups: ['sanitaer'], tags: ['trinkwasser'], filters: [] },
  { id: 'cafe-hund', label: tl('Café mit Kind und Hund'), icon: 'cup', groups: ['gastro'], tags: ['cafe'], filters: ['hund'] },
  { id: 'hund', label: tl('Hund darf rennen'), icon: 'paw', groups: ['entdecken'], tags: ['hundeauslauf'], filters: [] },
];

// ---------- Opening hours (common OSM formats; holidays ignored) ----------
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; // i18n-skip: OSM opening-hours syntax
const DAY_DE = I18N_DAYS; // weekday names in the chosen language
function parseOH(s) {
  if (!s) return null;
  s = s.replace(/"[^"]*"/g, '').replace(/\bDi\b/g, 'Tu').replace(/\bMi\b/g, 'We').replace(/\bDo\b/g, 'Th').replace(/\bSo\b/g, 'Su').trim(); // i18n-skip
  if (s === '24/7') return { always: true };
  const week = Array(7).fill(null);
  const spill = Array(7).fill(null).map(() => []);
  let ph;
  const rules = s.split(/;|,\s+(?=[A-Z][a-z])/).map(r => r.trim()).filter(Boolean);
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
// "Offen bis 18:00" / "Öffnet um 10:00" / "Heute geschlossen"
function openText(p) {
  const oh = p.oh; if (!oh) return '';
  if (oh.always) return `<span class="open">${tl('24 Stunden offen')}</span>`;
  const now = new Date(), d = dayIdx(now), min = now.getHours() * 60 + now.getMinutes();
  const today = dayRanges(oh, now), hol = holidayName(now);
  const cur = today.find(([a, b]) => min >= a && min < b) || oh.spill[d].find(([a, b]) => min >= a && min < b);
  if (cur) return `<span class="open">${tl('Offen bis')} ${fmtMin(cur[1] === 1440 && oh.spill[(d + 1) % 7][0] ? oh.spill[(d + 1) % 7][0][1] : cur[1])}</span>`;
  const next = today.find(([a]) => a > min);
  return next ? `<span class="closed">${tl('Öffnet um')} ${fmtMin(next[0])}</span>` : `<span class="closed">${tl('Heute geschlossen')}${hol ? tl(' (Feiertag)') : ''}</span>`;
}

// ---------- Local store (server-ready shape) ----------
const STORE_KEY = 'djuu.v2';
let store = { contributions: [], confirmations: [], reviews: [], reports: [], events: [], prompted: {}, favorites: [], profile: { kids: [], expecting: '', dogs: 0 } };
try { Object.assign(store, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* storage blocked */ }
store.favorites = store.favorites || [];
store.savedOffers = store.savedOffers || []; // [{ id, at, snap }]
store.visits = store.visits || {}; // offer id -> ['YYYY-MM-DD', ...]
// v0.8: expected date is a full date now; an old 'YYYY-MM' value becomes the middle of that month
if (store.profile && /^\d{4}-\d{2}$/.test(store.profile.expecting || '')) store.profile.expecting += '-15';
store.profile = Object.assign({ kids: [], expecting: '', dogs: 0, state: 'DE-HH' }, store.profile || {});
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
const state = { mode: 'erleben', groups: new Set(['spielen']), cats: new Set(), tags: new Set(['spielplatz']), io: null, area: { type: 'all' }, picking: false, drawing: null, level: 0, sq: '', filters: new Set(), preset: null, showUnknown: false, q: '', tab: 'map', listLimit: 40, me: null, selected: null };
let SOURCES = [];
const places = [];
const byId = new Map();

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat(LOCALE);
const fmtDate = t => new Date(t).toLocaleDateString(LOCALE);
const desktop = () => window.innerWidth >= 900;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000); }
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

function userAnswers(pid, attrId) {
  const out = [];
  for (const c of store.contributions) if (c.placeId === pid && c.attrs?.[attrId] && c.attrs[attrId] !== 'unknown') out.push({ v: c.attrs[attrId], at: c.createdAt });
  for (const c of store.confirmations) if (c.placeId === pid && c.attr === attrId) out.push({ v: c.answer, at: c.at });
  return out.sort((a, b) => b.at - a.at);
}
function attrVal(p, id) {
  if (GEAR.some(g => g.id === id)) return { v: p.gear?.has(id) ? 'yes' : null, src: p.gear ? tl('OpenStreetMap') : null };
  const a = ATTR[id];
  let base = { v: null };
  if (id === 'toilette' && p.cat === 'wc') base = { v: 'yes', src: tl('Kategorie') };
  else if (id === 'wasser' && p.gear?.has('wasser')) base = { v: 'yes', src: tl('OpenStreetMap') };
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
  if (f.min_age || f.max_age) out.push([(parseInt(f.min_age?.[0]) || 0) * 12, (parseInt(f.max_age?.[0]) || 18) * 12]);
  if (f.for_baby || f.for_toddler) out.push([0, 36]);
  return out.length ? out : null;
}
function ageFilter(p, id) {
  const spans = agesOf(p); if (!spans) return null;
  if (id === 'age_fit') { const kids = familyAges(); return kids.length ? kids.some(k => spans.some(([a, b]) => k.months >= a && k.months < b)) : null; }
  const a = AGE_FILTERS.find(x => x.id === id);
  return spans.some(([x, y]) => x < a.to && y > a.from);
}
function filterVal(p, f) {
  if (f.startsWith('age_')) return ageFilter(p, f);
  if (f === 'jetzt') return isOpen(p.oh);
  if (f === 'sonntag') return opensSunday(p.oh);
  const v = attrVal(p, f).v;
  return v === 'yes' || v === 'limited' ? true : v === 'no' ? false : null;
}
const relevantAttrs = p => ATTRS.filter(a => !a.groups || a.groups.includes(groupOf(p).id));

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
function addUserPlaces() {
  SI = null;
  for (const c of store.contributions) if (c.isNew && !byId.has(c.placeId)) {
    const p = { id: c.placeId, name: c.name, named: true, cat: c.cat, lat: c.lat, lon: c.lon, district: '', f: {}, srcs: [], tags: new Set([c.cat]), mine: true };
    if (c.hours) { p.hoursRaw = c.hours; p.oh = parseOH(c.hours); }
    places.push(p); byId.set(p.id, p);
  }
}

// ---------- Offers: courses, groups, events (data/offers.json) ----------
let OFFERS = [];
const OFFER_BY_ID = new Map();
const offersByPlace = new Map();
const TOPIC_LABEL = {
  geburtsvorbereitung: tl('Geburtsvorbereitung'), rueckbildung: tl('Rückbildung'), pekip: tl('PEKiP & Bewegung'), babymassage: tl('Babymassage'),
  schwimmen: tl('Babyschwimmen'), musik: tl('Musik'), krabbelgruppe: tl('Krabbel- & Spielgruppe'), eltern_cafe: tl('Eltern-Café'), beratung: tl('Beratung'),
  erste_hilfe: tl('Erste Hilfe am Kind'), kreativ: tl('Basteln'), lesen: tl('Vorlesen'), spiele: tl('Spielen & Medien'), theater: tl('Theater, Kino & Zirkus'),
  flohmarkt: tl('Flohmarkt & Basar'), feste: tl('Feste & Laternen'), kochen: tl('Kochen & Backen'), sport: tl('Sport & Toben'), eltern_thema: tl('Elternthemen'), wissen: tl('Forschen & Wissen'), sonstiges: tl('Angebot'),
};
const WD = I18N_DAYS;
// offer title in the chosen language: translated on the server each night (title_en ...), else the provider's German title
const titleOf = o => (LANG !== 'de' && o['title_' + LANG]) || o.title;
function loadOffers(data) {
  const cols = data.cols;
  OFFERS = data.offers.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  for (const o of OFFERS) OFFER_BY_ID.set(o.id, o);
  for (const o of OFFERS) if (o.place_id) (offersByPlace.get(o.place_id) || offersByPlace.set(o.place_id, []).get(o.place_id)).push(o);
}
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const f = m => m < 24 ? `${m} ${tl('Mon.')}` : `${Math.floor(m / 12)} J.`;
  if (max == null) return `ab ${f(min)}`;
  if (!min) return `bis ${f(max - 1)}`;
  return min < 24 && max <= 25 ? `${min}–${max - 1} ${tl('Mon.')}` : `${f(min)}–${f(max - 1)}`;
}
// Ages of the user's children in months (from birth month); negative = expected baby.
function familyAges() {
  const now = new Date(), out = [];
  for (const k of store.profile.kids) {
    if (!k.ym) continue;
    const [y, m] = k.ym.split('-').map(Number);
    let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    if (k.d && now.getDate() < +k.d) months--; // birthday this month not reached yet
    out.push({ name: k.name || tl('Kind'), months });
  }
  return out;
}
function kidLabel(m) { return m < 0 ? 'unterwegs' : m < 24 ? `${m} ${tl('Monate')}` : `${Math.floor(m / 12)} ${tl('Jahre')}`; }
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
  const fits = offerFits(o), n = o.id ? visitsOf(o.id).length : 0;
  const tags = [o.audience === 'erwachsene' ? tl('für Erwachsene') : ageLabel(o.age_min_m, o.age_max_m), o.free ? tl('kostenlos') : o.price, o.kind === 'gruppe' ? (isRecurring(o) ? tl('regelmäßig') : tl('offenes Treffen')) : o.kind === 'kurs' ? (o.sessions ? `${tl('Kurs,')} ${o.sessions}×` : tl('Kurs')) : '']
    .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
  const box = opts.timeOnly
    ? (o.time_from ? `<span class="datebox time"><b>${esc(o.time_from)}</b><span>${o.time_to ? tl('bis') + ' ' + esc(o.time_to) : tl('Uhr')}</span></span>` : '<span class="datebox time"><span>ganztags</span></span>')
    : `<span class="datebox"><b>${nd ? esc(fmtDay(nd)) : '–'}</b><span>${esc(o.time_from || '')}</span></span>`;
  const inner = `${box}
    <span><h3>${esc(titleOf(o))}</h3><span class="meta">${esc(TOPIC_LABEL[o.topic] || '')}${o.venue ? ' · ' + esc(o.venue) : ''}${d != null ? ' · ' + fmtDist(d) : ''}</span>
    <span class="mini${fits === true ? ' fit' : ''}">${fits === true ? `<span class="fitchip">${tl('passt zu euch')}</span>` : ''}${n ? `<span class="visitchip">${n === 1 ? tl('wart ihr schon') : n + '× dabei'}</span>` : ''}${tags}</span></span><span></span>`;
  return o.id ? `<li class="offrow"><button type="button" class="item offer" data-offer="${o.id}">${inner}</button>${saveBtn(o)}</li>` : `<li><div class="item offer">${inner}</div></li>`;
}

// ---------- Map ----------
const map = L.map('map', { zoomControl: false, minZoom: 10, maxZoom: 19, maxBounds: [[53.25, 9.55], [53.85, 10.45]] }).setView([53.5600, 9.9800], 13);
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
  chunkedLoading: true, showCoverageOnHover: false, disableClusteringAtZoom: 13, spiderfyOnMaxZoom: false,
  maxClusterRadius: z => z <= 11 ? 40 : 28,
  iconCreateFunction: c => {
    const n = c.getChildCount(), size = n < 50 ? '' : n < 300 ? 'm' : 'l';
    return L.divIcon({ html: `<div class="mkhit"><div class="cluster ${size}">${n < 1000 ? n : Math.round(n / 100) / 10 + 'k'}</div></div>`, className: '', iconSize: [44, 44] });
  },
});
map.addLayer(cluster);
// compact markers until street level, so single dots stay readable without clustering
const zoomClass = () => { const c = map.getContainer().classList; c.toggle('zs', map.getZoom() < 15); c.toggle('zd', map.getZoom() < 14); };
map.on('zoomend', zoomClass); zoomClass();
const iconCache = {};
function iconFor(p, unknown, og) {
  const g = og || groupOf(p), icon = og ? og.icon : iconOf(p), tip = !!p.f.tipp, k = g.id + icon + (unknown ? 'u' : '') + (p.mine ? 'm' : '') + (tip ? 't' : '');
  return iconCache[k] || (iconCache[k] = L.divIcon({ className: '', iconSize: [44, 44], html: `<div class="mkhit"><div class="mk${unknown ? ' unk' : ''}${p.mine ? ' mine' : ''}${tip ? ' tip' : ''}" style="--c:${tip ? '#0E8F84' : g.color}"><svg viewBox="0 0 24 24">${ICON[icon]}</svg>${tip ? `<span class="star">${svg('star', '')}</span>` : ''}</div></div>` }));
}
function markerFor(p, unknown, og) {
  if (!p.marker) { p.marker = L.marker([p.lat, p.lon]); p.marker.on('click', () => showPlace(p.id, true)); }
  p.marker.setIcon(iconFor(p, unknown, og));
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
  if (wet) return `<button type="button" class="tool wx${state.io === 'drinnen' ? ' on' : ''}" data-wx="rain"><span>${esc(label)} ${tl('· Drinnen zeigen')}</span></button>`;
  if (hot) return `<button type="button" class="tool wx" data-wx="hot"><span>${esc(label)} ${tl('· Wasser zeigen')}</span></button>`;
  return `<span class="tool wx plain"><span>${esc(label)}</span></span>`;
}
let meMarker = null;
map.on('click', e => {
  if (state.picking) { state.picking = false; setArea({ type: 'radius', r: state.area.type === 'radius' ? state.area.r : 1000, center: [e.latlng.lat, e.latlng.lng] }); stack = [{ type: 'list' }]; go({ type: 'area' }, 'half'); return; }
  if (state.drawing) { state.drawing.push([e.latlng.lat, e.latlng.lng]); drawArea(); renderPanel(); return; }
  if (view().type === 'card') return home('peek');
  if (!desktop() && view().type === 'list') setSize('peek');
});
map.on('moveend', () => { if (view().type === 'list') renderPanel(); });

// ---------- Filtering ----------
// ---------- Area (Gebiet): all Hamburg, district, radius around me or a point, drawn polygon ----------
const areaCenter = a => a.center === 'me' ? (state.me || [map.getCenter().lat, map.getCenter().lng]) : a.center;
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
  if (a.type === 'district') return p.district === a.name;
  if (a.type === 'radius') { const c = areaCenter(a); return Math.abs(p.lat - c[0]) < a.r / 1e5 && dist(c, [p.lat, p.lon]) <= a.r; }
  if (a.type === 'poly') return inPoly([p.lat, p.lon], a.pts);
  return true;
}
const fmtR = r => r < 1000 ? r + ' m' : r / 1000 + ' km';
function areaLabel(a = state.area) {
  if (a.type === 'district') return a.name;
  if (a.type === 'radius') return `${fmtR(a.r)} um ${a.center === 'me' ? 'dich' : tl('Punkt')}`;
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
  else if (a.type === 'district') { const pts = places.filter(p => p.district === a.name).map(p => [p.lat, p.lon]); if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); }
}
let DISTRICTS = [];
function districtList() {
  if (!DISTRICTS.length) { const n = {}; for (const p of places) if (p.district) n[p.district] = (n[p.district] || 0) + 1; DISTRICTS = Object.keys(n).sort((a, b) => a.localeCompare(b, 'de')); }
  return DISTRICTS;
}

// the one selected sub-category (tags only apply then), or null
const soleGroup = () => state.groups.size === 1 ? GROUP[[...state.groups][0]] : null;
const offerGroup = () => { const g = soleGroup(); return g && g.offers ? g : null; };
// selected tags of a group, split into alternatives (any) and properties (all), plus the audience of offers
function tagSel(g) {
  const list = TAGS[g.id] || [], sel = list.filter(t => state.tags.has(t.id));
  return { any: sel.filter(t => !t.p && !t.id.startsWith('aud:')).map(t => t.id), all: sel.filter(t => t.p).map(t => t.id), aud: sel.filter(t => t.id.startsWith('aud:')).map(t => t.id.slice(4)) };
}
function tagsOk(tags, g) {
  const s = tagSel(g);
  return (!s.any.length || s.any.some(t => tags.has(t))) && s.all.every(t => tags.has(t));
}
// offers of an offer group (next 8 weeks) that pass the selected tags
function groupOffers(g) {
  const s = tagSel(g), t0 = today0();
  return OFFERS.filter(o => g.offers.includes(o.kind) && (!s.aud.length || s.aud.includes(o.audience)) && (!s.any.length || s.any.includes(o.topic)))
    .map(o => [nextDate(o), o]).filter(([d]) => d && d - t0 < 56 * 864e5);
}
let offerPlaces = new Map(); // group id -> Set of place ids with matching offers (rebuilt in compute)
function memberOf(p, g) {
  if (g.virtual) return !!p.f.tipp;
  if (g.offers) return offerPlaces.get(g.id)?.has(p.id) || false;
  return g.cats.includes(p.cat) || !!(g.extra && g.extra(p));
}
const ioOk = p => !state.io || !(p.tags.has('drinnen') || p.tags.has('draussen')) || p.tags.has(state.io);
function inSelection(p) {
  if (!ioOk(p) || !areaOk(p)) return false;
  if (!state.groups.size && !state.cats.size) return true;
  if (state.cats.has(p.cat)) return true;
  for (const id of state.groups) { const g = GROUP[id]; if (memberOf(p, g) && (state.groups.size > 1 || g.offers || tagsOk(p.tags, g))) return true; }
  return false;
}
function compute() {
  offerPlaces = new Map();
  for (const id of state.groups) if (GROUP[id].offers) offerPlaces.set(id, new Set(groupOffers(GROUP[id]).map(([, o]) => o.place_id).filter(Boolean)));
  const q = state.q.trim().toLowerCase();
  const qHits = q ? new Set(searchPlaces(q).map(r => r.p.id)) : null;
  const fs = [...state.filters];
  const res = { match: [], unknown: [] };
  for (const p of places) {
    if (!inSelection(p)) continue;
    if (qHits && !qHits.has(p.id)) continue;
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
  const og = offerGroup();
  cluster.addLayers(last.match.map(p => markerFor(p, false, og)).concat(state.showUnknown ? last.unknown.map(p => markerFor(p, true, og)) : []));
  renderTop();
  if (['list', 'filters'].includes(view().type)) renderPanel();
}

// ---------- Top bar ----------
function topTitle() {
  if (state.q) return `„${state.q}“`;
  if (state.preset) return PRESETS.find(x => x.id === state.preset).label;
  const g = soleGroup();
  if (g) return state.tags.size ? [...state.tags].map(t => TAG_LABEL[t] || t).join(', ') : g.label;
  return state.groups.size ? tl('Mehrere Kategorien') : tl('Alle Orte');
}
// One level at a time: 0 = Erleben or Service, 1 = categories of that mode, 2 = tags of the chosen category.
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
  const g = soleGroup(), nf_ = state.filters.size + (state.io ? 1 : 0);
  $('#filterBtn').innerHTML = svg('filter') + (nf_ ? `<span class="count">${nf_}</span>` : '');
  $('#filterBtn').hidden = !!(g && g.offers);
  $('#filterBtn').classList.toggle('on', nf_ > 0);
  $('#ctx').innerHTML = rowHtml();
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
    for (const p of places) if (memberOf(p, g)) for (const t of p.tags) n[t] = (n[t] || 0) + 1;
    if (!places.length) return [];
    tagCountCache.set(g.id, TAGS[g.id].map(t => [t, n[t.id] || 0]).filter(([, c]) => c));
  }
  return tagCountCache.get(g.id);
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
  if (state.drawing) { state.drawing = null; drawArea(); return back(); }
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
function home(size = 'peek') { stack = [{ type: 'list' }]; clearSel(); renderPanel(); setSize(size); setTab('map'); }
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
  if (v.type === 'list') body.innerHTML = listView();
  else if (v.type === 'detail') { const html = await detailView(v.id); if (view() !== v) return; body.innerHTML = html; bindDetail(v.id); }
  else if (v.type === 'card') body.innerHTML = cardView(v.id);
  else if (v.type === 'filters') body.innerHTML = filtersView();
  else if (v.type === 'area') body.innerHTML = areaView();
  else if (v.type === 'ferien') body.innerHTML = ferienView();
  else if (v.type === 'draw') body.innerHTML = drawView();
  else if (v.type === 'search') body.innerHTML = searchView();
  else if (v.type === 'sos') body.innerHTML = sosView(v.kind);
  else if (v.type === 'events') body.innerHTML = eventsView();
  else if (['favs', 'me', 'wir', 'person'].includes(v.type)) body.innerHTML = wirRender(v);
  else if (v.type === 'offer') body.innerHTML = offerView(v.id);
  else if (v.type === 'evfilters') body.innerHTML = evFiltersView();
  else if (v.type === 'evtopics') body.innerHTML = evTopicsView();
  else if (v.type === 'evdistricts') body.innerHTML = evDistrictsView();
  else if (v.type === 'rate') { body.innerHTML = rateView(v.id); bindRate(v.id); }
  else if (v.type === 'report') body.innerHTML = reportView(v.id);
  else if (v.type === 'wizard') { renderWizard(); return; }
  else if (v.type === 'thanks') body.innerHTML = v.html;
  decorateEmpty(body);
  if (v.type !== 'detail' && v.type !== 'rate' && v.type !== 'list' && !(stayType === v.type && ['evfilters', 'evtopics', 'events'].includes(v.type))) body.scrollTop = 0;
  stayType = v.type;
}

// list (the home view)
function listView() {
  if (offerGroup()) return offerListView(offerGroup());
  const o = origin();
  const shown = shownList();
  const sorted = shown.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]);
  const u = last.unknown.length;
  const sub = state.filters.size
    ? `${nf.format(last.match.length)} ${tl('passen sicher')}${u ? ` · ${nf.format(u)} ${tl('ohne Angabe')} <button type="button" data-unk="1">${state.showUnknown ? 'ausblenden' : tl('auch zeigen')}</button>` : ''}`
    : `${tl('Nächste zuerst,')} ${state.area.type === 'radius' ? tl('ab Mittelpunkt') : state.me ? tl('von dir aus') : tl('ab Kartenmitte')}`;
  const todayFits = hasFamily() ? OFFERS.filter(o => { const d = nextDate(o); return d && +d === +today0() && offerFits(o) === true; }).length : 0;
  const breakCard = ferienCard(21);
  const famCard = breakCard || todayFits && !state.filters.size ? breakCard + (!todayFits || state.filters.size ? '' : `<button type="button" class="askcard" data-tab="events" style="width:100%;border:0;text-align:left;margin:0 0 8px"><div><b>${tl('Heute:')} ${todayFits} passende ${todayFits === 1 ? tl('Gruppe') : tl('Gruppen und Kurse')}</b><span>${tl('für')} ${esc(familyAges().map(k => k.name).join(', ') || 'euch')}</span></div>${svg('cal')}</button>`) : '';
  return `<div class="ph" data-expand="1"><h2>${nf.format(shown.length)} ${shown.length === 1 ? tl('Ort') : tl('Orte')} · ${esc(topTitle())}<span class="sub">${sub}</span></h2></div>${toolsHtml()}${famCard}
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
  return `<div class="ph" data-expand="1"><h2>${nf.format(list.length)} ${tl('Angebote ·')} ${esc(topTitle())}<span class="sub">${tl('in den nächsten 8 Wochen,')} ${state.me ? tl('von dir aus') : tl('ab Kartenmitte')}</span></h2></div>${toolsHtml(false)}
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
function itemHtml(p, d) {
  const yes = [...p.tags].filter(t => PROP_TAGS.has(t)).slice(0, 2).map(t => `<span>${esc(TAG_LABEL[t])}</span>`)
    .concat(relevantAttrs(p).filter(a => attrVal(p, a.id).v === 'yes' && ![...p.tags].some(t => PROP_TAGS.has(t) && TAG_LABEL[t] === a.label)).slice(0, 2).map(a => `<span>${esc(a.label)}</span>`)).join('');
  const ot = openText(p);
  return `<li><button type="button" class="item" data-id="${p.id}">${badge(p)}
    <span><h3>${esc(p.name)}${p.f.tipp ? ` <span class="tipdot" title="${tl('Djuu-Tipp')}">${svg('star', '')}</span>` : ''}</h3><span class="meta">${esc(CAT_LABEL[p.cat] || '')}${ot ? ' · ' + ot : ''}</span>${yes ? `<span class="mini">${yes}</span>` : ''}</span>
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
  const yes = [...p.tags].filter(t => PROP_TAGS.has(t)).slice(0, 2).map(t => `<span>${esc(TAG_LABEL[t])}</span>`)
    .concat(relevantAttrs(p).filter(a => attrVal(p, a.id).v === 'yes' && ![...p.tags].some(t => PROP_TAGS.has(t) && TAG_LABEL[t] === a.label)).slice(0, 2).map(a => `<span>${esc(a.label)}</span>`)).join('');
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
async function photoTags(ids) {
  const out = [];
  for (const id of ids || []) { try { const d = await photoDB.get(id); if (d) out.push(`<img src="${d}" alt="${tl('Foto von Nutzer')}" loading="lazy">`); } catch (e) { /* ignore */ } }
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
  const webRaw = f.website?.[0], web = webRaw && /^(https?:\/\/|www\.)\S+$|^\S+\.[a-z]{2,}(\/\S*)?$/i.test(webRaw) ? webRaw : null;
  const cm = (f.image?.[0] || '').match(/commons(?:\.m)?\.wikimedia\.org\/wiki\/(?:Special:FilePath\/|File:)(.+)$/i) || (f.image?.[0] || '').match(/^File:(.+)$/);
  const stars = f.rating ? Math.round(+f.rating[0] / 2) / 10 : null;
  const photos = await photoTags(store.contributions.filter(c => c.placeId === id).flatMap(c => c.photoIds || []).concat(reviews.flatMap(r => r.photoIds || [])));
  const extra = [
    f.description && esc(f.description[0]),
    f.dog_rule && `<b>${esc(f.dog_rule[0])}</b>`,
    f.water_status && `<b>${tl('Wasserqualität:')}</b> ${esc(f.water_status[0])}`,
    f.age_groups && `<b>${tl('Für Altersgruppen:')}</b> ${esc(f.age_groups[0])} ${tl('Jahre')}`,
    f.care_types && `${tl('Betreuung:')} ${esc(f.care_types[0])}`,
    f.services && esc(f.services[0]).slice(0, 280),
    f.transit && p.cat === 'haltestelle' && `<b>${tl('Linien:')}</b> ${esc(f.transit[0])}`,
    f.stop_near && `${tl('Nächste Haltestelle:')} ${esc(f.stop_near[0].split('|')[1])} (${esc(f.stop_near[0].split('|')[0])} m)`,
    sportText(f.sport?.[0]) && `<b>${tl('Sport:')}</b> ${esc(sportText(f.sport[0]))}`,
    f.season && `<b>${tl('Saison:')}</b> ${esc(f.season[0])}`,
    f.fee_text && `<b>${tl('Preis:')}</b> ${esc(f.fee_text[0])}`,
    cuisineText(f.cuisine?.[0]) && `<b>${tl('Küche:')}</b> ${esc(cuisineText(f.cuisine[0]))}`,
    f.device_count && +f.device_count[0] > 1 && `${esc(f.device_count[0])} ${tl('Spielgeräte')}`,
    f.area_ha && +f.area_ha[0] >= 1 && `${tl('Größe:')} ${esc(String(Math.round(+f.area_ha[0] * 10) / 10).replace('.', ','))} ${tl('Hektar')}`,
    f.operator && p.cat !== 'aufzug' && `<span class="muted">${tl('Betreiber:')} ${esc(f.operator[0])}</span>`,
  ].filter(Boolean);
  const today = dayIdx(new Date());
  const factChip = ([a, r]) => `<span class="fact${r.v === 'no' ? ' no' : r.v === 'limited' ? ' lim' : ''}">${r.v === 'no' ? '' : svg('check')}${esc(r.v === 'no' ? NO_LABEL[a.id] || tl('Kein ') + a.label : a.label)}${r.v === 'limited' ? tl(' (eingeschränkt)') : ''}</span>`;
  return `
    <div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><span style="flex:1"></span>
      <button type="button" class="round" data-home="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    <div class="hero">${badge(p)}<div style="min-width:0">
      <h2 style="margin:0;font:800 23px/1.15 var(--font-display);letter-spacing:-.02em;text-wrap:balance">${esc(p.name)}</h2>
      <div class="status-line"><span>${esc(CAT_LABEL[p.cat] || '')}${p.district ? ' · ' + esc(p.district) : ''}</span></div>
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
      ${known.length || p.gear || ages.length || p.tags.size ? `<div class="facts">${known.map(factChip).join('')}
        ${[...p.tags].filter(t => t !== p.cat && TAG_LABEL[t]).map(t => `<span class="fact neutral">${esc(TAG_LABEL[t])}</span>`).join('')}
        ${p.gear ? GEAR.filter(g => p.gear.has(g.id)).map(g => `<span class="fact neutral">${esc(g.label)}</span>`).join('') : ''}
        ${ages.map(a => `<span class="fact neutral">${esc(AGES.find(x => x.id === a)?.label || a)}</span>`).join('')}</div>`
      : `<p class="muted text">${tl('Zu diesem Ort wissen wir noch wenig.')}</p>`}
    </div>
    ${placeOffersHtml(id)}
    ${extra.length ? `<div class="sec">${extra.map(x => `<p class="text">${x}</p>`).join('')}</div>` : ''}
    ${addr || web || f.phone ? `<div class="sec"><h4>${tl('Kontakt')}</h4>${addr ? `<p class="text">${esc(addr)}</p>` : ''}
      ${f.phone ? `<p class="text">${tl('Telefon:')} <span style="user-select:all">${esc(f.phone[0])}</span></p>` : ''}
      ${web ? `<p class="text"><a href="${esc(web.startsWith('http') ? web : 'https://' + web)}" target="_blank" rel="noopener">${tl('Webseite öffnen')}</a></p>` : ''}</div>` : ''}
    ${p.hoursRaw ? `<details class="fold"><summary>${tl('Öffnungszeiten')}</summary>${!p.oh ? `<p>${esc(p.hoursRaw)}</p>` : p.oh.always ? `<p>${tl('Rund um die Uhr')}</p>` :
      '<table class="hours">' + p.oh.week.map((r, i) => `<tr class="${i === today ? 'today' : ''}"><td>${DAY_DE[i]}</td><td>${r.length ? r.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : tl('geschlossen')}</td></tr>`).join('') + '</table>' + (p.oh.ph ? `<p class="note">${tl('An Feiertagen:')} ${p.oh.ph.length ? p.oh.ph.map(([a, b]) => fmtMin(a) + '–' + fmtMin(b)).join(', ') : tl('geschlossen')}</p>` : `<p class="note">${tl('An Feiertagen wie sonntags, soweit nichts anderes bekannt ist.')}</p>`)}</details>` : ''}
    <details class="fold"${reviews.length ? ' open' : ''}><summary>${tl('Bewertungen')}${reviews.length ? ` (${reviews.length})` : ''}</summary>
      <div style="margin-top:8px">${reviews.length ? '' : `<p class="muted text">${tl('Noch keine Bewertung.')}</p>`}
      ${(await Promise.all(reviews.sort((a, b) => b.at - a.at).map(async r => `<div class="review">${r.stars ? `<b class="stars-read">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</b> ` : ''}<span class="muted">${fmtDate(r.at)}</span>
        ${r.text ? `<div>${esc(r.text)}</div>` : ''}${r.photoIds?.length ? `<div class="photos">${await photoTags(r.photoIds)}</div>` : ''}
        <button type="button" class="linkbtn" data-report="${r.id}">${tl('Melden')}</button></div>`))).join('')}
      <button type="button" class="btn" data-rate="${id}" style="margin-top:8px">${tl('Bewerten')}</button></div></details>
    <details class="fold"><summary>${tl('Woher stammen die Infos?')}</summary><div style="margin-top:8px">
      ${known.map(([a, r]) => `<div class="srcrow"><b>${esc(a.label)}</b><span>${r.v === 'yes' ? tl('Ja') : r.v === 'no' ? tl('Nein') : tl('Eingeschränkt')}</span>
        <span class="s">${r.method === 'user' ? `${tl('Von Nutzern bestätigt (')}${r.confirmations.length}×, zuletzt ${fmtDate(r.confirmations[0].at)}${tl(', auf diesem Gerät)')}` : r.method === 'website' ? `${tl('Webseite des Ortes, automatisch gelesen (')}${Math.round((r.conf || .6) * 100)} % sicher)` : r.method === 'computed' ? tl('Aus Kartendaten berechnet') : esc(r.src || '')}</span>
        ${r.evidence ? `<q>${esc(r.evidence)}</q>` : ''}</div>`).join('')}
      ${f.near_name ? `<p class="note">${tl('Der Name ist nur eine Orientierung: abgeleitet aus dem Park oder der nächsten Straße.')}</p>` : ''}<p class="note">${tl('Datensätze:')} ${p.srcs.map(i => esc(SOURCES[i]?.[1]) + ' (' + esc(SOURCES[i]?.[2]) + ')').join(' · ') || tl('von dir eingetragen')}</p></div></details>
    ${CONTACT.email ? `<button type="button" class="linkbtn" data-reportplace="${id}" style="margin-top:16px">${tl('Stimmt etwas nicht? Ort melden')}</button>` : ''}
    <p class="note" style="margin-top:12px">${tl('Was du hier einträgst, bleibt bisher auf diesem Gerät.')}</p>`;
}
function placeOffersHtml(id) {
  const list = (offersByPlace.get(id) || []).map(o => [nextDate(o), o]).filter(([d]) => d).sort((a, b) => a[0] - b[0]);
  if (!list.length) return '';
  const fitsFirst = list.sort((a, b) => (offerFits(b[1]) === true) - (offerFits(a[1]) === true) || a[0] - b[0]);
  return `<div class="sec"><h4>${tl('Gruppen & Kurse')}</h4><ol class="list">${fitsFirst.slice(0, 8).map(([d, o]) => offerItem(o, d)).join('')}</ol>
    ${list.length > 8 ? `<p class="note">${tl('und {n} weitere', { n: list.length - 8 })}</p>` : ''}<p class="note">${tl('Anmeldung und aktuelle Infos beim Anbieter.')}</p></div>`;
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
    const photoIds = [], file = $('#revPhoto').files[0];
    if (file) {
      if (!file.type.startsWith('image/')) { err.textContent = tl('Bitte wähle ein Bild aus (JPG oder PNG).'); err.hidden = false; return; }
      try { const pid = uid('ph_'); await photoDB.put(pid, await compressPhoto(file)); photoIds.push(pid); }
      catch (x) { err.textContent = tl('Das Foto konnte nicht gespeichert werden. Versuch es ohne Foto.'); err.hidden = false; return; }
    }
    store.reviews.push({ id: uid('r_'), placeId: id, stars, text: $('#revText').value.trim(), photoIds, at: Date.now() });
    save(); toast('Bewertung gespeichert.'); back();
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
    <p class="note">${tl('Dein E-Mail-Programm öffnet sich. Du siehst alles, bevor du es abschickst.')}</p>
    <div class="sticky-bar"><button type="button" class="btn big primary" data-reportsend="1">${tl('E-Mail vorbereiten')}</button></div>`;
}
function sendPlaceReport() {
  const v = view(), p = byId.get(v.id);
  if (!v.reason) { $('#repErr').hidden = false; return; }
  const body = [`${tl('Ort:')} ${p.name}`, `${tl('Kennung:')} ${p.id}`, `${tl('Grund:')} ${v.reason}`, $('#repText').value.trim()].filter(Boolean).join('\n');
  location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent('Djuu: Ort melden')}&body=${encodeURIComponent(body)}`;
  back();
}

// filters
const RARE_BELOW = 10;
const CORE_FILTERS = new Set(['jetzt', 'sonntag', 'wickeltisch', 'stillen', 'hochstuhl', 'spielecke', 'kindermenue', 'kinderwagen', 'toilette', 'kleinkind', 'eingezaeunt', 'wasser', 'hund', 'age_fit', 'age_0', 'age_3', 'age_6']);
function filtersView() {
  const first = [...state.groups][0];
  const fits = a => !a.groups || !state.groups.size || [...state.groups].some(g => a.groups.includes(g));
  const sel = places.filter(inSelection), counts = new Map();
  const count = id => { if (!counts.has(id)) { let n = 0; for (const p of sel) if (filterVal(p, id) === true) n++; counts.set(id, n); } return counts.get(id); };
  // Nothing here: gone. Few here and not a core question for parents: further down, under "Seltene Angaben".
  const rare = [];
  const chipFor = x => `<button type="button" class="chip${state.filters.has(x.id) ? ' on' : ''}" data-filter="${x.id}">${esc(x.label)} <span class="n">${nf.format(count(x.id))}</span></button>`;
  const block = (title, all, sorted = false) => {
    const live = all.filter(x => state.filters.has(x.id) || count(x.id) > 0);
    const main = live.filter(x => state.filters.has(x.id) || CORE_FILTERS.has(x.id) || count(x.id) >= RARE_BELOW);
    rare.push(...live.filter(x => !main.includes(x)));
    if (sorted) main.sort((a, b) => (store.profile.dogs > 0 ? (b.id === 'hund') - (a.id === 'hund') : 0) || CORE_FILTERS.has(b.id) - CORE_FILTERS.has(a.id) || count(b.id) - count(a.id));
    return main.length ? `<div class="sec"><h4>${title}</h4><div class="fgrid">${main.map(chipFor).join('')}</div></div>` : '';
  };
  const total = last.match.length + (state.showUnknown ? last.unknown.length : 0);
  const timeBlock = block(tl('Öffnungszeiten'), TIME_FILTERS);
  const attrBlock = block(tl('Ausstattung'), ATTRS.filter(fits), true);
  const ageBlock = !state.groups.size || ['spielen', 'entdecken', 'familie'].some(g => state.groups.has(g)) ? block(tl('Alter'), AGE_FILTERS.filter(a => !a.family || hasFamily())) : '';
  const gearBlock = !state.groups.size || state.groups.has('spielen') ? block(tl('Spielgeräte'), GEAR, true) : '';
  return `${head(tl('Filter'), state.groups.size ? tl('für ') + [...state.groups].map(g => GROUP[g].label).join(', ') : tl('für alle Orte'))}
    <p class="muted text">${tl('Die Zahl zeigt, bei wie vielen Orten wir es sicher wissen. Es können mehr sein.')}</p>
    ${ioAllowed() ? `<div class="sec"><h4>${tl('Drinnen oder draußen')}</h4><div class="fgrid">${[['drinnen', 'house', tl('Drinnen')], ['draussen', 'tree', tl('Draußen')]].map(([id, ic, l]) => `<button type="button" class="chip${state.io === id ? ' on' : ''}" data-io="${id}">${svg(ic)}${l}</button>`).join('')}</div></div>` : ''}
    ${timeBlock}${attrBlock}${ageBlock}${gearBlock}
    ${rare.length ? `<details class="fold"><summary>${tl('Seltene Angaben')}</summary><div class="fgrid" style="margin-top:10px">${rare.map(chipFor).join('')}</div></details>` : ''}
    <label class="switch" for="unkSwitch">${tl('Orte ohne Angabe blass zeigen')} <input type="checkbox" id="unkSwitch" ${state.showUnknown ? 'checked' : ''}></label>
    <div class="sticky-bar"><button type="button" class="btn" data-reset="1">${tl('Zurücksetzen')}</button><button type="button" class="btn big primary" data-home="peek">${nf.format(total)} ${tl('Orte zeigen')}</button></div>`;
}
// area
function areaView() {
  const a = state.area, n = last.match.length;
  const chip = (attrs, on, label) => `<button type="button" class="chip${on ? ' on' : ''}" ${attrs}>${label}</button>`;
  return `${head(tl('Gebiet'), tl('Wo sollen wir suchen?'))}
    <div class="fgrid">${chip('data-area="all"', a.type === 'all', tl('Ganz Hamburg'))}</div>
    <div class="sec"><h4>${tl('Umkreis')}</h4>
      <div class="fgrid">${[500, 1000, 2000, 5000].map(r => chip(`data-radius="${r}"`, a.type === 'radius' && a.r === r, fmtR(r))).join('')}</div>
      <div class="fgrid" style="margin-top:8px">${chip('data-center="me"', a.type === 'radius' && a.center === 'me', svg('locate') + tl('um mich'))}${chip('data-center="pick"', a.type === 'radius' && a.center !== 'me', svg('pin') + tl('um einen Punkt auf der Karte'))}</div></div>
    <div class="sec"><h4>${tl('Eigenes Gebiet')}</h4>
      <button type="button" class="btn${a.type === 'poly' ? ' primary' : ''}" data-draw="1">${svg('edit')}${a.type === 'poly' ? tl('Neu einzeichnen') : tl('Auf der Karte einzeichnen')}</button></div>
    <div class="sec"><h4>${tl('Stadtteil')}</h4>
      <div class="field" style="margin-top:0"><input id="distQ" type="search" placeholder="${tl('Stadtteil suchen, z. B. Ottensen')}" autocomplete="off"></div>
      <div class="fgrid" id="distList">${districtChips('')}</div></div>
    <div class="sticky-bar"><button type="button" class="btn big primary" data-home="peek">${nf.format(n)} ${tl('Orte zeigen')}</button></div>`;
}
function districtChips(q) {
  q = q.trim().toLowerCase();
  const list = districtList().filter(d => !q || d.toLowerCase().includes(q));
  return list.slice(0, q ? 40 : 200).map(d => `<button type="button" class="chip${state.area.type === 'district' && state.area.name === d ? ' on' : ''}" data-district="${esc(d)}">${esc(d)}</button>`).join('') || `<p class="muted text">${tl('Kein Stadtteil gefunden.')}</p>`;
}
function drawView() {
  const n = state.drawing.length;
  return `<p class="text drawhint"><b>${tl('Tippe auf die Ecken des Gebiets.')}</b> ${n ? `${n} ${n === 1 ? tl('Ecke') : tl('Ecken')} gesetzt.` : ''}${n && n < 3 ? tl(' Mindestens 3 nötig.') : ''}</p>
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
  playground: ['spielplatz'], spielplaetze: ['spielplatz'], rutschen: ['rutsche'], schaukeln: ['schaukel'], sandkiste: ['sandkasten'], indoor: ['indoorspielplatz', 'drinnen'], indoorspielplatz: ['indoorspielplatz'], regen: ['indoorspielplatz', 'spielhaus', 'museen', 'drinnen'], toben: ['spielplatz', 'indoorspielplatz', 'trampolin'], kindergeburtstag: ['indoorspielplatz', 'trampolin', 'kindercafe'], bouldern: ['klettern'], fussball: ['bolzplatz'], bolzen: ['bolzplatz'], basketball: ['bolzplatz'], ping: ['tischtennis'], sport: ['sportanlagen', 'sportvereine'], turnen: ['sportvereine'], pferde: ['reiten'], ponyhof: ['reiten'], schlitten: ['rodeln'], rodelberg: ['rodeln'],
  cafe: ['cafe'], kaffee: ['cafe'], kuchen: ['kuchen', 'cafe'], eisdiele: ['eis'], eiscafe: ['eis'], essen: ['restaurant', 'imbiss', 'cafe'], restaurants: ['restaurant'], fruehstuecken: ['fruehstueck'], brunch: ['fruehstueck'], pommes: ['imbiss'], doener: ['imbiss'], pizzeria: ['pizza'], spielcafe: ['kindercafe'], familiencafe: ['kindercafe'], vegetarier: ['vegetarisch'], terrasse: ['draussen'],
  kultur: ['museen', 'kultur'], ausstellung: ['museen', 'museum'], theater: ['theater'], kino: ['theater', 'kino'], bibliothek: ['buecherhallen', 'buecherhalle'], buecherei: ['buecherhallen', 'buecherhalle'], wald: ['natur', 'park'], wiese: ['park', 'natur'], natur: ['natur', 'park'], gruenanlage: ['park'], ausflug: ['ausflugsziele', 'tiere', 'museen'], faehre: ['faehren', 'faehranleger'], boot: ['bootsverleih'], grillen: ['picknick'],
  hund: ['hunde', 'hundeauslauf'], hunde: ['hunde', 'hundeauslauf'], gassi: ['hundeauslauf'], kindergarten: ['kita'], kitas: ['kita'], grundschule: ['schule'], schulen: ['schule'], musikunterricht: ['musikschulen'], tanzen: ['tanzschulen'], ballett: ['tanzschulen'], beratungsstelle: ['beratung'], familienzentrum: ['familienzentren'], elternschule: ['elternschulen'],
  krabbelgruppe: ['krabbel', 'spielgruppe'], babykurs: ['babymassage', 'pekip', 'krabbel'], kurs: ['kurs'], kurse: ['kurs'], babyschwimmen: ['babyschwimmen'], geburtsvorbereitung: ['geburtsvorbereitung'], flohmarkt: ['flohmarkt', 'basar'], basar: ['flohmarkt', 'basar'], laterne: ['laternenumzug'], vorlesen: ['vorlesen', 'bilderbuch'],
  kinderwagen: ['kinderwagen'], fahrstuhl: ['aufzug'], lift: ['aufzug'], bus: ['haltestelle'], bahn: ['haltestelle', 'bahnhof'], ubahn: ['haltestelle', 'bahnhof'], sbahn: ['haltestelle', 'bahnhof'], station: ['haltestelle', 'bahnhof'],
};
const PHRASES = { 'u bahn': 'ubahn', 's bahn': 'sbahn', 'ice cream': 'eis', 'wc anlage': 'wc', 'spiel platz': 'spielplatz', 'kinder arzt': 'kinderarzt', 'kinder cafe': 'kindercafe' };
// Places with this tag are what the word really means, not those that merely share a word with its synonyms.
const INTENT = { zoo: 'tiere', tierpark: 'tiere', tiergarten: 'tiere', wildpark: 'tiere', streichelzoo: 'tiere', bauernhof: 'tiere', kinderbauernhof: 'tiere', aquarium: 'tiere', regen: 'drinnen', ubahn: 'bahnhof', sbahn: 'bahnhof', bahn: 'bahnhof' };
const OPEN_WORDS = new Set(['offen', 'geoeffnet', 'jetzt']);
const SUNDAY_WORDS = new Set(['sonntag', 'sonntags']);
// Places that are rarely what someone means by a word in their name.
const LOW_RANK = new Set(['haltestelle', 'bahnhof', 'aufzug', 'spielstrasse', 'faehre']);
let SI = null;
function searchIndex() {
  if (SI) return SI;
  const name = new Map(), meta = new Map(), low = new Map();
  const add = (m, text, i) => { for (const w of words(text)) { let l = m.get(w); if (!l) m.set(w, l = []); if (l[l.length - 1] !== i) l.push(i); } };
  places.forEach((p, i) => {
    if (p.named) add(name, p.name, i);
    if (p.cat !== 'windeln') add(meta, CAT_LABEL[p.cat], i); // its tags say which kind of shop it is
    for (const t of p.tags) add(meta, TAG_LABEL[t], i);
    if (p.gear) for (const g of GEAR) if (p.gear.has(g.id)) add(meta, g.label, i);
    for (const a of ATTRS) if (!a.id.endsWith('_nahe') && attrVal(p, a.id).v === 'yes') add(meta, a.label, i);
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
  const all = n.split(' ').filter(Boolean), open = all.some(w => OPEN_WORDS.has(w)), sunday = all.some(w => SUNDAY_WORDS.has(w));
  const tokens = all.filter(w => !STOP.has(w) && !OPEN_WORDS.has(w) && !SUNDAY_WORDS.has(w));
  return { tokens, open, sunday };
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
  const { tokens, open, sunday } = parseQuery(q), st = { fuzzy: false };
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
    if (open && isOpen(p.oh) !== true) continue;
    if (sunday && opensSunday(p.oh) !== true) continue;
    let s = s0 + (p.f.tipp ? 4 : 0) + (p.named ? 0 : -3);
    if (tokens.some(t => p.tags.has(INTENT[t]))) s += 25;
    if (tokens.some(t => [t, ...(SYN[t] || [])].some(w => words(CAT_LABEL[p.cat]).includes(w)))) s += 12;
    const n = norm(p.name);
    if (nq && n === nq) s += 40; else if (nq && words(p.name).join(' ').startsWith(nq + ' ')) s += 15;
    if (LOW_RANK.has(p.cat) && !tokens.some(t => t.includes(p.cat) || (SYN[t] || []).includes(p.cat))) s *= .4;
    res.push({ p, s, d: dist(o, [p.lat, p.lon]) });
  }
  res.sort((a, b) => b.s - a.s || a.d - b.d);
  res.fuzzy = st.fuzzy;
  return res;
}
function searchOffers(q) {
  const { tokens } = parseQuery(q);
  if (!tokens.length) return [];
  const idx = searchIndex();
  if (!idx.offers) idx.offers = OFFERS.map(o => norm([o.title, titleOf(o), TOPIC_LABEL[o.topic], o.venue, o.provider].filter(Boolean).join(' ')));
  const typoKeys = t => { const m = typoMax(t); return m && !SYN[t] ? Object.keys(SYN).filter(k => typoDist(t, k, m) <= m).flatMap(k => SYN[k]) : []; };
  const terms = tokens.map(t => [t, ...(SYN[t] || []), ...typoKeys(t)]);
  const out = [];
  OFFERS.forEach((o, i) => {
    if (terms.every(ts => ts.some(w => idx.offers[i].includes(w)))) { const d = nextDate(o); if (d) out.push([d, o]); }
  });
  return out.sort((a, b) => a[0] - b[0]);
}
// Category and tag shortcuts for the search words.
function searchChips(tokens) {
  const terms = new Set(tokens.flatMap(t => [t, ...(SYN[t] || [])]));
  const hit = label => { const n = norm(label), ws = words(label); return [...terms].some(w => w.length > 3 ? n.includes(w) : ws.includes(w)); };
  return { gs: GROUPS.filter(g => hit(g.label)), ts: Object.entries(TAGS).flatMap(([gid, list]) => list.filter(t => hit(t.label)).map(t => [gid, t])).slice(0, 8), fs: ATTRS.filter(a => a.q && hit(a.label)).slice(0, 4), ds: districtList().filter(d => tokens.some(t => t.length > 2 && norm(d).includes(t))).slice(0, 4) };
}

// Voice input with the browser's own speech service; the button only appears where the browser offers one.
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function toggleMic() {
  if (rec) { rec.stop(); return; }
  const r = new Speech();
  r.lang = LOCALE; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
  const setBtn = on => { const b = $('#micBtn'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? tl('Spracheingabe beenden') : tl('Spracheingabe starten')); } };
  r.onresult = e => {
    const el = $('#q'); if (!el) return;
    el.value = [...e.results].map(x => x[0].transcript).join(' ').trim();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  r.onerror = e => toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? tl('Das Mikrofon ist nicht erlaubt. Bitte im Browser freigeben.') : e.error === 'no-speech' ? tl('Nichts gehört. Versuch es noch einmal.') : tl('Die Spracheingabe hat gerade nicht geklappt.'));
  r.onend = () => { rec = null; setBtn(false); };
  rec = r;
  try { r.start(); setBtn(true); } catch (e) { rec = null; toast('Die Spracheingabe hat gerade nicht geklappt.'); }
}

function searchView() {
  const catBlock = (m) => `<div class="sec"><h4>${m.label}</h4><div class="catgrid">${GROUPS.filter(g => g.mode === m.id).map(g => `<button type="button" class="catcard${state.groups.has(g.id) ? ' on' : ''}" data-group="${g.id}" style="--c:${g.color}"><span class="ic">${svg(g.icon, '')}</span>${esc(g.label)}</button>`).join('')}</div></div>`;
  return `${head(tl('Was sucht ihr?'), '', false)}
    <div class="searchfield">${svg('search')}<label for="q" class="sr">${tl('Suche')}</label><input id="q" type="search" placeholder="${tl('Ort, Stadtteil oder Thema, z. B. vegan')}" autocomplete="off" enterkeyhint="search" value="${esc(state.sq)}">${Speech ? `<button type="button" class="micbtn" id="micBtn" data-mic="1" aria-label="${tl('Spracheingabe starten')}" aria-pressed="false">${svg('mic')}</button>` : ''}</div>
    <div id="searchRes">${searchResults()}</div>
    <div id="searchHome"${state.sq ? ' hidden' : ''}>
      <div class="tools" style="margin-top:12px"><button type="button" class="tool${state.area.type !== 'all' ? ' on' : ''}" data-open="area">${svg('pin')}<span>${esc(areaLabel())}</span></button></div>
      ${MODES.map(catBlock).join('')}
      <div class="sec"><h4>${tl('Schnelle Fragen')}</h4><ol class="list">${PRESETS.map(p => `<li><button type="button" class="item" data-preset="${p.id}"><span class="badge" style="--c:var(--brand)">${svg(p.icon, '')}</span><span><h3>${esc(p.label)}</h3></span><span></span></button></li>`).join('')}</ol></div>
      <button type="button" class="btn" data-group-all="1">${tl('Alle Orte zeigen')}</button>
    </div>`;
}
function searchResults() {
  const q = state.sq.trim().toLowerCase();
  if (!q) return '';
  const { tokens } = parseQuery(q);
  const { gs, ts, fs, ds } = searchChips(tokens);
  const found = searchPlaces(q), ps = found.slice(0, 25).map(r => [r.d, r.p]), offers = searchOffers(q);
  return `${gs.length || fs.length || ts.length || ds.length ? `<div class="fgrid" style="margin:12px 0 10px">${gs.map(g => `<button type="button" class="chip" data-group-only="${g.id}">${esc(g.label)}</button>`).join('')}${ts.map(([gid, t]) => `<button type="button" class="chip" data-gtag="${gid}|${t.id}">${esc(GROUP[gid].label)}: ${esc(t.label)}</button>`).join('')}${ds.map(d => `<button type="button" class="chip" data-sdistrict="${esc(d)}">${svg('pin')}${esc(d)}</button>`).join('')}${fs.map(a => `<button type="button" class="chip" data-filter-only="${a.id}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    ${found.fuzzy && ps.length ? `<p class="note" style="margin:8px 0 0">${tl('Ähnliche Schreibweisen gezeigt.')}</p>` : ''}
    ${ps.length ? `<ol class="list">${ps.map(([d, p]) => itemHtml(p, d)).join('')}</ol>` : offers.length ? '' : `<div class="empty"><b>${tl('Keine Orte mit diesem Namen.')}</b>${tl('Versuch einen anderen Begriff.')}</div>`}
    ${offers.length ? `<div class="sec"><h4>${tl('Kurse und Termine')}</h4><ol class="list">${offers.slice(0, 6).map(([d, o]) => offerItem(o, d)).join('')}</ol>${offers.length > 6 ? `<p class="note">${tl('und')} ${nf.format(offers.length - 6)} ${tl('weitere im Tab Termine')}</p>` : ''}</div>` : ''}`;
}

// urgent
const SOS = [
  { id: 'wc', label: tl('Toilette'), title: tl('Nächste Toilette'), icon: 'toilet', color: '#0C8599', test: p => (p.cat === 'wc' || attrVal(p, 'toilette').v === 'yes') && isOpen(p.oh) !== false, hint: tl('öffentlich oder im Café') },
  { id: 'wickeln', label: tl('Wickeltisch'), title: tl('Nächster Wickeltisch'), icon: 'baby', color: '#0CA678', test: p => attrVal(p, 'wickeltisch').v === 'yes' && isOpen(p.oh) !== false, hint: tl('sicher bekannte Plätze') },
  { id: 'windeln', label: tl('Windeln'), title: tl('Windeln: nächster offener Laden'), icon: 'bag', color: '#1971C2', test: p => (p.cat === 'windeln' || p.cat === 'apotheke') && isOpen(p.oh) === true, hint: tl('jetzt geöffnet') },
  { id: 'apotheke', label: tl('Apotheke'), title: tl('Nächste offene Apotheke'), icon: 'pill', color: '#E03131', test: p => p.cat === 'apotheke' && isOpen(p.oh) === true, hint: tl('jetzt geöffnet') },
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
    if (Math.abs(p.lat - o[0]) > 0.03 || Math.abs(p.lon - o[1]) > 0.05) continue;
    if (s.test(p)) near.push([dist(o, [p.lat, p.lon]), p]);
  }
  near.sort((a, b) => a[0] - b[0]);
  if (!near.length) return `${head(s.label)}<div class="empty"><b>${tl('Nichts in der Nähe bekannt.')}</b>${tl('Zoom raus oder versuch eine andere Kachel.')}</div>${calls}`;
  const [d, p] = near[0];
  return `${head(s.title, state.me ? tl('Ab deinem Standort') : tl('Ab Kartenmitte'))}
    <div class="best"><span class="muted">${esc(CAT_LABEL[p.cat] || '')}</span><b style="font-size:18px">${esc(p.name)}</b>
      <span class="mins">${walkMin(d)} ${tl('Min.')}</span><span class="muted">${fmtDist(d)} ${tl('zu Fuß')}${p.oh ? ' · ' : ''}${openText(p)}</span>
      <a class="btn big primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking" target="_blank" rel="noopener">${svg('route')}${tl('Route starten')}</a>
      <button type="button" class="btn" data-id="${p.id}">${tl('Details')}</button></div>
    ${near.length > 1 ? `<div class="sec"><h4>${tl('Weitere in der Nähe')}</h4><ol class="list">${near.slice(1, 5).map(([dd, pp]) => itemHtml(pp, dd)).join('')}</ol></div>` : ''}${calls}`;
}

// events
function nextDow(dow, plusWeeks = 0) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7) + plusWeeks * 7); return d; }
const EXAMPLE_EVENTS = [
  { d: nextDow(6), time: '10:00–13:00', title: tl('Kinderflohmarkt von Eltern für Eltern'), where: tl('Eimsbüttel'), kind: tl('Flohmarkt') },
  { d: nextDow(3), time: '16:00', title: tl('Bilderbuchkino ab 3 Jahren'), where: tl('Bücherhalle'), kind: tl('Lesen') },
  { d: nextDow(0), time: '11:00', title: tl('Familienkonzert: Klassik für Kleine'), where: tl('Konzertsaal'), kind: tl('Musik') },
  { d: nextDow(6, 1), time: '09:00–14:00', title: tl('Kinderkleiderbasar Herbst/Winter'), where: tl('Winterhude'), kind: tl('Flohmarkt') },
];
// ---------- Termine: four pages (Alle, Gruppen, Kurse, Einmalig), search, one filter sheet (design: djuu-termine-filter PDF) ----------
// Kept while the app is open, so a look at one offer does not reset the list.
const EV = { page: 'alle', q: '', when: '', from: '', to: '', days: new Set(), f: new Set(), topics: new Set(), limit: 60 };
const EV_PAGES = [['alle', tl('Alle')], ['gruppe', tl('Gruppen')], ['kurs', tl('Kurse')], ['termin', tl('Einmalig')]];
const EV_UNIT = { alle: [tl('Termin'), tl('Termine')], termin: [tl('Termin'), tl('Termine')], gruppe: [tl('Gruppe'), tl('Gruppen')], kurs: [tl('Kurs'), tl('Kurse')] };
const unitOf = n => { const u = EV_UNIT[EV.page][n === 1 ? 0 : 1]; return LANG === 'de' ? u : u.toLowerCase(); }; // German nouns keep their capital
const cardPage = () => EV.page === 'gruppe' || EV.page === 'kurs';
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
  if (id === 'datum' && EV.from) { const a = new Date(EV.from + 'T00:00'), b = EV.to ? new Date(EV.to + 'T00:00') : a; return [a < t ? t : a, b < a ? a : b]; }
  return null;
}
// first day in [a, b] the offer takes place
function firstIn(o, a, b) {
  for (let d = new Date(a), i = 0; d <= b && i < 200; d.setDate(d.getDate() + 1), i++) if (occursOn(o, d)) return new Date(d);
  return null;
}
// weekly offers with more than one date (a group that meets once is not recurring)
const isRecurring = o => o.kind !== 'termin' && o.weekday != null && !(o.start_date && o.start_date === o.end_date);
const hourOf = o => o.time_from ? +o.time_from.slice(0, 2) : null;
const ageIs = (x, y) => o => (o.age_min_m != null || o.age_max_m != null) && (o.age_min_m ?? 0) < y && (o.age_max_m ?? 999) > x;
const fitNames = () => familyAges().filter(k => k.months >= 0).map(k => `${k.name} (${kidLabel(k.months).replace(' Jahre', ' J.').replace(' Monate', tl(' Mon.'))})`).join(', ');
// Filter sections: inside one section any choice may match, across sections all must. Order as in the sheet (Thema sits between Alter and Preis).
const EV_SECTIONS = [
  { id: 'time', title: tl('Uhrzeit'), any: true, two: true, items: [['vormittag', tl('Vormittag'), o => hourOf(o) != null && hourOf(o) < 12], ['mittag', tl('Mittag'), o => hourOf(o) >= 12 && hourOf(o) < 15],
    ['nachmittag', tl('Nachmittag'), o => hourOf(o) >= 15 && hourOf(o) < 18], ['abend', tl('Abend'), o => hourOf(o) >= 18]] },
  { id: 'aud', title: tl('Für wen'), any: true, items: [['kinder', tl('Für Kinder'), o => o.audience === 'kinder'], ['erwachsene', tl('Für Erwachsene'), o => o.audience === 'erwachsene']] },
  { id: 'age', title: tl('Alter'), any: true, two: true, show: () => EV.f.has('kinder'), note: tl('Nur Termine, bei denen der Anbieter ein Alter nennt.'),
    items: [['fit', () => tl('Passt zu ') + fitNames(), o => offerFits(o) === true, () => hasFamily() && familyAges().some(k => k.months >= 0)],
      ['a0', tl('bis 1'), ageIs(0, 12)], ['a1', '1–2', ageIs(12, 36)], ['a3', '3–5', ageIs(36, 72)], ['a6', '6–9', ageIs(72, 120)], ['a10', '10+', ageIs(120, 216)]] },
  { id: 'price', title: tl('Preis & Anmeldung'), items: [['frei', tl('kostenlos'), o => o.free === 1], ['offen', tl('ohne Anmeldung'), o => o.registration === 'offen']] },
];
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
  return skip === 'topic' || !EV.topics.size || EV.topics.has(o.topic);
}
// offers of the current page as [date, offer]: day pages one row per date in the range (or next 8 weeks), card pages one card per offer.
// raw = without Wann/Wochentag, Ort and search (for which topics exist on this page at all)
function evBase(raw = false, skipPlace = false) {
  const t = today0(), r = raw ? null : rangeOf(), p = EV.page;
  const own = p === 'alle' || p === 'termin' ? store.events.map(e => ({ title: e.title, kind: 'termin', start_date: e.date, time_from: e.time, lat: e.lat, lon: e.lon, venue: tl('von dir eingetragen'), topic: 'sonstiges', own: true })) : [];
  let list = OFFERS.filter(o => p === 'alle' || o.kind === p).concat(own)
    .map(o => [r ? firstIn(o, r[0], r[1]) : nextDate(o), o]).filter(([d]) => d && (r || d - t < (cardPage() ? 120 : 56) * 864e5));
  if (raw) return list;
  if (cardPage() && EV.days.size) list = list.filter(([, o]) => EV.days.has(o.weekday));
  if (!skipPlace) list = list.filter(([, o]) => evPlaceOk(o));
  const q = words(EV.q).filter(w => !STOP.has(w));
  if (q.length) list = list.filter(([, o]) => { const n = norm([o.title, titleOf(o), o.venue, o.provider, TOPIC_LABEL[o.topic]].filter(Boolean).join(' ')); return q.every(w => n.includes(w)); });
  // what is over today is gone: end time passed, or one hour after the start when no end is known
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const endMin = o => o.time_to ? +o.time_to.slice(0, 2) * 60 + +o.time_to.slice(3, 5) : o.time_from ? timeKey(o) + 60 : 24 * 60;
  return list.filter(([d, o]) => +d !== +t || endMin(o) > nowMin);
}
const evResults = () => evBase().filter(([, o]) => o.own || evPass(o));
function evActiveCount() {
  let n = (cardPage() ? EV.days.size : (EV.when ? 1 : 0)) + EV.topics.size + (EV.place.mode !== 'all' ? 1 : 0);
  for (const sec of EV_SECTIONS) if (sectionOn(sec)) n += sec.items.filter(it => EV.f.has(it[0]) && itemOn(it)).length;
  return n;
}

// ---------- the page ----------
function eventsView() {
  const nf_ = evActiveCount();
  return `<div class="ph"><h2>${tl('Termine')}<span class="sub">${tl('Gruppen, Kurse & Events in Hamburg')}</span></h2></div>
    <div class="evtabs" role="tablist">${EV_PAGES.map(([id, l]) => `<button type="button" role="tab" aria-selected="${EV.page === id}" class="${EV.page === id ? 'on' : ''}" data-evpage="${id}">${l}</button>`).join('')}</div>
    <div class="evbar"><label class="evsearch">${svg('search')}<input id="evQ" type="search" placeholder="${tl('Suchen')}" value="${esc(EV.q)}" autocomplete="off" aria-label="${tl('Termine durchsuchen')}"></label>
      <button type="button" class="evfilterbtn${nf_ ? ' on' : ''}" data-open="evfilters">${svg('filter')}${tl('Filter')}${nf_ ? ` <span class="count">${nf_}</span>` : ''}</button></div>
    <div id="evList">${evListHtml()}</div>
    <button type="button" class="btn" data-addevent="1" style="margin-top:14px">${svg('plus')}${tl('Veranstaltung eintragen')}</button>
    <p class="note">${tl('Quellen: Eltern-Kind-Zentren, Elternschulen, Familienbildung, Bücherhallen, Bäderland u. a. Anmeldung immer beim Anbieter.')}</p>`;
}
function evListHtml() {
  const list = evResults(), o0 = origin(), t = today0();
  const near = o => { const pl = o.place_id && byId.get(o.place_id); return pl ? dist(o0, [pl.lat, pl.lon]) : o.lat ? dist(o0, [o.lat, o.lon]) : 9e9; };
  list.sort((a, b) => byDayTime(a, b) || near(a[1]) - near(b[1]));
  const shown = list.slice(0, EV.limit), r = rangeOf();
  return `<p class="evcount">${nf.format(list.length)} ${unitOf(list.length)}${DATA_AT.offers ? ` · <span class="freshinline">${svg('check')}${esc(tl('{when} aktualisiert', { when: freshText() }))}</span>` : ''}</p>
    ${cardPage() ? '' : ferienCard(14, true)}
    ${!cardPage() && schoolHoliday(r?.[0] || t) ? `<p class="note" style="margin:0 0 10px">${esc(schoolHoliday(r?.[0] || t))}${tl(': Viele Kurse pausieren, bitte beim Anbieter nachsehen.')}</p>` : ''}
    ${list.length ? (cardPage() ? `<ol class="list evcards">${shown.map(([d, o]) => evCardHtml(o, d)).join('')}</ol>` : dayListHtml(shown))
      + (list.length > EV.limit ? `<button type="button" class="more" data-emore="1">${tl('Mehr anzeigen')}</button>` : '')
      : `<div class="empty"><b>${OFFERS.length ? tl('Nichts gefunden.') : tl('Noch keine Termine geladen.')}</b>${OFFERS.length ? tl('Probier eine andere Suche oder weniger Filter.') : ''}</div>`}`;
}
// tags under a title: age, recurring, registration, price
function evTags(o, withRecurring) {
  const kids = o.audience === 'erwachsene' ? tl('für Erwachsene') : ageLabel(o.age_min_m, o.age_max_m);
  const fits = offerFits(o) === true, n = o.id ? visitsOf(o.id).length : 0;
  return [fits && `<span class="fitchip">${tl('passt zu euch')}</span>`, n && `<span class="visitchip">${n === 1 ? tl('wart ihr schon') : n + '× dabei'}</span>`,
    kids && `<span>${esc(kids)}</span>`,
    withRecurring && isRecurring(o) && `<span class="tag rec">${svg('repeat')}${o.kind === 'kurs' ? tl('Kurs') : tl('Gruppe')} · ${tl('jeden {day}', { day: WD_LONG[o.weekday] })}</span>`,
    o.registration === 'nötig' && `<span class="tag reg">${svg('edit')}${tl('Anmeldung nötig')}</span>`,
    o.registration === 'offen' && `<span class="tag ok">${svg('check')}${tl('ohne Anmeldung')}</span>`,
    o.registration === 'Warteliste' && `<span class="tag reg">${tl('Warteliste')}</span>`,
    o.free === 1 && `<span>${tl('kostenlos')}</span>`].filter(Boolean).join('');
}
const timeRange = o => o.time_from ? `${o.time_from}${o.time_to ? '–' + o.time_to : ''}` : '';
// one row in a day list (Alle, Einmalig, Gemerkt)
function evRowHtml(o, d) {
  const fam = topicFam(o.topic), tags = evTags(o, true);
  const inner = `<span class="evtime">${o.time_from ? esc(o.time_from) : `<small>${tl('ganztags')}</small>`}</span>
    <span><h3>${esc(titleOf(o))}</h3><span class="meta"><span class="ticon" style="--c:${fam[2]}">${svg(fam[1])}</span>${esc(TOPIC_LABEL[o.topic] || tl('Angebot'))}${o.venue ? ' · ' + esc(o.venue) : ''}${evDistText(o)}</span>
    ${tags ? `<span class="mini">${tags}</span>` : ''}</span>`;
  return o.id ? `<li class="offrow"><button type="button" class="item evrow" data-offer="${o.id}">${inner}</button>${saveBtn(o)}</li>` : `<li><div class="item evrow">${inner}</div></li>`;
}
// one card on the Gruppen and Kurse pages
function evCardHtml(o, nd) {
  const fam = topicFam(o.topic), time = timeRange(o);
  const rec = isRecurring(o) ? `${tl('Jeden')} ${WD_LONG[o.weekday]}${time ? ' · ' + time : ''}`
    : o.start_date && o.end_date && o.start_date !== o.end_date ? `${fmtShort(new Date(o.start_date + 'T00:00'))} bis ${fmtShort(new Date(o.end_date + 'T00:00'))}${time ? ' · ' + time : ''}`
    : `${tl('Einmal')}${time ? ' · ' + time : ''}`;
  return `<li class="offrow"><button type="button" class="evcard" data-offer="${o.id}">
      <span class="evicon" style="--c:${fam[2]}">${svg(fam[1])}</span>
      <span class="evcbody"><h3>${esc(titleOf(o))}</h3><span class="meta">${esc(TOPIC_LABEL[o.topic] || tl('Angebot'))}${o.venue ? ' · ' + esc(o.venue) : ''}${evDistText(o)}</span>
        <span class="rec">${svg('repeat')}${esc(rec)}</span>
        <span class="next">${tl('Nächster Termin:')} ${esc(fmtShort(nd))}${o.sessions ? ` · ${o.sessions} ${tl('Termine')}` : ''}</span>
        <span class="mini">${evTags(o, false)}</span></span></button>${saveBtn(o)}</li>`;
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
  const section = sec => {
    if (!sectionOn(sec)) return '';
    const chip = it => { const on = EV.f.has(it[0]), n = count(sec, it[2]); return `<button type="button" class="${chipCls(on, n)}" data-evf="${it[0]}" aria-pressed="${on}"${!on && n === 0 ? ' disabled' : ''}>${chipInner(on, itemLabel(it[1]), n)}</button>`; };
    const items = sec.items.filter(itemOn), wide = items.filter(it => it[0] === 'fit'), row = items.filter(it => it[0] !== 'fit');
    // time and age: one row of equal boxes as in the design; "Passt zu Mia" gets its own line
    return `<div class="sec"><h4>${sec.title}</h4>${wide.length ? `<div class="fgrid" style="margin-bottom:8px">${wide.map(chip).join('')}</div>` : ''}
      <div class="fgrid${sec.two ? ' two' : ''}"${sec.two ? ` style="grid-template-columns:repeat(${row.length},1fr)"` : ''}>${row.map(chip).join('')}</div>${sec.note ? `<p class="note">${sec.note}</p>` : ''}</div>`;
  };
  const when = cardPage()
    ? `<div class="sec"><h4>${tl('Wochentag')}</h4><div class="fgrid days">${WD.map((l, i) => `<button type="button" class="chip round${EV.days.has(i) ? ' on' : ''}" data-evday="${i}" aria-pressed="${EV.days.has(i)}" aria-label="${WD_LONG[i]}">${EV.days.has(i) ? svg('check') : ''}${l}</button>`).join('')}</div></div>`
    : `<div class="sec"><h4>${tl('Wann')}</h4><div class="fgrid when">${[['heute', tl('Heute')], ['morgen', tl('Morgen')], ['wochenende', tl('Wochenende')], ['woche', tl('Woche')]].map(([id, l]) => `<button type="button" class="chip${EV.when === id ? ' on' : ''}" data-evwhen="${id}" aria-pressed="${EV.when === id}">${chipInner(EV.when === id, l)}</button>`).join('')}
        <button type="button" class="chip round${EV.when === 'datum' ? ' on' : ''}" data-evwhen="datum" aria-pressed="${EV.when === 'datum'}" aria-label="${tl('Zeitraum wählen')}">${svg('cal')}</button></div>
        ${EV.when === 'datum' ? `<div class="evrange"><label>von <input id="evFrom" type="date" value="${esc(EV.from)}" min="${ymd(today0())}"></label><label>bis <input id="evTo" type="date" value="${esc(EV.to)}" min="${esc(EV.from || ymd(today0()))}"></label></div>` : ''}</div>`;
  const { page, live } = evTopicCounts(), all = Object.keys(page);
  const top = all.sort((a, b) => page[b] - page[a]).slice(0, 4);
  for (const t of EV.topics) if (page[t] && !top.includes(t)) top.push(t);
  const topic = all.length ? `<div class="sec"><div class="sechead"><h4>${tl('Thema')}</h4><span>${EV.topics.size ? `${EV.topics.size} ${tl('gewählt')}` : tl('Mehrere möglich')}</span></div>
      <div class="fgrid">${top.map(t => topicChip(t, live[t] || 0)).join('')}</div>
      ${all.length > top.length ? `<button type="button" class="morelink" data-open="evtopics">${tl('Alle')} ${all.length} ${tl('Themen')} ${svg('back')}</button>` : ''}</div>` : '';
  const place = evPlaceHtml();
  return `<div class="ph sheethead"><h2>${tl('Filter')}</h2><button type="button" class="round" data-back="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    ${when}${section(EV_SECTIONS[0])}${section(EV_SECTIONS[1])}${section(EV_SECTIONS[2])}${topic}${section(EV_SECTIONS[3])}${place}
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
// Ganz Hamburg, several Stadtteile (by the coordinates of the offer), or a radius around home (or, for one search, the current position).
// Home is kept on this phone only, as the centre of a postcode or Stadtteil, and never goes to the server or the family.
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
EV.place = { mode: 'all', districts: new Set(), km: 5, gps: null };
EV.placeTab = 'stadtteil';
EV.pending = new Set(); EV.dq = '';
const KMS = [1, 2, 5, 10, 20];
// the place the radius is measured from: chosen in the filter, else the one marked "Standard für Suchen", else the first
const searchPlace = () => { const ps = (store.places || []).filter(p => p.lat); return ps.find(p => p.id === EV.place.placeId) || ps.find(p => p.def) || ps[0] || null; };
const homeOf = () => { const p = searchPlace(); return p ? { label: `${tl(p.name)} (${p.plz})`, lat: p.lat, lon: p.lon } : null; };
const radiusOrigin = () => EV.place.gps || (homeOf() ? [homeOf().lat, homeOf().lon] : null);
function evPlaceOk(o) {
  const P = EV.place;
  if (P.mode === 'districts') return P.districts.has(offerDistrict(o));
  if (P.mode === 'radius') { const c = radiusOrigin(), p = offerPos(o); return !!(c && p && dist(c, p) <= P.km * 1000); }
  return true;
}
const kmText = km => String(km).replace('.', ',') + ' km';
// distance shown in lists and cards while the radius is on
const evDistText = o => { if (EV.place.mode !== 'radius') return ''; const c = radiusOrigin(), p = offerPos(o); return c && p ? ' · ' + fmtDist(dist(c, p)) : ''; };

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
  const h = homeOf();
  return `<div class="field"><label for="${id}">${tl('Zuhause')}</label>
    <input id="${id}" data-home="1" list="homeList" autocomplete="off" placeholder="${tl('PLZ oder Stadtteil, z. B. 20535')}" value="${esc(h?.label || '')}">
    <datalist id="homeList">${GEO.plz.map(p => `<option value="${p[0]} (${esc(p[3])})"></option>`).join('')}${GEO.stadtteile.map(s => `<option value="${esc(s[0])}"></option>`).join('')}</datalist>
    <p class="note">${tl('PLZ oder Stadtteil reicht. Wird als „Zuhause“ unter Wir › Meine Orte gespeichert.')}</p></div>`;
}
function meineInfosHtml() {
  const h = homeOf();
  return `<div class="sec"><h4>${tl('Meine Infos')}</h4>
    <p class="muted text">${tl('Nur auf diesem Handy. Wird nicht mit der Familie geteilt.')}</p>
    <div class="field"><label for="langSel">${tl('Sprache · Language')}</label><select id="langSel">${Object.entries(LANGS).map(([c, n]) => `<option value="${c}"${c === LANG ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    ${homeFieldHtml('meHome')}
    ${h ? `<p class="note">${tl('Zuhause:')} ${esc(h.label)}${tl('. Djuu nutzt es für „Umkreis von zu Hause“ bei den Terminen.')} <button type="button" class="linkbtn" data-homeclear="1">${tl('Entfernen')}</button></p>` : ''}</div>`;
}
function setHome(value) {
  if (!String(value || '').trim()) return;
  const h = parseHome(value);
  if (!h) return toast('Nicht gefunden. Bitte eine Hamburger PLZ oder einen Stadtteil eingeben.');
  // becomes "Zuhause" in Meine Orte (postcode only; a Stadtteil gets its nearest postcode)
  const plz = (h.label.match(/\b\d{5}\b/) || [])[0] || GEO.plz.map(x => [dist([h.lat, h.lon], [x[1], x[2]]), x[0]]).sort((a, b) => a[0] - b[0])[0]?.[1] || '';
  const g = GEO.plz.find(x => x[0] === plz) || [plz, h.lat, h.lon];
  store.places.push({ id: pbId(), name: tl('Zuhause'), plz, address: '', lat: g[1], lon: g[2], shared: false, def: !store.places.some(p => p.def), mine: true });
  save();
  toast(`${tl('Zuhause:')} ${h.label}`);
  renderPanel();
}

// the Ort section of the filter sheet
function evPlaceHtml() {
  const P = EV.place, origin = radiusOrigin();
  const tab = `<div class="minitoggle" role="tablist" aria-label="${tl('Ort wählen über')}">${[['stadtteil', tl('Stadtteil')], ['umkreis', tl('Umkreis')]].map(([id, l]) =>
    `<button type="button" role="tab" aria-selected="${EV.placeTab === id}" class="${EV.placeTab === id ? 'on' : ''}" data-evplacetab="${id}">${l}</button>`).join('')}</div>`;
  const all = `<button type="button" class="chip${P.mode === 'all' ? ' on' : ''}" data-evplace="all" aria-pressed="${P.mode === 'all'}">${P.mode === 'all' ? svg('check') : svg('pin')}${tl('Ganz Hamburg')}</button>`;
  let body;
  if (EV.placeTab === 'stadtteil') {
    body = `<div class="fgrid">${all}${P.mode === 'districts' ? [...P.districts].map(d => `<button type="button" class="chip on" data-evdistrictx="${esc(d)}" aria-label="${esc(d)} entfernen">${svg('check')}${esc(d)} ${svg('close')}</button>`).join('') : ''}
      <button type="button" class="chip" data-open="evdistricts">${svg('pin')}${tl('Stadtteil wählen')}</button></div>`;
  } else if (!origin) {
    body = `<div class="fgrid">${all}</div>
      <p class="text" style="margin-top:10px"><b>${tl('Umkreis von zu Hause')}</b></p>${homeFieldHtml('evHome')}
      <button type="button" class="btn" data-evgps="1">${svg('locate')}${tl('Aktuellen Standort verwenden')}</button>
      <p class="note">${tl('Der aktuelle Standort gilt nur für diese Suche und wird nicht gespeichert.')}</p>`;
  } else {
    const on = k => P.mode === 'radius' && P.km === k;
    body = `<div class="fgrid">${all}${KMS.map(k => `<button type="button" class="chip${on(k) ? ' on' : ''}" data-evkm="${k}" aria-pressed="${on(k)}">${on(k) ? svg('check') : ''}${k} km</button>`).join('')}</div>
      <div class="kmcustom${P.mode === 'radius' && !KMS.includes(P.km) ? ' on' : ''}"><label for="evKm">${tl('Eigene km')}</label>
        <input id="evKm" type="number" min="0.5" max="50" step="0.5" inputmode="decimal" value="${P.mode === 'radius' && !KMS.includes(P.km) ? String(P.km) : ''}" placeholder="z. B. 3,5">
        <input id="evKmRange" type="range" min="0.5" max="50" step="0.5" value="${P.km}" aria-label="Umkreis in Kilometern, ${kmText(P.km)}"></div>
      ${!P.gps && (store.places || []).filter(p => p.lat).length > 1 ? `<div class="fgrid fromrow"><span class="muted">${tl('Von:')}</span>${store.places.filter(p => p.lat).map(p => `<button type="button" class="chip${searchPlace() === p ? ' on' : ''}" data-evorigin="${p.id}">${searchPlace() === p ? svg('check') : svg('pin')}${esc(tl(p.name))}</button>`).join('')}</div>` : ''}
      <p class="note">${tl('Luftlinie,')} ${P.gps ? tl('vom aktuellen Standort') : `${tl('von')} ${esc(homeOf().label)}`}.
        ${P.gps ? (homeOf() ? ` <button type="button" class="linkbtn" data-evgpsoff="1">${tl('Zuhause verwenden')}</button>` : '') : ` <button type="button" class="linkbtn" data-evgps="1">${tl('Aktuellen Standort verwenden')}</button>`}</p>`;
  }
  return `<div class="sec"><div class="sechead"><h4>${tl('Ort')}</h4>${tab}</div>${body}</div>`;
}
function setKm(v) {
  const km = Math.min(50, Math.max(0.5, Math.round(parseFloat(String(v).replace(',', '.')) * 2) / 2));
  if (!km) return;
  EV.place.km = km; EV.place.mode = 'radius'; EV.place.districts.clear();
}

// the Stadtteil page: every Stadtteil with results on this page, by Bezirk, several at once
function evDistrictCounts() {
  const page = {}, live = {};
  for (const [, o] of evBase(true)) { const d = offerDistrict(o); if (d) page[d] = (page[d] || 0) + 1; }
  for (const [, o] of evBase(false, true)) if (!o.own && evPass(o)) { const d = offerDistrict(o); if (d) live[d] = (live[d] || 0) + 1; }
  return { page, live };
}
function districtListHtml() {
  const { page, live } = evDistrictCounts(), q = norm(EV.dq.trim());
  const out = BEZIRKE.map(bz => {
    const names = GEO.stadtteile.filter(s => s[1] === bz && page[s[0]] && (!q || norm(s[0]).includes(q))).map(s => s[0]);
    if (!names.length) return '';
    const selectable = names.filter(n => live[n] || EV.pending.has(n)), allOn = selectable.length && selectable.every(n => EV.pending.has(n));
    return `<fieldset class="bezirk"><legend>${esc(bz)}</legend>
      <label class="drow all${allOn ? ' on' : ''}"><input type="checkbox" data-dall="${esc(bz)}"${allOn ? ' checked' : ''}${selectable.length ? '' : ' disabled'}><span class="dname">${tl('Alle in')} ${esc(bz)}</span></label>
      ${names.map(n => { const on = EV.pending.has(n), c = live[n] || 0, off = !on && !c;
        return `<label class="drow${on ? ' on' : ''}${off ? ' zero' : ''}"><input type="checkbox" data-dname="${esc(n)}"${on ? ' checked' : ''}${off ? ' disabled' : ''}><span class="dname">${esc(n)}</span><span class="n" aria-label="${c} Ergebnisse">${nf.format(c)}</span></label>`; }).join('')}
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
function evReset() { EV.when = ''; EV.from = ''; EV.to = ''; EV.days.clear(); EV.f.clear(); EV.topics.clear(); Object.assign(EV.place, { mode: 'all', gps: null }); EV.place.districts.clear(); renderPanel(); }

// Merken and "waren wir schon" for offers; a snapshot keeps a saved offer readable after it leaves the data.
const isSaved = id => store.savedOffers.some(x => x.id === id);
const visitsOf = id => store.visits[id] || [];
function toggleSaved(id) {
  const i = store.savedOffers.findIndex(x => x.id === id);
  if (i >= 0) store.savedOffers.splice(i, 1);
  else { const o = OFFER_BY_ID.get(id); store.savedOffers.push({ id, at: Date.now(), by: typeof meId === 'function' ? meId() : null, snap: { title: o.title, url: o.url, venue: o.venue, address: o.address, provider: o.provider, kind: o.kind, weekday: o.weekday, time_from: o.time_from, time_to: o.time_to, start_date: o.start_date, end_date: o.end_date } }); }
  save(); toast(i >= 0 ? tl('Nicht mehr gemerkt.') : tl('Gemerkt. Du findest es unter „Gemerkt“.'));
}
// all dates in the next months, for the offer page
function upcoming(o, max = 6) {
  const out = [], t = today0();
  for (let d = new Date(t), i = 0; i < 200 && out.length < max; d.setDate(d.getDate() + 1), i++) if (occursOn(o, d)) out.push(new Date(d));
  return out;
}
const REG_TEXT = { 'nötig': tl('Anmeldung nötig'), offen: tl('Ohne Anmeldung'), Warteliste: tl('Warteliste'), geschlossen: tl('Anmeldung geschlossen') };
function offerView(id) {
  const o = OFFER_BY_ID.get(id);
  if (!o) {
    const s = store.savedOffers.find(x => x.id === id);
    return `${head(tl('Termin'))}<div class="empty"><b>${tl('Diesen Termin finden wir nicht mehr.')}</b>${tl('Vielleicht ist er vorbei oder wurde abgesagt.')}</div>
      ${s ? `<p class="text">${esc(s.snap.title)}</p><a class="btn" href="${esc(s.snap.url)}" target="_blank" rel="noopener">${tl('Beim Anbieter nachsehen')}</a>
      <button type="button" class="btn" data-saveoffer="${esc(id)}" style="margin-top:8px">${tl('Nicht mehr merken')}</button>` : ''}`;
  }
  const v = view(), place = o.place_id && byId.get(o.place_id), dates = upcoming(o), saved = isSaved(id), visits = visitsOf(id), fits = offerFits(o);
  const d = state.me && (place || o.lat) ? dist(origin(), place ? [place.lat, place.lon] : [o.lat, o.lon]) : null;
  const time = o.time_from ? `${o.time_from}${o.time_to ? '–' + o.time_to : ''} ${tl('Uhr')}` : tl('Uhrzeit beim Anbieter');
  const who = o.audience === 'erwachsene' ? tl('Für Erwachsene') : ageLabel(o.age_min_m, o.age_max_m) ? tl('Für Kinder ') + ageLabel(o.age_min_m, o.age_max_m) : tl('Alter beim Anbieter nachsehen');
  return `<div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><span style="flex:1"></span>
      <button type="button" class="round" data-home="1" aria-label="${tl('Schließen')}">${svg('close')}</button></div>
    <div class="hero"><span class="datebox"><b>${dates[0] ? esc(fmtDay(dates[0])) : '–'}</b><span>${esc(o.time_from || '')}</span></span><div style="min-width:0">
      <h2 style="margin:0;font:600 23px/1.15 var(--font-display);text-wrap:balance">${esc(titleOf(o))}</h2>${titleOf(o) !== o.title ? `<p class="note orig" lang="de">${esc(o.title)}</p>` : ''}
      <div class="status-line"><span>${esc(TOPIC_LABEL[o.topic] || '')}${o.provider ? ' · ' + esc(o.provider) : ''}</span></div></div></div>
    <div class="acts">
      <button type="button" class="act${saved ? ' on' : ''}" data-saveoffer="${id}">${svg('heart')}${saved ? tl('Gemerkt') : tl('Merken')}</button>
      <button type="button" class="act${v.cal ? ' on' : ''}" data-calmenu="1">${svg('cal')}${tl('Kalender')}</button>
      <button type="button" class="act" data-shareoffer="${id}">${svg('share')}${tl('Teilen')}</button>
      <button type="button" class="act${visits.length ? ' on' : ''}" data-visit="${id}">${svg('check')}${visits.length ? tl('Wieder dabei') : tl('Waren dabei')}</button>
    </div>
    ${v.cal ? `<div class="calmenu"><button type="button" class="btn" data-ics="${id}">${svg('cal')}${tl('Kalender-Datei (iPhone, Outlook, Android)')}</button>
      <a class="btn" href="${esc(gcalUrl(o))}" target="_blank" rel="noopener">${svg('cal')}${tl('Google Kalender')}</a>
      <p class="note">${tl('Tipp: Lege in deinem Kalender einen Kalender „Familie“ an und wähle ihn beim Eintragen aus. Djuu speichert dabei nichts.')}</p></div>` : ''}
    ${visits.length ? `<p class="note">${visits.length === 1 ? tl('Ihr wart schon dabei') : `${tl('Ihr wart')} ${visits.length}× dabei`}${tl(', zuletzt eingetragen am')} ${esc(new Date(visits[visits.length - 1] + 'T00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' }))}. <button type="button" class="linkbtn" data-unvisit="${id}">${tl('Letzten Eintrag löschen')}</button></p>` : ''}
    <div class="sec"><h4>${tl('Wann')}</h4><p class="text"><b>${esc(time)}</b>${o.kind === 'gruppe' ? (isRecurring(o) ? tl(' · regelmäßige Gruppe') : tl(' · offenes Treffen')) : o.kind === 'kurs' ? ` ${tl('· Kurs')}${o.sessions ? ', ' + o.sessions + tl(' Termine') : ''}` : ''}</p>
      ${dates.length ? `<p class="text">${dates.map(x => esc(fmtLong(x))).join('<br>')}${o.kind !== 'termin' && dates.length === 6 ? `<br>${tl('und weitere')}` : ''}</p>` : `<p class="muted text">${tl('Keine weiteren Termine bekannt.')}</p>`}
      ${o.schedule ? `<p class="note">${tl('Laut Anbieter:')} ${esc(o.schedule)}</p>` : ''}</div>
    <div class="sec"><h4>${tl('Wo')}</h4><p class="text">${esc(o.venue || '')}${o.address ? `<br>${esc(o.address)}` : ''}${d != null ? `<br><span class="muted">${fmtDist(d)} ${tl('von dir')}</span>` : ''}</p>
      ${place ? `<button type="button" class="btn" data-id="${place.id}">${svg('pin')}${tl('Auf der Karte')}</button>` : ''}</div>
    <div class="sec"><h4>${tl('Für wen')}</h4><p class="text">${esc(who)}${fits === true ? ` · <b class="yes">${tl('passt zu euch')}</b>` : ''}</p></div>
    <div class="sec"><h4>${tl('Kosten und Anmeldung')}</h4><p class="text">${o.free ? tl('Kostenlos') : o.price ? esc(o.price) : tl('Preis beim Anbieter')}${o.registration ? ' · ' + esc(REG_TEXT[o.registration] || o.registration) : ''}</p></div>
    <a class="btn big primary" href="${esc(o.url)}" target="_blank" rel="noopener" style="margin-top:16px">${tl('Zum Anbieter')}${o.registration === 'nötig' ? tl(' und anmelden') : ''}</a>
    <p class="note">${tl('Angaben vom Anbieter, ohne Gewähr. Änderungen und Absagen erfährst du dort.')}</p>`;
}

// Calendar: a file any calendar app can import, or Google's own form. Weekly groups repeat, at most 12 weeks.
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const compact = d => ymd(d).replace(/-/g, '');
function calParts(o) {
  const day = nextDate(o) || today0(), hm = s => s.replace(':', '') + '00';
  const end = o.time_to && o.time_to > (o.time_from || '') ? o.time_to : o.time_from ? `${String(Math.min(23, +o.time_from.slice(0, 2) + 1)).padStart(2, '0')}${o.time_from.slice(2)}` : null;
  let rrule = null;
  if (isRecurring(o)) {
    const cap = addDays(day, 7 * 11), until = o.end_date && new Date(o.end_date + 'T00:00') < cap ? new Date(o.end_date + 'T00:00') : cap;
    rrule = `FREQ=WEEKLY;BYDAY=${BYDAY[o.weekday]};UNTIL=${compact(until)}${o.time_from ? 'T225959Z' : ''}`;
  }
  const desc = [o.provider, o.free ? 'Kostenlos' : o.price, REG_TEXT[o.registration], o.url, rrule && !o.end_date ? 'Wiederholung von Djuu auf 12 Wochen begrenzt.' : '', 'Ohne Gewähr, bitte beim Anbieter prüfen.'].filter(Boolean).join('\n');
  return { day, start: o.time_from ? `${compact(day)}T${hm(o.time_from)}` : compact(day), end: end ? `${compact(day)}T${hm(end)}` : compact(addDays(day, 1)), timed: !!o.time_from, rrule, desc, where: [o.venue, o.address].filter(Boolean).join(', ') };
}
function gcalUrl(o) {
  const c = calParts(o), q = new URLSearchParams({ action: 'TEMPLATE', text: titleOf(o), dates: `${c.start}/${c.end}`, details: c.desc, location: c.where });
  if (c.timed) q.set('ctz', 'Europe/Berlin');
  if (c.rrule) q.set('recur', 'RRULE:' + c.rrule);
  return 'https://calendar.google.com/calendar/render?' + q;
}
function icsFile(list, alarm) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const fold = l => { const out = []; while (l.length > 60) { out.push(l.slice(0, 60)); l = ' ' + l.slice(60); } out.push(l); return out.join('\r\n'); };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Djuu//Termine//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  for (const o of list) {
    const c = calParts(o), tz = c.timed ? ';TZID=Europe/Berlin' : ';VALUE=DATE';
    lines.push('BEGIN:VEVENT', `UID:${o.id}@djuu`, `DTSTAMP:${stamp}`, `DTSTART${tz}:${c.start}`, `DTEND${tz}:${c.end}`, `SUMMARY:${icsText(titleOf(o))}`,
      `LOCATION:${icsText(c.where)}`, `DESCRIPTION:${icsText(c.desc)}`, `URL:${o.url}`);
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
  toast('Kalender-Datei erstellt. Öffne sie, um die Termine einzutragen.');
}
function shareOffer(id) {
  const o = OFFER_BY_ID.get(id), d = nextDate(o), url = location.origin + location.pathname + '#o=' + id;
  const text = `${titleOf(o)}${d ? ', ' + fmtDay(d) : ''}${o.time_from ? ' ' + o.time_from + tl(' Uhr') : ''}${o.venue ? ', ' + o.venue : ''}`;
  if (navigator.share) navigator.share({ title: titleOf(o), text, url }).catch(() => {});
  else navigator.clipboard?.writeText(text + ' ' + url).then(() => toast('Link kopiert.'), () => toast(url));
}
// does the offer take place on this day? (single date, weekly group within its run, or course period)
function occursOn(o, day) {
  const k = ymd(day), s = o.start_date, e = o.end_date;
  if (o.kind === 'termin') return s === k || (!!e && s <= k && k <= e);
  if (o.weekday != null) return o.weekday === dayIdx(day) && (!s || s <= k) && (!e || k <= e);
  return !!s && s <= k && (!e ? s === k : k <= e);
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
const kidNames = () => familyAges().filter(k => k.months >= 0).map(k => `${k.name} (${kidLabel(k.months)})`);
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
  const fits = p => { if (young && p.tags.has('groessere')) return false; const s = agesOf(p); return !kids.length || !s || kids.some(k => s.some(([a, z]) => k.months >= a && k.months < z)); };
  return places.filter(p => pairs.some(([g, t]) => p.tags.has(t) && memberOf(p, GROUP[g])) && p.named && fits(p) && areaOk(p))
    .map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => (!!b[1].f.tipp - !!a[1].f.tipp) || a[0] - b[0]).slice(0, 4);
}
function ferienView() {
  const b = nextBreak();
  if (!b) return `${head(tl('Ferien'))}<div class="empty"><b>${breaksFailed ? tl('Die Ferientermine ließen sich gerade nicht laden.') : tl('Keine Ferientermine bekannt.')}</b></div>`;
  const kids = familyAges().filter(k => k.months >= 0), school = kids.filter(k => k.months >= 72), small = kids.filter(k => k.months < 72);
  const state = STATES[store.profile.state || 'DE-HH'];
  const range = `${fmtD(b.from)} bis ${fmtD(b.to)}`;
  const offers = OFFERS.filter(o => (o.kind === 'termin' || o.kind === 'kurs') && o.audience !== 'erwachsene' && offerFits(o) !== false && offerInArea(o)).map(o => {
    for (let d = new Date(Math.max(b.from, today0())); d <= b.to; d.setDate(d.getDate() + 1)) if (occursOn(o, d)) return [new Date(d), o];
    return null;
  }).filter(Boolean).sort((x, y) => x[0] - y[0]);
  const sections = SEASON_IDEAS(b.from.getMonth()).map(([title, ...pairs]) => [title, ideaPlaces(pairs, kids)]).filter(([, l]) => l.length);
  return `${head(esc(b.name), `${esc(range)} · ${esc(state)}`)}
    ${school.length ? `<p class="text">${tl('Schulfrei für')} ${esc(school.map(k => k.name).join(', '))}.${small.length ? ` ${esc(small.map(k => k.name).join(', '))} ${small.length === 1 ? 'ist' : 'sind'} ${tl('noch nicht in der Schule: Prüft die Schließzeiten eurer Kita.')}` : ''}</p>` : small.length ? `<p class="text">${tl('Noch kein Schulkind dabei, aber Ausflugsziele werden voller und viele Kurse pausieren. Prüft die Schließzeiten eurer Kita.')}</p>` : ''}
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
function savedView() {
  const pr = store.profile, now = new Date();
  const maxYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `<div class="sec"><h4>${tl('Kinder')}</h4>
      <p class="muted text">${tl('Mit dem Alter deiner Kinder zeigt Djuu passende Gruppen, Kurse und Orte. Der Tag ist freiwillig, Monat und Jahr reichen.')}</p>
      <div id="kids">${pr.kids.map((k, i) => `<div class="kidrow">
        <input id="kidName${i}" data-kid="${i}" data-k="name" value="${esc(k.name || '')}" placeholder="${tl('Name (optional)')}" maxlength="20" aria-label="Name von Kind ${i + 1}">
        <button type="button" class="round" data-delkid="${i}" aria-label="${tl('Kind entfernen')}">${svg('close')}</button>
        <input id="kidYm${i}" data-kid="${i}" data-k="ym" type="month" value="${esc(k.ym || '')}" max="${maxYm}" aria-label="Geburtsmonat von Kind ${i + 1}">
        <select id="kidD${i}" data-kid="${i}" data-k="d" aria-label="Geburtstag (Tag, optional) von Kind ${i + 1}"><option value="">${tl('Tag (optional)')}</option>${Array.from({ length: 31 }, (_, j) => `<option${+k.d === j + 1 ? ' selected' : ''}>${j + 1}</option>`).join('')}</select>${kidMoreHtml(k, i)}</div>`).join('')}</div>
      <button type="button" class="btn" data-addkid="1">${svg('plus')}${tl('Kind hinzufügen')}</button>
      <div class="field"><label for="expecting">${tl('Baby unterwegs? Errechneter Termin (optional)')}</label><input id="expecting" type="date" value="${esc(pr.expecting || '')}" min="${ymd(today0())}"></div>
      <div class="field"><label for="fedState">${tl('Bundesland (für eure Schulferien)')}</label><select id="fedState">${Object.entries(STATES).map(([c, n]) => `<option value="${c}"${(pr.state || 'DE-HH') === c ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      ${ferienCard(9999)}
      <div class="field"><label for="dogs">${tl('Hunde in der Familie')}</label>
        <div class="stepper"><button type="button" data-dogs="-1" aria-label="${tl('Weniger')}">–</button><b id="dogsN">${pr.dogs || 0}</b><button type="button" data-dogs="1" aria-label="${tl('Mehr')}">+</button></div></div>
      <p class="note">${tl('Wenn ihr einen Hund habt, steht „Hunde erlaubt“ im Filter gleich oben.')}</p>
    </div>
    <div class="sec"><h4>${tl('Karte')}</h4>
      <details class="stylefold"${state.styleOpen ? ' open' : ''}><summary><img src="icons/maps/${mapStyle().id}.jpg" alt="" width="60" height="40"><span><b>${tl('Kartenstil:')} ${esc(mapStyle().label)}</b><small>${tl('Ändern')}</small></span></summary>
      ${MAP_STYLES.map(m => m.sec ? `<p class="stylesec">${esc(m.sec)}</p>` : `<button type="button" class="stylecard${mapStyle().id === m.id ? ' on' : ''}" data-mapstyle="${m.id}"><img src="icons/maps/${m.id}.jpg" alt="" loading="lazy" width="150" height="100"><span>${esc(m.label)}</span></button>`).join('')}</details>
      <p class="note">${tl('Alle Kartenstile sind kostenlos und brauchen kein Konto. Die Wetteranzeige stammt vom Deutschen Wetterdienst über Bright Sky. Schulferien: Ferienordnung Hamburg, andere Bundesländer über OpenHolidays (ODbL). Die Spracheingabe in der Suche nutzt den Sprachdienst deines Browsers, dabei kann der Ton an dessen Anbieter gehen.')}</p>
    </div>
    <div class="sec"><h4>${tl('Über Djuu')}</h4>
      <div class="melinks">${CONTACT.email ? `<a href="mailto:${esc(CONTACT.email)}?subject=${encodeURIComponent('Feedback zu Djuu')}">${tl('Feedback geben')}</a>` : ''}<a href="legal.html#impressum" target="_blank" rel="noopener">${tl('Impressum')}</a><a href="legal.html#agb" target="_blank" rel="noopener">${tl('Nutzungsbedingungen')}</a><a href="legal.html#datenschutz" target="_blank" rel="noopener">${tl('Datenschutz')}</a><a href="legal.html#daten" target="_blank" rel="noopener">${tl('Daten und Lizenzen')}</a></div>
      <p class="note">${DATA_AT.offers ? `${esc(tl('Termine zuletzt {when} aktualisiert', { when: freshText() }))}. ` : ''}${tl('Version')} ${VERSION}</p></div>
`;
}
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
  const a = wizAttr(id), v = wiz.data.attrs[id] || 'unknown';
  return `<div class="tri"><span class="tri-label">${esc(a.label)}</span><span class="seg" role="radiogroup" aria-label="${esc(a.label)}">
    ${[['yes', tl('Ja')], ['no', tl('Nein')], ['unknown', tl('Weiß nicht')]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${v === k}" class="${v === k ? 'on ' + k : ''}" data-tri="${id}" data-v="${k}">${l}</button>`).join('')}
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
      <div class="sec"><h4>${tl('Was ist es?')}</h4>
      <div class="typegrid">${WIZ_TYPES.filter(t => d.isNew || t.id !== 'event').map(t => `<button type="button" class="typebtn${d.type === t.id ? ' on' : ''}" data-type="${t.id}">${svg(t.icon)}<span>${esc(t.label)}</span></button>`).join('')}</div></div>
      ${d.isNew ? `<div class="field"><label for="wizName">${tl('Name')}</label><input id="wizName" autocomplete="off" value="${esc(d.name)}" placeholder="${tl('z. B. Spielplatz am Weiher')}" maxlength="80">
        <div class="suggest" id="wizSuggest"></div></div>` : ''}
      ${d.type === 'event' ? `<div class="row2"><div class="field"><label for="wizDate">${tl('Datum')}</label><input id="wizDate" type="date" value="${esc(d.eventDate)}"></div>
        <div class="field"><label for="wizTime">${tl('Uhrzeit')}</label><input id="wizTime" type="time" value="${esc(d.eventTime)}"></div></div>` : ''}
      <div class="field"><label for="wizPhoto">${tl('Foto (optional)')}</label><input id="wizPhoto" type="file" accept="image/*" capture="environment">
        ${d.photo ? '<img class="preview" src="' + d.photo + '" alt="Vorschau">' : ''}<p class="hint-kids">${tl('Bitte keine Gesichter von Kindern zeigen.')}</p></div>`;
  } else if (wiz.step === 2) {
    const own = type?.attrs || [];
    html = `${head(tl('Was gibt es hier?'), tl('Nur antippen, was du sicher weißt'))}${wizHeader()}
      ${own.length ? `<div class="sec"><h4>${esc(type.label)}</h4>${own.map(triRow).join('')}</div>` : ''}
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
        <dt>${tl('Angaben')}</dt><dd>${ans.length ? ans.map(([k, v]) => `${esc(wizAttr(k).label)}: <b>${v === 'yes' ? tl('Ja') : tl('Nein')}</b>`).join('<br>') : tl('keine')}</dd>
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
    if (d.isNew && !(d.lat > 53.39 && d.lat < 53.75 && d.lon > 9.72 && d.lon < 10.33)) return wizError(tl('Der Pin liegt außerhalb von Hamburg. Bitte verschieb ihn.'));
    if (d.type === 'event') {
      if (!d.eventDate) return wizError(tl('Bitte gib das Datum der Veranstaltung an.'));
      if (new Date(d.eventDate) < new Date(new Date().toDateString())) return wizError(tl('Das Datum liegt in der Vergangenheit.'));
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
  go({ type: 'thanks', html: `<div class="thanks">${BALLS_THANKS}<svg viewBox="0 0 24 24" width="64" height="64" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#0E8F84"/><path d="M7 12.5l3.2 3L17 9" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>${tl('Gespeichert')}</h2><p>${tl('Dein Eintrag')}${area ? ' in ' + esc(area) : ''} ${tl('ist auf diesem Gerät gespeichert. Andere sehen ihn noch nicht.')}</p>
    <div style="display:flex;gap:8px;margin-top:10px">${p ? `<button type="button" class="btn primary" data-id="${p.id}">${tl('Ort ansehen')}</button>` : ''}<button type="button" class="btn" data-home="peek">${tl('Fertig')}</button></div></div>` }, desktop() ? 'full' : 'half');
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
  $('#tabs').innerHTML = TABS.map(t => `<button type="button" class="${t.cls || ''}${state.tab === t.id ? ' on' : ''}" data-tab="${t.id}">${svg(t.icon)}${t.label}</button>`).join('');
}

// ---------- Global interaction ----------
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-expand]'); if (!t) return;
  const ds = t.dataset;
  if (ds.mode) { state.mode = ds.mode; state.level = 1; renderTop(); }
  else if (ds.level) { state.level = +ds.level; renderTop(); }
  else if (ds.groupAll) { state.groups.clear(); state.cats.clear(); state.tags.clear(); state.preset = null; state.level = 0; refresh(); home('peek'); }
  else if (ds.group) { const same = state.groups.size === 1 && state.groups.has(ds.group); if (!same) { state.groups = new Set([ds.group]); state.cats.clear(); state.tags.clear(); state.preset = null; if (!IO_GROUPS.includes(ds.group)) state.io = null; state.listLimit = 40; } state.mode = GROUP[ds.group].mode; state.level = TAGS[ds.group] ? 2 : 1; refresh(); if (view().type !== 'list') home('peek'); }
  else if (ds.tag) { toggle(state.tags, ds.tag); state.preset = null; state.listLimit = 40; refresh(); if (view().type !== 'list') home('peek'); }
  else if (ds.io) { state.io = state.io === ds.io ? null : ds.io; state.preset = null; refresh(); }
  else if (ds.detail) go({ type: 'detail', id: ds.detail }, 'full');
  else if (ds.sdistrict) { state.sq = ''; setArea({ type: 'district', name: ds.sdistrict }); home('peek'); }
  else if (ds.gtag) { const [gid, tg] = ds.gtag.split('|'); state.groups = new Set([gid]); state.tags = new Set([tg]); state.cats.clear(); state.mode = GROUP[gid].mode; state.level = 2; state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.groupOnly) { state.groups = new Set([ds.groupOnly]); state.tags.clear(); state.cats.clear(); state.mode = GROUP[ds.groupOnly].mode; state.level = 2; state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.filterOnly) { state.filters.add(ds.filterOnly); state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.filter) { toggle(state.filters, ds.filter); state.preset = null; refresh(); }
  else if (ds.preset) { const p = PRESETS.find(x => x.id === ds.preset); state.preset = p.id; state.groups = new Set(p.groups); state.cats = new Set(p.cats || []); state.tags = new Set(p.tags || []); state.io = p.io || null; state.filters = new Set(p.filters); if (p.groups[0]) state.mode = GROUP[p.groups[0]].mode; state.level = 2; state.q = ''; state.sq = ''; refresh(); home('peek'); }
  else if (ds.open === 'filters') go({ type: 'filters' });
  else if (ds.open === 'area') go({ type: 'area' });
  else if (ds.open === 'evfilters') go({ type: 'evfilters' });
  else if (ds.open === 'evtopics') go({ type: 'evtopics' });
  else if (ds.open === 'evdistricts') { EV.pending = new Set(EV.place.districts); EV.dq = ''; go({ type: 'evdistricts' }); }
  else if (ds.open === 'ferien') go({ type: 'ferien' });
  else if (ds.area === 'all') { setArea({ type: 'all' }, false); renderPanel(); }
  else if (ds.radius) { const a = state.area; setArea({ type: 'radius', r: +ds.radius, center: a.type === 'radius' ? a.center : state.me ? 'me' : [map.getCenter().lat, map.getCenter().lng] }); renderPanel(); }
  else if (ds.center === 'me') { locate(false); setArea({ type: 'radius', r: state.area.r || 1000, center: 'me' }); renderPanel(); if (!state.me) toast('Wir suchen deinen Standort …'); }
  else if (ds.center === 'pick') { state.picking = true; setSize('peek'); toast('Tippe auf die Karte, um den Mittelpunkt zu setzen.'); }
  else if (ds.district) { setArea({ type: 'district', name: ds.district }); renderPanel(); }
  else if (ds.draw) { state.drawing = []; drawArea(); go({ type: 'draw' }, 'card'); }
  else if (ds.drawundo) { state.drawing.pop(); drawArea(); renderPanel(); }
  else if (ds.drawcancel) { state.drawing = null; drawArea(); back(); }
  else if (ds.drawdone) { const pts = state.drawing; state.drawing = null; setArea({ type: 'poly', pts }); stack = [{ type: 'list' }]; renderPanel(); setSize(desktop() ? 'full' : 'half'); }
  else if (ds.evpage) { EV.page = ds.evpage; EV.limit = 60; renderPanel(); $('#panelBody').scrollTop = 0; }
  else if (ds.evwhen) { EV.when = EV.when === ds.evwhen ? '' : ds.evwhen; if (EV.when === 'datum' && !EV.from) EV.from = ymd(today0()); renderPanel(); }
  else if (ds.evday) { toggle(EV.days, +ds.evday); renderPanel(); }
  else if (ds.evf) { toggle(EV.f, ds.evf); EV.limit = 60; renderPanel(); }
  else if (ds.evtopic) { toggle(EV.topics, ds.evtopic); EV.limit = 60; renderPanel(); }
  else if (ds.evplacetab) { EV.placeTab = ds.evplacetab; renderPanel(); }
  else if (ds.evplace) { Object.assign(EV.place, { mode: 'all', gps: null }); EV.place.districts.clear(); renderPanel(); }
  else if (ds.evdistrictx) { EV.place.districts.delete(ds.evdistrictx); if (!EV.place.districts.size) EV.place.mode = 'all'; renderPanel(); }
  else if (ds.evkm) { setKm(ds.evkm); renderPanel(); }
  else if (ds.evgps) {
    if (!navigator.geolocation) toast('Dieses Gerät kann den Standort nicht bestimmen.');
    else navigator.geolocation.getCurrentPosition(p => { EV.place.gps = [p.coords.latitude, p.coords.longitude]; EV.placeTab = 'umkreis'; setKm(EV.place.km); renderPanel(); },
      () => toast('Standort nicht verfügbar. Bitte im Browser erlauben.'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }
  else if (ds.evgpsoff) { EV.place.gps = null; renderPanel(); }
  else if (ds.evorigin) { EV.place.placeId = ds.evorigin; EV.place.gps = null; renderPanel(); }
  else if (ds.evdreset) { EV.pending.clear(); refreshDistrictList(); }
  else if (ds.evdapply) { EV.place.districts = new Set(EV.pending); EV.place.mode = EV.pending.size ? 'districts' : 'all'; if (EV.pending.size) EV.place.gps = null; back(); }
  else if (ds.evreset) evReset();
  else if (ds.evshow) evShow();
  else if (ds.offer) go({ type: 'offer', id: ds.offer }, 'full');
  else if (ds.saveoffer) {
    toggleSaved(ds.saveoffer);
    if (ds.inline) { const on = isSaved(ds.saveoffer); document.querySelectorAll(`.savebtn[data-saveoffer="${ds.saveoffer}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? tl('Nicht mehr merken') : tl('Merken')); }); }
    else renderPanel();
  }
  else if (ds.visit) { const k = ymd(today0()), l = store.visits[ds.visit] || (store.visits[ds.visit] = []); if (l[l.length - 1] !== k) l.push(k); save(); toast('Eingetragen: ihr wart dabei.'); renderPanel(); }
  else if (ds.unvisit) { const l = store.visits[ds.unvisit] || []; l.pop(); if (!l.length) delete store.visits[ds.unvisit]; save(); renderPanel(); }
  else if (ds.calmenu) { view().cal = !view().cal; renderPanel(); }
  else if (ds.ics) { const list = ds.ics === 'saved' ? store.savedOffers.map(s => OFFER_BY_ID.get(s.id)).filter(o => o && nextDate(o)) : [OFFER_BY_ID.get(ds.ics)]; downloadIcs(list, ds.ics === 'saved' ? 'djuu-gemerkte-termine.ics' : 'djuu-termin.ics'); }
  else if (ds.shareoffer) shareOffer(ds.shareoffer);
  else if (ds.clearq) { state.q = ''; state.sq = ''; refresh(); }
  else if (ds.mic) toggleMic();
  else if (ds.unk) { state.showUnknown = !state.showUnknown; refresh(); }
  else if (ds.reset) { state.filters.clear(); state.io = null; state.preset = null; state.showUnknown = false; refresh(); renderPanel(); }
  else if (ds.more) { state.listLimit += 40; renderPanel(); }
  else if (ds.expand) { if ($('#panel').dataset.size === 'peek') setSize('half'); }
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
    else navigator.clipboard?.writeText(url).then(() => toast('Link kopiert.'), () => toast(url));
  }
  else if (ds.addinfo) startWizard({ place: byId.get(ds.addinfo) });
  else if (ds.addevent) startWizard({ type: 'event' });
  else if (ds.rate) go({ type: 'rate', id: ds.rate });
  else if (ds.reportplace) go({ type: 'report', id: ds.reportplace });
  else if (ds.reason) { view().reason = ds.reason; $('#panelBody').querySelectorAll('[data-reason]').forEach(b => b.classList.toggle('on', b === t)); $('#repErr').hidden = true; }
  else if (ds.reportsend) sendPlaceReport();
  else if (ds.emore) { EV.limit += 60; $('#evList') ? ($('#evList').innerHTML = evListHtml()) : renderPanel(); }
  else if (ds.offerurl) window.open(ds.offerurl, '_blank', 'noopener');
  else if (ds.mapstyle) { setMapStyle(ds.mapstyle); state.styleOpen = false; renderPanel(); toast(`${tl('Kartenstil:')} ${mapStyle().label}`); }
  else if (ds.wx) { if (ds.wx === 'rain') { state.io = state.io === 'drinnen' ? null : 'drinnen'; state.preset = null; refresh(); } else { const pr = PRESETS.find(x => x.id === 'hitze'); state.preset = pr.id; state.groups = new Set(pr.groups); state.tags = new Set(pr.tags); state.cats.clear(); state.level = 1; refresh(); home(desktop() ? 'full' : 'peek'); } }
  else if (ds.addkid) { store.profile.kids.push({ id: pbId(), name: '', ym: '' }); save(); renderPanel(); setTimeout(() => $('#kidYm' + (store.profile.kids.length - 1))?.focus(), 50); }
  else if (ds.delkid) { store.profile.kids.splice(+ds.delkid, 1); save(); renderPanel(); }
  else if (ds.dogs) { store.profile.dogs = Math.max(0, Math.min(9, (store.profile.dogs || 0) + +ds.dogs)); save(); $('#dogsN').textContent = store.profile.dogs; renderTop(); }
  else if (ds.report) { store.reports.push({ targetType: 'review', targetId: ds.report, at: Date.now() }); save(); toast('Auf diesem Gerät ausgeblendet.'); renderPanel(); }
  else if (ds.sos) go({ type: 'sos', kind: ds.sos });
});
document.addEventListener('input', e => {
  if (e.target.id === 'dq') { EV.dq = e.target.value; refreshDistrictList(); return; }
  if (e.target.id === 'evKmRange') { const l = e.target.previousElementSibling; if (l) l.value = String(e.target.value); e.target.setAttribute('aria-label', `${tl('Umkreis in Kilometern,')} ${kmText(+e.target.value)}`); return; }
  if (e.target.id === 'evQ') { EV.q = e.target.value; EV.limit = 60; clearTimeout(document.evqt); document.evqt = setTimeout(() => { const l = $('#evList'); if (l) l.innerHTML = evListHtml(); }, 150); return; }
  if (e.target.id === 'distQ') $('#distList').innerHTML = districtChips(e.target.value); });
document.addEventListener('change', e => {
  if (e.target.matches('[data-kid], #expecting')) saveProfileField(e.target);
  if (e.target.id === 'fedState') { store.profile.state = e.target.value; save(); loadBreaks().then(renderPanel); }
  if (e.target.id === 'langSel') { store.lang = e.target.value; save(); location.reload(); }
  if (e.target.dataset.home) setHome(e.target.value);
  if (e.target.id === 'evKm' && e.target.value) { setKm(e.target.value); renderPanel(); }
  if (e.target.id === 'evKmRange') { setKm(e.target.value); renderPanel(); }
  if (e.target.dataset.dname) { e.target.checked ? EV.pending.add(e.target.dataset.dname) : EV.pending.delete(e.target.dataset.dname); refreshDistrictList(); }
  if (e.target.dataset.dall) {
    const { live } = evDistrictCounts(), q = norm(EV.dq.trim());
    const names = GEO.stadtteile.filter(s => s[1] === e.target.dataset.dall && (live[s[0]] || EV.pending.has(s[0])) && (!q || norm(s[0]).includes(q))).map(s => s[0]);
    for (const n of names) e.target.checked ? EV.pending.add(n) : EV.pending.delete(n);
    refreshDistrictList();
  }
  if (e.target.id === 'evFrom') { EV.from = e.target.value; if (EV.to && EV.to < EV.from) EV.to = ''; renderPanel(); }
  if (e.target.id === 'evTo') { EV.to = e.target.value; renderPanel(); }
});
$('#sos').innerHTML = svg('bolt');
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
document.addEventListener('keydown', e => { if (e.target.id === 'q' && e.key === 'Enter') { state.q = e.target.value.trim(); state.groups.clear(); state.cats.clear(); state.tags.clear(); state.preset = null; state.level = 0; e.target.blur(); state.listLimit = 40; refresh(); home('peek'); } });

// drag the sheet by its grip (phone)
(() => {
  const grip = $('#grip'); let y0 = null;
  const order = ['peek', 'half', 'full'];
  grip.addEventListener('pointerdown', e => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointerup', e => {
    if (y0 === null) return;
    const dy = e.clientY - y0, i = order.indexOf($('#panel').dataset.size);
    y0 = null;
    if ($('#panel').dataset.size === 'card') { if (view().type !== 'card') return; return dy > 8 ? home('peek') : go({ type: 'detail', id: view().id }, 'full'); }
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
    if (state.area.type === 'radius' && state.area.center === 'me') { drawArea(); refresh(); }
    if (first || ['list', 'sos'].includes(view().type)) renderPanel();
    first = false;
  }, () => { if (center) toast('Standort nicht verfügbar. Bitte im Browser erlauben.'); }, { enableHighAccuracy: true, maximumAge: 30000 });
}
setInterval(() => { if (state.filters.has('jetzt')) refresh(); }, 60000);
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
loadBreaks().then(() => { if (['list', 'me', 'events'].includes(view().type)) renderPanel(); });
renderTop();
$('#panelBody').innerHTML = `<div class="ph"><h2>${tl('Lade Orte …')}</h2></div>`;
(async () => {
  try {
    const res = await fetch('data/places.json');
    if (!res.ok) throw new Error('places.json ' + res.status);
    const data = await res.json();
    SOURCES = data.sources;
    for (const row of data.places) { const p = buildPlace(row); places.push(p); byId.set(p.id, p); }
    addUserPlaces();
    if (store.area && store.area.type) { state.area = store.area; drawArea(); if (state.area.center === 'me') locate(false); }
    // events are refreshed every night on the Djuu server; the copy shipped with the app is the fallback
    const getOffers = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
    try { const od = await getOffers(window.DJUU_API ? window.DJUU_API + '/data/offers.json' : 'data/offers.json').catch(() => getOffers('data/offers.json')); DATA_AT.offers = od.generated; loadOffers(od); } catch (e) { /* offers optional */ }
    refresh();
    renderPanel();
    loadGeo();
    (window.requestIdleCallback || setTimeout)(searchIndex); // first search answers at once
    const hash = location.hash.slice(1);
    if (byId.has(hash)) { const p = byId.get(hash); map.setView([p.lat, p.lon], 17); showPlace(hash); }
    else if (hash.startsWith('o=')) { setTab('events'); stack = [{ type: 'list' }, { type: 'events' }]; go({ type: 'offer', id: hash.slice(2) }, 'full'); }
    hideSplash();
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
