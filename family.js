/* Djuu family: members, shopping list (supermarket) and errands (Besorgungen).
   Loaded after app.js and uses its helpers (store, save, svg, esc, head, view, renderPanel, toast, uid).
   Everything stays on this device for now. The shapes are ready for the shared family on the server
   (db/supabase/schema.sql): every item knows who added it (member id) and when. */
'use strict';

// ---------- Members ----------
// ids in the server's format (15 lowercase letters and digits), so items need no renaming when the family is shared
function pbId() { const a = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.getRandomValues(new Uint8Array(15)); return Array.from(b, x => a[x % 36]).join(''); }
const MEMBER_COLORS = ['#6B4EE6', '#0E8F84', '#D6336C', '#CC6A00', '#1971C2', '#2F9E44', '#9C36B5'];
store.profile.adults = store.profile.adults || [];
for (const k of store.profile.kids) k.id = k.id || pbId();
for (const a of store.profile.adults) a.id = a.id || pbId();
save();
function members() {
  const pr = store.profile;
  return pr.adults.map((a, i) => ({ id: a.id, name: a.name || `Erwachsene*r ${i + 1}`, kid: false }))
    .concat(pr.kids.map((k, i) => ({ id: k.id, name: k.name || `Kind ${i + 1}`, kid: true, size: k.size, shoe: k.shoe })))
    .map((m, i) => ({ ...m, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }));
}
const memberById = id => members().find(m => m.id === id);
// who is using this device: chosen in "Wir", else the first adult
const meId = () => (memberById(store.profile.me) && store.profile.me) || store.profile.adults[0]?.id || null;
const byLine = id => { const m = id && memberById(id); return m ? `<span class="by" style="--c:${m.color}">${esc(m.name)}</span>` : ''; };

