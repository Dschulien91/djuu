/* Djuu more lists (Wir › Listen): more shopping lists besides the main one (e.g. "Drogerie"), to-do lists with a person and
   a date, packing lists that are used again and again (Kita-Tasche, Urlaub, Schwimmbad as starting points), and wish lists
   ("Wunschliste": for a child or the whole family, an occasion, "Bitte nicht", who gives what, surprise mode, shared as text).
   Lists live in store.lists (collection lists), their entries in store.shop.items like the main shopping list (shop_items
   with `list`; to-dos also with `assignee` and `due`), synced by sync.js with the outbox, so they work offline and live.
   Access: shopping, packing and wish lists follow "Einkauf", to-do lists follow "Besorgungen" ('view' reads, 'edit' changes).
   Extra shopping lists use the same page as the main one (family.js, SH.list). Following a list (push for new entries)
   is kept in the person record (members.follow_lists). Calm: no badges, no prompts.
   Loaded after cal.js. */
'use strict'; // i18n-skip

store.lists = Array.isArray(store.lists) ? store.lists : [];
const LS = { draft: null, open: null, packEdit: false, todoMine: false, busy: false, wedit: null }; // screen state, not saved
const LIST_KINDS = () => [['shop', tl('Einkauf'), 'cart'], ['todo', tl('To-do'), 'check'], ['pack', tl('Packliste'), 'bag'], ['wish', tl('Wunschliste'), 'gift']];
// starting points for packing lists (the entries are ordinary entries afterwards)
const PACK_TEMPLATES = () => [
  ['kita', tl('Kita-Tasche'), [tl('Wechselkleidung'), tl('Windeln'), tl('Feuchttücher'), tl('Matschhose'), tl('Gummistiefel'), tl('Hausschuhe'), tl('Trinkflasche'), tl('Brotdose'), tl('Sonnencreme'), tl('Kuscheltier')]],
  ['urlaub', tl('Urlaub'), [tl('Ausweise'), tl('Krankenversicherungskarten'), tl('Impfpass und U-Heft'), tl('Medikamente'), tl('Ladekabel'), tl('Sonnencreme'), tl('Badesachen'), tl('Schlafanzüge'), tl('Zahnbürsten'), tl('Kuscheltier'), tl('Snacks für die Fahrt'), tl('Bücher und Spiele')]],
  ['schwimmbad', tl('Schwimmbad'), [tl('Badesachen'), tl('Handtücher'), tl('Schwimmwindeln'), tl('Schwimmflügel'), tl('Duschgel'), tl('Haarbürste'), tl('Badelatschen'), tl('Trinkflasche'), tl('Snacks'), tl('Münze für den Spind'), tl('Wechselkleidung')]],
];
const listArea = l => (l?.kind === 'todo' ? 'errands' : 'shop');
const listPerm = l => perm(listArea(l));
const listById = id => store.lists.find(l => l.id === id);
const listItems = id => store.shop.items.filter(i => i.list === id);
// the lists page needs the server to know lists (an app update before the server update shows nothing new)
const listsSee = () => signedIn() && !(typeof MISSING !== 'undefined' && MISSING.has('lists')) && (perm('shop') !== 'none' || perm('errands') !== 'none');
const canNewList = () => perm('shop') === 'edit' || perm('errands') === 'edit';
const sortedLists = (kind, archived = false) => store.lists.filter(l => l.kind === kind && !!l.archived === archived && listPerm(l) !== 'none').sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.at - b.at);
const dueText = due => {
  if (!due) return '';
  const d = new Date(due + 'T00:00'), diff = Math.round((d - today0()) / 864e5);
  return diff === 0 ? tl('heute') : diff === 1 ? tl('morgen') : tl('bis {date}', { date: d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) });
};

// ---------- Wir › Listen ----------
function listsView() {
  if (!listsSee()) return `${head(tl('Listen'))}<div class="empty"><b>${tl('Listen sind für dich nicht freigegeben.')}</b>${tl('Der Admin eures Wir kann sie für dich freigeben.')}</div>`;
  const me = meId();
  const row = (l, sub) => `<li><button type="button" class="prow" data-listopen="${esc(l.id)}"><span class="navic">${svg(LIST_KINDS().find(k => k[0] === l.kind)[2])}</span><span class="navtx"><b>${esc(l.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${unsavedMark(l)}${svg('next')}</button></li>`;
  const subOf = l => {
    const it = listItems(l.id), open = it.filter(i => !i.done);
    if (l.kind === 'pack') return it.length ? tl('{n} von {m} eingepackt', { n: it.length - open.length, m: it.length }) : tl('Noch leer');
    if (l.kind === 'todo') { const mine = open.filter(i => i.assignee === me).length; return [open.length ? tl('{n} offen', { n: open.length }) : tl('Alles erledigt'), mine ? tl('{n} für dich', { n: mine }) : ''].filter(Boolean).join(' · '); }
    if (l.kind === 'wish') return wishSub(l);
    return open.length ? tl('{n} offen', { n: open.length }) : tl('Noch leer');
  };
  const sec = (title, sub, rows) => rows.length ? `<div class="sec"><h4>${title}${sub ? `<small>${sub}</small>` : ''}</h4><ol class="card plist">${rows.join('')}</ol></div>` : '';
  const shop = perm('shop') !== 'none', todo = perm('errands') !== 'none';
  const mainN = shop ? openItems('').length : 0;
  const main = shop ? [`<li><button type="button" class="prow" data-wir="shop"><span class="navic">${svg('cart')}</span><span class="navtx"><b>${tl('Einkauf')}</b><small>${mainN ? tl('{n} offen', { n: mainN }) : tl('Noch leer')}</small></span>${svg('next')}</button></li>`] : [];
  const archived = store.lists.filter(l => l.archived && listPerm(l) !== 'none');
  const any = sortedLists('shop').length + sortedLists('todo').length + sortedLists('pack').length + sortedLists('wish').length;
  return `${head(tl('Listen'), tl('Einkauf, To-dos, Packlisten und Wünsche'))}
    ${shop ? sec(tl('Einkaufslisten'), '', main.concat(sortedLists('shop').map(l => row(l, subOf(l))))) : ''}
    ${todo ? sec(tl('To-dos'), tl('Mit Person und Datum'), sortedLists('todo').map(l => row(l, subOf(l)))) : ''}
    ${shop ? sec(tl('Packlisten'), tl('Immer wieder benutzen'), sortedLists('pack').map(l => row(l, subOf(l)))) : ''}
    ${shop ? sec(tl('Wunschlisten'), tl('Geburtstag, Weihnachten und mehr'), sortedLists('wish').map(l => row(l, subOf(l)))) : ''}
    ${!any ? `<div class="empty"><b>${tl('Mehr Listen, wenn ihr sie braucht.')}</b>${tl('Zum Beispiel eine Drogerie-Liste, To-dos fürs Wochenende oder die Kita-Tasche zum Abhaken.')}</div>` : ''}
    ${archived.length ? `<details class="fold"><summary>${tl('Archiviert ({n})', { n: archived.length })}</summary><ol class="card plist">${archived.map(l => row(l, subOf(l))).join('')}</ol></details>` : ''}
    ${canNewList() ? `<div class="stick"><button type="button" class="btn big primary" data-listnew="1">${svg('plus')}${tl('Neue Liste')}</button></div>` : ''}`;
}

