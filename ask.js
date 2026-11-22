/* Djuu "Suchen" and "Frag Djuu": the search page with Erleben and Service tiles (sub-categories fold out), free questions
   that become the app's own filters ("Djuu hat verstanden"), and voice input ("Ich höre zu …").
   A question goes to the Djuu server (only the text) which asks Claude Haiku; without that (no key, offline, limit) a
   simple recognition on the phone takes over, and if that finds nothing the normal text search does.
   Loaded after app.js (uses state, GROUPS, TAGS, ATTRS, AGE_FILTERS, refresh, home, places ...). */
'use strict'; // i18n-skip

// ---------- the search page ----------
const ERLEBEN = ['tipps', 'spielen', 'gastro', 'entdecken', 'kurse', 'events'];
const SERVICE = ['gesundheit', 'sanitaer', 'laeden', 'familie', 'mobil'];
const ASK = { open: null, u: null, busy: false, text: '', ai: false, wo: false, fi: false };
// A category with sub-categories opens in place: its tile becomes one card over both columns (violet edge, light violet),
// head with icon, name and an arrow up, below all sub-categories as chips. Only one card is open; the other tiles follow below it.
function tileHtml(id, kind) {
  const g = GROUP[id], on = state.groups.has(id), subs = TAGS[id] && !g.offers;
  if (subs && ASK.open === id) return subCardHtml(id, kind);
  const action = id === 'kurse' ? ' data-evjump="wiederkehrend"' : id === 'events' ? ' data-evjump="einmalig"' : subs ? ` data-subopen="${id}" aria-expanded="false"` : ` data-group="${id}"`;
  return `<div class="stilewrap"><button type="button" class="stile ${kind}${on ? ' on' : ''}"${action} aria-pressed="${on}">
      <span class="stic">${svg(g.icon, '')}</span><span class="stlabel">${esc(g.label)}</span>${on ? `<span class="stcheck">${svg('check')}</span>` : ''}${subs ? `<span class="stmore">${svg('next')}</span>` : ''}</button></div>`;
}
function subCardHtml(id, kind) {
  const g = GROUP[id], mine = state.groups.size === 1 && state.groups.has(id), chosen = mine ? [...state.tags].length : 0;
  return `<div class="subcard ${kind}"><button type="button" class="subhead" data-subopen="${id}" aria-expanded="true" aria-label="${tl('{name} zuklappen', { name: g.label })}">
      <span class="stic">${svg(g.icon, '')}</span><span class="stlabel">${esc(g.label)}</span>${svg('up')}</button>
    <div class="subchips">${tagCounts(g).map(([t]) => { const sel = mine && state.tags.has(t.id); return `<button type="button" class="chip${sel ? ' on' : ''}" data-stag="${id}|${t.id}" aria-pressed="${sel}">${sel ? svg('check') : ''}${esc(t.label)}</button>`; }).join('')}</div>
    ${chosen ? `<button type="button" class="btn primary wide" data-showmap="1">${svg('pin')}${tl('Auf der Karte zeigen')} (${nf.format(last.match.length)})</button>` : ''}</div>`;
}
function searchView() {
  const grid = (title, list, kind, extra = '') => `<div class="sec"><h4>${title}</h4><div class="stiles">${list.map(id => tileHtml(id, kind)).join('')}${extra}</div></div>`;
  const sos = `<div class="stilewrap"><button type="button" class="stile sos" data-sosopen="1"><span class="stic">${svg('bolt', '')}</span><span class="stlabel">${tl('Jetzt dringend')}</span></button></div>`;
  return `<div class="ph"><h2>${tl('Was sucht ihr?')}</h2></div>
    <form class="searchfield ask" id="askForm" role="search">${svg('sparkle')}<label for="q" class="sr">${tl('Suche')}</label><input id="q" type="search" placeholder="${tl('Suchen oder frag Djuu …')}" autocomplete="off" enterkeyhint="search" value="${esc(state.sq)}">
      ${Speech ? `<button type="button" class="micbtn" data-voice="1" aria-label="${tl('Spracheingabe starten')}">${svg('mic')}</button>` : ''}</form>
    <div id="searchRes">${ASK.u ? askResultsHtml() : searchResults()}</div>
    <div id="searchHome"${state.sq || ASK.u ? ' hidden' : ''}>
      ${foldsHtml()}
      ${grid(tl('Erleben'), ERLEBEN, 'erleben')}
      ${grid(tl('Service'), SERVICE, 'service', sos)}
      <div class="sec"><h4>${tl('Schnelle Fragen')}</h4><ol class="list">${PRESETS.filter(p => hasDog() || !/hund/.test(p.id)).map(p => `<li><button type="button" class="item" data-preset="${p.id}"><span class="badge" style="--c:var(--brand)">${svg(p.icon, '')}</span><span><h3>${esc(p.label)}</h3></span><span></span></button></li>`).join('')}</ol></div>
      <button type="button" class="btn" data-group-all="1">${tl('Alle Orte zeigen')}</button>
      ${ASK.wo || ASK.fi ? `<div class="sticky-bar"><button type="button" class="btn big primary" data-showmap="1">${nf.format(shownTotal())} ${tl('Orte zeigen')}</button></div>` : ''}
    </div>`;
}
// Wo and Filter: closed rows that say what is set; opened, they work exactly like the Gebiet and Filter pages
function foldsHtml() {
  const fl = [...state.filters].map(f => FILTER_LABEL[f] || f).concat(state.io ? [TAG_LABEL[state.io] || state.io] : []);
  const row = (key, icon, title, sub, open, set) => `<button type="button" class="sfold${set ? ' set' : ''}" data-sfold="${key}" aria-expanded="${open}">
      <span class="sfic">${svg(icon)}</span><span class="sftx"><b>${title}</b><small>${esc(sub)}</small></span>${svg('up')}</button>`;
  return `<div class="sfolds">
    ${row('wo', 'pin', tl('Wo'), areaLabel(), ASK.wo, state.area.type !== 'all')}
    ${row('fi', 'filter', tl('Filter'), fl.length ? fl.slice(0, 3).join(', ') + (fl.length > 3 ? ` +${fl.length - 3}` : '') : tl('Keine'), ASK.fi, !!fl.length)}
    ${ASK.wo ? `<div class="sfbody">${areaBody()}</div>` : ASK.fi ? `<div class="sfbody">${filtersBody()}</div>` : ''}</div>`;
}