function adultsHtml() {
  const pr = store.profile, ms = members();
  return `<div class="sec"><h4>Erwachsene</h4>
      <p class="muted text">Alles freiwillig. Die Namen zeigen später, wer etwas auf die Liste gesetzt hat.</p>
      ${pr.adults.map((a, i) => `<div class="kidrow">
        <input data-adult="${i}" data-k="name" value="${esc(a.name || '')}" placeholder="Name" maxlength="20" aria-label="Name von Erwachsener ${i + 1}">
        ${a.account ? '<span class="round" aria-hidden="true"></span>' : `<button type="button" class="round" data-deladult="${i}" aria-label="Entfernen">${svg('close')}</button>`}
        <input data-adult="${i}" data-k="work" value="${esc(a.work || '')}" placeholder="Arbeitszeiten (optional), z. B. Mo–Fr 8–16" maxlength="60" aria-label="Arbeitszeiten" class="wide"></div>`).join('')}
      <button type="button" class="btn" data-addadult="1">${svg('plus')}Erwachsene*n hinzufügen</button>
      ${ms.length && !(typeof auth !== 'undefined' && auth?.family) ? `<div class="field"><label for="meSel">Wer nutzt dieses Handy?</label><select id="meSel">${ms.filter(m => !m.kid || ms.every(x => x.kid)).map(m => `<option value="${m.id}"${meId() === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>` : ''}
    </div>`;
}
// extra, optional details per child (shown folded under each child in "Wir")
const kidMoreHtml = (k, i) => `<details class="kidmore"${k.school || k.size || k.shoe ? ' open' : ''}><summary>Kita, Schule, Größen</summary>
  <input data-kid="${i}" data-k="school" value="${esc(k.school || '')}" placeholder="Kita oder Schule, Klasse" maxlength="60" aria-label="Kita oder Schule">
  <input data-kid="${i}" data-k="size" value="${esc(k.size || '')}" placeholder="Kleidergröße, z. B. 104" maxlength="12" aria-label="Kleidergröße">
  <input data-kid="${i}" data-k="shoe" value="${esc(k.shoe || '')}" placeholder="Schuhgröße" maxlength="8" aria-label="Schuhgröße"></details>`;

function connectHtml() {
  return `<div class="sec"><h4>Familie verbinden</h4>
    <p class="text">Bald: Einladen per Link, dann sehen alle dieselben Listen, Gemerktes und Termine. Dazu kommen ein Familienkalender zum Abonnieren und „Wo seid ihr?“, mit dem man die anderen bitten kann, ihren Standort einmal zu senden.</p>
    <p class="note">Bis dahin bleibt alles auf diesem Gerät.</p></div>`;
}

// ---------- Shopping: supermarket ----------
// Categories in the order most German supermarkets put them; the app learns the order of your shop from how you tick items off.
const SHOP_CATS = [
  ['obst', 'Obst & Gemüse', 'apfel aepfel banane birne orange mandarine clementine zitrone limette traube trauben erdbeere erdbeeren himbeere himbeeren heidelbeere heidelbeeren blaubeeren kiwi mango ananas melone wassermelone pfirsich nektarine pflaume kirsche kirschen avocado tomate tomaten gurke salat eisberg rucola feldsalat spinat brokkoli blumenkohl karotte karotten moehre moehren moehrchen kartoffel kartoffeln suesskartoffel zwiebel zwiebeln knoblauch paprika zucchini aubergine kohlrabi lauch porree sellerie fenchel radieschen pilze champignons ingwer kraeuter petersilie basilikum schnittlauch dill koriander minze mais kuerbis rote bete obst gemuese weintrauben'],
  ['brot', 'Brot & Backwaren', 'brot brotchen broetchen toast toastbrot vollkornbrot baguette croissant laugenbrezel brezel kuchen knaeckebrot zwieback wraps tortilla tortillas fladenbrot aufbackbroetchen'],
  ['kuehl', 'Milch, Käse & Eier', 'milch hafermilch sojamilch mandelmilch joghurt jogurt quark skyr sahne schmand creme fraiche butter margarine kaese gouda emmentaler mozzarella feta parmesan frischkaese hirtenkaese reibekaese eier ei pudding kefir buttermilch smoothie hefe frischhefe tofu'],
  ['fleisch', 'Wurst, Fleisch & Fisch', 'wurst salami schinken aufschnitt leberwurst wiener wuerstchen bratwurst hack hackfleisch rinderhack haehnchen haehnchenbrust huhn pute putenbrust schnitzel steak gulasch speck lachs fisch fischstaebchen thunfisch garnelen frikadellen'],
  ['fruehstueck', 'Frühstück, Kaffee & Tee', 'muesli musli haferflocken cornflakes cerealien marmelade konfituere honig nutella nussnougatcreme erdnussbutter kaffee kaffeebohnen espresso kakao tee pfefferminztee kamillentee fruechtetee kaffeepads kapseln'],
  ['vorrat', 'Nudeln, Reis & Vorrat', 'nudeln spaghetti penne fusilli reis couscous bulgur quinoa linsen kichererbsen bohnen mehl zucker puderzucker backpulver vanillezucker salz pfeffer gewuerze paprikapulver curry oel olivenoel rapsoel essig balsamico ketchup senf mayonnaise mayo pesto tomatensosse passata tomatenmark dosentomaten bruehe gemuesebruehe suppe konserven mais dose dosen nuesse mandeln rosinen sosse sossen sojasosse kokosmilch'],
  ['suess', 'Süßes & Knabbern', 'schokolade schoki kekse plaetzchen gummibaerchen bonbons chips salzstangen cracker popcorn riegel muesliriegel kaugummi suessigkeiten lebkuchen'],
  ['getraenke', 'Getränke', 'wasser mineralwasser sprudel saft apfelsaft orangensaft schorle apfelschorle limo limonade cola bier wein sekt sirup eistee'],
  ['baby', 'Baby & Drogerie', 'windeln feuchttuecher babybrei brei pre milchpulver folgemilch quetschie quetschies schnuller wundcreme babyshampoo zahnpasta zahnbuerste shampoo duschgel seife deo deodorant creme sonnencreme toilettenpapier klopapier taschentuecher waschlappen pflaster tampons binden rasierer wattepads wattestaebchen'],
  ['haushalt', 'Haushalt & Putzen', 'spuelmittel spuelmaschinentabs tabs waschmittel weichspueler muellbeutel muelltueten alufolie frischhaltefolie backpapier kuechenrolle schwamm schwaemme putzmittel reiniger batterien gluehbirne kerzen servietten gefrierbeutel'],
  ['tier', 'Tierbedarf', 'hundefutter katzenfutter katzenstreu leckerli tierfutter'],
  ['tiefkuehl', 'Tiefkühl', 'tk tiefkuehl pizza tiefkuehlpizza eis eiscreme pommes tk-gemuese erbsen spinat-tk beeren-tk fischstaebchen-tk'],
  ['sonst', 'Sonstiges', ''],
];
const SHOP_CAT = Object.fromEntries(SHOP_CATS.map(([id, label]) => [id, label]));
const SHOP_WORDS = [];
// German plural and case endings off, so "Bananen" finds "banane" and "Äpfel" finds "apfel"
const stem = w => w.length > 4 ? w.replace(/(en|n|e|s)$/, '') : w;
for (const [id, , words] of SHOP_CATS) for (const w of words.split(' ').filter(Boolean)) SHOP_WORDS.push([stem(norm(w)), id]);
SHOP_WORDS.sort((a, b) => b[0].length - a[0].length); // longest match first: "hafermilch" before "milch"

store.shop = Object.assign({ items: [], history: {}, learned: {}, rank: {}, trips: 0, seq: [] }, store.shop || {});
store.errands = store.errands || [];
const SH = { pending: null, menu: null, undo: null, editing: null }; // screen state, not saved

// "2 Milch", "Milch 2x", "500 g Hack" -> quantity and name
function parseItem(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  let m = t.match(/^(\d+(?:[.,]\d+)?\s*(?:x|stk\.?|stück|g|gr|kg|l|ml|pck\.?|packungen?|dosen?|flaschen?|becher|beutel|bund|netz|kisten?)?)\s+(.+)$/i);
  if (m) return { qty: m[1].replace(/\s+/g, ' '), name: m[2] };
  m = t.match(/^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:x|stk\.?|g|kg|l|ml)?)$/i);
  if (m && !/(gr\.?|größe|groesse|nr\.?|gr)$/i.test(m[1])) return { qty: m[2], name: m[1] }; // "Windeln Gr. 4" keeps its size
  return { qty: '', name: t };
}
// same thing, different spelling: case, umlauts, plural endings
const itemKey = name => { const n = norm(name).replace(/[^a-z0-9]+/g, ''); return n.length > 4 ? n.replace(/(en|n|e|s)$/, '') : n; };
function shopCat(name) {
  const k = itemKey(name);
  if (store.shop.learned[k]) return store.shop.learned[k];
  const ws = norm(name).replace(/[^a-z0-9 -]+/g, '').split(/[ -]+/).filter(Boolean).map(stem);
  for (const [w, id] of SHOP_WORDS) if (ws.some(x => x === w || (w.length >= 3 && x.endsWith(w)))) return id;
  return 'sonst';
}
// learned shop order: average position of each category in past trips, default order until there are two trips
function catOrder() {
  const base = Object.fromEntries(SHOP_CATS.map(([id], i) => [id, i]));
  if (store.shop.trips < 2) return base;
  const r = store.shop.rank, out = {};
  for (const id in base) out[id] = r[id] != null ? r[id] : base[id] / SHOP_CATS.length;
  out.sonst = 99;
  return out;
}
const openItems = () => store.shop.items.filter(i => !i.done && !i.later);
function findDuplicate(name) {
  const k = itemKey(name);
  return openItems().concat(store.shop.items.filter(i => i.later)).find(i => itemKey(i.name) === k || (k.length >= 5 && typoDist(itemKey(i.name), k, 1) <= 1));
}
function addShopItem(text, force = false) {
  const { qty, name } = parseItem(text);
  if (!name) return;
  const dup = !force && findDuplicate(name);
  if (dup) { SH.pending = { text, qty, name, dup: dup.id }; renderPanel(); return; }
  store.shop.items.push({ id: pbId(), name, qty, cat: shopCat(name), by: meId(), at: Date.now(), done: false, later: false });
  SH.pending = null; save(); renderPanel();
  setTimeout(() => $('#shIn')?.focus(), 30);
}
// "Menge erhöhen": numbers add up, everything else is listed
function raiseQty(item, qty) {
  const a = parseFloat((item.qty || '1').replace(',', '.')), b = parseFloat((qty || '1').replace(',', '.'));
  const unitA = (item.qty || '').replace(/[\d.,\s]/g, ''), unitB = (qty || '').replace(/[\d.,\s]/g, '');
  item.qty = !isNaN(a) && !isNaN(b) && unitA === unitB ? `${String(a + b).replace('.', ',')}${unitA ? ' ' + unitA : ''}` : [item.qty || '1', qty || '1'].join(' + ');
  item.later = false;
}
function finishTrip() {
  const s = store.shop, done = s.items.filter(i => i.done);
  if (!done.length) return;
  // learn the shop: position of each category in the order things went into the trolley
  const seen = [];
  for (const c of s.seq) if (!seen.includes(c)) seen.push(c);
  seen.forEach((c, i) => { const pos = i / Math.max(1, seen.length - 1); s.rank[c] = s.rank[c] == null ? pos : s.rank[c] * .6 + pos * .4; });
  for (const i of done) { const h = s.history[itemKey(i.name)] || { name: i.name, cat: i.cat, n: 0 }; h.n++; h.last = Date.now(); h.name = i.name; h.cat = i.cat; s.history[itemKey(i.name)] = h; }
  s.items = s.items.filter(i => !i.done).map(i => ({ ...i, later: false })); // "Nächstes Mal" comes back
  s.trips++; s.seq = [];
  save(); toast(`Einkauf fertig: ${done.length} ${done.length === 1 ? 'Sache' : 'Sachen'} erledigt.`);
}
function shopHtml() {
  const s = store.shop, order = catOrder(), open = openItems();
  const groups = {};
  for (const i of open) (groups[i.cat] || (groups[i.cat] = [])).push(i);
  const cats = Object.keys(groups).sort((a, b) => order[a] - order[b]);
  const done = s.items.filter(i => i.done), later = s.items.filter(i => i.later && !i.done);
  const onList = new Set(s.items.map(i => itemKey(i.name)));
  const often = Object.entries(s.history).filter(([k]) => !onList.has(k)).sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).slice(0, 10);
  const row = i => `<li class="shrow${i.done ? ' done' : ''}">
      <button type="button" class="shcheck" data-shtoggle="${i.id}" aria-label="${i.done ? 'Zurück auf die Liste' : 'Abhaken'}">${i.done ? svg('check') : ''}</button>
      <button type="button" class="shname" data-shtoggle="${i.id}">${i.qty ? `<b>${esc(i.qty)}</b> ` : ''}${esc(i.name)}${byLine(i.by)}</button>
      ${i.done ? '' : `<button type="button" class="round sm" data-shmenu="${i.id}" aria-label="Mehr">⋯</button>`}</li>
      ${SH.menu === i.id ? `<li class="shmenu"><button type="button" class="chip" data-shlater="${i.id}">Nächstes Mal</button><button type="button" class="chip" data-shdel="${i.id}">Löschen</button>
        <span class="muted">Gang:</span>${SHOP_CATS.map(([id, l]) => `<button type="button" class="chip${i.cat === id ? ' on' : ''}" data-shcat="${i.id}|${id}">${esc(l)}</button>`).join('')}</li>` : ''}`;
  const p = SH.pending, pd = p && s.items.find(i => i.id === p.dup);
  return `<form class="shadd" id="shForm"><input id="shIn" autocomplete="off" placeholder="Was fehlt? z. B. 2 Milch" maxlength="60" aria-label="Neuer Eintrag"><button type="submit" class="btn primary" aria-label="Hinzufügen">${svg('plus')}</button></form>
    ${p && pd ? `<div class="dupcard"><b>„${esc(pd.name)}“ steht schon drauf${pd.later ? ' (für nächstes Mal)' : ''}${pd.qty ? ', ' + esc(pd.qty) : ''}${memberById(pd.by) ? `, von ${esc(memberById(pd.by).name)}` : ''}.</b>
      <div class="fgrid"><button type="button" class="chip on" data-shraise="1">Menge erhöhen</button><button type="button" class="chip" data-shforce="1">Trotzdem hinzufügen</button><button type="button" class="chip" data-shcancel="1">Abbrechen</button></div></div>` : ''}
    ${often.length ? `<div class="row shoften">${often.map(([k, h]) => `<button type="button" class="chip" data-shagain="${esc(k)}">${svg('plus')}${esc(h.name)}</button>`).join('')}</div>` : ''}
    ${open.length ? cats.map(c => `<h4 class="shcat">${esc(SHOP_CAT[c])}</h4><ol class="shlist">${groups[c].sort((a, b) => a.at - b.at).map(row).join('')}</ol>`).join('')
      : `<div class="empty"><b>${done.length ? 'Alles im Wagen.' : 'Die Liste ist leer.'}</b>${done.length ? 'Tippe auf „Einkauf fertig“, wenn ihr durch seid.' : 'Was fehlt, sortiert Djuu nach den Gängen im Supermarkt.'}</div>`}
    ${done.length ? `<h4 class="shcat">Im Wagen (${done.length})</h4><ol class="shlist">${done.map(row).join('')}</ol>` : ''}
    ${later.length ? `<details class="fold"><summary>Nächstes Mal (${later.length})</summary><ol class="shlist">${later.map(i => `<li class="shrow"><span class="shname">${i.qty ? `<b>${esc(i.qty)}</b> ` : ''}${esc(i.name)}${byLine(i.by)}</span><button type="button" class="chip" data-shnow="${i.id}">Jetzt</button></li>`).join('')}</ol>
      <p class="note">Kommt nach „Einkauf fertig“ automatisch wieder auf die Liste.</p></details>` : ''}
    ${s.items.length ? `<div class="sticky-bar"><button type="button" class="btn" data-shclear="1">Liste leeren</button><button type="button" class="btn big primary" data-shfinish="1"${done.length ? '' : ' disabled'}>Einkauf fertig</button></div>` : ''}
    <p class="note">${store.shop.trips >= 2 ? 'Die Reihenfolge der Gänge lernt Djuu aus euren letzten Einkäufen.' : 'Sortiert wie in den meisten Supermärkten. Nach zwei Einkäufen passt Djuu die Reihenfolge an euren Laden an.'}</p>`;
}

// ---------- Errands (Besorgungen): clothes, furniture, presents ----------
const ERRAND_STATES = [['idee', 'Idee'], ['ja', 'Kaufen wir'], ['gekauft', 'Gekauft']];
const cleanUrl = u => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : null; } catch (e) { return null; } };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
// a readable title from a shop link: last words of the path ("kinderbett-90x200" -> "Kinderbett 90x200"), else the shop's name
function titleFromUrl(u) {
  try {
    const parts = decodeURIComponent(new URL(u).pathname).split('/').filter(x => /[a-zäöüß]{3}/i.test(x) && !/^(p|dp|product|produkt|artikel|item|de|shop)$/i.test(x));
    const t = (parts.pop() || '').replace(/\.[a-z]{2,5}$/i, '').replace(/[-_+]+/g, ' ').replace(/\b[0-9a-f]{8,}\b|\b\d{5,}\b/gi, '').replace(/\s+/g, ' ').trim();
    return t.length >= 3 ? t.charAt(0).toUpperCase() + t.slice(1, 70) : hostOf(u);
  } catch (e) { return hostOf(u); }
}
function addErrand(text) {
  const t = text.trim(); if (!t) return;
  const url = /^(https?:\/\/|www\.)\S+$/i.test(t) ? cleanUrl(t) : null;
  const e = { id: pbId(), title: url ? titleFromUrl(url) : t, link: url || '', for: '', note: '', price: '', state: 'idee', by: meId(), at: Date.now() };
  store.errands.unshift(e); SH.editing = url ? e.id : null; save(); renderPanel();
}
function errandHtml() {
  const ms = members(), list = store.errands, open = list.filter(e => e.state !== 'gekauft'), bought = list.filter(e => e.state === 'gekauft');
  const groups = [['', 'Für alle']].concat(ms.map(m => [m.id, 'Für ' + m.name])).map(([id, l]) => [l, open.filter(e => (e.for || '') === id || (id === '' && !memberById(e.for)))]).filter(([, l]) => l.length);
  const card = e => {
    const m = memberById(e.for), size = m && m.kid && (m.size || m.shoe) ? [m.size && 'Gr. ' + m.size, m.shoe && 'Schuhe ' + m.shoe].filter(Boolean).join(' · ') : '';
    return `<li class="ercard${e.state === 'gekauft' ? ' done' : ''}">
      <div class="erhead"><button type="button" class="shcheck" data-erbought="${e.id}" aria-label="${e.state === 'gekauft' ? 'Doch nicht gekauft' : 'Gekauft'}">${e.state === 'gekauft' ? svg('check') : ''}</button>
        <div class="ertitle"><b>${esc(e.title)}</b>
          <span class="ermeta">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener nofollow">${esc(hostOf(e.link))}</a>` : ''}${e.price ? `<span>${esc(e.price)}</span>` : ''}${size ? `<span>${esc(size)}</span>` : ''}${byLine(e.by)}</span>
          ${e.note ? `<span class="muted">${esc(e.note)}</span>` : ''}</div>
        <button type="button" class="round sm" data-eredit="${e.id}" aria-label="Bearbeiten">${svg('edit')}</button></div>
      ${e.state !== 'gekauft' ? `<div class="erstates">${ERRAND_STATES.slice(0, 2).map(([id, l]) => `<button type="button" class="chip${e.state === id ? ' on' : ''}" data-erstate="${e.id}|${id}">${l}</button>`).join('')}</div>` : ''}
      ${SH.editing === e.id ? `<div class="eredit">
        <input data-erf="${e.id}|title" value="${esc(e.title)}" maxlength="80" aria-label="Was">
        <input data-erf="${e.id}|link" value="${esc(e.link)}" placeholder="Link (optional)" inputmode="url" aria-label="Link">
        <select data-erf="${e.id}|for" aria-label="Für wen"><option value="">Für alle</option>${ms.map(x => `<option value="${x.id}"${e.for === x.id ? ' selected' : ''}>Für ${esc(x.name)}</option>`).join('')}</select>
        <input data-erf="${e.id}|price" value="${esc(e.price)}" placeholder="Preis (optional)" maxlength="20" aria-label="Preis">
        <input data-erf="${e.id}|note" value="${esc(e.note)}" placeholder="Notiz, z. B. Farbe, Laden" maxlength="140" aria-label="Notiz">
        <div class="fgrid"><button type="button" class="chip on" data-eredit="${e.id}">Fertig</button><button type="button" class="chip" data-erdel="${e.id}">Löschen</button></div></div>` : ''}</li>`;
  };
  return `<form class="shadd" id="erForm"><input id="erIn" autocomplete="off" placeholder="Was brauchen wir? Oder Link einfügen" maxlength="300" aria-label="Neue Besorgung"><button type="submit" class="btn primary" aria-label="Hinzufügen">${svg('plus')}</button></form>
    ${groups.length ? groups.map(([l, items]) => `<h4 class="shcat">${esc(l)}</h4><ol class="erlist">${items.map(card).join('')}</ol>`).join('')
      : `<div class="empty"><b>Noch nichts geplant.</b>Für alles außer dem Wocheneinkauf: Kinderkleidung, Möbel, Geschenke. Ein Link zum Shop passt auch.</div>`}
    ${bought.length ? `<details class="fold"><summary>Gekauft (${bought.length})</summary><ol class="erlist">${bought.map(card).join('')}</ol></details>` : ''}`;
}

// ---------- The family tab ----------
const FAM_SEGS = [['einkauf', 'Einkauf'], ['besorgungen', 'Besorgungen'], ['wir', 'Wir']];
function familyView() {
  const seg = state.famSeg || 'einkauf';
  const n = openItems().length, e = store.errands.filter(x => x.state !== 'gekauft').length;
  return `${head('Familie', typeof auth !== 'undefined' && auth?.family ? 'Geteilt mit ' + esc(auth.familyName || 'der Familie') : 'Bisher nur auf diesem Gerät', false)}
    <div class="famseg" role="tablist">${FAM_SEGS.map(([id, l]) => `<button type="button" role="tab" aria-selected="${seg === id}" class="${seg === id ? 'on' : ''}" data-famseg="${id}">${l}${id === 'einkauf' && n ? ` <span class="n">${n}</span>` : id === 'besorgungen' && e ? ` <span class="n">${e}</span>` : ''}</button>`).join('')}</div>
    ${seg === 'einkauf' ? shopHtml() : seg === 'besorgungen' ? errandHtml() : `<div class="melogo">${LOGO}</div>${syncHtml()}${adultsHtml()}${savedView()}`}`;
}

// ---------- Interaction ----------
function shopItem(id) { return store.shop.items.find(i => i.id === id); }
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, s = store.shop;
  if (d.famseg) { state.famSeg = d.famseg; SH.menu = SH.pending = SH.editing = null; renderPanel(); }
  else if (d.shtoggle) { const i = shopItem(d.shtoggle); i.done = !i.done; if (i.done) { i.doneBy = meId(); s.seq.push(i.cat); } SH.menu = null; save(); renderPanel(); }
  else if (d.shmenu) { SH.menu = SH.menu === d.shmenu ? null : d.shmenu; renderPanel(); }
  else if (d.shlater) { shopItem(d.shlater).later = true; SH.menu = null; save(); renderPanel(); toast('Kommt beim nächsten Einkauf wieder.'); }
  else if (d.shnow) { shopItem(d.shnow).later = false; save(); renderPanel(); }
  else if (d.shdel) { s.items = s.items.filter(i => i.id !== d.shdel); SH.menu = null; save(); renderPanel(); }
  else if (d.shcat) { const [id, c] = d.shcat.split('|'), i = shopItem(id); i.cat = c; s.learned[itemKey(i.name)] = c; SH.menu = null; save(); renderPanel(); }
  else if (d.shraise) { const p = SH.pending, i = shopItem(p.dup); raiseQty(i, p.qty); SH.pending = null; save(); renderPanel(); }
  else if (d.shforce) { const p = SH.pending; SH.pending = null; addShopItem(p.text, true); }
  else if (d.shcancel) { SH.pending = null; renderPanel(); }
  else if (d.shagain) { const h = s.history[d.shagain]; addShopItem(h.name); }
  else if (d.shfinish) { finishTrip(); renderPanel(); }
  else if (d.shclear) {
    // everything on the list goes, "Nächstes Mal" stays and becomes the new list; one tap brings it all back
    const before = JSON.parse(JSON.stringify(s.items));
    s.items = s.items.filter(i => i.later && !i.done).map(i => ({ ...i, later: false })); save(); renderPanel();
    SH.undo = before; toastAction('Liste geleert.', 'Rückgängig', () => { s.items = SH.undo; SH.undo = null; save(); renderPanel(); });
  }
  else if (d.erbought) { const x = store.errands.find(r => r.id === d.erbought); x.state = x.state === 'gekauft' ? 'ja' : 'gekauft'; save(); renderPanel(); }
  else if (d.erstate) { const [id, st] = d.erstate.split('|'); store.errands.find(r => r.id === id).state = st; save(); renderPanel(); }
  else if (d.eredit) { SH.editing = SH.editing === d.eredit ? null : d.eredit; renderPanel(); }
  else if (d.erdel) { store.errands = store.errands.filter(r => r.id !== d.erdel); SH.editing = null; save(); renderPanel(); }
  else if (d.addadult) { store.profile.adults.push({ id: pbId(), name: '', work: '' }); save(); renderPanel(); }
  else if (d.deladult) { store.profile.adults.splice(+d.deladult, 1); save(); renderPanel(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'shForm') { e.preventDefault(); const v = $('#shIn').value; if (v.trim()) addShopItem(v); }
  if (e.target.id === 'erForm') { e.preventDefault(); const v = $('#erIn').value; if (v.trim()) addErrand(v); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.adult != null) { store.profile.adults[+el.dataset.adult][el.dataset.k] = el.value.trim(); save(); }
  if (el.id === 'meSel') { store.profile.me = el.value; save(); }
  if (el.dataset.erf) {
    const [id, k] = el.dataset.erf.split('|'), x = store.errands.find(r => r.id === id);
    if (k === 'link') { const u = el.value.trim() ? cleanUrl(el.value.trim()) : ''; if (u === null) return toast('Der Link sieht nicht richtig aus.'); x.link = u; }
    else x[k] = el.value.trim();
    save();
    if (k === 'for') renderPanel();
  }
});
// toast with one action button (undo)
function toastAction(msg, label, fn) {
  const t = $('#toast');
  t.innerHTML = `${esc(msg)} <button type="button" class="toastbtn">${esc(label)}</button>`;
  t.hidden = false; clearTimeout(toast.t);
  t.querySelector('button').onclick = () => { fn(); t.hidden = true; };
  toast.t = setTimeout(() => t.hidden = true, 6000);
}