// ---------- New list: kind, name, starting point ----------
function listNewView() {
  const D = LS.draft || (LS.draft = { kind: perm('shop') === 'edit' ? 'shop' : 'todo', name: '', tpl: '' });
  const kinds = LIST_KINDS().filter(([k]) => perm(k === 'todo' ? 'errands' : 'shop') === 'edit' && (k !== 'wish' || wishOk()));
  if (D.kind === 'wish') wishDraftInit(D);
  const own = sortedLists('pack').concat(store.lists.filter(l => l.kind === 'pack' && l.archived)).filter(l => listItems(l.id).length);
  const wishes = sortedLists('wish').concat(store.lists.filter(l => l.kind === 'wish' && l.archived)).filter(l => wishCopy(l.id, false).length);
  const carry = D.tpl.startsWith('open:') ? listById(D.tpl.slice(5)) : null;
  const tpls = D.kind === 'pack' ? [['', tl('Leer')]].concat(PACK_TEMPLATES().map(([id, n]) => [id, n]), own.map(l => ['copy:' + l.id, tl('Wie „{name}“', { name: l.name })]))
    : D.kind === 'wish' ? [['', tl('Leer')]].concat(carry ? [[D.tpl, tl('Offene Wünsche aus „{name}“', { name: carry.name })]] : [], wishes.map(l => ['copy:' + l.id, tl('Wie „{name}“', { name: l.name })])) : [];
  const ph = { shop: tl('z. B. Drogerie'), todo: tl('z. B. Wochenende'), pack: tl('z. B. Kita-Tasche'), wish: tl('z. B. Emma · Weihnachten') }[D.kind];
  return `${head(tl('Neue Liste'))}
    <div class="segs" role="tablist">${kinds.map(([k, l]) => `<button type="button" role="tab" aria-selected="${D.kind === k}" class="${D.kind === k ? 'on' : ''}" data-listkind="${k}">${l}</button>`).join('')}</div>
    <p class="muted text">${{ shop: tl('Eine weitere Einkaufsliste, sortiert nach Gängen wie die große.'), todo: tl('Aufgaben, auf Wunsch mit Person und Datum.'), pack: tl('Zum Abhaken beim Packen. Danach alles auspacken und beim nächsten Mal wieder benutzen.'),
      wish: tl('Wünsche sammeln, zum Beispiel für Geburtstag oder Weihnachten. Wer etwas schenkt, trägt sich ein, damit nichts doppelt kommt.') }[D.kind]}</p>
    ${D.kind === 'wish' ? wishFieldsHtml(D) : ''}
    <div class="field"><label for="listName">${tl('Name')}</label><input id="listName" maxlength="40" value="${esc(D.name)}" placeholder="${esc(ph)}"></div>
    ${D.kind === 'wish' ? wishMoreHtml(D) : ''}
    ${tpls.length ? `<div class="field"><label>${tl('Vorlage')} <small class="muted">${tl('freiwillig')}</small></label><div class="fgrid">${tpls.map(([id, n]) => `<button type="button" class="chip${D.tpl === id ? ' on' : ''}" data-listtpl="${esc(id)}" aria-pressed="${D.tpl === id}">${D.tpl === id ? svg('check') : ''}${esc(n)}</button>`).join('')}</div>
      ${D.tpl ? `<p class="note">${tl('Die Einträge kannst du danach ändern.')}</p>` : ''}</div>` : ''}
    <div class="stick"><button type="button" class="btn big primary" data-listcreate="1">${tl('Liste anlegen')}</button></div>`;
}
function listCreate() {
  const D = LS.draft; if (!D) return;
  D.name = ($('#listName')?.value || D.name || '').trim().slice(0, 40);
  if (!D.name) return toast(tl('Bitte gib der Liste einen Namen.'));
  if (perm(D.kind === 'todo' ? 'errands' : 'shop') !== 'edit') return;
  const l = { id: pbId(), name: D.name, kind: D.kind, sort: Math.max(0, ...store.lists.map(x => +x.sort || 0)) + 1, archived: false, at: Date.now() };
  if (D.kind === 'wish') { wishDraftRead(D); Object.assign(l, wishFieldsOf(D)); }
  store.lists.push(l);
  if (D.kind === 'wish') {
    // starting point: the wishes of an earlier list (all but "nicht mehr nötig"), or the open ones carried over; never the givers
    const t = Date.now(), from = D.tpl ? wishCopy(D.tpl.slice(D.tpl.indexOf(':') + 1), D.tpl.startsWith('open:')) : [];
    from.forEach((i, n) => store.shop.items.push({ id: pbId(), name: i.name, qty: '', cat: 'sonst', by: meId(), at: t + n, done: false, later: false, list: l.id,
      ...(i.link ? { link: i.link } : {}), ...(i.price ? { price: i.price } : {}), ...(i.note ? { note: i.note } : {}), ...(i.prio ? { prio: true } : {}) }));
    LS.draft = null; save(); stack.pop(); go({ type: 'wir', page: 'list', id: l.id }); return;
  }
  let names = [];
  if (D.kind === 'pack' && D.tpl.startsWith('copy:')) names = listItems(D.tpl.slice(5)).sort((a, b) => a.at - b.at).map(i => i.name);
  else if (D.kind === 'pack' && D.tpl) names = (PACK_TEMPLATES().find(t => t[0] === D.tpl) || [, , []])[2];
  const t = Date.now();
  names.forEach((n, i) => store.shop.items.push({ id: pbId(), name: String(n).slice(0, 60), qty: '', cat: 'sonst', by: meId(), at: t + i, done: false, later: false, list: l.id }));
  LS.draft = null; save();
  stack.pop(); go({ type: 'wir', page: 'list', id: l.id });
}

// ---------- One list ----------
function oneListView() {
  const l = listById(view().id);
  if (!l) return `${head(tl('Liste'))}<div class="empty"><b>${tl('Diese Liste gibt es nicht mehr.')}</b></div>`;
  const p = listPerm(l);
  if (p === 'none') return `${head(esc(l.name))}<div class="empty"><b>${tl('Diese Liste ist für dich nicht freigegeben.')}</b>${tl('Der Admin eures Wir kann sie für dich freigeben.')}</div>`;
  const sub = [LIST_KINDS().find(k => k[0] === l.kind)[1], p === 'view' ? tl('nur ansehen') : '', l.archived ? tl('archiviert') : ''].filter(Boolean).join(' · ');
  const body = l.kind === 'todo' ? todoHtml(l, p === 'view') : l.kind === 'pack' ? packHtml(l, p === 'view') : l.kind === 'wish' ? wishHtml(l, p === 'view') : (SH.list = l.id, shopHtml());
  return `${head(esc(l.name), esc(sub))}${typeof reloginHint === 'function' ? reloginHint() : ''}<div class="${p === 'view' ? 'readonly' : ''}">${body}</div>${listFootHtml(l.id)}`;
}
// at the end of every list: its settings (name, following, archive) – for the main list only following
const listFootHtml = id => `<p class="center listfoot"><button type="button" class="linkbtn" data-listedit="${esc(id || 'main')}">${svg('gear')}${id ? tl('Liste bearbeiten') : tl('Mitteilungen zu dieser Liste')}</button></p>`;
// shopping lists side by side above the shopping list (only when there is more than the main one)
function shopListChips() {
  if (!listsSee()) return '';
  const extra = sortedLists('shop');
  if (!extra.length && !SH.list) return '';
  const cur = SH.list || '';
  return `<div class="row listchips" role="tablist">${[{ id: '', name: tl('Einkauf') }].concat(extra).map(l => `<button type="button" role="tab" class="chip${cur === l.id ? ' on' : ''}" aria-selected="${cur === l.id}" data-shlistchip="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>`;
}

