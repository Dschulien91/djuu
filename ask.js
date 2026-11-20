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
  const list = found.map(p => [dist(o, [p.lat, p.lon]), p]).sort((a, b) => a[0] - b[0]).slice(0, 25);
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
  tags: [...new Set(Object.entries(TAGS).filter(([id]) => !GROUP[id].offers).flatMap(([, l]) => l.map(t => t.id)))],
  filters: ATTRS.map(a => a.id).filter(id => id !== 'hund' || hasDog()).concat(['jetzt', 'sonntag']),
});
// which group a tag belongs to (the first that has it)
const groupOfTag = t => Object.keys(TAGS).find(id => !GROUP[id].offers && TAGS[id].some(x => x.id === t)) || null;
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
      if (u.group) u.tags = u.tags.filter(t => TAGS[u.group]?.some(x => x.id === t));
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
const LOCAL_RULES = [
  [/spielpl\w*/, { group: 'spielen', tags: ['spielplatz'] }], [/abenteuer\w*/, { group: 'spielen', tags: ['abenteuer'] }], [/indoor\w*|spielhalle\w*/, { group: 'spielen', tags: ['indoorspielplatz'] }],
  [/kletter\w*|boulder\w*/, { group: 'spielen', tags: ['klettern'] }], [/trampolin\w*/, { group: 'spielen', tags: ['trampolin'] }],
  [/kindercafe\w*|spielcafe\w*|familiencafe\w*/, { group: 'gastro', tags: ['kindercafe'] }],
  [/\bcafe\w*|kaffee\w*/, { group: 'gastro', tags: ['cafe'] }], [/restaurant\w*|essen gehen|mittagessen/, { group: 'gastro', tags: ['restaurant'] }], [/\beis(diele|cafe)?\b/, { group: 'gastro', tags: ['eis'] }],
  [/museum|museen/, { group: 'entdecken', tags: ['museum'] }], [/\bzoo\b|tierpark\w*|bauernhof\w*|\btiere\b/, { group: 'entdecken', tags: ['tiere'] }], [/\bpark\b|\bparks\b|\bnatur\b|\bwald\b/, { group: 'entdecken', tags: ['natur'] }],
  [/schwimm\w*|\bbaden\b|freibad\w*|hallenbad\w*/, { group: 'entdecken', tags: ['baden'] }], [/buecherhalle\w*|bibliothek\w*/, { group: 'entdecken', tags: ['buecherei'] }], [/theater\w*|\bkino\w*/, { group: 'entdecken', tags: ['theater'] }],
  [/wickel\w*/, { group: 'sanitaer', tags: ['wickeln'] }], [/toilette\w*|\bwc\b|\bklo\b/, { group: 'sanitaer', tags: ['wc'] }], [/still(en|raum)\b/, { group: 'sanitaer', tags: ['stillen'] }],
  [/apotheke\w*/, { group: 'gesundheit', tags: ['apotheke'] }], [/kinderarzt\w*|kinderaerzt\w*/, { group: 'gesundheit', tags: ['kinderarzt'] }], [/hebamme\w*/, { group: 'gesundheit', tags: ['hebamme'] }],
  [/drogerie\w*|windeln/, { group: 'laeden', tags: ['drogerie'] }], [/supermarkt\w*/, { group: 'laeden', tags: ['supermarkt'] }], [/spielzeug\w*/, { group: 'laeden', tags: ['spielzeug'] }],
  [/\bkita\w*|kindergarten\w*|krippe\w*/, { group: 'familie', tags: ['kita'] }], [/beratung\w*/, { group: 'familie', tags: ['beratung'] }], [/aufzug\w*|aufzuege\w*|fahrstuhl\w*|\blift\b/, { group: 'mobil', tags: ['aufzug'] }],
];
const LOCAL_FILTERS = [[/\bwasser\w*|matsch\w*|planschen/, 'wasser'], [/eingezaeunt|umzaeunt/, 'eingezaeunt'], [/kinderwagen\w*|stufenlos\w*|barrierefrei\w*/, 'kinderwagen'],
  [/hochstuhl\w*/, 'hochstuhl'], [/spielecke\w*/, 'spielecke'], [/kostenlos\w*|gratis|umsonst/, 'kostenlos'], [/\bjetzt\b|\bgerade\b|\bsofort\b|\bgeoeffnet\b|\boffen\b/, 'jetzt'],
  [/sonntags?\b/, 'sonntag'], [/\bhunde?\b/, 'hund'], [/notdienst\w*|notapotheke\w*|\bnachts\b|in der nacht/, 'notdienst'],
  [/kaputt|defekt|ausser betrieb|geht nicht|funktioniert nicht|gestoert/, 'aufzug_kaputt']];