// ---------- what Djuu understood ----------
// u = { group, tags: [], filters: [], io, age: [from, to] }  -> applied to the map's own state
const AGE_ID = a => !a ? null : a[1] <= 36 ? 'age_0' : a[0] >= 72 ? 'age_6' : 'age_3';
function applyAsk(u) {
  const pr = u.preset && PRESETS.find(x => x.id === u.preset);
  state.groups = new Set(pr ? pr.groups : u.group ? [u.group] : []); state.tags = new Set(pr ? pr.tags || [] : u.group ? u.tags : []); state.cats = new Set(pr ? pr.cats || [] : []);
  state.filters = new Set(u.filters.concat(u.age ? [AGE_ID(u.age)] : [])); state.io = u.io || (pr && pr.io) || null;
  ASK.applied = [...state.filters];
  state.preset = pr ? pr.id : null; state.q = u.q || ''; state.level = state.groups.size ? 2 : 0; state.listLimit = 40; state.onlyPlace = null;
  if (u.group) state.mode = GROUP[u.group].mode;
  // where: a Stadtteil from the question, or "in der Nähe" = 1 km around me (otherwise the area stays as chosen)
  // an area that came from an earlier question goes again with the next one (one chosen in "Wo" stays)
  if (u.area) { if (u.area.center === 'me') locate(false); ASK.areaSet = true; setArea(u.area); }
  else if (ASK.areaSet) { ASK.areaSet = false; setArea({ type: 'all' }, false); }
  else refresh();
}
function askChips(u) {
  const out = [];
  const pr = u.preset && PRESETS.find(x => x.id === u.preset);
  if (pr) out.push(['preset', pr.label]);
  if (u.group) out.push(['group', GROUP[u.group].label]);
  for (const t of u.tags) out.push(['tag:' + t, TAG_LABEL[t] || t]);
  for (const f of u.filters) out.push(['filter:' + f, FILTER_LABEL[f] || f]);
  if (u.age) out.push(['age', u.age[0] >= 12 ? tl('ab {n} Jahren', { n: Math.floor(u.age[0] / 12) }) : tl('ab {n} Monaten', { n: u.age[0] })]);
  if (u.io) out.push(['io', u.io === 'drinnen' ? tl('überdacht oder drinnen') : tl('draußen')]);
  if (u.area) out.push(['area', u.area.type === 'district' ? u.area.names.map(dLabel).join(', ') : tl('in der Nähe (1 km)')]);
  if (u.q) out.push(['q', `„${u.q}“`]);
  return out;
}
const askEmpty = u => !u.group && !u.preset && !u.tags.length && !u.filters.length && !u.io && !u.age && !u.area;
function askResultsHtml() {
  const u = ASK.u, chips = askChips(u), o = origin();
  // nothing fits exactly? Then places where a detail is unknown (e.g. no age given), then without "drinnen/draußen";
  // they are marked as fitting only partly, nothing is claimed that we do not know
  let found = shownList(), partial = '';
  if (!found.length && last.unknown.length) { found = last.unknown; partial = tl('Zu diesen Orten fehlen Angaben (zum Beispiel das Alter). Sie passen zum Rest deiner Frage.'); }
  if (!found.length && state.io) { const io = state.io; state.io = null; const r = compute(); state.io = io; found = r.match.concat(r.unknown); partial = tl('Nichts passt genau. Diese Orte passen zu einem Teil deiner Frage.'); }
  ASK.partial = !!partial;
  const list = found.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => maybeLast(a[0], a[1]) - maybeLast(b[0], b[1])).slice(0, 25);
  return `<div class="askbox"><p class="askhead">${svg('sparkle')}${tl('Djuu hat verstanden')}</p>
      <div class="fgrid">${chips.map(([k, l]) => `<button type="button" class="chip askchip" data-askx="${esc(k)}" aria-label="${esc(l)} ${tl('entfernen')}">${esc(l)} ${svg('close')}</button>`).join('')}</div></div>
    ${partial && list.length ? `<p class="note partial">${svg('info')} ${partial}</p>` : ''}
    ${list.length ? `<ol class="list">${list.map(([d, p]) => itemHtml(p, d)).join('')}</ol>` : `<div class="empty"><b>${tl('Dazu finden wir nichts.')}</b>${tl('Entferne einen Filter oben.')}</div>`}
    ${offersBlock(searchOffers(ASK.text), ASK.text)}
    ${ASK.ai ? `<p class="note">${tl('Die KI macht aus deiner Frage nur Filter. Es werden keine persönlichen Daten gesendet.')}</p>` : ''}
    <div class="stick"><button type="button" class="btn big primary" data-askmap="1">${svg('pin')}${tl('Auf der Karte zeigen')}</button></div>`;
}