// to-dos: what, who, until when
function todoHtml(l, ro) {
  const me = meId(), all = listItems(l.id), people = members();
  const mineN = all.filter(i => !i.done && i.assignee === me).length;
  const open = all.filter(i => !i.done && (!LS.todoMine || i.assignee === me)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.at - b.at);
  const done = all.filter(i => i.done).sort((a, b) => b.at - a.at);
  const today = ymd(today0());
  const row = i => {
    const who = i.assignee && people.find(m => m.id === i.assignee);
    const meta = [who ? who.name : '', i.due ? dueText(i.due) : ''].filter(Boolean).join(' · ');
    return `<li class="shrow tdrow${i.done ? ' done' : ''}${!i.done && i.due && i.due < today ? ' late' : ''}">
      <button type="button" class="shcheck" data-tdtoggle="${esc(i.id)}" aria-label="${i.done ? tl('Wieder offen') : tl('Erledigt')}">${i.done ? svg('check') : ''}</button>
      <button type="button" class="shname" data-tdopen="${esc(i.id)}"${ro ? ' disabled' : ''}>${esc(i.name)}${meta ? `<small class="tdmeta">${esc(meta)}</small>` : ''}${unsavedMark(i)}</button>
      ${who ? avatarHtml(who, 'xs') : ''}</li>
      ${LS.open === i.id && !ro ? `<li class="tdedit"><input data-tdf="${esc(i.id)}|name" value="${esc(i.name)}" maxlength="60" aria-label="${tl('Was')}">
        <label class="small">${tl('Wer')}</label><div class="fgrid">${people.map(m => `<button type="button" class="chip${i.assignee === m.id ? ' on' : ''}" data-tdwho="${esc(i.id)}|${esc(m.id)}" aria-pressed="${i.assignee === m.id}">${i.assignee === m.id ? svg('check') : ''}${esc(m.name)}</button>`).join('')}</div>
        <label class="small" for="tdDue">${tl('Bis wann')} <small class="muted">${tl('freiwillig')}</small></label><div class="calwhen"><input id="tdDue" type="date" data-tdf="${esc(i.id)}|due" value="${esc(i.due || '')}">${i.due ? `<button type="button" class="chip" data-tdnodue="${esc(i.id)}">${tl('Kein Datum')}</button>` : ''}</div>
        <div class="fgrid"><button type="button" class="chip on" data-tdopen="${esc(i.id)}">${tl('Fertig')}</button><button type="button" class="chip" data-tddel="${esc(i.id)}">${tl('Löschen')}</button></div></li>` : ''}`;
  };
  return `<form class="shadd" id="tdForm" data-list="${esc(l.id)}"><input id="tdIn" autocomplete="off" placeholder="${tl('Was ist zu tun?')}" maxlength="60" aria-label="${tl('Neue Aufgabe')}"><button type="submit" class="btn primary" aria-label="${tl('Hinzufügen')}">${svg('plus')}</button></form>
    ${mineN && mineN < all.filter(i => !i.done).length ? `<div class="fgrid"><button type="button" class="chip${LS.todoMine ? '' : ' on'}" data-tdmine="0">${tl('Alle')}</button><button type="button" class="chip${LS.todoMine ? ' on' : ''}" data-tdmine="1">${tl('Für mich ({n})', { n: mineN })}</button></div>` : ''}
    ${open.length ? `<ol class="shlist">${open.map(row).join('')}</ol>` : `<div class="empty"><b>${done.length ? tl('Alles erledigt.') : tl('Noch nichts zu tun.')}</b>${done.length ? '' : tl('Tippe eine Aufgabe ein. Wer sie übernimmt und bis wann, kannst du danach wählen.')}</div>`}
    ${done.length ? `<details class="fold"><summary>${tl('Erledigt ({n})', { n: done.length })}</summary><ol class="shlist">${done.map(row).join('')}</ol>
      ${ro ? '' : `<p><button type="button" class="linkbtn" data-tdclear="${esc(l.id)}">${tl('Erledigte löschen')}</button></p>`}</details>` : ''}`;
}

// packing lists: tick off while packing, unpack everything afterwards, use again next time
function packHtml(l, ro) {
  const all = listItems(l.id).sort((a, b) => a.at - b.at), packed = all.filter(i => i.done).length;
  const row = i => `<li class="shrow${i.done ? ' done' : ''}">
      <button type="button" class="shcheck" data-pktoggle="${esc(i.id)}" aria-label="${i.done ? tl('Wieder auspacken') : tl('Eingepackt')}">${i.done ? svg('check') : ''}</button>
      <button type="button" class="shname" data-pktoggle="${esc(i.id)}">${esc(i.name)}${unsavedMark(i)}</button>
      ${LS.packEdit && !ro ? `<button type="button" class="round sm" data-pkdel="${esc(i.id)}" aria-label="${tl('Löschen')}">${svg('close')}</button>` : ''}</li>`;
  return `${all.length ? `<div class="packbar" role="progressbar" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${packed}"><i style="width:${Math.round(packed / all.length * 100)}%"></i></div>
      <p class="note">${packed === all.length ? tl('Alles eingepackt.') : tl('{n} von {m} eingepackt', { n: packed, m: all.length })}</p>` : ''}
    <form class="shadd" id="pkForm" data-list="${esc(l.id)}"><input id="pkIn" autocomplete="off" placeholder="${tl('Was muss mit?')}" maxlength="60" aria-label="${tl('Neuer Eintrag')}"><button type="submit" class="btn primary" aria-label="${tl('Hinzufügen')}">${svg('plus')}</button></form>
    ${all.length ? `<ol class="shlist">${all.map(row).join('')}</ol>` : `<div class="empty"><b>${tl('Die Liste ist leer.')}</b>${tl('Was einmal draufsteht, bleibt für das nächste Mal.')}</div>`}
    ${all.length && !ro ? `<div class="sticky-bar"><button type="button" class="btn" data-pkedit="1">${LS.packEdit ? tl('Fertig') : tl('Bearbeiten')}</button><button type="button" class="btn big primary" data-pkreset="${esc(l.id)}"${packed ? '' : ' disabled'}>${tl('Alles auspacken')}</button></div>
      <p class="note">${tl('„Alles auspacken“ nimmt die Haken weg. Die Einträge bleiben für das nächste Mal.')}</p>` : ''}`;
}

