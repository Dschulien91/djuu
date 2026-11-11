/* Djuu "Suchen" and "Frag Djuu": the search page with Erleben and Service tiles (sub-categories fold out), free questions
   that become the app's own filters ("Djuu hat verstanden"), and voice input ("Ich höre zu …").
   A question goes to the Djuu server (only the text) which asks Claude Haiku; without that (no key, offline, limit) a
   simple recognition on the phone takes over, and if that finds nothing the normal text search does.
   Loaded after app.js (uses state, GROUPS, TAGS, ATTRS, AGE_FILTERS, refresh, home, places ...). */
'use strict'; // i18n-skip

// ---------- the search page ----------
const ERLEBEN = ['tipps', 'spielen', 'gastro', 'entdecken', 'kurse', 'events'];
const SERVICE = ['gesundheit', 'sanitaer', 'laeden', 'familie', 'mobil'];
const ASK = { open: null, u: null, busy: false, text: '', ai: false };
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
      <button type="button" class="tool areabtn${state.area.type !== 'all' ? ' on' : ''}" data-open="area">${svg('locate')}<span>${esc(areaLabel())}</span></button>
      ${grid(tl('Erleben'), ERLEBEN, 'erleben')}
      ${grid(tl('Service'), SERVICE, 'service', sos)}
      <div class="sec"><h4>${tl('Schnelle Fragen')}</h4><ol class="list">${PRESETS.filter(p => hasDog() || !/hund/.test(p.id)).map(p => `<li><button type="button" class="item" data-preset="${p.id}"><span class="badge" style="--c:var(--brand)">${svg(p.icon, '')}</span><span><h3>${esc(p.label)}</h3></span><span></span></button></li>`).join('')}</ol></div>
      <button type="button" class="btn" data-group-all="1">${tl('Alle Orte zeigen')}</button>
    </div>`;
}

// ---------- what Djuu understood ----------
// u = { group, tags: [], filters: [], io, age: [from, to] }  -> applied to the map's own state
const AGE_ID = a => !a ? null : a[1] <= 36 ? 'age_0' : a[0] >= 72 ? 'age_6' : 'age_3';
function applyAsk(u) {
  state.groups = new Set(u.group ? [u.group] : []); state.tags = new Set(u.group ? u.tags : []); state.cats.clear();
  state.filters = new Set(u.filters.concat(u.age ? [AGE_ID(u.age)] : [])); state.io = u.io || null;
  state.preset = null; state.q = ''; state.level = state.groups.size ? 2 : 0; state.listLimit = 40;
  if (u.group) state.mode = GROUP[u.group].mode;
  refresh();
}
function askChips(u) {
  const out = [];
  if (u.group) out.push(['group', GROUP[u.group].label]);
  for (const t of u.tags) out.push(['tag:' + t, TAG_LABEL[t] || t]);
  for (const f of u.filters) out.push(['filter:' + f, FILTER_LABEL[f] || f]);
  if (u.age) out.push(['age', u.age[0] >= 12 ? tl('ab {n} Jahren', { n: Math.floor(u.age[0] / 12) }) : tl('ab {n} Monaten', { n: u.age[0] })]);
  if (u.io) out.push(['io', u.io === 'drinnen' ? tl('überdacht oder drinnen') : tl('draußen')]);
  return out;
}
const askEmpty = u => !u.group && !u.tags.length && !u.filters.length && !u.io && !u.age;
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
    <p class="note">${tl('Die KI macht aus deiner Frage nur Filter. Es werden keine persönlichen Daten gesendet.')}</p>
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
    const r = await fetch((window.DJUU_API || '') + '/api/djuu/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ q, vocab: VOCAB() }) });
    if (r.ok) {
      const a = await r.json();
      const u = { group: a.group, tags: a.tags || [], filters: a.filters || [], io: a.io, age: a.age_months };
      if (!u.group && u.tags.length) u.group = groupOfTag(u.tags[0]);
      if (u.group) u.tags = u.tags.filter(t => TAGS[u.group]?.some(x => x.id === t));
      ASK.ai = true;
      return u;
    }
  } catch (e) { /* offline or blocked: the phone understands it */ }
  ASK.ai = false;
  return localUnderstand(q);
}
// the phone's own recognition: words for categories, properties, indoor/outdoor and age
const LOCAL_RULES = [
  [/spielpl/, { group: 'spielen', tags: ['spielplatz'] }], [/abenteuer/, { group: 'spielen', tags: ['abenteuer'] }], [/indoor|spielhalle/, { group: 'spielen', tags: ['indoorspielplatz'] }],
  [/kletter|boulder/, { group: 'spielen', tags: ['klettern'] }], [/trampolin/, { group: 'spielen', tags: ['trampolin'] }],
  [/caf[eé]|kaffee/, { group: 'gastro', tags: ['cafe'] }], [/restaurant|essen gehen|mittagessen/, { group: 'gastro', tags: ['restaurant'] }], [/eis(diele|cafe)?\b/, { group: 'gastro', tags: ['eis'] }],
  [/museum|museen/, { group: 'entdecken', tags: ['museum'] }], [/zoo|tierpark|bauernhof|tiere/, { group: 'entdecken', tags: ['tiere'] }], [/park|natur|wald/, { group: 'entdecken', tags: ['natur'] }],
  [/schwimm|baden|freibad|hallenbad/, { group: 'entdecken', tags: ['baden'] }], [/b(ü|ue)cherhalle|bibliothek/, { group: 'entdecken', tags: ['buecherei'] }], [/theater|kino/, { group: 'entdecken', tags: ['theater'] }],
  [/wickel/, { group: 'sanitaer', tags: ['wickeln'] }], [/toilette|\bwc\b|\bklo\b/, { group: 'sanitaer', tags: ['wc'] }], [/still(en|raum)/, { group: 'sanitaer', tags: ['stillen'] }],
  [/apotheke/, { group: 'gesundheit', tags: ['apotheke'] }], [/kinderarzt|kinder(ä|ae)rzt/, { group: 'gesundheit', tags: ['kinderarzt'] }], [/hebamme/, { group: 'gesundheit', tags: ['hebamme'] }],
  [/drogerie|windeln/, { group: 'laeden', tags: ['drogerie'] }], [/supermarkt/, { group: 'laeden', tags: ['supermarkt'] }], [/spielzeug/, { group: 'laeden', tags: ['spielzeug'] }],
  [/kita|kindergarten/, { group: 'familie', tags: ['kita'] }], [/beratung/, { group: 'familie', tags: ['beratung'] }], [/aufzug|fahrstuhl/, { group: 'mobil', tags: ['aufzug'] }],
];
const LOCAL_FILTERS = [[/wasser|matsch|planschen/, 'wasser'], [/schatten/, 'schatten'], [/eingez(ä|ae)unt|umz(ä|ae)unt/, 'eingezaeunt'], [/kinderwagen|stufenlos|barrierefrei/, 'kinderwagen'],
  [/hochstuhl/, 'hochstuhl'], [/spielecke/, 'spielecke'], [/kostenlos|gratis|umsonst/, 'kostenlos'], [/jetzt (offen|ge(ö|oe)ffnet)|hat (jetzt )?offen/, 'jetzt'], [/sonntag/, 'sonntag'], [/hund/, 'hund']];
function localUnderstand(q) {
  const t = norm(q), u = { group: null, tags: [], filters: [], io: null, age: null };
  for (const [re, r] of LOCAL_RULES) if (re.test(t) && (!u.group || u.group === r.group)) { u.group = r.group; for (const x of r.tags) if (!u.tags.includes(x)) u.tags.push(x); }
  for (const [re, f] of LOCAL_FILTERS) if (re.test(t) && (f !== 'hund' || hasDog()) && !u.filters.includes(f)) u.filters.push(f);
  if (u.filters.includes('wasser') && u.group === 'spielen') { u.filters = u.filters.filter(f => f !== 'wasser'); u.tags.push('wasserspiel'); }
  if (/regen|drinnen|(ü|ue)berdacht|indoor/.test(t)) u.io = 'drinnen'; else if (/drau(ss|ß)en|im freien/.test(t)) u.io = 'draussen';
  const m = t.match(/(\d{1,2})\s*-?\s*(j(a|ä|ae)hrig|jahre?n?\b|j\.|monate?n?\b|mon\.)/);
  if (m) { const n = +m[1], months = /mon/.test(m[2]) ? n : n * 12; u.age = [months, months + 12]; }
  else if (/baby|s(ä|ae)ugling/.test(t)) u.age = [0, 12]; else if (/kleinkind/.test(t)) u.age = [12, 36];
  return u;
}
async function ask(q) {
  q = q.trim(); if (!q) return;
  state.sq = q; ASK.busy = true; ASK.text = q;
  const res = $('#searchRes'); if (res) res.innerHTML = `<div class="askbox busy"><p class="askhead">${svg('sparkle')}${tl('Djuu denkt nach …')}</p></div>`;
  const home_ = $('#searchHome'); if (home_) home_.hidden = true;
  const u = await understand(q);
  ASK.busy = false;
  if (askEmpty(u)) { ASK.u = null; state.q = q; state.groups.clear(); state.tags.clear(); refresh(); if (res) { res.innerHTML = searchResults(); decorateEmpty(res); } return; } // plain text search
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
  else if (d.stag) {
    const [gid, tag] = d.stag.split('|');
    if (!(state.groups.size === 1 && state.groups.has(gid))) { state.groups = new Set([gid]); state.tags.clear(); state.cats.clear(); state.preset = null; state.q = ''; state.mode = GROUP[gid].mode; }
    toggle(state.tags, tag); state.level = 2; state.listLimit = 40; refresh(); renderPanel();
  }
  else if (d.showmap || d.askmap) { if (d.askmap && ASK.partial) { state.showUnknown = true; refresh(); } home('peek'); }
  else if (d.evjump) { EV.page = d.evjump; EV.limit = 60; stack = [{ type: 'list' }]; go({ type: 'events' }, 'full'); setTab('events'); }
  else if (d.sosopen) { stack = [{ type: 'list' }]; go({ type: 'sos' }, 'full'); locate(false); }
  else if (d.voice) startVoice();
  else if (d.voicedone) stopVoice(false);
  else if (d.voicecancel) stopVoice(true);
  else if (d.askx) {
    const u = ASK.u, k = d.askx;
    if (k === 'group') { u.group = null; u.tags = []; } else if (k === 'age') u.age = null; else if (k === 'io') u.io = null;
    else if (k.startsWith('tag:')) u.tags = u.tags.filter(x => x !== k.slice(4)); else if (k.startsWith('filter:')) u.filters = u.filters.filter(x => x !== k.slice(7));
    if (askEmpty(u)) { ASK.u = null; state.sq = ''; }
    applyAsk(u); renderPanel();
  }
});
// typing again starts a new question; clearing the field shows the tiles
document.addEventListener('input', e => { if (e.target.id === 'q' && ASK.u) { ASK.u = null; } });