// ---------- understanding a question: Claude Haiku on the server, else simple rules on the phone ----------
const VOCAB = () => ({
  groups: GROUPS.filter(g => !g.offers).map(g => g.id),
  tags: [...new Set(Object.entries(TAGS).filter(([id]) => !GROUP[id].offers).flatMap(([, l]) => l.flatMap(t => [t.id, ...(t.of || [])])))], // museum, natur, baden … too
  filters: ATTRS.filter(a => !dogFact(a) || hasDog()).map(a => a.id).concat(['jetzt', 'sonntag']),
});
// which group a tag belongs to (the first that has it)
const groupOfTag = t => Object.keys(TAGS).find(id => !GROUP[id].offers && TAGS[id].some(x => x.id === t || x.of?.includes(t))) || null;
async function understand(q) {
  try {
    // only the question goes out: no account token, no names, no position
    // 5 s at most, then the phone's own rules answer
    const c = new AbortController(), timer = setTimeout(() => c.abort(), 5000);
    const r = await fetch((window.DJUU_API || '') + '/api/djuu/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ q, vocab: VOCAB() }), signal: c.signal })
      .finally(() => clearTimeout(timer));
    if (r.ok) {
      const a = await r.json();
      const u = { group: a.group, tags: a.tags || [], filters: a.filters || [], io: a.io, age: a.age_months };
      if (!u.group && u.tags.length) u.group = groupOfTag(u.tags[0]);
      if (u.tags.includes('wasserspiel')) { u.tags = u.tags.filter(t => t !== 'wasserspiel'); if (!u.filters.includes('wasser')) u.filters.push('wasser'); }
      if (u.group) { const ok = groupTagIds(GROUP[u.group]); u.tags = u.tags.filter(t => ok.has(t)); } // sub-categories and the place tags they stand for (museum)
      u.filters = u.filters.filter(f => FILTER_LABEL[f]);
      // the server knows no Stadtteile: they, "in der Nähe" and leftover names come from the phone's own reading
      const local = localUnderstand(q);
      if (local.area) u.area = local.area;
      if (local.q) u.q = local.q;
      ASK.ai = true;
      return u;
    }
  } catch (e) { /* offline or blocked: the phone understands it */ }
  ASK.ai = false;
  return localUnderstand(q);
}
// the phone's own recognition: words for categories, properties, indoor/outdoor, age, Stadtteile and "in der Nähe".
// Works on norm()-ed text (ä -> ae, ß -> ss). Each rule marks the words it used, to see how much of the question was understood.
// German and English alike ("playground", "changing table", "nappies")
const LOCAL_RULES = [
  [/spielpl\w*|playground\w*/, { group: 'spielen', tags: ['spielplatz'] }], [/abenteuer\w*|adventure playground/, { group: 'spielen', tags: ['abenteuer'] }], [/indoor\w*|spielhalle\w*|soft ?play/, { group: 'spielen', tags: ['indoorspielplatz'] }],
  [/kletter\w*|boulder\w*|climbing/, { group: 'spielen', tags: ['klettern'] }], [/trampolin\w*/, { group: 'spielen', tags: ['trampolin'] }],
  [/kindercafe\w*|spielcafe\w*|familiencafe\w*|(kids|family|childrens?) ?cafes?\b/, { group: 'gastro', tags: ['kindercafe'] }],
  [/\bcafe\w*|kaffee\w*|coffee/, { group: 'gastro', tags: ['cafe'] }], [/restaurant\w*|essen gehen|mittagessen|\blunch\b|\bdinner\b/, { group: 'gastro', tags: ['restaurant'] }], [/\beis(diele|cafe)?\b|ice ?cream/, { group: 'gastro', tags: ['eis'] }],
  [/museum|museen|museums/, { group: 'entdecken', tags: ['museum'] }], [/\bzoo\b|tierpark\w*|bauernhof\w*|\btiere\b|\banimals?\b|\bfarm\b|petting/, { group: 'entdecken', tags: ['tiere'] }], [/\bpark\b|\bparks\b|\bnatur\b|\bnature\b|\bwald\b|\bforest\b|\bwoods\b/, { group: 'entdecken', tags: ['natur'] }],
  [/schwimmbad\w*|\bbaden\b|freibad\w*|hallenbad\w*|swimming pool|\bpools?\b|\blido\b/, { group: 'entdecken', tags: ['baden'] }], [/buecherhalle\w*|bibliothek\w*|librar(y|ies)/, { group: 'entdecken', tags: ['buecherei'] }], [/theater\w*|\bkino\w*|theatre\w*|cinema\w*/, { group: 'entdecken', tags: ['theater'] }],
  [/wickel\w*|changing (table|room|station)|baby ?chang\w*/, { group: 'sanitaer', tags: ['wickeln'] }], [/toilette\w*|\bwc\b|\bklo\b|toilets?\b|restrooms?|bathrooms?|\bloo\b/, { group: 'sanitaer', tags: ['wc'] }], [/still(en|raum)\b|breast ?feed\w*|nursing room/, { group: 'sanitaer', tags: ['stillen'] }],
  [/apotheke\w*|pharmac(y|ies)|chemists?\b/, { group: 'gesundheit', tags: ['apotheke'] }], [/kinderarzt\w*|kinderaerzt\w*|paediatrician\w*|pediatrician\w*|\bdoctors?\b/, { group: 'gesundheit', tags: ['kinderarzt'] }], [/hebamme\w*|midwi(fe|ves)/, { group: 'gesundheit', tags: ['hebamme'] }],
  [/drogerie\w*|windeln|nappies|diapers?|drugstores?/, { group: 'laeden', tags: ['drogerie'] }], [/supermarkt\w*|supermarkets?|groceries/, { group: 'laeden', tags: ['supermarkt'] }], [/spielzeug\w*|\btoys?\b|toy ?shops?/, { group: 'laeden', tags: ['spielzeug'] }],
  [/\bkita\w*|kindergarten\w*|krippe\w*|day ?care|nurser(y|ies)/, { group: 'familie', tags: ['kita'] }], [/beratung\w*|counsel\w*/, { group: 'familie', tags: ['beratung'] }], [/aufzug\w*|aufzuege\w*|fahrstuhl\w*|\blifts?\b|elevators?/, { group: 'mobil', tags: ['aufzug'] }],
];
const LOCAL_FILTERS = [[/\bwasser\w*|matsch\w*|planschen|\bwater\b|splash\w*/, 'wasser'], [/eingezaeunt|umzaeunt|fenced/, 'eingezaeunt'], [/kinderwagen\w*|stufenlos\w*|barrierefrei\w*|stroller|\bprams?\b|buggy|step ?free|wheelchair/, 'kinderwagen'],
  [/hochstuhl\w*|high ?chairs?/, 'hochstuhl'], [/spielecke\w*|play (corner|area)/, 'spielecke'], [/kostenlos\w*|gratis|umsonst|\bfree\b/, 'kostenlos'], [/\bjetzt\b|\bgerade\b|\bsofort\b|\bgeoeffnet\b|\boffen\b|\bopen\b|\bnow\b/, 'jetzt'],
  [/sonntags?\b|sundays?\b/, 'sonntag'], [/\bhunde?\b|\bdogs?\b/, 'hund'], [/notdienst\w*|notapotheke\w*|\bnachts\b|in der nacht|emergency|at night/, 'notdienst'],
  [/kaputt|defekt|ausser betrieb|geht nicht|funktioniert nicht|gestoert|broken|out of order/, 'aufzug_kaputt']];
// words that carry no wish of their own ("Ideen", "bitte", "für meine Kinder", "for my kids"): never a text filter
const FILLER = new Set(('ideen idee tipps tipp vorschlag vorschlaege kinder kind kids familie familien bitte gut gute guter schoen schoene schoenen toll tolle beste besten naechste naechsten naechster wetter welche welcher welches wohin gehen hin kann koennen man unsere unser unseren unserer uns mal noch was gibts '
  + 'meine mein meinen meiner meinem fuer mit tochter sohn jaehrige jaehrigen jaehriger jahrige jahre jahren jahr alt alte alten los etwas sowas '
  + 'ideas idea tips tip please good nice great best nearest closest where what which whats can could we our my me for with the a an to go some any something child children family families son daughter year years old is are there this on in at of do does when it i you how should would like want need find looking look get let lets us').split(' '));
const NEAR = /\b(in der )?naehe\b|\bnah\b|\bum die ecke\b|\bhier\b|\bbei mir\b|\bnear ?by\b|\bnear me\b|\baround here\b|\bclose by\b/;
const NEAR_WORDS = ['naehe', 'nah', 'hier', 'ecke', 'bei', 'mir', 'near', 'nearby', 'me', 'around', 'here', 'close', 'by'];
// marks the words a rule understood: every word of a match ("erste hilfe") and every whole word a match sits in
// ("eingezaeunter", "kindertheater"), so no part of it is left over as a search word
const askMarker = (t, used) => re => {
  for (const m of t.matchAll(new RegExp(re.source, 'g'))) for (const w of words(m[0])) used.add(w);
  for (const w of words(t)) if (re.test(w)) used.add(w);
};
// Stadtteile meant by a word that is only the first part of their names: "Barmbek" = Barmbek-Nord and Barmbek-Süd
function askDistrictStem(q) {
  const ws = words(q).filter(w => w.length >= 4);
  for (const w of ws) { const hit = districtList().filter(d => words(d)[0] === w && words(d).length > 1); if (hit.length) return [hit, w]; }
  return null;
}
// normalised word -> how the person wrote it (chips show their own spelling: „Straße“, not „strasse“)
function askSpelling(q) {
  const out = new Map();
  for (const tok of String(q).split(/[\s,.;:!?„“”"'()]+/)) for (const w of words(tok)) if (!out.has(w)) out.set(w, tok);
  return out;
}
function localUnderstand(q) {
  const t = norm(q), u = { group: null, tags: [], filters: [], io: null, age: null, area: null, preset: null, q: '' };
  const used = new Set(); // the words the rules understood
  const mark = askMarker(t, used);
  for (const [re, r] of LOCAL_RULES) if (re.test(t) && (!u.group || u.group === r.group)) { u.group = r.group; mark(re); for (const x of r.tags) if (!u.tags.includes(x)) u.tags.push(x); }
  for (const [re, f] of LOCAL_FILTERS) if (re.test(t) && (f !== 'hund' || hasDog()) && !u.filters.includes(f)) { u.filters.push(f); mark(re); }
  // emergency pharmacy: always the pharmacies; a broken lift: always the lifts
  if (u.filters.includes('notdienst')) { u.group = 'gesundheit'; u.tags = ['apotheke']; u.filters = u.filters.filter(f => f !== 'jetzt'); }
  if (u.filters.includes('aufzug_kaputt')) { u.group = 'mobil'; u.tags = ['aufzug']; }
  if (u.group === 'mobil') u.filters = u.filters.filter(f => f !== 'jetzt'); // lifts and stations have no opening hours
  // rain: the curated indoor set (indoor playgrounds, climbing, museums, Bücherhallen, kids' cafés, indoor pools), not every roof in town
  const RAIN = /regen\w*|regnet|schlechtes wetter|schmuddel\w*|\brain\w*|bad weather/;
  if (RAIN.test(t)) { mark(RAIN); if (!u.group) u.preset = 'regen'; else u.io = 'drinnen'; }
  else if (/drinnen|ueberdacht|\bindoors?\b/.test(t)) { u.io = 'drinnen'; mark(/drinnen|ueberdacht|\bindoors\b/); }
  else if (/draussen|im freien|outdoors?|outside/.test(t)) { u.io = 'draussen'; mark(/draussen|im freien|outdoors?|outside/); }
  const months = askAge(t);
  if (months) { u.age = [months.m, months.m + (months.m < 12 ? 12 : months.re === AGE_RE ? 12 : 24)]; mark(months.re); }
  // where: a Stadtteil named in the question (longest name first: "St. Pauli", "Ottensen"), else "in der Nähe" = 1 km around me
  const hit = askDistrict(q), stem = !hit && askDistrictStem(q);
  if (hit) { u.area = { type: 'district', names: [hit[0]] }; for (const w of hit[1].split(' ')) used.add(w); }
  else if (stem) { u.area = { type: 'district', names: stem[0] }; used.add(stem[1]); }
  else if (NEAR.test(t)) { u.area = { type: 'radius', r: 1000, center: 'me' }; for (const w of NEAR_WORDS) used.add(w); }
  // what is left: words the rules did not use. Names and streets among them stay a text search ("Aufzug Hauptbahnhof")
  const all = words(q).filter(w => !STOP.has(w) && !FILLER.has(w) && !/^\d+$/.test(w));
  const left = all.filter(w => !used.has(w));
  u.share = all.length ? 1 - left.length / all.length : 1;
  if (left.length && !askEmpty(u)) { const lq = left.join(' '); if (searchPlaces(lq).length) { const sp = askSpelling(q); u.q = [...new Set(left.map(w => sp.get(w) || w))].join(' '); } }
  return u;
}
// age in a question: "3 Jahre", "3-jährig", "18 Monate", "3 year old", "18 months", baby, toddler -> { m: months, re }
const AGE_RE = /(\d{1,2})\s*-?\s*(j(a|ae)hrig\w*|jahre?n?\b|j\.|monate?n?\b|mon\.|years?\b|yrs?\b|months?\b)/;
function askAge(t) {
  const m = t.match(AGE_RE);
  if (m) return { m: /mon/.test(m[2]) ? +m[1] : +m[1] * 12, re: AGE_RE };
  if (/baby\w*|babies|saeugling\w*|infant\w*/.test(t)) return { m: 0, re: /baby\w*|babies|saeugling\w*|infant\w*/ };
  if (/kleinkind\w*|toddler\w*/.test(t)) return { m: 12, re: /kleinkind\w*|toddler\w*/ };
  return null;
}
// a Stadtteil named in the question (longest name first: "St. Pauli", "Ottensen") -> [name, its words], or null
function askDistrict(q) {
  const flat = ' ' + words(q).join(' ') + ' ';
  return districtList().map(d => [d, words(d).join(' ')]).filter(([, n]) => n.length > 2).sort((a, b) => b[1].length - a[1].length).find(([, n]) => flat.includes(' ' + n + ' ')) || null;
}

// ---------- questions about Termine: "Krabbelgruppe in Altona für 1-Jährige", "Was ist am Wochenende los?" ----------
// They open Termine with its own filters (topic, Wann, age, Stadtteil or Bezirk, search words) instead of the map.
// strong (1): only an offer is meant; weak words (Theater, Schwimmen, Musik …) count only next to a time or "Kurs/Termin" word.
// page: 'e' = a single event (Einmalig), 'w' = a course or group (Wiederkehrend), '' = where the topic has more offers
const EV_TOPIC_RULES = [
  [/krabbel\w*|spielgruppe\w*|playgroups?|toddler groups?/, 'krabbelgruppe', 1, 'w'], [/kinderturn\w*|kinderyoga\w*|kindertanz\w*|kids'? (gym|yoga|dance)/, 'sport', 1, 'w'], [/pekip|babyturn\w*|eltern-?kind-?turn\w*|baby ?gym/, 'pekip', 1, 'w'], [/babymassage\w*|baby massage/, 'babymassage', 1, 'w'],
  [/babyschwimm\w*|baby ?swim\w*|schwimmkurs\w*|swimming (lessons?|class\w*|course\w*)/, 'schwimmen', 1, 'w'], [/vorles\w*|bilderbuch\w*|lesung\w*|story ?time|storytelling/, 'lesen', 1, ''],
  [/kinderkonzert\w*|familienkonzert\w*|konzert\w*|concerts?/, 'musik', 1, 'e'], [/bastel\w*|crafts?\b|crafting/, 'kreativ', 1, ''], [/flohmarkt\w*|basar\w*|flea ?markets?|jumble/, 'flohmarkt', 1, 'e'],
  [/laterne\w*|lantern\w*|weihnachtsmarkt\w*|christmas markets?|kinderfest\w*|stadtteilfest\w*|festival\w*/, 'feste', 1, 'e'], [/geburtsvorbereitung\w*|antenatal|birth prep\w*|prenatal class\w*/, 'geburtsvorbereitung', 1, 'w'],
  [/rueckbildung\w*|postnatal|post natal/, 'rueckbildung', 1, 'w'], [/erste hilfe|first aid/, 'erste_hilfe', 1, ''], [/eltern ?cafe\w*|elterncafe\w*|elterntreff\w*|parents? (cafe|meet\w*)/, 'eltern_cafe', 1, 'w'],
  [/experiment\w*|forscher\w*|science/, 'wissen', 1, ''], [/kochkurs\w*|backkurs\w*|cooking|baking/, 'kochen', 1, ''],
  [/theater\w*|theatre\w*|puppen\w*|puppet\w*|\bkino\w*|cinema|\bfilms?\b|zirkus\w*|circus/, 'theater', 0, 'e'], [/musik\w*|music|singen|singing/, 'musik', 0, ''],
  [/turnen|\bsport\w*|tanz\w*|\bdanc\w*|yoga/, 'sport', 0, ''], [/schwimm\w*|swim\w*/, 'schwimmen', 0, ''], [/basteln|malen|painting|kreativ\w*/, 'kreativ', 0, ''],
];
const EV_WORDS = /\b(kurs|kurse|kursen|course|courses|class|classes|termin|termine|terminen|veranstaltung\w*|events?|programm|ferienprogramm|workshops?|vorstellung\w*|auffuehrung\w*|aktivitaet\w*|activit(y|ies)|was ist los|what(s| is|'s) (on|happening)|things to do|unternehmen)\b/;
const EV_REGULAR = /\b(kurs|kurse|kursen|course|courses|class|classes|gruppe|gruppen|group|groups|treff|treffs|regelmaessig\w*|weekly|woechentlich)\b/;
const EV_WHEN = [[/\bheute\b|\btoday\b|\btonight\b/, 'heute'], [/\bmorgen\b|\btomorrow\b/, 'morgen'], [/wochenende\w*|weekend|\bsamstag\w*|\bsaturday\b|\bsonntag\b|\bsunday\b/, 'wochenende'], [/diese woche|this week/, 'woche'], [/naechsten? (30 tage|monat)|this month|diesen monat/, '30']];
function askTermine(q) {
  const t = norm(q), used = new Set();
  const mark = askMarker(t, used);
  const topics = [];
  let strong = false, hint = '';
  for (const [re, topic, s, pg] of EV_TOPIC_RULES) if (re.test(t)) { if (!topics.includes(topic)) topics.push(topic); strong = strong || !!s; hint = hint || pg; mark(re); }
  const evWord = EV_WORDS.test(t), regular = EV_REGULAR.test(t);
  if (evWord) mark(EV_WORDS);
  let when = '';
  for (const [re, w] of EV_WHEN) if (re.test(t)) { when = when || w; mark(re); }
  // a place question stays one: "Spielplatz heute", "Café sonntags", "Museum mit Kinderwagen" (Theater/Kino may be either)
  const placeHit = LOCAL_RULES.some(([re, r]) => re.test(t) && r.tags[0] !== 'theater');
  const loose = when && !placeHit && /\blos\b|\bmachen\b|\bunternehmen\b|\bto do\b|\bwhat(s| is|'s) (on|happening)\b/.test(t); // "Was machen wir am Wochenende?"
  if (!strong && !evWord && !(when && topics.length && !placeHit) && !loose) return null;
  if (placeHit && !strong && !evWord) return null;
  const ev = { topics: topics.slice(0, 3), when, age: '', districts: [], q: '' };
  const a = askAge(t);
  if (a) { ev.age = a.m < 12 ? 'a0' : a.m < 36 ? 'a1' : a.m < 72 ? 'a3' : a.m < 120 ? 'a6' : 'a10'; mark(a.re); }
  // where: a Stadtteil, else a Bezirk ("Bezirk Wandsbek", "in Altona": every Stadtteil of it)
  const flat = ' ' + words(q).join(' ') + ' ', d = askDistrict(q);
  const bz = BEZIRKE.map(b => [b, words(b).filter(w => w !== 'hamburg').join(' ')]).find(([, n]) => flat.includes(' ' + n + ' '));
  const stem = !d && !bz && askDistrictStem(q);
  if (d && !(bz && /\bbezirk\b/.test(t))) { ev.districts = [d[0]]; for (const w of d[1].split(' ')) used.add(w); }
  else if (bz && GEO.stadtteile.length) { ev.districts = GEO.stadtteile.filter(s => s[1] === bz[0]).map(s => s[0]); for (const w of bz[1].split(' ').concat('bezirk', 'hamburg')) used.add(w); }
  else if (stem) { ev.districts = stem[0]; used.add(stem[1]); }
  // the page: what is asked for ("Kurs", "Gruppe") or where the topic has more offers
  const ofTopic = o => !topics.length || topics.includes(o.topic);
  const nT = OFFERS.filter(o => ofTopic(o) && o.kind === 'termin').length, nW = OFFERS.filter(o => ofTopic(o) && o.kind !== 'termin').length;
  ev.page = regular ? 'wiederkehrend' : evWord && /veranstaltung|event|programm|vorstellung|auffuehrung|was ist los|what(s| is|'s) (on|happening)/.test(t) ? 'einmalig'
    : hint === 'w' ? 'wiederkehrend' : hint === 'e' || when ? 'einmalig' : topics.length && nW > nT ? 'wiederkehrend' : 'einmalig';
  // what is left and says something becomes the search words, in the person's own spelling
  const sp = askSpelling(q), left = words(q).filter(w => !used.has(w) && !STOP.has(w) && !FILLER.has(w) && !/^\d+$/.test(w) && w.length > 2);
  ev.q = [...new Set(left.map(w => sp.get(w) || w))].join(' ');
  return ev;
}
function openTermine(ev) {
  Object.assign(EV, { page: ev.page, mode: 'alle', when: ev.page === 'einmalig' ? ev.when || '30' : '7', from: '', to: '', q: ev.q, today: ev.page === 'wiederkehrend' && ev.when === 'heute', limit: 60 });
  EV.topics = new Set(ev.topics); EV.fmt.clear(); EV.reg = '';
  for (const k of ['fit', 'a0', 'a1', 'a3', 'a6', 'a10']) EV.f.delete(k);
  if (ev.age) EV.f.add(ev.age);
  // the Stadtteile go for this look only (the remembered Ort stays as it is and comes back with the next question without a place)
  if (ev.districts.length) { Object.assign(EV.place, { mode: 'districts', districts: new Set(ev.districts), gps: null }); ASK.evPlace = true; }
  else if (ASK.evPlace) { ASK.evPlace = false; Object.assign(EV.place, { mode: 'all', gps: null, districts: new Set() }); evRestore(); }
  EVB.clear(); stack = [{ type: 'list' }]; go({ type: 'events' }, 'full'); setTab('events');
}
async function ask(q) {
  q = q.trim(); if (!q) return;
  clearTimeout(document.qt); // a pending "as you type" search must not paint over the answer
  state.sq = q; ASK.busy = true; ASK.text = q;
  // a question about Termine opens Termine with its filters (the server's AI knows only the places)
  const ev = OFFERS.length ? askTermine(q) : null;
  if (ev) { ASK.busy = false; ASK.u = null; openTermine(ev); return; }
  const res = $('#searchRes'); if (res) res.innerHTML = `<div class="askbox busy"><p class="askhead">${svg('sparkle')}${tl('Djuu denkt nach …')}</p></div>`;
  const home_ = $('#searchHome'); if (home_) home_.hidden = true;
  const u = await understand(q);
  ASK.busy = false;
  if (ASK.text !== q) return; // a newer question is on its way
  // the phone's rules understood too little (< 60 % of the words): the text search answers, it uses every word
  if (!ASK.ai && u.share < 0.6) Object.assign(u, { group: null, tags: [], filters: [], io: null, age: null, area: null, preset: null, q: '' });
  if (askEmpty(u)) {
    // plain text search: what an earlier question had set goes (filters chosen by hand in "Filter" stay)
    for (const f of ASK.applied || []) state.filters.delete(f);
    ASK.applied = []; state.preset = null; state.cats.clear(); state.io = null;
    if (ASK.areaSet) { ASK.areaSet = false; state.area = { type: 'all' }; store.area = state.area; save(); drawArea(); }
    ASK.u = null; state.q = q; state.groups.clear(); state.tags.clear(); refresh(); if (res) { res.innerHTML = searchResults(); decorateEmpty(res); } return; } // plain text search
  ASK.u = u; applyAsk(u);
  if (view().type === 'search') renderPanel();
}

// ---------- voice: "Ich höre zu …" ----------
let voiceRec = null;
function startVoice() {
  if (!Speech) return;
  stopVoice(true);
  const el = document.createElement('div');
  el.id = 'voice'; el.className = 'lockwrap';
  el.innerHTML = `<div class="lockbg" data-voicecancel="1"></div><div class="locksheet voicesheet" role="dialog" aria-modal="true" aria-labelledby="vT"><i class="lockgrip"></i>
    <h3 id="vT">${tl('Ich höre zu …')}</h3><div class="wave" aria-hidden="true">${'<i></i>'.repeat(11)}</div>
    <p class="voicetext" id="voiceText" aria-live="polite">&nbsp;</p>
    <button type="button" class="voicemic" data-voicedone="1" aria-label="${tl('Tippen zum Beenden')}">${svg('mic')}</button>
    <p class="muted"><button type="button" class="linkbtn" data-voicedone="1">${tl('Tippen zum Beenden')}</button> · <button type="button" class="linkbtn" data-voicecancel="1">${tl('Abbrechen')}</button></p></div>`;
  document.body.appendChild(el);
  const r = new Speech();
  r.lang = LOCALE; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
  let text = '', cancelled = false;
  r.onresult = e => { text = [...e.results].map(x => x[0].transcript).join(' ').trim(); const t = $('#voiceText'); if (t) t.textContent = `„${text}“`; };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast(tl('Das Mikrofon ist nicht erlaubt. Bitte im Browser freigeben.')); else if (e.error === 'no-speech') toast(tl('Nichts gehört. Versuch es noch einmal.')); };
  r.onend = () => { const t = text; cancelled = cancelled || voiceRec?.cancelled; voiceRec = null; $('#voice')?.remove(); if (!cancelled && t) { const q = $('#q'); if (q) q.value = t; ask(t); } };
  voiceRec = r;
  try { r.start(); } catch (e) { voiceRec = null; el.remove(); toast(tl('Die Spracheingabe hat gerade nicht geklappt.')); }
}
function stopVoice(cancel) {
  if (!voiceRec) { $('#voice')?.remove(); return; }
  voiceRec.cancelled = !!cancel;
  try { voiceRec.stop(); } catch (e) { /* already stopped */ }
  if (cancel) $('#voice')?.remove();
}

// ---------- interaction ----------
document.addEventListener('submit', e => { if (e.target.id !== 'askForm') return; e.preventDefault(); const q = $('#q').value; $('#q').blur(); ask(q); });
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.subopen) { ASK.open = ASK.open === d.subopen ? null : d.subopen; renderPanel(); }
  else if (d.sfold) { const k = d.sfold, o = k === 'wo' ? 'fi' : 'wo'; ASK[k] = !ASK[k]; ASK[o] = false; renderPanel(); } // side by side: one open at a time
  else if (d.stag) {
    const [gid, tag] = d.stag.split('|');
    if (!(state.groups.size === 1 && state.groups.has(gid))) { state.groups = new Set([gid]); state.tags.clear(); state.cats.clear(); state.preset = null; state.q = ''; state.mode = GROUP[gid].mode; }
    toggle(state.tags, tag); state.level = 2; state.listLimit = 40; refresh(); renderPanel();
  }
  else if (d.showmap || d.askmap) { if (d.askmap && ASK.partial) { state.showUnknown = true; refresh(); } home('peek'); }
  else if (d.evjump) { EV.page = d.evjump; EV.limit = 60; EV.today = false; stack = [{ type: 'list' }]; go({ type: 'events' }, 'full'); setTab('events'); }
  else if (d.sosopen) { stack = [{ type: 'list' }]; go({ type: 'sos' }, 'full'); locate(false); }
  else if (d.voice) startVoice();
  else if (d.voicedone) stopVoice(false);
  else if (d.voicecancel) stopVoice(true);
  else if (d.askx) {
    const u = ASK.u, k = d.askx;
    if (k === 'group') { u.group = null; u.tags = []; } else if (k === 'age') u.age = null; else if (k === 'io') u.io = null;
    else if (k === 'preset') u.preset = null; else if (k === 'q') u.q = '';
    else if (k === 'area') { u.area = null; ASK.areaSet = false; setArea({ type: 'all' }, false); }
    else if (k.startsWith('tag:')) u.tags = u.tags.filter(x => x !== k.slice(4)); else if (k.startsWith('filter:')) u.filters = u.filters.filter(x => x !== k.slice(7));
    if (askEmpty(u)) { ASK.u = null; state.sq = ''; }
    applyAsk(u); renderPanel();
  }
});
// typing again starts a new question; clearing the field shows the tiles
document.addEventListener('input', e => { if (e.target.id === 'q' && ASK.u) { ASK.u = null; } });