// ---------- List settings: name, following (push), archive, delete ----------
const myFollow = () => {
  const r = typeof RECS !== 'undefined' && RECS.members ? RECS.members.find(m => m.id === auth?.member) : null;
  return Array.isArray(r?.follow_lists) ? r.follow_lists.filter(x => typeof x === 'string') : [];
};
function listEditView() {
  const id = view().id, main = id === 'main', l = main ? null : listById(id);
  if (!main && !l) return `${head(tl('Liste'))}<div class="empty"><b>${tl('Diese Liste gibt es nicht mehr.')}</b></div>`;
  const edit = main ? perm('shop') === 'edit' : listPerm(l) === 'edit', on = myFollow().includes(main ? 'main' : l.id);
  const push = window.djuuPush, can = !!push && push.supported();
  const wish = !main && l.kind === 'wish' && edit;
  if (wish && LS.wedit?.id !== l.id) LS.wedit = { id: l.id, name: l.name, ...wishFieldsOf(l) };
  return `${head(main ? tl('Einkauf') : tl('Liste bearbeiten'), main ? '' : esc(l.name))}
    ${wish ? wishFieldsHtml(LS.wedit) : ''}
    ${!main && edit ? `<div class="field"><label for="listRename">${tl('Name')}</label><input id="listRename" maxlength="40" value="${esc(wish ? LS.wedit.name : l.name)}"></div>` : ''}
    ${wish ? wishMoreHtml(LS.wedit) : ''}
    <div class="card">${toggleRow(`data-listfollow="${esc(main ? 'main' : l.id)}"${LS.busy ? ' disabled' : ''}`, on, tl('Mitteilung bei neuen Einträgen'), tl('Aufs Handy, wenn jemand anderes etwas hinzufügt'))}</div>
    <p class="note">${can ? tl('Gilt nur für dich. Ausschalten jederzeit hier oder unter Einstellungen › Mitteilungen.') : pushUnsupportedText()}</p>
    ${!main && edit ? `<div class="stick"><button type="button" class="btn big primary" data-listrename="${esc(l.id)}">${tl('Speichern')}</button></div>
      ${wish && wishCopy(l.id, true).length ? `<button type="button" class="btn wide" data-wscarry="${esc(l.id)}">${tl('Offene Wünsche auf eine neue Liste übernehmen')}</button>` : ''}
      <button type="button" class="btn wide" data-listarchive="${esc(l.id)}">${l.archived ? tl('Wieder hervorholen') : tl('Archivieren')}</button>
      <p class="note">${l.archived ? tl('Die Liste steht dann wieder bei den anderen.') : tl('Archivierte Listen bleiben erhalten und stehen unten unter „Archiviert“.')}</p>
      <button type="button" class="btn wide danger" data-listdel="${esc(l.id)}">${tl('Liste löschen')}</button>` : ''}`;
}
// why push does not work here, calmly (iPhone: only for Djuu on the home screen)
// (here: the push page itself, where the setting is for this device only)
function pushUnsupportedText(here) {
  const ios = typeof isIOS === 'function' && isIOS();
  return ios ? tl('Auf dem iPhone kommen Mitteilungen nur, wenn Djuu auf dem Home-Bildschirm ist: im Browser auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach Djuu von dort öffnen.')
    : here ? tl('Dieser Browser kann keine Mitteilungen anzeigen.') : tl('Dieser Browser kann keine Mitteilungen anzeigen. Auf deinen anderen Geräten gilt die Einstellung trotzdem.');
}
async function setFollow(key, on) {
  const cur = myFollow(), next = on ? [...new Set(cur.concat(key))] : cur.filter(x => x !== key);
  LS.busy = true; renderPanel();
  let msg;
  try {
    const rec = await api('PATCH', `/api/collections/members/records/${auth.member}`, { follow_lists: next });
    if (typeof storeRec === 'function') storeRec('members', rec);
    msg = on ? await followPush() : tl('Keine Mitteilungen mehr für diese Liste.');
  } catch (e) { msg = typeof accountError === 'function' ? accountError(e) : tl('Das hat nicht geklappt.'); }
  toast(msg); LS.busy = false; renderPanel();
}
// the push topic "lists" comes on with the first followed list on this phone; the answer says what really happens here
async function followPush() {
  const push = window.djuuPush;
  if (!push || !push.supported()) return tl('Gespeichert. Dieses Gerät kann keine Mitteilungen anzeigen.');
  try {
    // a browser whose service worker never gets ready must not keep the switch busy (the answer to the permission question can take a while)
    const now = await Promise.race([(async () => {
      const st = await push.state();
      if (!st?.on) await push.enable(['lists']);
      else if (!(st.topics || []).includes('lists')) await push.setTopics([...(st.topics || []), 'lists']);
      return push.state();
    })(), new Promise(res => setTimeout(() => res(null), 60000))]);
    if (now?.on && (now.topics || []).includes('lists')) return tl('Du bekommst eine Mitteilung bei neuen Einträgen.');
  } catch (e) { if (e?.code === 'denied') return tl('Gespeichert. Mitteilungen sind im Browser blockiert. Du kannst sie in den Einstellungen des Browsers für Djuu erlauben.'); }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return tl('Gespeichert. Mitteilungen sind im Browser blockiert. Du kannst sie in den Einstellungen des Browsers für Djuu erlauben.');
  return tl('Gespeichert. Mitteilungen sind auf diesem Gerät noch aus. Einschalten geht unter Einstellungen › Mitteilungen.');
}