// words that carry no wish of their own ("Ideen", "bitte", "für Kinder")
const FILLER = new Set('ideen idee tipps tipp vorschlag vorschlaege kinder kind kids familie familien bitte gut gute guter schoen schoene schoenen toll tolle beste besten naechste naechsten naechster wetter welche welcher welches wohin gehen hin kann koennen man unsere unser uns mal noch was gibts'.split(' '));
const NEAR = /\b(in der )?naehe\b|\bnah\b|\bum die ecke\b|\bhier\b|\bbei mir\b/;
const NEAR_WORDS = ['naehe', 'nah', 'hier', 'ecke', 'bei', 'mir'];
function localUnderstand(q) {
  const t = norm(q), u = { group: null, tags: [], filters: [], io: null, age: null, area: null, preset: null, q: '' };
  const used = new Set(); // the words the rules understood
  const mark = re => { for (const m of t.matchAll(new RegExp(re.source, 'g'))) for (const w of words(m[0])) used.add(w); };
  for (const [re, r] of LOCAL_RULES) if (re.test(t) && (!u.group || u.group === r.group)) { u.group = r.group; mark(re); for (const x of r.tags) if (!u.tags.includes(x)) u.tags.push(x); }
  for (const [re, f] of LOCAL_FILTERS) if (re.test(t) && (f !== 'hund' || hasDog()) && !u.filters.includes(f)) { u.filters.push(f); mark(re); }
  // emergency pharmacy: always the pharmacies; a broken lift: always the lifts
  if (u.filters.includes('notdienst')) { u.group = 'gesundheit'; u.tags = ['apotheke']; u.filters = u.filters.filter(f => f !== 'jetzt'); }
  if (u.filters.includes('aufzug_kaputt')) { u.group = 'mobil'; u.tags = ['aufzug']; }
  if (u.group === 'mobil') u.filters = u.filters.filter(f => f !== 'jetzt'); // lifts and stations have no opening hours
  // rain: the curated indoor set (indoor playgrounds, climbing, museums, Bücherhallen, kids' cafés, indoor pools), not every roof in town
  const RAIN = /regen\w*|regnet|schlechtes wetter|schmuddel\w*/;
  if (RAIN.test(t)) { mark(RAIN); if (!u.group) u.preset = 'regen'; else u.io = 'drinnen'; }
  else if (/drinnen|ueberdacht|\bindoor\b/.test(t)) { u.io = 'drinnen'; mark(/drinnen|ueberdacht/); }
  else if (/draussen|im freien/.test(t)) { u.io = 'draussen'; mark(/draussen|im freien/); }
  const AGE = /(\d{1,2})\s*-?\s*(j(a|ae)hrig\w*|jahre?n?\b|j\.|monate?n?\b|mon\.)/;
  const m = t.match(AGE);
  if (m) { const n = +m[1], months = /mon/.test(m[2]) ? n : n * 12; u.age = [months, months + 12]; mark(AGE); }
  else if (/baby\w*|saeugling\w*/.test(t)) { u.age = [0, 12]; mark(/baby\w*|saeugling\w*/); } else if (/kleinkind\w*/.test(t)) { u.age = [12, 36]; mark(/kleinkind\w*/); }
  // where: a Stadtteil named in the question (longest name first: "St. Pauli", "Ottensen"), else "in der Nähe" = 1 km around me
  const flat = ' ' + words(q).join(' ') + ' ';
  const hit = districtList().map(d => [d, words(d).join(' ')]).filter(([, n]) => n.length > 2).sort((a, b) => b[1].length - a[1].length).find(([, n]) => flat.includes(' ' + n + ' '));
  if (hit) { u.area = { type: 'district', names: [hit[0]] }; for (const w of hit[1].split(' ')) used.add(w); }
  else if (NEAR.test(t)) { u.area = { type: 'radius', r: 1000, center: 'me' }; for (const w of NEAR_WORDS) used.add(w); }
  // what is left: words the rules did not use. Names and streets among them stay a text search ("Aufzug Hauptbahnhof")
  const all = words(q).filter(w => !STOP.has(w) && !FILLER.has(w) && !/^\d+$/.test(w));
  const left = all.filter(w => !used.has(w));
  u.share = all.length ? 1 - left.length / all.length : 1;
  if (left.length && !askEmpty(u)) { const lq = left.join(' '); if (searchPlaces(lq).length) u.q = lq; }
  return u;
}
async function ask(q) {
  q = q.trim(); if (!q) return;
  clearTimeout(document.qt); // a pending "as you type" search must not paint over the answer
  state.sq = q; ASK.busy = true; ASK.text = q;
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
