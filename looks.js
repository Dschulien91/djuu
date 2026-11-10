/* Djuu looks and news: photos (Wir and people), the six person colours, and "Neuigkeiten" behind the bell on the map.
   Photos are cut round in the app and shrunk to at most 512 px (JPEG). They are stored with the Wir or the person on the
   Djuu server, so everyone allowed to see that person sees them (children only the family group). No face recognition.
   News come from what others in the Wir do (lists, saved events, joining) and from coming school holidays; they live on
   this phone. Loaded after wir.js. */
'use strict'; // i18n-skip

// ---------- Colours ----------
const COLOR_NAMES = [tl('Viola'), tl('Petrol'), tl('Rosa'), tl('Orange'), tl('Gelb'), tl('Nachtblau')];
const isPalette = c => MEMBER_COLORS.includes(c);
// may this phone change the photo and colour of an entry? Own person; for children and people without an account the admin
const canEditLooks = x => !!x && !x.remote && (x.id === meId() || (isAdmin() && (!x.account || x.grp === 'helper')));
// every person gets a colour, in the same Wir if possible without repeating; stored only where this phone may change it
function assignColors() {
  const pr = store.profile, order = pr.adults.filter(a => a.grp !== 'helper').concat(pr.kids.filter(k => !k.remote), pr.adults.filter(a => a.grp === 'helper'));
  const used = new Set(order.map(x => x.color).filter(isPalette));
  let changed = false, n = 0;
  for (const x of order) {
    if (isPalette(x.color)) continue;
    const free = MEMBER_COLORS.find(c => !used.has(c)) || MEMBER_COLORS[n++ % MEMBER_COLORS.length];
    used.add(free);
    if (canEditLooks(x) || !signedIn()) { x.color = free; changed = true; }
  }
  if (changed) save();
}
const colorPicker = (key, current) => `<div class="colors" role="radiogroup">${MEMBER_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${current === c}" class="colorbtn${current === c ? ' on' : ''}" style="--c:${c};--on:${onColor(c)}" data-color="${key}|${c}" aria-label="${COLOR_NAMES[i]}">${current === c ? svg('check') : ''}</button>`).join('')}</div>`;

// ---------- Photo sheet and round cropping ----------
// opts: { title, hint, avatar (html), hasPhoto, onPhoto(dataUrl), onRemove() }
let PHOTO = null;
function photoSheet(opts) {
  PHOTO = opts;
  document.getElementById('lock')?.remove();
  const el = document.createElement('div');
  el.id = 'lock'; el.className = 'lockwrap';
  el.innerHTML = `<div class="lockbg" data-photoclose="1"></div><div class="locksheet photosheet" role="dialog" aria-modal="true" aria-labelledby="phT"><i class="lockgrip"></i>
    <div class="phhead">${opts.avatar || ''}<span class="navtx"><b id="phT">${esc(opts.title)}</b><small>${esc(opts.hint || '')}</small></span></div>
    <label class="sheetrow">${svg('camera')}<span>${tl('Foto aufnehmen')}</span><input type="file" accept="image/*" capture="${opts.selfie ? 'user' : 'environment'}" data-photofile="1" hidden></label>
    <label class="sheetrow">${svg('image')}<span>${tl('Aus der Galerie wählen')}</span><input type="file" accept="image/*" data-photofile="1" hidden></label>
    ${opts.hasPhoto ? `<button type="button" class="sheetrow danger" data-photoremove="1">${svg('trash')}<span>${tl('Foto entfernen')}</span></button>` : ''}
    ${opts.extra || ''}
    <button type="button" class="btn big wide" data-photoclose="1">${tl('Abbrechen')}</button></div>`;
  document.body.appendChild(el);
}
const closeSheet = () => document.getElementById('lock')?.remove();
// cropper: drag to move, pinch / wheel / slider to zoom; the circle shows what is kept
const CROP = { img: null, s: 1, min: 1, x: 0, y: 0, size: 300 };
function openCropper(file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    closeSheet();
    const size = Math.min(window.innerWidth - 64, 320);
    Object.assign(CROP, { img, size, min: size / Math.min(img.width, img.height) });
    CROP.s = CROP.min; CROP.x = (size - img.width * CROP.s) / 2; CROP.y = (size - img.height * CROP.s) / 2;
    const el = document.createElement('div');
    el.id = 'crop'; el.className = 'cropwrap';
    el.innerHTML = `<div class="cropbox" role="dialog" aria-modal="true" aria-label="${tl('Foto zuschneiden')}"><h3>${tl('Foto zuschneiden')}</h3><p class="muted">${tl('Verschieben und zoomen, bis alles im Kreis ist.')}</p>
      <div class="cropstage" style="width:${size}px;height:${size}px"><canvas id="cropCv" width="${size * 2}" height="${size * 2}" style="width:${size}px;height:${size}px"></canvas><i class="cropmask"></i></div>
      <label class="cropzoom">${svg('search')}<input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" aria-label="${tl('Zoom')}"></label>
      <div class="cropacts"><button type="button" class="btn big" data-cropcancel="1">${tl('Abbrechen')}</button><button type="button" class="btn big primary" data-cropsave="1">${tl('Speichern')}</button></div></div>`;
    document.body.appendChild(el);
    drawCrop(); bindCrop();
  };
  img.onerror = () => toast(tl('Dieses Bild lässt sich nicht öffnen.'));
  img.src = url;
}
function clampCrop() {
  const { img, s, size } = CROP;
  CROP.x = Math.min(0, Math.max(size - img.width * s, CROP.x));
  CROP.y = Math.min(0, Math.max(size - img.height * s, CROP.y));
}
function drawCrop() {
  const cv = $('#cropCv'); if (!cv) return;
  const g = cv.getContext('2d'), k = 2;
  g.fillStyle = '#1F1B4D'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(CROP.img, CROP.x * k, CROP.y * k, CROP.img.width * CROP.s * k, CROP.img.height * CROP.s * k);
}
function zoomTo(s, cx = CROP.size / 2, cy = CROP.size / 2) {
  s = Math.max(CROP.min, Math.min(CROP.min * 4, s));
  CROP.x = cx - (cx - CROP.x) * s / CROP.s; CROP.y = cy - (cy - CROP.y) * s / CROP.s; CROP.s = s;
  clampCrop(); drawCrop();
  const z = $('#cropZoom'); if (z) z.value = String(s / CROP.min);
}
function bindCrop() {
  const cv = $('#cropCv'), pts = new Map();
  let last = null, dist0 = 0, s0 = 1;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); last = [e.offsetX, e.offsetY];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); s0 = CROP.s; } });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; zoomTo(s0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / (dist0 || 1), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
    CROP.x += e.offsetX - last[0]; CROP.y += e.offsetY - last[1]; last = [e.offsetX, e.offsetY]; clampCrop(); drawCrop();
  });
  const up = e => { pts.delete(e.pointerId); last = pts.size ? [...pts.values()][0] : null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomTo(CROP.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.offsetX, e.offsetY); }, { passive: false });
  $('#cropZoom').addEventListener('input', e => zoomTo(CROP.min * +e.target.value));
}
// the square inside the circle, at most 512 px, as a small JPEG
function cropResult() {
  const out = Math.min(512, Math.round(CROP.size / CROP.s)), c = document.createElement('canvas');
  c.width = c.height = Math.max(64, out);
  c.getContext('2d').drawImage(CROP.img, -CROP.x / CROP.s, -CROP.y / CROP.s, CROP.size / CROP.s, CROP.size / CROP.s, 0, 0, c.width, c.height);
  let q = .85, url = c.toDataURL('image/jpeg', q);
  while (url.length > 180000 && q > .4) { q -= .1; url = c.toDataURL('image/jpeg', q); }
  return url;
}

// ---------- News ("Neuigkeiten") ----------
store.news = store.news || [];
const NEWS_AREAS = {
  shop: [tl('Einkauf'), 'cart', '#6B4EE6'], errands: [tl('Besorgungen'), 'list', '#0E8F84'], saved: [tl('Gemerkt'), 'heart', '#D6336C'],
  termine: [tl('Termine'), 'cal', '#CC6A00'], wir: [tl('Wir'), 'user', '#0E8F84'], tipp: [tl('Vorschlag'), 'star', '#6B4EE6'], karte: [tl('Karte'), 'pin', '#0E8F84'],
};
// news topics this person may get (helpers only where they have access) and which of them are switched off (store.newsOff,
// kept with the account, see sync.js); switched-off topics are neither listed nor counted at the bell
const NEWS_TOPICS = () => ['shop', 'errands', 'saved', 'wir', 'tipp'].filter(k => !['shop', 'errands', 'saved'].includes(k) || perm(k) !== 'none');
const newsOn = area => !(store.newsOff || []).includes(area) && (NEWS_TOPICS().includes(area) || !['shop', 'errands', 'saved', 'wir', 'tipp'].includes(area));
const visibleNews = () => store.news.filter(n => newsOn(n.area));
const unread = () => visibleNews().filter(n => !n.read).length;
// switch topics on or off: at once, on this phone, and in the account for all phones
async function setNewsOff(off) {
  store.newsOff = [...new Set(off)]; save(); updateBell(); renderPanel();
  if (auth?.userId) { try { await api('PATCH', `/api/collections/users/records/${auth.userId}`, { news_prefs: { off: store.newsOff } }); } catch (e) { /* tried again with the next change */ } }
}
function addNews(n) {
  if (n.key && store.news.some(x => x.key === n.key)) return;
  store.news.unshift({ id: pbId(), at: Date.now(), read: false, ...n });
  store.news = store.news.slice(0, 60);
  save(); updateBell();
}
const nameOfMember = id => memberById(id)?.name || tl('Jemand');
const AREA_OF = { shop_items: 'shop', errands: 'errands', saved_offers: 'saved' };
// a record someone else in the Wir created (called by sync.js for live events and after being away)
function newsFromRecord(coll, r) {
  if (!auth?.family) return;
  const by = r.added_by || r.saved_by || '', me = auth.member;
  if (coll === 'members') {
    if (r.kind === 'adult' && r.user && r.id !== me) addNews({ area: 'wir', key: 'join:' + r.id, text: tl('{name} ist jetzt in eurem Wir', { name: r.name }), target: { person: r.id } });
    return;
  }
  const area = AREA_OF[coll];
  if (!area || !by || by === me || perm(area === 'saved' ? 'saved' : area) === 'none') return;
  const who = nameOfMember(by);
  if (coll === 'shop_items') {
    // several things in a row from the same person become one message: "Tom hat Milch und Äpfel ... hinzugefügt"
    const last = store.news[0];
    if (last && last.area === 'shop' && !last.read && last.by === by && Date.now() - last.at < 30 * 60e3) {
      last.items = [...(last.items || []), r.name]; last.at = Date.now(); last.text = shopNewsText(who, last.items); save(); updateBell(); return;
    }
    return addNews({ area, by, items: [r.name], text: shopNewsText(who, [r.name]), target: { page: 'shop' }, key: 'shop:' + r.id });
  }
  if (coll === 'errands') return addNews({ area, by, text: tl('{name} plant eine Besorgung: {what}', { name: who, what: r.title }), target: { page: 'errands' }, key: 'err:' + r.id });
  if (coll === 'saved_offers') return addNews({ area, by, text: tl('{name} hat „{what}“ gemerkt', { name: who, what: r.snap?.title || tl('einen Termin') }), target: { offer: r.offer_id }, key: 'sav:' + r.id });
}
function shopNewsText(who, items) {
  const list = items.length <= 3 ? items.join(items.length === 2 ? tl(' und ') : ', ').replace(/, ([^,]*)$/, tl(' und ') + '$1') : `${items.slice(0, 2).join(', ')} ${tl('und {n} weitere', { n: items.length - 2 })}`;
  return tl('{name} hat {items} zur Einkaufsliste hinzugefügt', { name: who, items: list });
}
// Gemerkt: when the provider publishes a new block of a saved course or group, once (the same provider and title, a new offer)
function courseBlockNews() {
  if (!auth?.family || !OFFERS.length || perm('saved') === 'none') return;
  const key = o => norm(`${o.provider || ''}|${(o.title || '').replace(/\d+/g, '')}`);
  const seen = store.blocksSeen || (store.blocksSeen = {});
  for (const s of store.savedOffers) {
    const o = OFFER_BY_ID.get(s.id) || s.snap;
    if (!o || !['kurs', 'gruppe'].includes(o.kind)) continue;
    const same = OFFERS.filter(x => x.id !== s.id && ['kurs', 'gruppe'].includes(x.kind) && key(x) === key(o));
    if (!seen[s.id]) { seen[s.id] = same.map(x => x.id); continue; } // first look: remember what exists already
    for (const x of same) if (!seen[s.id].includes(x.id)) {
      seen[s.id].push(x.id);
      const d = nextDate(x);
      addNews({ area: 'saved', key: 'block:' + x.id, text: tl('Neuer Termin für „{what}“{when}', { what: titleOf(x), when: d ? ' ' + tl('ab {date}', { date: fmtShort(d) }) : '' }), target: { offer: x.id } });
    }
  }
  save();
}
// once per school break, two weeks before: ideas for the free days
function holidayNews() {
  if (!auth?.family || typeof nextBreak !== 'function') return;
  const b = nextBreak();
  if (b && !b.running && b.days <= 14) addNews({ area: 'tipp', key: 'ferien:' + ymd(b.from), text: tl('{name} in {n} Tagen: Ideen für die freien Tage', { name: b.name, n: b.days }), target: { ferien: 1 } });
}
function newsWhen(t) {
  const d = new Date(t), mins = Math.round((Date.now() - t) / 60e3), days = Math.round((today0() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (mins < 60) return mins < 1 ? tl('gerade eben') : tl('vor {n} Min.', { n: mins });
  if (days === 0) return tl('heute');
  if (days === 1) return tl('gestern');
  if (days < 7) return d.toLocaleDateString(LOCALE, { weekday: 'short' });
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}
function newsView() {
  const fresh = visibleNews().filter(n => !n.read), old = visibleNews().filter(n => n.read);
  const row = n => { const [label, ic, c] = NEWS_AREAS[n.area] || NEWS_AREAS.wir;
    return `<li><button type="button" class="newsrow${n.read ? '' : ' new'}" data-news="${n.id}"><span class="newsic" style="--c:${c}">${svg(ic)}</span>
      <span class="navtx"><b>${esc(n.text)}</b><small>${esc(label)} · ${esc(newsWhen(n.at))}</small></span>${n.read ? '' : '<i class="newdot" aria-label="' + tl('neu') + '"></i>'}</button></li>`; };
  return `<div class="ph"><button type="button" class="round" data-back="1" aria-label="${tl('Zurück')}">${svg('back')}</button><h2>${tl('Neuigkeiten')}<span class="sub">${fresh.length ? tl('{n} neu', { n: fresh.length }) : tl('Alles gelesen')}</span></h2>
      <button type="button" class="pillbtn" data-wir="bell">${svg('gear')}${tl('Einstellungen')}</button></div>
    ${fresh.length ? `<div class="sec"><h4>${tl('Neu')}</h4><ol class="card plist newslist">${fresh.map(row).join('')}</ol></div>` : ''}
    ${old.length ? `<div class="sec"><h4>${tl('Früher')}</h4><ol class="card plist newslist">${old.map(row).join('')}</ol></div>` : ''}
    ${visibleNews().length ? `<p class="note center">${tl('Tippe auf eine Meldung, um direkt dorthin zu gehen.')}</p>` : `<div class="empty"><b>${tl('Noch keine Neuigkeiten.')}</b>${tl('Hier erscheint, was in eurem Wir passiert: Einkauf, Besorgungen, Gemerktes und neue Personen. Dazu Ideen vor den Ferien.')}</div>`}`;
}
function openNews(id) {
  const n = store.news.find(x => x.id === id); if (!n) return;
  n.read = true; save(); updateBell();
  const t = n.target || {};
  if (t.page) { SH.menu = SH.pending = SH.editing = null; stack = [{ type: 'list' }]; go({ type: 'me' }, 'full'); setTab('me'); go({ type: 'wir', page: t.page }); }
  else if (t.offer) go({ type: 'offer', id: t.offer }, 'full');
  else if (t.person) { stack = [{ type: 'list' }]; go({ type: 'me' }, 'full'); setTab('me'); go({ type: 'person', id: t.person }); }
  else if (t.ferien) go({ type: 'ferien' }, 'full');
  else if (t.place) go({ type: 'detail', id: t.place }, 'full');
  else renderPanel();
}
// the bell: on the map only, for people with an account; a pink dot with the number of unread news
function updateBell() {
  let b = document.getElementById('bell');
  if (!b) {
    b = document.createElement('button'); b.type = 'button'; b.id = 'bell'; b.className = 'bellbtn'; b.dataset.opennews = '1';
    document.getElementById('app').appendChild(b);
  }
  const n = unread(), show = !!auth?.family && state.tab === 'map';
  b.hidden = !show;
  document.getElementById('topbar')?.classList.toggle('withbell', show);
  b.setAttribute('aria-label', n ? tl('Neuigkeiten, {n} ungelesen', { n }) : tl('Neuigkeiten'));
  b.innerHTML = svg('bell') + (n ? `<span class="belldot">${n > 9 ? '9+' : n}</span>` : '');
}

// ---------- Interaction ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.photoclose) { closeSheet(); PHOTO = null; }
  else if (d.photoremove) { const p = PHOTO; closeSheet(); p?.onRemove?.(); }
  else if (d.cropcancel) { $('#crop')?.remove(); }
  else if (d.cropsave) { const url = cropResult(), p = PHOTO; $('#crop')?.remove(); p?.onPhoto?.(url); PHOTO = null; }
  else if (d.opennews) go({ type: 'wir', page: 'news' }, 'full');
  else if (d.news) openNews(d.news);
  else if (d.newsall) setNewsOff(d.newsall === 'on' ? [] : NEWS_TOPICS());
});
document.addEventListener('change', e => {
  if (e.target.dataset.photofile && e.target.files[0]) openCropper(e.target.files[0]);
  if (e.target.dataset.newstopic) { const k = e.target.dataset.newstopic, off = (store.newsOff || []).filter(x => x !== k); setNewsOff(e.target.checked ? off : off.concat(k)); }
});

// start: colours for everyone, the bell on the map
assignColors();
updateBell();