// ---------- Interaction ----------
const listItem = id => store.shop.items.find(i => i.id === id);
function addListEntry(listId, input) {
  const l = listById(listId), v = (input?.value || '').trim();
  if (!l || !v || listPerm(l) !== 'edit') return;
  store.shop.items.push({ id: pbId(), name: v.slice(0, 60), qty: '', cat: 'sonst', by: meId(), at: Date.now(), done: false, later: false, list: l.id });
  save(); renderPanel();
  setTimeout(() => document.getElementById(input.id)?.focus(), 30);
}
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'tdForm' || f.id === 'pkForm' || f.id === 'wsForm') { e.preventDefault(); addListEntry(f.dataset.list, f.querySelector('input')); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.listopen) { LS.open = null; LS.packEdit = false; LS.todoMine = false; LS.wedit = null; go({ type: 'wir', page: 'list', id: d.listopen }); }
  else if ('shlistchip' in d) {
    // the shopping lists switch in place (the page stays one step in the history)
    SH.list = d.shlistchip; SH.menu = SH.pending = null;
    stack[stack.length - 1] = d.shlistchip ? { type: 'wir', page: 'list', id: d.shlistchip } : { type: 'wir', page: 'shop' };
    renderPanel();
  }
  else if (d.listnew) { LS.draft = null; go({ type: 'wir', page: 'listnew' }); }
  else if (d.listkind) { const D = LS.draft; if (D.kind === 'wish') wishDraftRead(D); D.name = ($('#listName')?.value || '').trim(); if (D.kind === 'wish' && D.name === D.sug) D.name = ''; D.kind = d.listkind; D.tpl = ''; renderPanel(); }
  else if ('listtpl' in d) {
    const D = LS.draft; if (D.kind === 'wish') wishDraftRead(D); D.name = ($('#listName')?.value || '').trim();
    const before = PACK_TEMPLATES().find(x => x[0] === D.tpl)?.[1];
    D.tpl = D.tpl === d.listtpl ? '' : d.listtpl;
    const tp = PACK_TEMPLATES().find(x => x[0] === D.tpl);
    if (tp && (!D.name || D.name === before)) D.name = tp[1]; // the template's name, unless something else was typed
    renderPanel();
  }
  else if (d.listcreate) listCreate();
  else if (d.listedit) { LS.wedit = null; go({ type: 'wir', page: 'listedit', id: d.listedit }); }
  else if (d.listrename) {
    const l = listById(d.listrename), n = ($('#listRename')?.value || '').trim().slice(0, 40); if (!l) return; if (!n) return toast(tl('Bitte gib der Liste einen Namen.'));
    if (l.kind === 'wish' && LS.wedit?.id === l.id) { wishDraftRead(LS.wedit); Object.assign(l, wishFieldsOf(LS.wedit)); LS.wedit = null; }
    l.name = n; save(); toast(tl('Gespeichert.')); back();
  }
  else if (d.listarchive) { const l = listById(d.listarchive); if (!l) return; l.archived = !l.archived; save(); back(); }
  else if (d.listdel) {
    const l = listById(d.listdel); if (!l) return;
    const n = listItems(l.id).length;
    if (!confirm(n ? tl('„{name}“ mit {n} Einträgen löschen?', { name: l.name, n }) : tl('„{name}“ löschen?', { name: l.name }))) return;
    store.lists = store.lists.filter(x => x !== l);
    store.shop.items = store.shop.items.filter(i => i.list !== l.id); // the server deletes them with the list
    if (SH.list === l.id) SH.list = '';
    save(); stack.pop(); stack.pop(); if (!stack.length) stack = [{ type: 'list' }]; go({ type: 'wir', page: 'lists' });
  }
  // to-dos
  else if (d.tdtoggle) { const i = listItem(d.tdtoggle); if (!i || listPerm(listById(i.list)) !== 'edit') return; i.done = !i.done; i.doneBy = i.done ? meId() : ''; if (LS.open === i.id) LS.open = null; save(); renderPanel(); }
  else if (d.tdopen) { LS.open = LS.open === d.tdopen ? null : d.tdopen; renderPanel(); }
  else if (d.tdwho) { const [id, m] = d.tdwho.split('|'), i = listItem(id); if (!i) return; i.assignee = i.assignee === m ? '' : m; save(); renderPanel(); }
  else if (d.tdnodue) { const i = listItem(d.tdnodue); if (i) { i.due = ''; save(); renderPanel(); } }
  else if (d.tddel) { store.shop.items = store.shop.items.filter(i => i.id !== d.tddel); LS.open = null; save(); renderPanel(); }
  else if (d.tdclear) {
    const before = JSON.parse(JSON.stringify(store.shop.items));
    store.shop.items = store.shop.items.filter(i => !(i.list === d.tdclear && i.done)); save(); renderPanel();
    toastAction(tl('Erledigte gelöscht.'), tl('Rückgängig'), () => { store.shop.items = before; save(); renderPanel(); });
  }
  else if (d.tdmine) { LS.todoMine = d.tdmine === '1'; renderPanel(); }
  // packing lists
  else if (d.pktoggle) { const i = listItem(d.pktoggle); if (!i || listPerm(listById(i.list)) !== 'edit') return; i.done = !i.done; i.doneBy = i.done ? meId() : ''; save(); renderPanel(); }
  else if (d.pkdel) { store.shop.items = store.shop.items.filter(i => i.id !== d.pkdel); save(); renderPanel(); }
  else if (d.pkedit) { LS.packEdit = !LS.packEdit; renderPanel(); }
  else if (d.pkreset) { for (const i of listItems(d.pkreset)) { i.done = false; i.doneBy = ''; } save(); renderPanel(); toast(tl('Alles ausgepackt. Bereit für das nächste Mal.')); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.tdf) {
    const [id, k] = el.dataset.tdf.split('|'), i = listItem(id); if (!i) return;
    if (k === 'name') { const v = el.value.trim().slice(0, 60); if (v) i.name = v; }
    else if (k === 'due') i.due = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '';
    save(); if (k === 'due') renderPanel();
  }
  else if (el.dataset.listfollow) setFollow(el.dataset.listfollow, el.checked);
});
Object.assign(WIR_PAGES, { lists: listsView, list: oneListView, listnew: listNewView, listedit: listEditView, wishthanks: wishThanksView });

// ---------- Wish lists (Wunschliste) ----------
// A wish list (kind 'wish') has a child (or none = the whole family), an occasion with an optional date, a "Bitte nicht"
// note and a surprise switch. Its entries have link, price, note, prio ("wünscht sich sehr"), givers and a state:
// free (no givers), taken ("vergeben"), received ('received') or no longer needed ('gone', kept). `done` = "Danke gesagt".
const OCCASIONS = () => [['xmas', tl('Weihnachten')], ['birthday', tl('Geburtstag')], ['other', tl('Sonstiges')]];
const WISH_LINK = /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?([/?#][^\s"'<>\\]*)?$/; // the same rule as the server (djuu_wish.js)
// the server knows wish lists: an app update that arrives before the server update keeps the kind hidden
const wishOk = () => { const r = typeof RECS !== 'undefined' && RECS.lists; return !r || !r.length || 'surprise' in r[0]; };
const wishKid = l => (l?.kid && store.profile.kids.find(k => k.id === l.kid)) || null;
const wishGivers = i => (Array.isArray(i?.givers) ? i.givers : []);
const isFree = i => !i.wstate && !wishGivers(i).length;
const wishSort = (a, b) => (!!b.prio - !!a.prio) || a.at - b.at;
// "Größe 98/104 · Schuhe 25"
const sizesText = k => (k ? [k.size && tl('Größe {s}', { s: k.size }), k.shoe && tl('Schuhe {s}', { s: k.shoe })].filter(Boolean).join(' · ') : '');
// the next birthday of a child whose month and day are known: { date: 'YYYY-MM-DD', age }
function nextBirthday(k) {
  const [y, m] = String(k?.ym || '').split('-').map(Number), d = +k?.d;
  if (!y || !m || !d) return null;
  const t = today0();
  let yr = t.getFullYear(), day = new Date(yr, m - 1, d);
  if (day < t) day = new Date(++yr, m - 1, d);
  return { date: ymd(day), age: yr - y };
}
const xmasYear = () => { const t = today0(); return t.getFullYear() + (t.getMonth() === 11 && t.getDate() > 26 ? 1 : 0); };
// the suggested name: "Emma · Weihnachten 2026", "Emma · 3. Geburtstag", "Taufe"
function wishName(D) {
  const k = D.kid && kidById(D.kid), who = k ? (k.name || tl('Kind')) : '';
  let what;
  if (D.occ === 'xmas') what = tl('Weihnachten {year}', { year: /^\d{4}/.test(D.date || '') ? D.date.slice(0, 4) : xmasYear() });
  else if (D.occ === 'birthday') {
    const y = +String(k?.ym || '').slice(0, 4), age = y && /^\d{4}/.test(D.date || '') ? +D.date.slice(0, 4) - y : nextBirthday(k)?.age;
    what = age > 0 ? tl('{n}. Geburtstag', { n: age }) : tl('Geburtstag');
  } else what = D.occName || tl('Wünsche');
  return (who ? `${who} · ${what}` : what).slice(0, 40);
}
// the wish fields of a list or draft
const wishFieldsOf = x => ({ kid: x.kid || '', occ: x.occ || '', occName: (x.occName || '').slice(0, 40), date: x.date || '', avoid: (x.avoid || '').slice(0, 300), surprise: !!x.surprise });
function wishDraftInit(D) {
  if (D.occ == null) {
    const kids = store.profile.kids.filter(k => k.id);
    Object.assign(D, { kid: kids.length === 1 ? kids[0].id : '', occ: 'xmas', occName: '', date: '', avoid: '', surprise: false, autoDate: '' }, D.from || {});
    delete D.from;
  }
  wishAutoDate(D);
  // the suggestion follows the choices until something else is typed
  const sug = wishName(D);
  if (!D.name || D.name === D.sug) D.name = sug;
  D.sug = sug;
}
// a birthday list gets the child's next birthday as its date (unless another date was chosen)
function wishAutoDate(D) {
  const nb = D.occ === 'birthday' ? nextBirthday(kidById(D.kid)) : null;
  if (!D.date || D.date === D.autoDate) { D.date = nb ? nb.date : ''; D.autoDate = D.date; }
}
// what is typed on the page goes into the draft before the page is drawn again
function wishDraftRead(D) {
  const v = id => document.getElementById(id);
  if (v('listName') && D === LS.draft) D.name = v('listName').value.trim().slice(0, 40);
  if (v('listRename') && D === LS.wedit) D.name = v('listRename').value.trim().slice(0, 40);
  if (v('wsOccName')) D.occName = v('wsOccName').value.trim().slice(0, 40);
  if (v('wsDate')) D.date = /^\d{4}-\d{2}-\d{2}$/.test(v('wsDate').value) ? v('wsDate').value : '';
  if (v('wsAvoid')) D.avoid = v('wsAvoid').value.trim().slice(0, 300);
}
const wishDraft = () => (view().page === 'listnew' ? LS.draft : LS.wedit);
// for whom and which occasion (above the name)
function wishFieldsHtml(D) {
  const kids = store.profile.kids.filter(k => k.id);
  return `<div class="field"><label>${tl('Für wen')}</label><div class="fgrid">${[{ id: '', name: tl('Ganze Familie') }].concat(kids.map(k => ({ id: k.id, name: k.name || tl('Kind') })))
      .map(k => `<button type="button" class="chip${D.kid === k.id ? ' on' : ''}" data-wskid="${esc(k.id)}" aria-pressed="${D.kid === k.id}">${D.kid === k.id ? svg('check') : ''}${esc(k.name)}</button>`).join('')}</div></div>
    <div class="field"><label>${tl('Anlass')}</label><div class="segs" role="tablist">${OCCASIONS().map(([k, n]) => `<button type="button" role="tab" aria-selected="${D.occ === k}" class="${D.occ === k ? 'on' : ''}" data-wsocc="${k}">${n}</button>`).join('')}</div>
      ${D.occ === 'other' ? `<input id="wsOccName" maxlength="40" value="${esc(D.occName)}" placeholder="${tl('z. B. Taufe')}" aria-label="${tl('Anlass')}" data-wsname="1">` : ''}</div>
    <div class="field"><label for="wsDate">${tl('Datum')} <small class="muted">${tl('freiwillig')}</small></label><input id="wsDate" type="date" value="${esc(D.date)}" data-wsname="1"></div>`;
}
// "Bitte nicht", surprise and the starting point (below the name)
function wishMoreHtml(D) {
  return `<div class="field"><label for="wsAvoid">${tl('Bitte nicht')} <small class="muted">${tl('freiwillig')}</small></label><textarea id="wsAvoid" maxlength="300" placeholder="${tl('z. B. keine Süßigkeiten, wenig Plastik')}">${esc(D.avoid)}</textarea></div>
    <div class="card">${toggleRow('data-wssurprise="1"', !!D.surprise, tl('Überraschung'), tl('Wer was schenkt, sieht nur, wer es eingetragen hat. Alle anderen sehen „vergeben“.'))}</div>`;
}

// entries to copy into a new list: all but "nicht mehr nötig" (onlyOpen: also not the received ones); never the givers
const wishCopy = (id, onlyOpen) => listItems(id).filter(i => i.wstate !== 'gone' && (!onlyOpen || !i.wstate)).sort((a, b) => a.at - b.at);
function wishSub(l) {
  const open = listItems(l.id).filter(i => !i.wstate), free = open.filter(isFree).length, taken = open.length - free;
  if (!listItems(l.id).length) return tl('Noch leer');
  return [free ? tl('{n} frei', { n: free }) : '', taken ? tl('{n} vergeben', { n: taken }) : ''].filter(Boolean).join(' · ') || tl('Nichts mehr offen');
}
// Who gives it, as shown on this phone. Surprise lists show a giver's name only to the person who entered it (and to the
// giver); everyone else reads "vergeben". This is a display rule in the app, NOT a security boundary: everyone who may read
// the list can read the givers through the API. Once a gift has arrived (received), its givers are shown to everyone.
function giversText(l, i) {
  const g = wishGivers(i);
  if (!g.length) return '';
  const me = meId(), seen = !l.surprise || i.wstate === 'received' ? g : g.filter(x => x.by === me || x.member === me);
  if (!seen.length) return tl('vergeben');
  const names = joinNames(seen.map(x => x.name)), more = g.length - seen.length;
  return more ? tl('vergeben: {names} und {n} weitere', { names, n: more }) : tl('vergeben: {names}', { names });
}
const safeLink = v => (WISH_LINK.test(v || '') ? v : '');
function wishHtml(l, ro) {
  const all = listItems(l.id), me = meId(), k = wishKid(l);
  const open = all.filter(i => !i.wstate).sort(wishSort), got = all.filter(i => i.wstate === 'received').sort((a, b) => a.at - b.at), gone = all.filter(i => i.wstate === 'gone').sort((a, b) => a.at - b.at);
  const occ = l.occ === 'other' ? l.occName : OCCASIONS().find(o => o[0] === l.occ)?.[1];
  const when = l.date ? new Date(l.date + 'T12:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const forLine = [k ? tl('Für {name}', { name: k.name || tl('Kind') }) : tl('Für die ganze Familie'), [occ, when].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const row = i => {
    const meta = [i.note, i.price].filter(Boolean).join(' · '), who = giversText(l, i), link = safeLink(i.link);
    const state = i.wstate === 'received' ? tl('angekommen') : i.wstate === 'gone' ? tl('nicht mehr nötig') : who || tl('frei');
    return `<li class="shrow tdrow wishrow${i.wstate ? ' done' : ''}${isFree(i) ? ' free' : ''}">
      <button type="button" class="shname" data-wsopen="${esc(i.id)}"${ro ? ' disabled' : ''}>${esc(i.name)}${i.prio ? ` <small class="wprio">${tl('wünscht sich sehr')}</small>` : ''}
        ${meta ? `<small class="tdmeta">${esc(meta)}</small>` : ''}<small class="tdmeta wstate">${esc(state)}</small>${unsavedMark(i)}</button>
      ${link ? `<a class="round sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="${tl('Link öffnen')}">${svg('link')}</a>` : ''}</li>
      ${LS.open === i.id && !ro ? wishEditHtml(l, i, me) : ''}`;
  };
  const after = got.length || (l.date && l.date < ymd(today0())) || l.archived;
  return `<div class="wishtop">${forLine ? `<p class="wishfor">${esc(forLine)}</p>` : ''}${sizesText(k) ? `<p class="wishfor">${esc(sizesText(k))}</p>` : ''}
      ${l.avoid ? `<p class="hintbox"><span><b>${tl('Bitte nicht')}:</b> ${esc(l.avoid)}</span></p>` : ''}
      ${l.surprise ? `<p class="note">${tl('Überraschung: Wer was schenkt, sieht nur, wer es eingetragen hat.')}</p>` : ''}</div>
    ${ro ? '' : `<form class="shadd" id="wsForm" data-list="${esc(l.id)}"><input id="wsIn" autocomplete="off" placeholder="${tl('Was wird gewünscht?')}" maxlength="60" aria-label="${tl('Neuer Wunsch')}"><button type="submit" class="btn primary" aria-label="${tl('Hinzufügen')}">${svg('plus')}</button></form>`}
    ${open.length ? `<ol class="shlist">${open.map(row).join('')}</ol>` : `<div class="empty"><b>${all.length ? tl('Gerade ist nichts offen.') : tl('Noch keine Wünsche.')}</b>${all.length ? '' : tl('Tippe einen Wunsch ein. Link, Preis und Hinweis kannst du danach ergänzen.')}</div>`}
    ${got.length ? `<details class="fold"${LS.open && got.some(i => i.id === LS.open) ? ' open' : ''}><summary>${tl('Angekommen ({n})', { n: got.length })}</summary><ol class="shlist">${got.map(row).join('')}</ol></details>` : ''}
    ${gone.length ? `<details class="fold"${LS.open && gone.some(i => i.id === LS.open) ? ' open' : ''}><summary>${tl('Nicht mehr nötig ({n})', { n: gone.length })}</summary><ol class="shlist">${gone.map(row).join('')}</ol></details>` : ''}
    <div class="wishacts">${open.some(isFree) ? `<button type="button" class="btn wide" data-wsshare="${esc(l.id)}">${svg('share')}${tl('Als Text teilen')}</button>` : ''}
      ${got.length ? `<button type="button" class="btn wide" data-wsthanks="${esc(l.id)}">${tl('Danke sagen')}</button>` : ''}
      ${after && !ro && open.length ? `<button type="button" class="btn wide" data-wscarry="${esc(l.id)}">${tl('Offene Wünsche auf eine neue Liste übernehmen')}</button>` : ''}</div>
    ${open.some(isFree) ? `<p class="note">${tl('Im Text stehen nur freie Wünsche, ohne die Namen der Schenkenden.')}</p>` : ''}`;
}
// one wish opened: details, who gives it, state
function wishEditHtml(l, i, me) {
  const g = wishGivers(i), id = esc(i.id), mine = g.some(x => x.member === me);
  const visible = (x) => !l.surprise || i.wstate === 'received' || x.by === me || x.member === me;
  const hidden = g.filter(x => !visible(x)).length;
  const f = (k, label, v, max, extra = '') => `<label class="small" for="ws_${k}_${id}">${label} <small class="muted">${tl('freiwillig')}</small></label><input id="ws_${k}_${id}" data-wsf="${id}|${k}" value="${esc(v || '')}" maxlength="${max}"${extra}>`;
  return `<li class="tdedit wishedit"><input data-wsf="${id}|name" value="${esc(i.name)}" maxlength="60" aria-label="${tl('Was')}">
    ${f('link', tl('Link'), i.link, 500, ` type="url" inputmode="url" placeholder="https://…"`)}
    ${f('price', tl('Preis'), i.price, 30, ` placeholder="${tl('z. B. ca. 20 €')}"`)}
    ${f('note', tl('Hinweis'), i.note, 200, ` placeholder="${tl('z. B. Größe 104, gebraucht ist okay')}"`)}
    <div class="fgrid"><button type="button" class="chip${i.prio ? ' on' : ''}" data-wsprio="${id}" aria-pressed="${!!i.prio}">${i.prio ? svg('check') : ''}${tl('Wünscht sich sehr')}</button></div>
    <label class="small">${g.length > 1 ? tl('Gemeinsam schenken') : tl('Wer schenkt das?')}</label>
    ${g.length ? `<div class="fgrid">${g.map((x, n) => visible(x) ? `<button type="button" class="chip on" data-wsgdel="${id}|${n}" aria-label="${esc(tl('{name} entfernen', { name: x.name }))}">${esc(x.name)} ${svg('close')}</button>` : '').join('')}
      ${hidden ? `<span class="muted small">${hidden === 1 ? tl('1 weitere Person') : tl('{n} weitere Personen', { n: hidden })}</span>` : ''}</div>` : ''}
    ${g.length < 6 && !i.wstate ? `<div class="fgrid">${mine ? '' : `<button type="button" class="chip" data-wsme="${id}">${g.length ? tl('Ich schenke mit') : tl('Das schenke ich')}</button>`}</div>
      <div class="calwhen"><input id="wsGiver" maxlength="40" placeholder="${tl('Name, z. B. Oma Rita')}" aria-label="${tl('Wer schenkt das?')}"><button type="button" class="chip" data-wsgadd="${id}">${tl('Eintragen')}</button></div>` : ''}
    <div class="fgrid">${i.wstate ? `<button type="button" class="chip" data-wsstate="${id}|">${tl('Wieder offen')}</button>`
      : `<button type="button" class="chip" data-wsstate="${id}|received">${tl('Ist angekommen')}</button><button type="button" class="chip" data-wsstate="${id}|gone">${tl('Nicht mehr nötig')}</button>`}</div>
    <div class="fgrid"><button type="button" class="chip on" data-wsopen="${id}">${tl('Fertig')}</button><button type="button" class="chip" data-wsdel="${id}">${tl('Löschen')}</button></div></li>`;
}

// "Als Text teilen": the free wishes as plain text (never the givers), for a message to grandparents and friends
function wishText(l) {
  const k = wishKid(l), free = listItems(l.id).filter(isFree).sort(wishSort);
  const lines = [l.name];
  if (l.avoid) lines.push(tl('Bitte nicht: {what}', { what: l.avoid }));
  if (sizesText(k)) lines.push(sizesText(k));
  lines.push('');
  for (const i of free) lines.push('• ' + [i.name + (i.prio ? ' ' + tl('(wünscht sich sehr)') : ''), i.note, i.price, safeLink(i.link)].filter(Boolean).join(' · '));
  return lines.join('\n');
}
async function wishShare(l) {
  const text = wishText(l);
  if (navigator.share) {
    try { await navigator.share({ title: l.name, text }); return; }
    catch (e) { if (e?.name === 'AbortError') return; } // closed by the person: nothing to say
  }
  try { await navigator.clipboard.writeText(text); toast(tl('Text kopiert. Du kannst ihn jetzt einfügen.')); return; } catch (e) { /* older browser: below */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  toast(ok ? tl('Text kopiert. Du kannst ihn jetzt einfügen.') : tl('Kopieren hat nicht geklappt.'));
}

// "Danke sagen": what arrived and from whom, to tick off (done = thanked)
function wishThanksView() {
  const l = listById(view().id);
  if (!l) return `${head(tl('Danke sagen'))}<div class="empty"><b>${tl('Diese Liste gibt es nicht mehr.')}</b></div>`;
  const ro = listPerm(l) !== 'edit', got = listItems(l.id).filter(i => i.wstate === 'received').sort((a, b) => a.at - b.at);
  const row = i => `<li class="shrow tdrow${i.done ? ' done' : ''}">
      <button type="button" class="shcheck" data-wsthank="${esc(i.id)}" aria-label="${i.done ? tl('Noch nicht gedankt') : tl('Danke gesagt')}"${ro ? ' disabled' : ''}>${i.done ? svg('check') : ''}</button>
      <span class="shname">${esc(i.name)}<small class="tdmeta">${esc(joinNames(wishGivers(i).map(x => x.name)) || tl('Von wem, steht nicht dabei'))}</small></span></li>`;
  const left = got.filter(i => !i.done).length;
  return `${head(tl('Danke sagen'), esc(l.name))}
    <p class="muted text">${tl('Was angekommen ist und von wem. Abhaken, wenn ihr Danke gesagt habt.')}</p>
    ${got.length ? `<ol class="shlist">${got.map(row).join('')}</ol><p class="note">${left ? tl('Noch {n} offen.', { n: left }) : tl('Allen gedankt.')}</p>` : `<div class="empty"><b>${tl('Noch nichts angekommen.')}</b></div>`}`;
}

// a new wish list from this one: the same child and occasion, the open wishes as starting point (without givers)
function wishCarry(l) {
  LS.draft = { kind: 'wish', name: '', tpl: 'open:' + l.id, from: { kid: wishKid(l) ? l.kid : '', occ: l.occ || 'xmas', occName: l.occName || '', date: '', avoid: l.avoid || '', surprise: !!l.surprise, autoDate: '' } };
  go({ type: 'wir', page: 'listnew' });
}
const wishEditable = i => !!i && listPerm(listById(i.list)) === 'edit';
function addGiver(i, g) {
  const list = wishGivers(i);
  if (list.length >= 6) return toast(tl('Mehr als sechs Personen gehen nicht.'));
  i.givers = list.concat({ name: g.name.slice(0, 40), member: g.member || '', by: meId() || '', at: Date.now() });
  save(); renderPanel();
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if ('wskid' in d || d.wsocc) {
    const D = wishDraft(); if (!D) return;
    wishDraftRead(D);
    if ('wskid' in d) D.kid = d.wskid; else D.occ = d.wsocc;
    if (D === LS.draft) wishDraftInit(D); else wishAutoDate(D);
    renderPanel();
  }
  else if (d.wsopen) { LS.open = LS.open === d.wsopen ? null : d.wsopen; renderPanel(); }
  else if (d.wsprio) { const i = listItem(d.wsprio); if (!wishEditable(i)) return; i.prio = !i.prio; save(); renderPanel(); }
  else if (d.wsme) { const i = listItem(d.wsme), me = meId(); if (!wishEditable(i) || !me) return; addGiver(i, { name: memberById(me)?.name || tl('Ich'), member: me }); }
  else if (d.wsgadd) {
    const i = listItem(d.wsgadd), n = ($('#wsGiver')?.value || '').trim(); if (!wishEditable(i)) return;
    if (!n) return toast(tl('Bitte gib einen Namen ein.'));
    addGiver(i, { name: n, member: '' });
  }
  else if (d.wsgdel) { const [id, n] = d.wsgdel.split('|'), i = listItem(id); if (!wishEditable(i)) return; i.givers = wishGivers(i).filter((_, k) => k !== +n); save(); renderPanel(); }
  else if ('wsstate' in d) {
    const [id, st] = d.wsstate.split('|'), i = listItem(id); if (!wishEditable(i)) return;
    i.wstate = st; if (!st) { i.done = false; i.doneBy = ''; }
    LS.open = null; save(); renderPanel();
    if (st) toast(st === 'received' ? tl('Steht jetzt unter „Angekommen“.') : tl('Steht jetzt unter „Nicht mehr nötig“.'));
  }
  else if (d.wsdel) {
    const i = listItem(d.wsdel); if (!wishEditable(i)) return;
    store.shop.items = store.shop.items.filter(x => x !== i); LS.open = null; save(); renderPanel();
    toastAction(tl('Wunsch gelöscht.'), tl('Rückgängig'), () => { store.shop.items.push(i); save(); renderPanel(); });
  }
  else if (d.wsshare) { const l = listById(d.wsshare); if (l) wishShare(l); }
  else if (d.wsthanks) go({ type: 'wir', page: 'wishthanks', id: d.wsthanks });
  else if (d.wsthank) { const i = listItem(d.wsthank); if (!wishEditable(i)) return; i.done = !i.done; i.doneBy = i.done ? meId() : ''; save(); renderPanel(); }
  else if (d.wscarry) { const l = listById(d.wscarry); if (l) wishCarry(l); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.wsf) {
    const [id, k] = el.dataset.wsf.split('|'), i = listItem(id); if (!wishEditable(i)) return;
    let v = el.value.trim();
    if (k === 'name') { if (v) i.name = v.slice(0, 60); }
    else if (k === 'link') {
      if (v && !/^[a-z]+:/i.test(v)) v = 'https://' + v; // "shop.de/x" is meant as https
      try { if (v) v = new URL(v).href; } catch (x) { v = '#'; }
      if (v && !WISH_LINK.test(v)) { el.value = i.link || ''; return toast(tl('Der Link muss mit https:// beginnen.')); }
      i.link = v.slice(0, 500);
    }
    else if (k === 'price') i.price = v.slice(0, 30);
    else if (k === 'note') i.note = v.slice(0, 200);
    save();
  }
  else if (el.dataset.wssurprise) { const D = wishDraft(); if (D) { wishDraftRead(D); D.surprise = el.checked; renderPanel(); } }
  else if (el.dataset.wsname && LS.draft && view().page === 'listnew') {
    // occasion name or date: the suggested name follows (in place: drawing the page again here would remove the field being left)
    wishDraftRead(LS.draft); wishDraftInit(LS.draft);
    const n = $('#listName'); if (n) n.value = LS.draft.name;
  }
});
