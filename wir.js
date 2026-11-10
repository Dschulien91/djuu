/* Djuu "Wir": the hub of a family. People in three groups (Familie, Kinder, Helfer:innen) with access per area,
   the first steps, Meine Orte, "Was passt zu euch?", Gemerkt, settings, account and "Über Djuu".
   Einkauf and Besorgungen are unchanged (family.js); they only open from the tiles here and follow the access rules.
   Guests (no account) use the map, search and events; the Wir, the lists, Gemerkt and Meine Orte need an account.
   Loaded after app.js, family.js and sync.js. */
'use strict'; // i18n-skip

// ---------- People, groups and access ----------
const AREAS = [['shop', tl('Einkauf')], ['errands', tl('Besorgungen')], ['cal', tl('Kalender')], ['saved', tl('Gemerkt')]];
const LEVELS = [['none', tl('Kein Zugriff')], ['view', tl('Ansehen')], ['edit', tl('Mitbearbeiten')]];
const DEFAULT_PERMS = { family: { shop: 'edit', errands: 'edit', cal: 'edit', saved: 'edit' }, helper: { shop: 'view', errands: 'view', cal: 'view', saved: 'none' } };
const ROLES_ME = [tl('Mama'), tl('Papa'), tl('Elternteil'), tl('Bezugsperson'), tl('Anderes …'), tl('Lieber nicht sagen')];
const ROLES_FAMILY = [tl('Partner:in'), tl('Elternteil'), tl('Oma / Opa'), tl('Tante / Onkel'), tl('Anderes …')];
const ROLES_HELPER = [tl('Babysitter:in'), tl('Tagesmutter / -vater'), tl('Freund:in'), tl('Nachbar:in'), tl('Anderes …')];
const FIT_TAGS = [tl('Alleinerziehend'), tl('Regenbogenfamilie'), tl('Zwei Zuhause'), tl('Patchwork'), tl('Pflege- oder Adoptivfamilie'), tl('Mehrsprachig'), tl('Großeltern helfen mit'), tl('Inklusion, besonderer Bedarf'), tl('Neu in Hamburg'), tl('Mehrlinge')];
const PLACE_NAMES = [tl('Zuhause'), tl('Arbeit'), tl('Kita'), tl('Oma & Opa')];

store.places = store.places || [];
// dogs are entries in the Wir (a name is optional); an old count ("Hunde in der Familie: 2") becomes that many entries
if (!Array.isArray(store.profile.dogList)) store.profile.dogList = Array.from({ length: Math.max(0, Math.min(9, +store.profile.dogs || 0)) }, () => ({ id: pbId(), name: '' }));
delete store.profile.dogs;
store.favBy = store.favBy || {};
// photos belong to the person and are shared like the person (children: family group only); old phone-only photos move in
if (store.kidPhotos) {
  for (const x of store.profile.kids.concat(store.profile.dogList || [])) if (store.kidPhotos[x.id] && !x.photo) x.photo = store.kidPhotos[x.id];
  delete store.kidPhotos;
}
for (const a of store.profile.adults) { a.grp = a.grp || 'family'; a.perms = a.perms || { ...DEFAULT_PERMS[a.grp] }; }
// the old single "Zuhause" becomes the first of "Meine Orte"
if (store.profile.home && !store.places.length) {
  const h = store.profile.home, plz = (String(h.label).match(/\b\d{5}\b/) || [''])[0];
  store.places.push({ id: pbId(), name: tl('Zuhause'), plz, address: '', lat: h.lat, lon: h.lon, shared: false, def: true, mine: true });
}
// people who used Djuu before the first steps existed do not see them
if (store.onboarded == null) store.onboarded = store.profile.adults.some(a => a.name) || store.profile.kids.length > 0 || store.shop.items.length > 0;
if (store.welcomed == null) store.welcomed = store.onboarded || store.favorites.length > 0 || store.savedOffers.length > 0;
save();

const signedIn = () => typeof auth !== 'undefined' && !!auth?.family;
const meAdult = () => store.profile.adults.find(a => a.id === meId()) || null;
const expired = a => !!a?.until && a.until < ymd(today0());
const isAdmin = () => signedIn() && !!meAdult()?.admin;
// what this person may do in an area: 'none', 'view' or 'edit'. Guests: nothing (the lists need an account).
function perm(area) {
  if (!signedIn()) return 'none';
  const me = meAdult();
  if (!me) return 'none';
  if (me.admin) return 'edit';
  if (expired(me)) return 'none';
  return me.perms?.[area] || 'edit';
}
const W = { onb: 1, add: { grp: 'family', role: '', perms: null, until: '', name: '' }, place: null, fitDraft: null, savedTab: 'orte', savedWho: '', remind: null, busy: false };

const kidAgeText = k => ageText(kidAge(k));
// Birth date in three parts: day, month, year. Only the year is needed; a day needs a month.
// key: an index of store.profile.kids, or 'new' for the "add child" page (W.add)
const MONTHS = () => Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(LOCALE, { month: 'long' }));
function birthParts(k) { const [y, m] = String(k.ym || '').split('-'); return { y: y || '', m: m ? String(+m) : '', d: m && k.d ? String(+k.d) : '' }; }
function birthHtml(key, k, withLabel = true) {
  const b = birthParts(k), now = new Date().getFullYear();
  const sel = (part, label, opts) => `<select data-birth="${key}|${part}" aria-label="${label}"${part === 'd' && !b.m ? ' disabled' : ''}>${opts}</select>`;
  return `<div class="field birth">${withLabel ? `<label>${tl('Geburtsdatum')}</label>` : ''}
    <div class="birthrow">${sel('d', tl('Tag'), `<option value="">${tl('Tag')}</option>` + Array.from({ length: 31 }, (_, i) => `<option${b.d === String(i + 1) ? ' selected' : ''}>${i + 1}</option>`).join(''))}
      ${sel('m', tl('Monat'), `<option value="">${tl('Monat')}</option>` + MONTHS().map((n, i) => `<option value="${i + 1}"${b.m === String(i + 1) ? ' selected' : ''}>${esc(n)}</option>`).join(''))}
      ${sel('y', tl('Jahr'), `<option value="">${tl('Jahr')} *</option>` + Array.from({ length: 19 }, (_, i) => now - i).map(y => `<option${b.y === String(y) ? ' selected' : ''}>${y}</option>`).join(''))}</div>
    ${withLabel ? `<p class="note">${tl('Nur das Jahr ist Pflicht. Je genauer, desto besser passen die Vorschläge.')}</p>` : ''}</div>`;
}
// read the three parts back into the child: "YYYY", "YYYY-MM" and a day only together with a month; nothing in the future
function setBirth(k, part, value) {
  const b = { ...birthParts(k), [part]: value };
  if (!b.m) b.d = '';
  const now = new Date(), y = +b.y, m = +b.m, d = +b.d;
  if (y && m && (y > now.getFullYear() || (y === now.getFullYear() && (m > now.getMonth() + 1 || (m === now.getMonth() + 1 && d > now.getDate()))))) { toast(tl('Das Datum liegt in der Zukunft.')); return false; }
  k.ym = b.y ? (b.m ? `${b.y}-${String(m).padStart(2, '0')}` : b.y) : '';
  k.d = b.m && b.d ? b.d : '';
  k.approx = false; // what was entered now is what we know
  return true;
}
// a person: the photo with a ring in their colour, else the first letter on their colour (dark text on yellow)
function avatarHtml(m, size = '') {
  return m.photo ? `<span class="av ring ${size}" style="--c:${m.color}"><img src="${m.photo}" alt=""></span>`
    : `<span class="av ${size}" style="--c:${m.color};color:${onColor(m.color)}" aria-hidden="true">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span>`;
}
const adultById = id => store.profile.adults.find(a => a.id === id);
const dogs = () => store.profile.dogList || [];
const dogName = d => d.name || tl('Hund');
const dogAv = (d, size = '') => { const c = d.color || '#FFD166'; return d.photo ? `<span class="av dog ring ${size}" style="--c:${c}"><img src="${d.photo}" alt=""></span>` : `<span class="av dog ${size}" style="background:${c};color:${onColor(c)}" aria-hidden="true">${svg('paw')}</span>`; };
// dogs, like children, can be added and changed by the family group (not by helpers)
const canEditFamily = () => isAdmin() || meAdult()?.grp === 'family';
const kidById = id => store.profile.kids.find(k => k.id === id);
function badgeOf(a) {
  if (a.admin) return [tl('Admin'), ''];
  if (!a.account && signedIn()) return [tl('Ohne Zugang'), 'grey'];
  if (a.until) return [tl('Befristet'), 'sun'];
  const v = Object.values(a.perms || {});
  return v.every(x => x === 'edit') ? [tl('Mitbearbeiten'), ''] : v.every(x => x === 'none') ? [tl('Kein Zugriff'), 'grey'] : [tl('Ansehen'), ''];
}
const fmtUntil = d => new Date(d + 'T12:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
function adultSub(a) {
  const seen = AREAS.filter(([k]) => a.perms?.[k] && a.perms[k] !== 'none').map(([, l]) => l);
  const parts = [];
  if (a.role) parts.push(tl(a.role));
  if (a.grp === 'helper' && a.until) parts.push(`${tl('bis')} ${fmtUntil(a.until)}`);
  else if (!a.admin && a.perms && Object.values(a.perms).some(x => x !== 'edit') && seen.length) parts.push(tl('Sieht ') + seen.join(tl(' und ')));
  if (!parts.length && a.email) parts.push(a.email);
  return parts.join(' · ');
}

// ---------- Small building blocks ----------
const navRow = (open, icon, title, sub) => `<button type="button" class="navrow" data-wir="${open}"><span class="navic">${svg(icon)}</span><span class="navtx"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${svg('next')}</button>`;
const levelSelect = (id, area, value, disabled) => `<select class="lvl" data-perm="${id}|${area}" aria-label="${esc(AREAS.find(a => a[0] === area)[1])}"${disabled ? ' disabled' : ''}>${LEVELS.map(([v, l]) => `<option value="${v}"${value === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const chipRow = (list, on, attr) => `<div class="fgrid">${list.map(r => `<button type="button" class="chip${on === r ? ' on' : ''}" ${attr}="${esc(r)}" aria-pressed="${on === r}">${on === r ? svg('check') : ''}${esc(r)}</button>`).join('')}</div>`;
const toggleRow = (attr, on, title, sub, extra = '') => `<label class="tgl"><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="tglr">${on ? `<small>${tl('Ein')}</small>` : ''}<input type="checkbox" role="switch" ${attr}${on ? ' checked' : ''}${extra}></span></label>`;
const hint = text => `<p class="hintbox">${text}</p>`;

// ---------- Hub ----------
function wirHub() {
  if (!hasToken()) return guestHub();
  if (!auth.family) return SY.invite ? joinView() : onboardingView(); // the first step creates the Wir
  if (!store.onboarded) return onboardingView();
  const ms = members(), kids = ms.filter(m => m.kid), adults = store.profile.adults;
  const fam = adults.filter(a => a.grp !== 'helper').length, help = adults.filter(a => a.grp === 'helper').length;
  const nd = dogs().length;
  const count = [fam && `${fam} ${fam === 1 ? tl('Erwachsene:r') : tl('Erwachsene')}`, kids.length && `${kids.length} ${kids.length === 1 ? tl('Kind') : tl('Kinder')}`, help && `${help} ${help === 1 ? tl('Helfer:in') : tl('Helfer:innen')}`, nd && `${nd} ${nd === 1 ? tl('Hund') : tl('Hunde')}`].filter(Boolean).join(' · ');
  const person = m => `<button type="button" class="avbtn" data-wirperson="${m.id}" aria-label="${esc(m.name)}">${avatarHtml(m)}</button>`;
  const humans = ms.filter(m => !m.kid && adultById(m.id)?.grp !== 'helper').concat(ms.filter(m => m.kid), ms.filter(m => !m.kid && adultById(m.id)?.grp === 'helper')).map(person);
  const pets = dogs().map(d => `<button type="button" class="avbtn dogav" data-wirdog="${d.id}" aria-label="${esc(dogName(d))}">${dogAv(d)}<small>${esc(dogName(d))}</small></button>`);
  // as many avatars as fit in one row (52 px each, the line before the dogs, the add button), then "+N"
  const width = ($('#panelBody')?.clientWidth || 360) - 32 - 28 - (pets.length ? 12 : 0);
  const slots = Math.max(3, Math.floor((width + 8) / 52) - (isAdmin() ? 1 : 0)), all = humans.length + pets.length;
  const over = all > slots, room = over ? slots - 1 : all, h = Math.min(humans.length, room), dg = room - h;
  const more = over ? [`<button type="button" class="avbtn" data-wir="people" aria-label="${tl('Alle anzeigen')}"><span class="av more">+${all - room}</span></button>`] : [];
  const shown = humans.slice(0, h).concat(dg ? [`<span class="avsep" aria-hidden="true"></span>`].concat(pets.slice(0, dg)) : [], more);
  const shop = perm('shop'), err = perm('errands');
  const n = openItems().length, e = store.errands.filter(x => x.state !== 'gekauft').length;
  const tile = (open, icon, title, n_) => `<button type="button" class="tile" data-wir="${open}"><span class="navic">${svg(icon)}</span>${n_ ? `<span class="n">${n_}</span>` : ''}<b>${title}</b><small>${signedIn() ? tl('Gemeinsam') : tl('Auf diesem Gerät')}</small></button>`;
  const placesSub = store.places.filter(p => p.mine !== false).map(p => tl(p.name)).slice(0, 3).join(', ');
  const me = meAdult();
  return `${wirHeadHtml()}
    ${expired(me) && signedIn() ? hint(tl('Dein Zugang ist abgelaufen. Der Admin kann ihn verlängern.')) : ''}
    <div class="card people"><div class="cardhead"><h4>${tl('Personen')}</h4><button type="button" class="linkbtn" data-wir="people">${tl('Verwalten')}</button></div>
      <div class="avrow">${shown.join('')}
        ${isAdmin() ? `<button type="button" class="avbtn" data-wir="add" aria-label="${tl('Person hinzufügen')}"><span class="av add">${svg('plus')}</span></button>` : ''}</div>
      <p class="note">${count || tl('Noch niemand eingetragen.')}</p></div>
    ${shop !== 'none' || err !== 'none' ? `<div class="tiles">${shop !== 'none' ? tile('shop', 'cart', tl('Einkauf'), n) : ''}${err !== 'none' ? tile('errands', 'list', tl('Besorgungen'), e) : ''}</div>` : ''}
    ${ferienCard(9999, true)}
    <div class="card navlist">
      ${navRow('places', 'pin', tl('Meine Orte'), esc(placesSub ? placesSub + (store.places.length > 3 ? ' …' : '') : tl('Zuhause, Arbeit, Kita …')))}
      ${navRow('fit', 'star', tl('Was passt zu euch?'), tl('Freiwillig · für passende Vorschläge'))}
      ${navRow('settings', 'gear', tl('Einstellungen'), tl('Benachrichtigungen, Karte, Sprache'))}
      ${navRow('account', 'card', tl('Konto & Abo'), tl('E-Mail, Abo, Abmelden'))}
      ${navRow('about', 'info', tl('Über Djuu'), tl('Feedback, Rechtliches, Version'))}</div>`;
}

// the head of the Wir: its photo (76 px) or first letter, the name, and what I am here
// The title is simply "Wir", the same for everyone. Only a name the admin gave the Wir (e.g. "Familie Rossi") replaces it.
// Names made automatically before ("Annas Wir", "Anna’s Us", "Familie", "Wir") count as no own name.
const ownWirName = () => { const n = (auth?.familyName || '').trim(); return !n || /^(wir|us|familie)$/i.test(n) || /^\S+(s|’|') Wir$/.test(n) || /^\S+’s Us$/.test(n) ? '' : n; };
const wirName = () => ownWirName() || tl('Wir');
const adminColor = () => (members().find(m => adultById(m.id)?.admin) || members()[0])?.color || MEMBER_COLORS[0];
function wirAvatar(size = 'xl') {
  return store.wirPhoto ? `<span class="av ring ${size}" style="--c:${adminColor()}"><img src="${store.wirPhoto}" alt=""></span>`
    : `<span class="av ${size}" style="--c:${adminColor()};color:${onColor(adminColor())}" aria-hidden="true">${esc(wirName().slice(0, 1).toUpperCase())}</span>`;
}
function wirHeadHtml() {
  const me = meAdult(), admin = isAdmin();
  const what = admin ? tl('Du bist Admin') : me?.grp === 'helper' ? (me.role ? tl(me.role) : tl('Helfer:in')) : tl('Familie');
  return `<div class="wirtop"><span class="photobox">${wirAvatar()}${admin ? `<button type="button" class="cambtn" data-lookphoto="wir|" aria-label="${tl('Foto des Wir ändern')}">${svg('camera')}</button>` : ''}</span>
    <span class="wirtx">${admin ? `<button type="button" class="wirname${wirName().length > 18 ? ' long' : ''}" data-wir="wirname" aria-label="${tl('Namen des Wir ändern')}">${esc(wirName())}</button>` : `<b class="wirname${wirName().length > 18 ? ' long' : ''}">${esc(wirName())}</b>`}</span></div>`;
}
function wirNameView() {
  return `${head(tl('Name des Wir'))}<form id="wirNameForm"><div class="field"><label for="wirNameIn">${tl('Eigener Name')} <small class="muted">${tl('freiwillig')}</small></label><input id="wirNameIn" maxlength="60" value="${esc(ownWirName())}" placeholder="${tl('z. B. Familie Rossi')}"></div>
    <p class="note">${tl('Alle im Wir sehen denselben Namen. Ohne eigenen Namen steht dort einfach „Wir“.')}</p>
    <div class="stick"><button type="submit" class="btn big primary">${tl('Speichern')}</button></div></form>`;
}
// photo, name and colour of one entry: the big avatar with the camera, and how others will see the person
function looksTop(x, kind, nameField) {
  const m = kind === 'dog' ? null : members().find(y => y.id === x.id) || { ...x, color: x.color || MEMBER_COLORS[0] };
  const edit = kind === 'dog' ? isAdmin() : canEditLooks(x), av = kind === 'dog' ? dogAv(x, 'xl') : avatarHtml(m, 'xl');
  return `<div class="looktop"><span class="photobox">${av}${edit ? `<button type="button" class="cambtn" data-lookphoto="${kind}|${x.id}" aria-label="${tl('Foto ändern')}">${svg('camera')}</button>` : ''}</span>
      ${edit ? `<button type="button" class="linkbtn strong" data-lookphoto="${kind}|${x.id}">${x.photo ? tl('Foto ändern') : tl('Foto hinzufügen')} · ${tl('freiwillig')}</button>` : ''}</div>
    ${nameField}
    ${kind === 'dog' && edit ? `<div class="field"><label>${tl('Farbe')}</label>${colorPicker(x.id, x.color || '#FFD166')}</div>` : ''}
    ${kind !== 'dog' && edit ? `<div class="field"><label>${tl('Farbe')} <small class="muted">${tl('Gilt für Listen, Filter und Kalender')}</small></label>${colorPicker(x.id, m.color)}</div>
      <div class="field"><label>${tl('So sieht man {name}', { name: esc(m.name) })}</label>
        <div class="previewrow" style="--c:${m.color}"><span class="navtx"><b>${tl('Babyschwimmen')}</b><small>${tl('Mi · 10:00')} · ${esc(m.name)}</small></span>${avatarHtml(m, 'xs')}</div></div>` : ''}
    <p class="note">${kind === 'kid' ? tl('Das Foto von {name} sehen nur Mitglieder der Familie.', { name: esc(x.name || tl('Kind')) }) : kind === 'dog' ? tl('Das Foto sehen nur Mitglieder der Familie.') : tl('Alle im Wir sehen das Foto.')}</p>`;
}

// ---------- First steps (name is the only thing that is needed) ----------
function onboardingView() {
  const dots = `<div class="dots" aria-label="${tl('Schritt')} ${W.onb} / 3">${[1, 2, 3].map(i => `<i class="${i === W.onb ? 'on' : ''}"></i>`).join('')}</div>`;
  const me = meAdult();
  if (W.onb === 1) {
    const c = me?.color || MEMBER_COLORS[0], av = { name: me?.name || '?', color: c, photo: me?.photo };
    return `${dots}<h2 class="big">${tl('Wer bist du?')}</h2>
      <div class="looktop"><span class="photobox" id="onbAv">${avatarHtml(av, 'xl')}<button type="button" class="cambtn" data-lookphoto="me|" aria-label="${tl('Foto hinzufügen')}">${svg('camera')}</button></span>
        <button type="button" class="linkbtn strong" data-lookphoto="me|">${me?.photo ? tl('Foto ändern') : tl('Foto hinzufügen')} · ${tl('freiwillig')}</button></div>
      <div class="field"><label for="onbName">${tl('Vorname oder Spitzname')}</label><input id="onbName" maxlength="30" autocomplete="given-name" value="${esc(me?.name || '')}"></div>
      <div class="field"><label>${tl('Deine Rolle')} <small class="muted">${tl('Freiwillig')}</small></label>${chipRow(ROLES_ME, me?.role, 'data-onbrole')}</div>
      <div class="field"><label>${tl('Deine Farbe')} <small class="muted">${tl('So erkennt dich deine Familie in Listen und Filtern')}</small></label>${colorPicker('me', c)}</div>
      <div class="stick"><button type="button" class="btn big primary" data-onb="2"${W.busy ? ' disabled' : ''}>${tl('Weiter')}</button></div>`;
  }
  if (W.onb === 2) {
    const home = store.places.find(p => p.def);
    return `${dots}<h2 class="big">${tl('Euer Wir')}</h2><p class="muted text">${tl('Trag deine Kinder ein, dann zeigen wir passende Termine. Ein Spitzname reicht.')}</p>
      ${store.profile.kids.map((k, i) => `<div class="kidblock"><input data-kid="${i}" data-k="name" value="${esc(k.name || '')}" placeholder="${tl('Vorname oder Spitzname')}" maxlength="20" aria-label="${tl('Name')}">
        ${birthHtml(i, k, false)}</div>`).join('')}
      ${store.profile.kids.length ? `<p class="note">${tl('Geburtsdatum: Nur das Jahr ist Pflicht. Je genauer, desto besser passen die Vorschläge.')}</p>` : ''}
      <button type="button" class="linkbtn plus" data-addkid="1">${svg('plus')}${tl('Kind hinzufügen')}</button>
      ${isAdmin() ? `<div class="field"><label for="onbWirName">${tl('Name eures Wir')} <small class="muted">${tl('freiwillig')}</small></label><input id="onbWirName" maxlength="60" placeholder="${tl('z. B. Familie Müller')}" value="${esc(ownWirName())}"><p class="note">${tl('Ohne Namen steht dort einfach „Wir“.')}</p></div>` : ''}
      <div class="field"><label>${tl('Habt ihr einen Hund?')} <small class="muted">${tl('freiwillig')}</small></label>
        ${dogs().map((d, i) => `<div class="dogline">${dogAv(d)}<input data-dogname="${i}" value="${esc(d.name)}" placeholder="${tl('Name (freiwillig)')}" maxlength="30" aria-label="${tl('Name')}"><button type="button" class="round sm" data-dogdel="${d.id}" aria-label="${tl('Entfernen')}">${svg('close')}</button></div>`).join('')}
        <button type="button" class="linkbtn plus" data-adddog="inline">${svg('plus')}${tl('Hund hinzufügen')}</button></div>
      <div class="field"><label for="onbPlz">${tl('Wo seid ihr zuhause?')} <small class="muted">${tl('freiwillig')}</small></label>
        <input id="onbPlz" inputmode="numeric" maxlength="5" placeholder="20251" value="${esc(home?.plz || '')}"><p class="note">${tl('Nur die Postleitzahl. Eine Adresse brauchen wir nicht.')}</p></div>
      <div class="stick"><button type="button" class="btn big primary" data-onb="3">${tl('Weiter')}</button><button type="button" class="btn ghost" data-onb="3" data-skip="1">${tl('Überspringen')}</button></div>`;
  }
  return `${dots}<h2 class="big">${tl('Gehört jemand dazu?')}</h2><p class="muted text">${tl('Lade Familie oder Helfer:innen ein, dann teilt ihr Einkauf, Besorgungen und Kalender. Jede:r bekommt einen eigenen Zugang.')}</p>
    <div class="radiocards">${[['family', 'user', tl('Familie'), tl('Eigener Zugang, bearbeitet mit')], ['helper', 'heart', tl('Helfer:in'), tl('Zugang nach deiner Wahl')]].map(([g, ic, t, s]) =>
      `<button type="button" class="radiocard${W.add.grp === g && W.onbPick ? ' on' : ''}" data-onbpick="${g}"><span class="navic">${svg(ic)}</span><span class="navtx"><b>${t}</b><small>${s}</small></span><i class="radio"></i></button>`).join('')}</div>
    ${hint(`${tl('Das geht auch später unter')} <b>${tl('Wir')} › ${tl('Personen')}</b>.`)}
    <div class="stick"><button type="button" class="btn big primary" data-onb="invite"${W.onbPick ? '' : ' disabled'}>${tl('Einladen')}</button><button type="button" class="btn ghost" data-onb="done">${tl('Später')}</button></div>`;
}
function setPlzPlace(plz, name = tl('Zuhause')) {
  const g = GEO.plz.find(x => x[0] === plz);
  if (!g) return false;
  let p = store.places.find(x => x.def && x.mine !== false);
  if (!p) { p = { id: pbId(), name, shared: false, def: true, mine: true, address: '' }; store.places.push(p); }
  Object.assign(p, { plz, lat: g[1], lon: g[2] });
  return true;
}

// ---------- People ----------
function peopleView() {
  const ms = members(), adults = store.profile.adults, kids = ms.filter(m => m.kid);
  const row = (m, sub, badge) => `<li><button type="button" class="prow" data-wirperson="${m.id}">${avatarHtml(m)}<span class="navtx"><b>${esc(m.name)}${m.id === meId() ? ` ${tl('(du)')}` : ''}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${badge ? `<span class="pill ${badge[1]}">${badge[0]}</span>` : ''}${svg('next')}</button></li>`;
  const group = (title, sub, list) => `<div class="sec"><h4>${title}<small>${sub}</small></h4>${list.length ? `<ol class="card plist">${list.join('')}</ol>` : `<p class="muted text">${tl('Noch niemand.')}</p>`}</div>`;
  const adultRow = a => row(ms.find(m => m.id === a.id), adultSub(a), badgeOf(a));
  return `${head(tl('Personen'), `${tl('Wir')} · ${ms.length} ${ms.length === 1 ? tl('Person') : tl('Personen')}`)}
    ${group(tl('Familie'), tl('Mit eigenem Zugang'), adults.filter(a => a.grp !== 'helper').map(adultRow))}
    ${group(tl('Kinder'), tl('Nur ein Eintrag, kein Zugang'), kids.map(m => { const k = kidById(m.id); return row(m, kidAgeText(k) + (k.approx && !k.remote ? ` · ${tl('Geburtsdatum ergänzen')}` : ''), null); }))}
    ${group(tl('Helfer:innen'), tl('Du bestimmst, was sie sehen'), adults.filter(a => a.grp === 'helper').map(adultRow))}
    ${meAdult()?.grp === 'helper' ? '' : `<div class="sec dogsec"><h4>${tl('Hunde')}<small>${tl('Für Hinweise, wo Hunde erlaubt sind')}</small></h4>
      ${dogs().length ? `<ol class="card plist dogs">${dogs().map(d => `<li><button type="button" class="prow" data-wirdog="${d.id}">${dogAv(d)}<span class="navtx"><b>${esc(dogName(d))}</b></span>${svg('next')}</button></li>`).join('')}</ol>` : ''}
      ${canEditFamily() ? `<button type="button" class="linkbtn plus" data-adddog="1">${svg('plus')}${tl('Hund hinzufügen')}</button>` : ''}</div>`}
    ${moreAboutHtml()}
    ${isAdmin() ? `<div class="stick"><button type="button" class="btn big primary" data-wir="add">${svg('plus')}${tl('Person hinzufügen')}</button></div>` : ''}`;
}
// family details that are not people: baby on the way, school holidays (kept from before)
function moreAboutHtml() {
  const pr = store.profile;
  return `<details class="fold"><summary>${tl('Mehr über euch')} <small class="muted">${tl('freiwillig')}</small></summary>
    <div class="field"><label for="expecting">${tl('Baby unterwegs? Errechneter Termin (optional)')}</label><input id="expecting" type="date" value="${esc(pr.expecting || '')}" min="${ymd(today0())}"></div>
    <div class="field"><label for="fedState">${tl('Bundesland (für eure Schulferien)')}</label><select id="fedState">${Object.entries(STATES).map(([c, n]) => `<option value="${c}"${(pr.state || 'DE-HH') === c ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    </details>`;
}

function addPersonView() {
  const A = W.add, seg = `<div class="segs" role="tablist">${[['family', tl('Familie')], ['kid', tl('Kind')], ['dog', tl('Hund')], ['helper', tl('Helfer:in')]].map(([g, l]) =>
    `<button type="button" role="tab" aria-selected="${A.grp === g}" class="${A.grp === g ? 'on' : ''}" data-addgrp="${g}">${l}</button>`).join('')}</div>`;
  if (A.grp === 'dog') {
    return `${head(tl('Person hinzufügen'))}${seg}<p class="muted text">${tl('Mit einem Hund im Wir zeigt Djuu bei Orten und Terminen, ob Hunde erlaubt sind.')}</p>
      <div class="field"><label for="addName">${tl('Name')} <small class="muted">${tl('freiwillig')}</small></label><input id="addName" maxlength="30" value="${esc(A.name)}"></div>
      <div class="stick"><button type="button" class="btn big primary" data-addsave="dog">${tl('Speichern')}</button></div>`;
  }
  if (A.grp === 'kid') {
    return `${head(tl('Person hinzufügen'))}${seg}<p class="muted text">${tl('Nur ein Eintrag für passende Vorschläge. Kinder haben keinen Zugang.')}</p>
      <div class="field"><label for="addName">${tl('Vorname oder Spitzname')}</label><input id="addName" maxlength="20" value="${esc(A.name)}"></div>
      ${birthHtml('new', A)}
      <div class="stick"><button type="button" class="btn big primary" data-addsave="kid">${tl('Speichern')}</button></div>`;
  }
  const helper = A.grp === 'helper', perms = A.perms || (A.perms = { ...DEFAULT_PERMS[A.grp] });
  const canInvite = signedIn() && isAdmin();
  return `${head(tl('Person hinzufügen'))}${seg}
    <p class="muted text">${helper ? tl('Mit eingeschränktem Zugang, den du bestimmst.') : tl('Mit eigenem Zugang. Bearbeitet Einkauf, Besorgungen und Kalender mit.')}</p>
    <div class="field"><label>${helper ? tl('Wer ist das?') : tl('Wer ist das?')}</label>${chipRow(helper ? ROLES_HELPER : ROLES_FAMILY, A.role, 'data-addrole')}</div>
    ${canInvite ? '' : `<div class="field"><label for="addName">${tl('Name')}</label><input id="addName" maxlength="30" value="${esc(A.name)}"></div>`}
    <div class="field"><label>${tl('Was darf er oder sie sehen?')}</label>
      <div class="card perms">${AREAS.map(([k, l]) => `<div class="permrow"><span>${l}</span>${levelSelect('new', k, perms[k])}</div>`).join('')}</div></div>
    ${helper ? toggleRow('data-adduntil="1"', !!A.until, tl('Zugang befristet'), A.until ? `${tl('Endet am')} ${fmtUntil(A.until)}` : tl('Endet automatisch an einem Tag deiner Wahl')) +
      (A.until ? `<div class="field"><input id="addUntil" type="date" value="${esc(A.until)}" min="${ymd(today0())}" aria-label="${tl('Endet am')}"></div>` : '') : ''}
    <p class="note center">${tl('Orte und Kinderdaten bleiben privat · jederzeit änderbar')}</p>
    ${canInvite ? '' : hint(tl('Einladen geht mit einem Konto (Wir › Konto & Abo). Bis dahin trägst du die Person hier nur ein.'))}
    <div class="stick"><button type="button" class="btn big primary" data-addsave="${canInvite ? 'invite' : 'local'}"${W.busy ? ' disabled' : ''}>${canInvite ? svg('link') + tl('Einladung senden') : tl('Hinzufügen')}</button></div>`;
}

function personView(id) {
  const kid = kidById(id);
  if (kid) return kidView(kid);
  const a = adultById(id);
  if (!a) return `${head(tl('Person'))}<div class="empty"><b>${tl('Diese Person gibt es nicht mehr.')}</b></div>`;
  const m = members().find(x => x.id === id), i = store.profile.adults.indexOf(a), self = id === meId();
  const admin = isAdmin(), canEditAccess = admin && !a.admin, canEditName = admin || self;
  const invited = a.at ? new Date(a.at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) : '';
  const access = a.account ? tl('eigener Zugang') : tl('ohne eigenen Zugang');
  return `${head(tl('{name} bearbeiten', { name: esc(a.name || tl('Person')) }), `${esc(a.grp === 'helper' ? tl('Helfer:in') : tl('Familie'))} · ${access}`)}
    ${looksTop(a, 'adult', canEditName ? `<div class="field"><label for="pName">${tl('Vorname oder Spitzname')}</label><input id="pName" data-adult="${i}" data-k="name" maxlength="30" value="${esc(a.name || '')}"></div>` : '')}
    <p class="note">${[invited && `${a.account ? tl('Eingeladen am') : tl('Eingetragen am')} ${invited}`, a.email].filter(Boolean).map(esc).join(' · ') || (a.admin ? tl('Admin dieses Wir') : '')}</p>
    ${canEditName ? `
      <div class="field"><label>${tl('Rolle')} <small class="muted">${tl('Freiwillig')}</small></label>${chipRow(a.grp === 'helper' ? ROLES_HELPER : self ? ROLES_ME : ROLES_FAMILY, a.role, 'data-prole')}</div>
      <div class="field"><label for="pWork">${tl('Arbeitszeiten')} <small class="muted">${tl('Freiwillig')}</small></label><input id="pWork" data-adult="${i}" data-k="work" maxlength="60" placeholder="${tl('z. B. Mo–Fr 8–16')}" value="${esc(a.work || '')}"></div>` : ''}
    <div class="sec"><h4>${tl('Zugang')}<small>${a.admin ? tl('Admins sehen und bearbeiten alles.') : admin ? `${tl('Du bestimmst als Admin, was')} ${esc(a.name || tl('diese Person'))} ${tl('sieht')}` : tl('Nur der Admin kann das ändern.')}</small></h4>
      <div class="card perms">${AREAS.map(([k, l]) => `<div class="permrow"><span>${l}</span>${levelSelect(id, k, a.admin ? 'edit' : a.perms?.[k] || 'edit', !canEditAccess)}</div>`).join('')}</div>
      <p class="note"><b>${tl('Ansehen')}</b>: ${tl('nur lesen')} · <b>${tl('Mitbearbeiten')}</b>: ${tl('hinzufügen, abhaken, ändern. Orte und Kinderdaten bleiben privat.')}</p></div>
    ${canEditAccess ? toggleRow(`data-puntil="${id}"`, !!a.until, tl('Zugang befristet'), a.until ? `${tl('Endet am')} ${fmtUntil(a.until)}${expired(a) ? ` · ${tl('abgelaufen')}` : ''}` : tl('Endet automatisch an einem Tag deiner Wahl')) +
      (a.until ? `<div class="field"><input id="pUntil" data-puntildate="${id}" type="date" value="${esc(a.until)}" aria-label="${tl('Endet am')}"></div>` : '') : ''}
    ${admin && signedIn() && a.account && a.grp !== 'helper' && !self ? toggleRow(`data-padmin="${id}"`, !!a.admin, tl('Zweiter Admin'), tl('Darf Personen einladen und den Zugang ändern')) : ''}
    ${signedIn() && a.account && !self ? `<button type="button" class="btn wide" data-syask="${id}">${svg('pin')}${tl('Fragen: Wo bist du?')}</button><p class="note">${tl('Die Person entscheidet selbst, ob sie ihren Standort einmal schickt. Er wird nach 24 Stunden gelöscht.')}</p>` : ''}
    ${admin && !self ? `<button type="button" class="btn wide danger" data-premove="${id}">${tl('Person entfernen')}</button>` : ''}
    <div class="stick"><button type="button" class="btn big primary" data-looksave="1">${tl('Speichern')}</button></div>`;
}
function kidView(k) {
  const i = store.profile.kids.indexOf(k), m = members().find(x => x.id === k.id);
  if (k.remote) return `${head(esc(k.name || tl('Kind')), esc(kidAgeText(k)))}<div class="card who">${avatarHtml(m, 'lg')}<span class="navtx"><b>${tl('Kind')}</b><small>${tl('Kinderdaten bleiben in der Familie. Du siehst nur Name und Alter.')}</small></span></div>`;
  return `${head(tl('{name} bearbeiten', { name: esc(k.name || tl('Kind')) }), `${tl('Kind')} · ${tl('nur ein Eintrag, kein Zugang')} · ${esc(kidAgeText(k))}`)}
    ${looksTop(k, 'kid', `<div class="field"><label for="kName">${tl('Vorname oder Spitzname')}</label><input id="kName" data-kid="${i}" data-k="name" maxlength="20" value="${esc(k.name || '')}"></div>`)}
    ${k.approx ? hint(tl('Das Alter ist ungefähr. Mit dem Geburtsdatum passen die Vorschläge genauer.')) : ''}
    ${birthHtml(i, k)}
    <div class="field"><label for="kSchool">${tl('Kita oder Schule')}</label><input id="kSchool" data-kid="${i}" data-k="school" maxlength="60" placeholder="${tl('Kita oder Schule, Klasse')}" value="${esc(k.school || '')}"></div>
    <div class="kidline"><div class="field"><label for="kSize">${tl('Kleidergröße')}</label><input id="kSize" data-kid="${i}" data-k="size" maxlength="12" placeholder="104" value="${esc(k.size || '')}"></div>
      <div class="field"><label for="kShoe">${tl('Schuhgröße')}</label><input id="kShoe" data-kid="${i}" data-k="shoe" maxlength="8" placeholder="28" value="${esc(k.shoe || '')}"></div></div>
    <p class="note">${tl('Die Größen stehen bei Besorgungen für dieses Kind.')}</p>
    ${isAdmin() || meAdult()?.grp === 'family' ? `<button type="button" class="btn wide danger" data-kidremove="${k.id}">${tl('Eintrag entfernen')}</button>` : ''}
    <div class="stick"><button type="button" class="btn big primary" data-looksave="1">${tl('Speichern')}</button></div>`;
}

function dogView() {
  const d = dogs().find(x => x.id === view().id);
  if (!d) return `${head(tl('Hund'))}<div class="empty"><b>${tl('Diesen Eintrag gibt es nicht mehr.')}</b></div>`;
  const i = dogs().indexOf(d), edit = canEditFamily();
  return `${head(tl('{name} bearbeiten', { name: esc(dogName(d)) }), `${tl('Hund')} · ${tl('nur ein Eintrag, kein Zugang')}`)}
    ${looksTop(d, 'dog', edit ? `<div class="field"><label for="dName">${tl('Name')} <small class="muted">${tl('freiwillig')}</small></label><input id="dName" data-dogname="${i}" maxlength="30" value="${esc(d.name)}"></div>` : '')}
    <p class="note">${tl('Mit einem Hund im Wir zeigt Djuu bei Orten und Terminen, ob Hunde erlaubt sind, und im Filter „Mit Hund“.')}</p>
    ${edit ? `<button type="button" class="btn wide danger" data-dogdel="${d.id}">${tl('Eintrag entfernen')}</button>` : ''}`;
}

// ---------- Meine Orte ----------
const placeIcon = n => /zuhause|home/i.test(n) ? 'house' : /arbeit|work|büro/i.test(n) ? 'bag' : /oma|opa|tante|onkel/i.test(n) ? 'heart' : 'pin';
const plzName = plz => (GEO.plz.find(x => x[0] === plz) || [])[3] || '';
function placesView() {
  const mine = store.places.filter(p => p.mine !== false), others = store.places.filter(p => p.mine === false);
  const card = p => `<li class="placerow"><span class="navic">${svg(placeIcon(p.name))}</span><span class="navtx"><b>${esc(tl(p.name))}</b>
      <small>${tl('PLZ')} ${esc(p.plz || '–')}${plzName(p.plz) ? ' · ' + esc(plzName(p.plz)) : ''}${p.mine === false && p.byName ? ` · ${tl('von')} ${esc(p.byName)}` : ''}</small>
      <span class="pills">${p.def ? `<span class="pill">${tl('Standard für Suchen')}</span>` : ''}${p.mine === false ? '' : p.shared ? `<span class="pill green">${tl('Mit Familie geteilt')}</span>` : `<span class="pill grey">${tl('Nur du')}</span>`}</span></span>
      ${p.mine === false ? '' : `<button type="button" class="round sm" data-placeedit="${p.id}" aria-label="${tl('Bearbeiten')}">${svg('edit')}</button>`}</li>`;
  return `${head(tl('Meine Orte'), tl('Damit findest du Termine und Kurse in der Nähe'))}
    ${mine.length ? `<ol class="card plist">${mine.map(card).join('')}</ol>` : ''}
    ${mine.length < 10 ? `<button type="button" class="card addrow" data-placeedit="new">${svg('plus')}${tl('Ort hinzufügen')}</button>` : `<p class="note">${tl('Mehr als 10 Orte werden schnell unübersichtlich.')}</p>`}
    ${others.length ? `<div class="sec"><h4>${tl('Von der Familie geteilt')}</h4><ol class="card plist">${others.map(card).join('')}</ol></div>` : ''}
    <p class="note">${tl('Wir speichern nur die Postleitzahl. Eine genaue Adresse ist freiwillig. Orte sind privat, bis du sie mit der Familie teilst.')}</p>`;
}
function placeEditView() {
  const P = W.place;
  if (!P) return placesView();
  const others = store.profile.adults.filter(a => a.account && a.id !== meId() && a.grp !== 'helper').map(a => a.name);
  return `${head(P.id ? tl('Ort bearbeiten') : tl('Ort hinzufügen'))}
    <div class="field"><label>${tl('Wie heißt der Ort?')}</label>${chipRow(PLACE_NAMES, PLACE_NAMES.find(n => n === P.name) || '', 'data-pname')}
      <input id="plName" maxlength="40" value="${esc(P.name)}" aria-label="${tl('Name des Orts')}" placeholder="${tl('z. B. Kita Mia')}"></div>
    <div class="field"><label for="plPlz">${tl('Postleitzahl')}</label><input id="plPlz" inputmode="numeric" maxlength="5" value="${esc(P.plz)}" placeholder="20253">
      <p class="note">${tl('Nur die Postleitzahl ist nötig.')}${P.plz && plzName(P.plz) ? ` ${esc(plzName(P.plz))}.` : ''}</p></div>
    ${P.showAddr || P.address ? `<div class="field"><label for="plAddr">${tl('Genaue Adresse (freiwillig)')}</label><input id="plAddr" maxlength="120" value="${esc(P.address)}" autocomplete="street-address"></div>`
      : `<button type="button" class="linkbtn" data-plshowaddr="1">${tl('Genaue Adresse (freiwillig)')}</button>`}
    <button type="button" class="linkbtn plus" data-plgps="1">${svg('locate')}${tl('Aktuellen Standort verwenden')}</button>
    ${toggleRow('data-plshared="1"', P.shared, tl('Mit Familie teilen'), signedIn() ? (others.length ? `${others.map(esc).join(tl(' und '))} ${tl('sehen diesen Ort')}` : tl('Alle aus der Familie sehen diesen Ort')) : tl('Wirkt, sobald ihr ein gemeinsames Konto habt'))}
    ${toggleRow('data-pldef="1"', P.def, tl('Standard für Suchen'), tl('Für „Umkreis“ bei den Terminen'))}
    <div class="stick"><button type="button" class="btn big primary" data-plsave="1">${tl('Speichern')}</button>${P.id ? `<button type="button" class="btn ghost" data-pldel="1">${tl('Löschen')}</button>` : ''}</div>`;
}
function savePlace() {
  const P = W.place, name = $('#plName').value.trim(), plz = $('#plPlz').value.trim(), addr = $('#plAddr')?.value.trim() ?? P.address;
  if (!name) return toast(tl('Bitte gib dem Ort einen Namen.'));
  const g = GEO.plz.find(x => x[0] === plz);
  if (!g) return toast(tl('Bitte eine Hamburger Postleitzahl eingeben.'));
  if (P.def) for (const p of store.places) p.def = false;
  const rec = { id: P.id || pbId(), name, plz, address: addr, lat: g[1], lon: g[2], shared: P.shared, def: P.def || !store.places.some(p => p.def && p.id !== P.id), mine: true };
  const i = store.places.findIndex(p => p.id === rec.id);
  if (i >= 0) store.places[i] = { ...store.places[i], ...rec }; else store.places.push(rec);
  save(); W.place = null; toast(`${tl('Gespeichert:')} ${name}`); back();
}

// ---------- Was passt zu euch? (sensitive: only with consent, only on this device, never shown to others) ----------
function fitView() {
  const D = W.fitDraft || (W.fitDraft = { tags: new Set(store.fit?.tags || []), ok: !!store.fit?.at });
  return `${head(tl('Was passt zu euch?'), tl('Freiwillig'))}
    <p class="text">${tl('Wähle, was auf euch zutrifft, dann zeigen wir passende Termine und Gruppen. Das sieht niemand sonst und ist nie Pflicht.')}</p>
    <div class="fgrid">${FIT_TAGS.map(t => `<button type="button" class="chip${D.tags.has(t) ? ' on' : ''}" data-fit="${esc(t)}" aria-pressed="${D.tags.has(t)}">${D.tags.has(t) ? svg('check') : ''}${esc(t)}</button>`).join('')}</div>
    ${hint(`${svg('lock')} ${tl('Du kannst das jederzeit ändern oder ganz leer lassen. Wir nutzen es nur für Vorschläge.')}`)}
    ${D.tags.size ? `<label class="consent"><input type="checkbox" id="fitOk"${D.ok ? ' checked' : ''}> <span>${tl('Ich bin einverstanden, dass Djuu diese Angaben auf diesem Gerät speichert, um passende Vorschläge zu zeigen. Sie werden nicht mit der Familie oder dem Server geteilt.')} <a href="legal.html#datenschutz" target="_blank" rel="noopener">${tl('Datenschutz')}</a></span></label>` : ''}
    <div class="stick"><button type="button" class="btn big primary" data-fitsave="1">${tl('Speichern')}</button>${store.fit?.tags?.length ? `<button type="button" class="btn ghost" data-fitclear="1">${tl('Alles löschen')}</button>` : ''}</div>`;
}

// ---------- Gemerkt: places and events of the Wir, with who saved them ----------
function gemerktView() {
  if (!auth?.family) return `${head(tl('Gemerkt'), '', false)}<div class="locked"><span class="bigic">${svg('heart')}</span><h3>${tl('Zum Merken brauchst du ein Konto')}</h3>
    <p class="muted">${tl('Dann findest du deine Lieblingsorte und Termine auf jedem Gerät wieder.')}</p>
    <button type="button" class="btn big primary wide" data-wir="register">${tl('Konto erstellen')}</button><button type="button" class="btn big wide" data-wir="login">${tl('Anmelden')}</button></div>`;
  if (perm('saved') === 'none') return `${head(tl('Gemerkt'), '', false)}<div class="empty"><b>${tl('Kein Zugriff auf Gemerkt.')}</b>${tl('Der Admin eures Wir kann das ändern.')}</div>`;
  const ms = members(), who = W.savedWho, by = id => ms.find(m => m.id === id);
  const placesL = store.favorites.map(id => [byId.get(id), store.favBy[id]]).filter(([p, b]) => p && (!who || b === who));
  const offers = store.savedOffers.filter(s => !who || s.by === who).map(s => [OFFER_BY_ID.get(s.id), s]).filter(([o]) => o && nextDate(o)).map(([o, s]) => [nextDate(o), o, s]).sort((a, b) => a[0] - b[0] || timeKey(a[1]) - timeKey(b[1]));
  const savers = [...new Set(store.savedOffers.map(s => s.by).concat(Object.values(store.favBy)))].map(by).filter(Boolean);
  const tabs = `<div class="segs" role="tablist">${[['orte', tl('Orte')], ['termine', tl('Termine')]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${W.savedTab === k}" class="${W.savedTab === k ? 'on' : ''}" data-savedtab="${k}">${l}</button>`).join('')}</div>`;
  const whoRow = savers.length > 1 ? `<div class="fgrid">${[['', tl('Alle')]].concat(savers.map(m => [m.id, m.name])).map(([id, l]) => `<button type="button" class="chip${who === id ? ' on' : ''}" data-savedwho="${id}">${who === id ? svg('check') : ''}${esc(l)}</button>`).join('')}</div>` : '';
  const mark = id => { const m = by(id); return m ? avatarHtml(m, 'xs') : ''; };
  const ro = perm('saved') === 'view';
  const o0 = origin();
  let body;
  if (W.savedTab === 'orte') {
    body = placesL.length ? `<ol class="savedlist">${placesL.map(([p, b]) => `<li class="savedcard"><button type="button" class="savedmain" data-detail="${p.id}"><span class="navic">${svg('pin')}</span><span class="navtx"><b>${esc(p.name)}</b><small>${esc([placeKind(p), p.district].filter(Boolean).join(' · '))}${o0 ? ' · ' + fmtDist(dist(o0, [p.lat, p.lon])) : ''}</small></span></button>
        <span class="savedside">${ro ? svg('heart') : `<button type="button" class="hearton" data-fav="${p.id}" aria-label="${tl('Nicht mehr merken')}">${svg('heart')}</button>`}${mark(b)}</span></li>`).join('')}</ol>`
      : `<div class="empty"><b>${tl('Noch keine Orte gemerkt.')}</b>${tl('Tippe bei einem Ort auf das Herz. Gemerkte Orte siehst du auch auf der Karte.')}</div>`;
  } else {
    body = offers.length ? `<ol class="savedlist">${offers.map(([d, o, s]) => `<li class="savedcard ev" style="--c:${by(s.by)?.color || 'transparent'}"><button type="button" class="savedmain" data-offer="${esc(o.id)}"><span class="datebox"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString(LOCALE, { month: 'short' }))}</small></span><span class="navtx"><b>${esc(titleOf(o))}</b><small>${esc([fmtDay(d), o.time_from && o.time_from + tl(' Uhr'), o.venue].filter(Boolean).join(' · '))}</small></span></button>
        <span class="savedside">${ro ? svg('heart') : `<button type="button" class="hearton" data-saveoffer="${esc(o.id)}" aria-label="${tl('Nicht mehr merken')}">${svg('heart')}</button>`}${mark(s.by)}</span>
        <div class="savedacts"><button type="button" class="chip" data-ics="${esc(o.id)}">${svg('cal')}${tl('Zum Kalender')}</button><button type="button" class="chip${W.remind === o.id ? ' on' : ''}" data-remind="${esc(o.id)}">${svg('bell')}${tl('Erinnerung')}</button></div>
        ${W.remind === o.id ? `<div class="savedacts"><span class="muted">${tl('Erinnern:')}</span><button type="button" class="chip" data-remindat="${esc(o.id)}|P1D">${tl('1 Tag vorher')}</button><button type="button" class="chip" data-remindat="${esc(o.id)}|PT1H">${tl('1 Stunde vorher')}</button></div>` : ''}</li>`).join('')}</ol>
        <p class="note">${tl('„Erinnerung“ trägt den Termin mit Wecker in deinen Handy-Kalender ein. Vergangene Termine verschwinden von selbst.')}</p>`
      : `<div class="empty"><b>${tl('Keine kommenden Termine gemerkt.')}</b>${tl('Tippe bei Terminen auf das Herz, dann sammeln sie sich hier.')}</div>`;
  }
  return `${head(tl('Gemerkt'), signedIn() ? `${tl('Wir')} · ${tl('gemeinsam')}` : tl('Nur auf diesem Gerät gespeichert'), false)}${tabs}${whoRow}${body}`;
}
const placeKind = p => CAT_LABEL[p.cat] || '';

// ---------- Settings, account, about, notifications ----------
function settingsView() {
  return `${head(tl('Einstellungen'))}<div class="card navlist">
    ${navRow('bell', 'bell', tl('Benachrichtigungen'), tl('Erinnerungen und Mitteilungen'))}
    ${navRow('mapset', 'map', tl('Karte'), esc(mapStyle().label))}
    ${navRow('lang', 'globe', tl('Sprache'), esc(LANGS[LANG]))}
    ${signedIn() && perm('cal') !== 'none' ? navRow('calsub', 'cal', tl('Familienkalender'), tl('In der Kalender-App abonnieren')) : ''}
    ${navRow('account', 'user', tl('Konto & Anmeldung'), tl('E-Mail, Abmelden'))}</div>`;
}
// Einstellungen › Benachrichtigungen: which news come today; choosing them comes later
// Einstellungen › Benachrichtigungen: one switch per topic (only for me, kept in my account), all on or all off
const NEWS_DESC = () => ({ shop: tl('Wenn jemand etwas auf die Einkaufsliste setzt'), errands: tl('Wenn jemand eine Besorgung plant'), saved: tl('Wenn jemand einen Termin merkt'), wir: tl('Wenn jemand eurem Wir beitritt'), tipp: tl('Zwei Wochen vor den Schulferien') });
function bellView() {
  const topics = NEWS_TOPICS(), off = store.newsOff || [], allOn = topics.every(k => !off.includes(k)), allOff = topics.every(k => off.includes(k));
  return `${head(tl('Benachrichtigungen'))}<p class="text">${tl('Neuigkeiten findest du über die Glocke auf der Karte. Hier wählst du, worüber Djuu dich informiert. Das gilt nur für dich.')}</p>
    <div class="twobtns"><button type="button" class="btn" data-newsall="on"${allOn ? ' disabled' : ''}>${svg('check')}${tl('Alle aktivieren')}</button><button type="button" class="btn" data-newsall="off"${allOff ? ' disabled' : ''}>${svg('close')}${tl('Alle deaktivieren')}</button></div>
    <div class="card navlist">${topics.map(k => { const [l, ic, c] = NEWS_AREAS[k], on = !off.includes(k);
      return `<label class="navrow switchrow"><span class="newsic" style="--c:${c}">${svg(ic)}</span><span class="navtx"><b>${l}</b><small>${NEWS_DESC()[k]}</small></span>
        <span class="tglr"><small class="${on ? '' : 'off'}">${on ? tl('Ein') : tl('Aus')}</small><span class="tglbox"><input type="checkbox" role="switch" data-newstopic="${k}" aria-label="${esc(l)}"${on ? ' checked' : ''}></span></span></label>`; }).join('')}</div>
    <p class="note">${tl('Mitteilungen aufs Handy fragt Djuu erst, wenn es Sinn ergibt. Ausgeschaltete Themen erscheinen weder in der Liste noch als Zahl an der Glocke.')}</p>`;
}
const mapSetView = () => `${head(tl('Karte'), tl('Standardansicht'))}<div class="stylegrid">${MAP_STYLES.map(m => m.sec ? `<p class="stylesec">${esc(m.sec)}</p>` : `<button type="button" class="stylecard${mapStyle().id === m.id ? ' on' : ''}" data-mapstyle="${m.id}"><img src="icons/maps/${m.id}.jpg" alt="" loading="lazy" width="150" height="100"><span>${esc(m.label)}</span></button>`).join('')}</div>
  <p class="note">${tl('Alle Kartenstile sind kostenlos und brauchen kein Konto.')}</p>`;
const langView = () => `${head(tl('Sprache'), 'Language')}<div class="card navlist">${Object.entries(LANGS).map(([c, n]) => `<button type="button" class="navrow" data-setlang="${c}"><span class="navtx"><b>${esc(n)}</b></span>${c === LANG ? svg('check') : ''}</button>`).join('')}</div>
  <p class="note">${tl('Termine und Orte stehen in der Sprache der Anbieter. Titel von Terminen übersetzt Djuu automatisch.')}</p>`;
const calSubView = () => `${head(tl('Familienkalender'))}${typeof calHtml === 'function' ? calHtml() : ''}`;
const accountView = () => hasToken() ? accountSignedIn() : loginView();
function aboutView() {
  return `${head(tl('Über Djuu'))}<div class="card navlist">
    ${CONTACT.email ? `<a class="navrow" href="mailto:${esc(CONTACT.email)}?subject=${encodeURIComponent('Feedback zu Djuu')}"><span class="navic">${svg('mail')}</span><span class="navtx"><b>${tl('Feedback geben')}</b><small>${esc(CONTACT.email)}</small></span>${svg('next')}</a>` : ''}
    ${[['impressum', tl('Impressum')], ['agb', tl('Nutzungsbedingungen')], ['datenschutz', tl('Datenschutz')], ['daten', tl('Daten und Lizenzen')]].map(([h, l]) => `<a class="navrow" href="legal.html#${h}" target="_blank" rel="noopener"><span class="navic">${svg('info')}</span><span class="navtx"><b>${l}</b></span>${svg('next')}</a>`).join('')}</div>
    <p class="note">${DATA_AT.offers ? `${esc(tl('Termine zuletzt {when} aktualisiert', { when: freshText() }))}. ` : ''}${tl('Version')} ${VERSION}</p>
    <p class="note">${tl('Die Wetteranzeige stammt vom Deutschen Wetterdienst über Bright Sky. Schulferien: Ferienordnung Hamburg, andere Bundesländer über OpenHolidays (ODbL). Die Spracheingabe in der Suche nutzt den Sprachdienst deines Browsers, dabei kann der Ton an dessen Anbieter gehen.')}</p>`;
}

// Einkauf and Besorgungen: the lists themselves are unchanged; "Ansehen" shows them without the controls
function listView_(kind) {
  const p = perm(kind === 'shop' ? 'shop' : 'errands'), title = kind === 'shop' ? tl('Einkauf') : tl('Besorgungen');
  const sub = signedIn() ? (p === 'view' ? tl('Gemeinsam · nur ansehen') : (ownWirName() ? tl('Gemeinsam mit ') + esc(ownWirName()) : tl('Gemeinsam'))) : tl('Bisher nur auf diesem Gerät');
  if (p === 'none') return `${head(title)}<div class="empty"><b>${tl('Kein Zugriff.')}</b>${tl('Der Admin eures Wir kann das ändern.')}</div>`;
  return `${head(title, sub)}<div class="${p === 'view' ? 'readonly' : ''}">${kind === 'shop' ? shopHtml() : errandHtml()}</div>`;
}

// ---------- Welcome (first start only) ----------
function showWelcome() {
  if (store.welcomed) return;
  const el = document.createElement('div');
  el.id = 'welcome'; el.className = 'welcome'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tl('Willkommen'));
  el.innerHTML = `<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i>
    <div class="wmid">${LOGO}<p>${tl('Spielplätze, Termine und Kurse für Familien in Hamburg.')}</p></div>
    <div class="wbot"><button type="button" class="btn big" data-welcome="go">${tl('Los geht’s')}</button><button type="button" class="linkbtn" data-welcome="account">${tl('Ich habe schon ein Konto')}</button></div>`;
  document.body.appendChild(el);
}
function closeWelcome(next) {
  store.welcomed = true; save();
  $('#welcome')?.remove();
  if (next === 'account') openWir('login');
}

// ---------- Rendering ----------
const WIR_PAGES = { news: () => newsView(), wirname: wirNameView, dog: dogView, guest: guestInfoView, register: registerView, verify: verifyView, login: loginView, forgot: forgotView, newpw: newPwView, invite: inviteView, join: joinView,
  pwchange: pwChangeView, emailchange: emailChangeView, emailconfirm: emailConfirmView, delete: deleteView, people: peopleView, add: addPersonView, places: placesView, place: placeEditView, fit: fitView, settings: settingsView, bell: bellView, mapset: mapSetView, lang: langView, calsub: calSubView, account: accountView, about: aboutView, shop: () => listView_('shop'), errands: () => listView_('errands') };
// every page fills the sheet, so the main button sits at the bottom like on the phone screens
function wirRender(v) {
  // pages that need an account show the sign-in instead (for example after signing out on another page)
  const needsAccount = v.type === 'person' || ['news', 'wirname', 'dog', 'people', 'add', 'places', 'place', 'fit', 'shop', 'errands', 'calsub', 'pwchange', 'emailchange', 'delete'].includes(v.page);
  const html = needsAccount && !auth?.family && !(hasToken() && ['pwchange', 'emailchange', 'delete'].includes(v.page)) ? loginView()
    : v.type === 'me' ? wirHub() : v.type === 'favs' ? gemerktView() : v.type === 'person' ? personView(v.id) : (WIR_PAGES[v.page] || wirHub)();
  return `<div class="pagewrap">${html}</div>`;
}

// ---------- Access changes: with an account through the server (admin only), else on this device ----------
async function setAccess(id, body) {
  const a = adultById(id);
  if (!a) return;
  if (signedIn() && a.account !== undefined && isPbId(id)) {
    try { await api('POST', '/api/djuu/member', { id, ...body }); }
    catch (e) { toast(e.data?.message || tl('Das hat nicht geklappt. Bitte mit Netz noch einmal versuchen.')); return renderPanel(); }
  }
  if (body.perms) a.perms = { ...a.perms, ...Object.fromEntries(Object.entries(body.perms).map(([k, v]) => [k.replace('perm_', ''), v])) };
  if ('until' in body) a.until = body.until || '';
  if ('admin' in body) a.admin = !!body.admin;
  saveLocal ? saveLocal() : save(); renderPanel();
}
const PERM_KEY = { shop: 'perm_shop', errands: 'perm_errands', cal: 'perm_cal', saved: 'perm_saved' };
async function sendInvite() {
  const A = W.add;
  W.busy = true; renderPanel();
  try {
    const perms = Object.fromEntries(Object.entries(A.perms).map(([k, v]) => [PERM_KEY[k], v]));
    const r = await api('POST', '/api/djuu/invite', { grp: A.grp, role: A.role, perms, until: A.grp === 'helper' ? A.until : '' });
    const url = `${location.origin}${location.pathname}#join=${r.token}`;
    const who = meAdult()?.name || '';
    const text = A.grp === 'helper' ? tl('{name} lädt dich ins Wir bei Djuu ein. Der Link gilt 7 Tage.', { name: who }) : tl('Komm in unser Wir bei Djuu: gemeinsamer Einkauf, Besorgungen und Kalender. Der Link gilt 7 Tage.');
    if (navigator.share) await navigator.share({ title: tl('Einladung zu Djuu'), text, url }).catch(() => {});
    else await navigator.clipboard?.writeText(text + ' ' + url).then(() => toast('Einladungslink kopiert.'), () => toast(url));
    W.add = { grp: 'family', role: '', perms: null, until: '', name: '' }; back();
  } catch (e) { toast(e.data?.message || tl('Einladen hat nicht geklappt. Bitte mit Netz noch einmal versuchen.')); }
  W.busy = false; renderPanel();
}
async function removePerson(id) {
  const a = adultById(id);
  if (!a || !confirm(tl('{name} aus eurem Wir entfernen? Das Konto der Person bleibt bestehen.', { name: a.name || tl('Diese Person') }))) return;
  if (signedIn() && a.account) {
    try { await api('POST', '/api/djuu/remove', { id }); } catch (e) { return toast(e.data?.message || tl('Entfernen hat nicht geklappt.')); }
  }
  store.profile.adults = store.profile.adults.filter(x => x.id !== id);
  save(); back();
}
function finishOnboarding() { store.onboarded = true; save(); W.onb = 1; renderPanel(); }

// ---------- Interaction ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.wir) {
    if (['register', 'login', 'forgot', 'verify'].includes(d.wir)) { W.err = ''; if (d.wir !== 'verify') W.notice = ''; }
    if (d.wir === 'add') { W.add = { grp: 'family', role: '', perms: null, until: '', name: '' }; }
    if (d.wir === 'shop' || d.wir === 'errands') SH.menu = SH.pending = SH.editing = null;
    go({ type: 'wir', page: d.wir });
  }
  else if (d.wirperson) go({ type: 'person', id: d.wirperson });
  else if (d.lookphoto) openLooksPhoto(d.lookphoto);
  else if (d.color) {
    const [key, c] = d.color.split('|'), dog = dogs().find(y => y.id === key), x = key === 'me' ? ensureMe() : adultById(key) || kidById(key) || dog;
    if (x && (key === 'me' || (dog ? isAdmin() : canEditLooks(x)))) { x.color = c; save(); renderPanel(); }
  }
  else if (d.looksave) { back(); toast(tl('Gespeichert.')); }
  else if (d.wirdog) go({ type: 'wir', page: 'dog', id: d.wirdog });
  else if (d.adddog) {
    if (d.adddog === 'inline') { store.profile.dogList.push({ id: pbId(), name: '' }); save(); renderPanel(); }
    else { W.add = { grp: 'dog', role: '', perms: null, until: '', name: '' }; go({ type: 'wir', page: 'add' }); }
  }
  else if (d.dogdel) {
    if (view().page === 'dog' && !confirm(tl('Diesen Eintrag entfernen?'))) return;
    store.profile.dogList = dogs().filter(x => x.id !== d.dogdel); save();
    if (view().page === 'dog') back(); else renderPanel();
  }
  else if (d.welcome) closeWelcome(d.welcome);
  else if (d.onbrole) { const me = ensureMe(); me.role = me.role === d.onbrole ? '' : d.onbrole; save(); renderPanel(); }
  else if (d.onb) {
    if (W.onb === 1) {
      const name = $('#onbName').value.trim();
      if (!name) { toast(tl('Bitte gib deinen Vornamen oder Spitznamen an.')); return $('#onbName').focus(); }
      ensureMe().name = name; save();
      // a new account: the first step creates the Wir, the lists and everything from this phone go into it
      if (hasToken() && !auth.family) {
        W.busy = true; renderPanel();
        createFamily(name, 'Wir', meAdult()?.role).then(() => { W.busy = false; W.onb = 2; renderPanel(); runPending(); },
          x => { W.busy = false; toast(accountError(x)); renderPanel(); });
        return;
      }
    }
    if (W.onb === 2 && !d.skip && store.profile.kids.some(k => k.name && !k.ym)) return toast(tl('Bitte bei jedem Kind mindestens das Geburtsjahr angeben.'));
    if (W.onb === 2 && !d.skip && $('#onbWirName') && $('#onbWirName').value.trim() !== ownWirName()) setWirLooks({ name: $('#onbWirName').value.trim().slice(0, 60) || 'Wir' });
    if (W.onb === 2 && !d.skip) { const plz = $('#onbPlz').value.trim(); if (plz && !setPlzPlace(plz)) return toast(tl('Bitte eine Hamburger Postleitzahl eingeben.')); save(); }
    if (d.onb === 'done') return finishOnboarding();
    if (d.onb === 'invite') { const g = W.add.grp; finishOnboarding(); W.add = { grp: g, role: '', perms: null, until: '', name: '' }; return go({ type: 'wir', page: 'add' }); }
    W.onb = +d.onb; renderPanel();
  }
  else if (d.onbpick) { W.onbPick = true; W.add.grp = d.onbpick; renderPanel(); }
  else if (d.addgrp) { W.add = { grp: d.addgrp, role: '', perms: null, until: '', name: W.add.name }; renderPanel(); }
  else if (d.addrole) { W.add.role = W.add.role === d.addrole ? '' : d.addrole; renderPanel(); }
  else if (d.addsave) {
    const A = W.add, name = $('#addName')?.value.trim() || '';
    if (d.addsave === 'kid') {
      A.name = name;
      if (!name) return toast(tl('Bitte gib einen Namen an.'));
      if (!A.ym) return toast(tl('Bitte mindestens das Geburtsjahr angeben.'));
      store.profile.kids.push({ id: pbId(), name, ym: A.ym, d: A.d || '' }); save(); back(); return;
    }
    if (d.addsave === 'dog') { store.profile.dogList.push({ id: pbId(), name }); save(); back(); return; }
    if (d.addsave === 'invite') return sendInvite();
    if (!name) return toast(tl('Bitte gib einen Namen an.'));
    store.profile.adults.push({ id: pbId(), name, work: '', role: A.role, grp: A.grp, perms: { ...A.perms }, until: A.grp === 'helper' ? A.until : '', at: Date.now() });
    save(); back();
  }
  else if (d.prole) { const a = adultById(view().id); if (a) { a.role = a.role === d.prole ? '' : d.prole; save(); renderPanel(); } }
  else if (d.premove) removePerson(d.premove);
  else if (d.kidremove) { if (!confirm(tl('Diesen Eintrag entfernen?'))) return; store.profile.kids = store.profile.kids.filter(k => k.id !== d.kidremove); save(); back(); }
  else if (d.placeedit) {
    const p = store.places.find(x => x.id === d.placeedit);
    W.place = p ? { ...p } : { id: '', name: store.places.some(x => x.name === tl('Zuhause')) ? '' : tl('Zuhause'), plz: '', address: '', shared: false, def: !store.places.some(x => x.def) };
    go({ type: 'wir', page: 'place' });
  }
  else if (d.pname) { W.place.name = d.pname; W.place.plz = $('#plPlz').value.trim(); renderPanel(); }
  else if (d.plshowaddr) { W.place.showAddr = true; W.place.name = $('#plName').value; W.place.plz = $('#plPlz').value.trim(); renderPanel(); setTimeout(() => $('#plAddr')?.focus(), 30); }
  else if (d.plgps) {
    if (!navigator.geolocation) return toast(tl('Dieses Gerät kann den Standort nicht bestimmen.'));
    navigator.geolocation.getCurrentPosition(p => {
      const near = GEO.plz.map(x => [dist([p.coords.latitude, p.coords.longitude], [x[1], x[2]]), x]).sort((a, b) => a[0] - b[0])[0];
      if (!near || near[0] > 15000) return toast(tl('Du bist gerade nicht in Hamburg.'));
      W.place.name = $('#plName').value; W.place.plz = near[1][0]; renderPanel(); toast(`${tl('Postleitzahl:')} ${near[1][0]} ${near[1][3]}`);
    }, () => toast(tl('Standort nicht verfügbar. Bitte im Browser erlauben.')), { timeout: 10000, maximumAge: 300000 });
  }
  else if (d.plsave) savePlace();
  else if (d.pldel) { if (!confirm(tl('Diesen Ort löschen?'))) return; const wasDef = W.place.def; store.places = store.places.filter(p => p.id !== W.place.id); if (wasDef) { const n = store.places.find(p => p.mine !== false); if (n) n.def = true; } W.place = null; save(); back(); }
  else if (d.fit) { const D = W.fitDraft; D.tags.has(d.fit) ? D.tags.delete(d.fit) : D.tags.add(d.fit); renderPanel(); }
  else if (d.fitsave) {
    const D = W.fitDraft;
    if (D.tags.size && !$('#fitOk')?.checked) return toast(tl('Bitte stimme zu, damit Djuu die Angaben speichern darf. Oder lass alles leer.'));
    store.fit = D.tags.size ? { tags: [...D.tags], at: Date.now() } : null; W.fitDraft = null; save(); toast(D.tags.size ? tl('Gespeichert. Nur auf diesem Gerät.') : tl('Nichts gespeichert.')); back();
  }
  else if (d.fitclear) { store.fit = null; W.fitDraft = null; save(); toast(tl('Gelöscht.')); renderPanel(); }
  else if (d.savedtab) { W.savedTab = d.savedtab; renderPanel(); }
  else if (d.savedwho != null && 'savedwho' in d) { W.savedWho = d.savedwho; renderPanel(); }
  else if (d.remind) { W.remind = W.remind === d.remind ? null : d.remind; renderPanel(); }
  else if (d.remindat) { const [id, at] = d.remindat.split('|'); downloadIcs([OFFER_BY_ID.get(id)], 'djuu-erinnerung.ics', at); W.remind = null; renderPanel(); }
  else if (d.setlang) { store.lang = d.setlang; save(); location.reload(); }
});
// the photo sheet for the Wir, my own entry (first step) or a person, child or dog
function openLooksPhoto(key) {
  const [kind, id] = key.split('|');
  if (kind === 'wir') {
    return photoSheet({ title: tl('Foto des Wir'), hint: tl('Alle im Wir sehen es'), avatar: wirAvatar('md'), hasPhoto: !!store.wirPhoto,
      onPhoto: url => setWirLooks({ photo: url }), onRemove: () => setWirLooks({ photo: '' }) });
  }
  const x = kind === 'me' ? ensureMe() : kind === 'dog' ? dogs().find(y => y.id === id) : adultById(id) || kidById(id);
  if (!x) return;
  const name = kind === 'dog' ? dogName(x) : x.name || '';
  const av = kind === 'dog' ? dogAv(x, 'md') : avatarHtml(members().find(y => y.id === x.id) || { ...x, color: x.color || MEMBER_COLORS[0] }, 'md');
  photoSheet({ title: kind === 'me' ? tl('Dein Foto') : tl('Foto von {name}', { name }), hint: kind === 'kid' || kind === 'dog' ? tl('Nur die Familie sieht es') : tl('Alle im Wir sehen es'),
    avatar: av, hasPhoto: !!x.photo, selfie: kind === 'me' || x.id === meId(),
    onPhoto: url => { x.photo = url; save(); renderPanel(); }, onRemove: () => { x.photo = ''; save(); renderPanel(); } });
}
// photo and name of the Wir live on the server (only the admin may change them)
async function setWirLooks(body) {
  try { await api('PATCH', `/api/collections/families/records/${auth.family}`, body); }
  catch (e) { return toast(!e.status ? tl('Keine Verbindung. Bitte später noch einmal.') : [400, 403, 404].includes(e.status) ? tl('Nur der Admin kann das ändern.') : tl('Das hat nicht geklappt.')); }
  if ('photo' in body) store.wirPhoto = body.photo;
  if ('name' in body) { auth.familyName = body.name; writeJson(AUTH_KEY, auth); }
  save(); renderPanel();
}

// the person using this phone: created on the first step if there is none yet
function ensureMe() {
  let me = meAdult();
  if (!me) { me = { id: pbId(), name: '', work: '', grp: 'family', perms: { ...DEFAULT_PERMS.family }, admin: true }; store.profile.adults.unshift(me); store.profile.me = me.id; }
  return me;
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'wirNameForm') return;
  e.preventDefault();
  const n = $('#wirNameIn').value.trim();
  setWirLooks({ name: n.slice(0, 60) || 'Wir' }).then(() => back());
});
document.addEventListener('input', e => {
  if (e.target.id !== 'onbName') return;
  const me = meAdult(), box = $('#onbAv .av:not(.ring)');
  if (box) box.textContent = (e.target.value.trim() || '?').slice(0, 1).toUpperCase();
  if (me) me.name = e.target.value.trim();
});
document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (d.perm) {
    const [id, area] = d.perm.split('|');
    if (id === 'new') { W.add.perms[area] = el.value; return; }
    setAccess(id, { perms: { [PERM_KEY[area]]: el.value } });
  }
  else if (d.adduntil) { W.add.until = el.checked ? ymd(addDays(today0(), 14)) : ''; renderPanel(); }
  else if (el.id === 'addUntil') W.add.until = el.value;
  else if (d.puntil) setAccess(d.puntil, { until: el.checked ? ymd(addDays(today0(), 14)) : '' });
  else if (d.puntildate) setAccess(d.puntildate, { until: el.value });
  else if (d.padmin) { if (el.checked || confirm(tl('Admin-Rechte wirklich wegnehmen?'))) setAccess(d.padmin, { admin: el.checked }); else el.checked = true; }
  else if (d.dogname != null) { const x = dogs()[+d.dogname]; if (x) { x.name = el.value.trim(); save(); } }
  else if (d.plshared) W.place.shared = el.checked;
  else if (d.pldef) W.place.def = el.checked;
  else if (d.birth) {
    const [key, part] = d.birth.split('|'), k = key === 'new' ? W.add : store.profile.kids[+key];
    if (key === 'new') W.add.name = $('#addName')?.value.trim() || W.add.name;
    if (k && setBirth(k, part, el.value) && key !== 'new') { save(); renderTop(); }
    renderPanel();
  }
  else if (el.id === 'plName' && W.place) W.place.name = el.value.trim();
  else if (el.id === 'plPlz' && W.place) W.place.plz = el.value.trim();
  else if (el.id === 'plAddr' && W.place) W.place.address = el.value.trim();
});
// ---------- Account pages: guest, register, confirm e-mail, sign in, passwords, invite ----------
const hasToken = () => typeof auth !== 'undefined' && !!auth?.token;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(navigator.userAgent);
const mailAppUrl = () => isIOS() ? 'message://' : isAndroid() ? 'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end' : '';
const pwField = (id, label, auto, extra = '') => `<div class="field"><label for="${id}">${label}</label><div class="pwbox"><input id="${id}" type="password" autocomplete="${auto}" minlength="8" required${extra}>
  <button type="button" class="pweye" data-pweye="${id}" aria-label="${tl('Passwort zeigen')}">${svg('eye')}</button></div></div>`;
const emailField = (id, value = '') => `<div class="field"><label for="${id}">${tl('E-Mail')}</label><input id="${id}" type="email" autocomplete="email" inputmode="email" required value="${esc(value)}" placeholder="anna@beispiel.de"></div>`;
const errHtml = () => W.err ? `<p class="error" role="alert">${W.err}</p>` : '';
const noticeHtml = () => W.notice ? `<p class="okbox" role="status">${svg('check')} ${esc(W.notice)}</p>` : '';
const consentBox = id => `<label class="consent"><input type="checkbox" id="${id}" required> <span>${tl('Ich akzeptiere die')} <a href="legal.html#agb" target="_blank" rel="noopener"><b>${tl('Nutzungsbedingungen')}</b></a> ${tl('und den')} <a href="legal.html#datenschutz" target="_blank" rel="noopener"><b>${tl('Datenschutz')}</b></a>.</span></label>`;
const pendingEmail = () => { try { return localStorage.getItem('djuu.pendingEmail') || ''; } catch (e) { return ''; } };

function guestHub() {
  return `<div class="wirhead guest"><span class="av lg ghost">${svg('user')}</span><h2>${tl('Wir')}<span class="sub">${tl('Nicht angemeldet · Daten nur auf diesem Gerät')}</span></h2></div>
    <div class="card hero"><h4>${tl('Konto erstellen')}</h4><p class="text">${tl('Mit E-Mail und Passwort bleiben deine Infos auf allen Geräten und du kannst deine Familie verbinden.')}</p>
      <button type="button" class="btn big primary" data-wir="register">${tl('Registrieren')}</button>
      <button type="button" class="btn big" data-wir="login">${tl('Ich habe schon ein Konto')}</button>
      <button type="button" class="linkbtn plus center" data-wir="guest">${tl('Als Gast weiter')}</button></div>
    <div class="card"><h4 class="cardtitle">${tl('Deine Familie')}</h4><p class="note">${tl('Nach der Anmeldung kannst du Partner:in, Großeltern und andere verbinden und Einkauf und Termine teilen.')}</p></div>
    <div class="card navlist">
      <button type="button" class="navrow" data-lock="people"><span class="navic">${svg('user')}</span><span class="navtx"><b>${tl('Personen')}</b><small>${tl('Personen, Orte, Vorschläge')}</small></span>${svg('next')}</button>
      ${navRow('settings', 'gear', tl('Einstellungen'), tl('Karte, Sprache'))}
      ${navRow('login', 'card', tl('Konto & Abo'), tl('E-Mail, Abmelden'))}
      ${navRow('about', 'info', tl('Über Djuu'), tl('Feedback, Rechtliches, Version'))}</div>`;
}
function guestInfoView() {
  const ok = [[tl('Karte, Suche und Termine'), tl('Alle Orte, Kurse und Filter')], [tl('Details und Anmeldung'), tl('Öffnungszeiten, Infos, Kontakt')]];
  const more = [[tl('Einkauf und Besorgungen'), tl('Gemeinsame Listen im Wir')], [tl('Gemerkt'), tl('Orte und Termine speichern')], [tl('Personen einladen'), tl('Einkauf, Besorgungen und Kalender teilen')],
    [tl('Meine Orte und Vorschläge'), tl('Umkreis-Suche, passende Termine')], [tl('Auf allen Geräten'), tl('Nichts geht verloren')]];
  const row = (ic, cls) => ([t, s]) => `<div class="navrow static"><span class="navic ${cls}">${svg(ic)}</span><span class="navtx"><b>${t}</b><small>${s}</small></span></div>`;
  return `${head(tl('Gast'), tl('Du nutzt Djuu ohne Konto'))}
    <div class="card navlist"><h4 class="cardtitle in">${tl('Das geht ohne Konto')}</h4>${ok.map(row('check', 'green')).join('')}</div>
    <div class="card navlist"><h4 class="cardtitle in">${tl('Mit Konto zusätzlich')}</h4>${more.map(row('lock', '')).join('')}</div>
    <div class="stick"><button type="button" class="btn big primary" data-wir="register">${tl('Konto erstellen')}</button><p class="note center">${tl('Kostenlos · nur E-Mail und Passwort')}</p></div>`;
}
function registerView() {
  return `${head(tl('Konto erstellen'), tl('Kostenlos · dauert eine Minute'))}
    <form id="regForm" novalidate>${emailField('regEmail', W.email || '')}${pwField('regPw', tl('Passwort'), 'new-password')}<p class="note">${tl('Mindestens 8 Zeichen.')}</p>
      ${consentBox('regOk')}${errHtml()}
      <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Registrieren')}</button></form>
    <p class="note center">${tl('Schon ein Konto?')} <button type="button" class="linkbtn strong" data-wir="login">${tl('Anmelden')}</button></p>
    ${hint(tl('Mehr brauchen wir nicht. Name, Kinder und Orte trägst du später selbst und freiwillig ein.'))}`;
}
function verifyView() {
  const left = Math.max(0, Math.ceil(((W.resendAt || 0) - Date.now()) / 1000)), app = mailAppUrl(), email = W.email || pendingEmail();
  return `${head('', '')}<div class="verify"><span class="bigic">${svg('mail')}</span><h2 class="big">${tl('Bestätige deine E-Mail')}</h2>
      <p class="muted">${tl('Wir haben dir einen Link geschickt an')}</p><p><b>${esc(email)}</b></p>
      <p class="muted small">${tl('Tippe auf den Link in der E-Mail. Erst danach ist dein Konto aktiv. Schau auch im Spam-Ordner nach.')}</p></div>
    ${noticeHtml()}${errHtml()}
    ${app ? `<a class="btn big primary wide" href="${app}">${svg('mail')}${tl('E-Mail-App öffnen')}</a>` : ''}
    <button type="button" class="btn big wide" id="resendBtn" data-resend="1"${left ? ' disabled' : ''}>${tl('Link erneut senden')}</button>
    <p class="note center" id="resendNote">${left ? tl('Du kannst in {n} Sekunden einen neuen Link anfordern.', { n: left }) : tl('Kein Link angekommen? Fordere einen neuen an.')}</p>
    <p class="center"><button type="button" class="linkbtn strong" data-wir="register">${tl('Falsche Adresse? E-Mail ändern')}</button></p>
    ${W.pw ? `<p class="note center">${tl('Sobald du bestätigt hast, geht es hier automatisch weiter.')}</p>` : `<p class="center"><button type="button" class="linkbtn strong" data-wir="login">${tl('Schon bestätigt? Anmelden')}</button></p>`}`;
}
function loginView() {
  return `${head(tl('Anmelden'))}${noticeHtml()}
    <form id="loginForm" novalidate>${emailField('loginEmail', W.email || pendingEmail())}${pwField('loginPw', tl('Passwort'), 'current-password')}
      <p><button type="button" class="linkbtn strong" data-wir="forgot">${tl('Passwort vergessen?')}</button></p>${errHtml()}
      ${W.unverified ? `<p class="note">${tl('Noch nicht bestätigt?')} <button type="button" class="linkbtn strong" data-resend="login">${tl('Bestätigungslink erneut senden')}</button></p>` : ''}
      <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Anmelden')}</button></form>
    <p class="note center">${tl('Neu hier?')} <button type="button" class="linkbtn strong" data-wir="register">${tl('Konto erstellen')}</button></p>`;
}
function forgotView() {
  return `${head(tl('Passwort vergessen?'))}<p class="text">${tl('Gib deine E-Mail ein. Wir schicken dir einen Link, mit dem du ein neues Passwort wählst.')}</p>
    <form id="forgotForm" novalidate>${emailField('forgotEmail', W.email || pendingEmail())}${noticeHtml()}${errHtml()}
      <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Link senden')}</button></form>`;
}
function newPwView() {
  return `${head(tl('Neues Passwort'))}<form id="newpwForm" novalidate>${pwField('newPw', tl('Neues Passwort'), 'new-password')}<p class="note">${tl('Mindestens 8 Zeichen.')}</p>${errHtml()}
    <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Speichern')}</button></form>`;
}
const peopleDots = list => `<div class="avrow center">${(list || []).slice(0, 6).map((l, i) => `<span class="av" style="--c:${MEMBER_COLORS[i % MEMBER_COLORS.length]}">${esc(l)}</span>`).join('')}</div>`;
function inviteView() {
  const I = W.inviteInfo;
  if (!I) { loadInviteInfo(); return `${head('')}<div class="empty"><b>${tl('Einladung wird geladen …')}</b></div>`; }
  if (I.error) return `${head(tl('Einladung'))}<div class="empty"><b>${esc(I.error)}</b>${tl('Bitte die Person, dir einen neuen Link zu schicken.')}</div><button type="button" class="btn wide" data-invitedrop="1">${tl('Schließen')}</button>`;
  return `<div class="invitehead">${peopleDots(I.people)}<h2 class="big center">${I.inviter ? tl('{name} lädt dich ins Wir ein', { name: esc(I.inviter) }) : tl('Du wurdest in ein Wir eingeladen')}</h2>
      <p class="muted center">${tl('Zusammen seht ihr Einkauf, Besorgungen und Kalender. Du bekommst deinen eigenen Zugang.')}</p></div>
    <form id="inviteForm" novalidate>${emailField('invEmail', W.email || '')}${pwField('invPw', tl('Passwort'), 'new-password')}<p class="note">${tl('Mindestens 8 Zeichen.')}</p>
      ${consentBox('invOk')}${errHtml()}
      <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Konto erstellen und beitreten')}</button></form>
    <p class="note center">${tl('Schon ein Konto?')} <button type="button" class="linkbtn strong" data-wir="login">${tl('Anmelden und beitreten')}</button></p>
    <p class="center"><button type="button" class="linkbtn" data-invitedrop="1">${tl('Nein danke')}</button></p>`;
}
async function loadInviteInfo() {
  if (W.inviteLoading || !SY.invite) return;
  W.inviteLoading = true;
  try { W.inviteInfo = await inviteInfo(SY.invite); } catch (e) { W.inviteInfo = { error: e.status === 404 ? (e.data?.message || tl('Diese Einladung gibt es nicht mehr.')) : tl('Keine Verbindung. Bitte später noch einmal.') }; }
  W.inviteLoading = false; renderPanel();
}
const ROLES_JOIN = [tl('Elternteil'), tl('Oma / Opa'), tl('Tante / Onkel'), tl('Babysitter:in'), tl('Anderes …')];
function joinView() {
  const I = W.inviteInfo;
  if (!I) loadInviteInfo();
  return `${peopleDots(I?.people)}<h2 class="big">${I?.inviter ? tl('Du trittst dem Wir von {name} bei', { name: esc(I.inviter) }) : tl('Du trittst dem Wir bei')}</h2>
    <p class="muted text">${tl('Wie sollen wir dich nennen?')}</p>
    <form id="joinForm" novalidate><div class="field"><label for="joinName">${tl('Vorname oder Spitzname')}</label><input id="joinName" maxlength="30" autocomplete="given-name" required value="${esc(W.joinName || '')}"></div>
      <div class="field"><label>${tl('Deine Rolle')} <small class="muted">${tl('Freiwillig')}</small></label>${chipRow(ROLES_JOIN, W.joinRole, 'data-joinrole')}</div>${errHtml()}
      <div class="stick"><button type="submit" class="btn big primary"${W.busy ? ' disabled' : ''}>${tl('Beitreten')}</button></div></form>`;
}
function accountSignedIn() {
  return `${head(tl('Konto & Anmeldung'))}
    <div class="card navlist acct"><div class="acctrow"><span class="navtx"><small>${tl('E-Mail')}</small><b>${esc(auth.email)}</b></span><span class="pill green">${tl('Bestätigt')}</span></div>
      <button type="button" class="navrow" data-wir="emailchange"><span class="navic">${svg('mail')}</span><span class="navtx"><b>${tl('E-Mail ändern')}</b></span>${svg('next')}</button>
      <button type="button" class="navrow" data-wir="pwchange"><span class="navic">${svg('gear')}</span><span class="navtx"><b>${tl('Passwort ändern')}</b></span>${svg('next')}</button>
      <div class="navrow static"><span class="navic">${svg('card')}</span><span class="navtx"><b>${tl('Abo')}</b><small>${tl('Kostenlos')}</small></span></div></div>
    ${hint(`${svg('check')} ${tl('Du bleibst angemeldet, bis du dich abmeldest. Deine Daten bleiben in deinem Konto.')}`)}
    ${auth.family ? `<p class="note">${SY.online ? `<span class="syok">●</span> ${tl('Verbunden mit')} ${esc(ownWirName() || tl('eurem Wir'))}` : `<span class="syoff">●</span> ${tl('Offline, Änderungen werden nachgereicht')}`}${outbox.length ? ` · ${outbox.length} ${tl('noch nicht gesendet')}` : ''}</p>` : ''}
    <button type="button" class="btn big wide" data-sylogout="1">${tl('Abmelden')}</button>
    <p class="center"><button type="button" class="linkbtn danger" data-wir="delete">${tl('Konto löschen')}</button></p>`;
}
function pwChangeView() {
  return `${head(tl('Passwort ändern'))}<form id="pwForm" novalidate>${pwField('pwOld', tl('Aktuelles Passwort'), 'current-password')}${pwField('pwNew', tl('Neues Passwort'), 'new-password')}
    <p class="note">${tl('Mindestens 8 Zeichen. Andere Geräte musst du danach neu anmelden.')}</p>${errHtml()}
    <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Speichern')}</button></form>`;
}
function emailChangeView() {
  return `${head(tl('E-Mail ändern'))}${noticeHtml()}<form id="emailForm" novalidate>${emailField('emNew')}${pwField('emPw', tl('Dein Passwort'), 'current-password')}
    <p class="note">${tl('Wir schicken einen Link an die neue Adresse. Erst wenn du ihn öffnest, gilt sie.')}</p>${errHtml()}
    <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Link senden')}</button></form>`;
}
function emailConfirmView() {
  return `${head(tl('Neue E-Mail bestätigen'))}<p class="text">${tl('Gib zur Sicherheit dein Passwort ein.')}</p>
    <form id="emailConfirmForm" novalidate>${pwField('ecPw', tl('Passwort'), 'current-password')}${errHtml()}
    <button type="submit" class="btn big primary wide"${W.busy ? ' disabled' : ''}>${tl('Bestätigen')}</button></form>`;
}
function deleteView() {
  const me = meAdult(), others = members().filter(m => m.id !== auth?.member);
  const text = me?.admin && others.length
    ? tl('Du bist Admin. Wenn du dein Konto löschst, wird euer ganzes Wir gelöscht, für alle: Einkauf, Besorgungen, Gemerktes, Orte und Einträge. Betroffen: {names}.', { names: others.map(m => m.name).join(', ') })
    : tl('Dein Konto und alle deine Daten werden gelöscht. Das lässt sich nicht rückgängig machen.');
  return `${head(tl('Konto löschen'))}<p class="warnbox">${svg('info')} ${esc(text)}</p>
    <form id="delForm" novalidate>${pwField('delPw', tl('Passwort zur Bestätigung'), 'current-password')}${errHtml()}
      <button type="submit" class="btn big wide danger"${W.busy ? ' disabled' : ''}>${tl('Konto endgültig löschen')}</button></form>
    <button type="button" class="btn ghost wide" data-back="1">${tl('Abbrechen')}</button>`;
}

// the sheet a guest sees on a locked feature; after signing in the action continues
const LOCKS = {
  merken: ['heart', tl('Zum Merken brauchst du ein Konto'), tl('Dann findest du deine Lieblingsorte und Termine auf jedem Gerät wieder.')],
  people: ['user', tl('Dafür brauchst du ein Konto'), tl('Mit Konto verbindest du deine Familie, trägst eure Orte ein und bekommst passende Vorschläge.')],
};
function lockSheet(kind) {
  document.getElementById('lock')?.remove();
  const [ic, title, text] = LOCKS[kind] || LOCKS.people, el = document.createElement('div');
  el.id = 'lock'; el.className = 'lockwrap';
  el.innerHTML = `<div class="lockbg" data-lockclose="1"></div><div class="locksheet" role="dialog" aria-modal="true" aria-labelledby="lockT"><i class="lockgrip"></i>
    <span class="bigic">${svg(ic)}</span><h3 id="lockT">${title}</h3><p class="muted">${text}</p>
    <button type="button" class="btn big primary wide" data-lockgo="register">${tl('Konto erstellen')}</button>
    <button type="button" class="btn big wide" data-lockgo="login">${tl('Anmelden')}</button>
    <button type="button" class="linkbtn center" data-lockclose="1">${tl('Später')}</button></div>`;
  document.body.appendChild(el);
  el.querySelector('[data-lockgo]').focus();
}
const closeLock = () => document.getElementById('lock')?.remove();
function openWir(page) { closeLock(); stack = [{ type: 'list' }]; go({ type: 'me' }, 'full'); setTab('me'); if (page) go({ type: 'wir', page }); }
// after signing in: join the Wir from the invite, or create one (first step), or straight into the Wir
function afterSignIn() {
  W.err = ''; W.notice = ''; W.pw = null; W.unverified = false;
  if (!auth.family) store.onboarded = false; else store.onboarded = true;
  W.onb = 1; save();
  openWir(!auth.family && SY.invite ? 'join' : null);
  runPending();
}
function runPending() {
  const P = W.pendingAction;
  if (!P || !auth?.family) return;
  W.pendingAction = null;
  if (P.offer && !isSaved(P.offer) && OFFER_BY_ID.get(P.offer)) toggleSaved(P.offer);
  if (P.place && !store.favorites.includes(P.place)) { store.favorites.push(P.place); store.favBy[P.place] = meId(); save(); toast(tl('Gemerkt. Du findest es unter „Gemerkt“.')); }
}
// friendly words for what the server says
function accountError(e, kind) {
  if (!e.status) return tl('Keine Verbindung. Bitte später noch einmal.');
  const f = e.data?.data || {};
  if (f.email?.code === 'validation_not_unique') return tl('Diese E-Mail hat schon ein Konto. Melde dich an.');
  if (f.email) return tl('Bitte eine gültige E-Mail eingeben.');
  if (f.password || f.oldPassword) return kind === 'pw' && f.oldPassword ? tl('Das aktuelle Passwort stimmt nicht.') : tl('Das Passwort braucht mindestens 8 Zeichen.');
  if (f.token) return tl('Der Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.');
  if (kind === 'login') return tl('E-Mail oder Passwort stimmt nicht.');
  if (kind === 'check') return tl('Das Passwort stimmt nicht.');
  if (e.status === 429) return tl('Zu viele Versuche. Bitte warte kurz.');
  return esc(e.data?.message || tl('Das hat nicht geklappt.'));
}
async function busy(fn) { W.busy = true; W.err = ''; renderPanel(); try { await fn(); } finally { W.busy = false; renderPanel(); } }
const val = id => ($('#' + id)?.value || '').trim();

document.addEventListener('submit', async e => {
  const id = e.target.id;
  if (!['regForm', 'loginForm', 'forgotForm', 'newpwForm', 'inviteForm', 'joinForm', 'pwForm', 'emailForm', 'emailConfirmForm', 'delForm'].includes(id)) return;
  e.preventDefault();
  const fail = msg => { W.err = msg; renderPanel(); };
  if (id === 'regForm' || id === 'inviteForm') {
    const p = id === 'regForm' ? 'reg' : 'inv', email = val(p + 'Email'), pw = $('#' + p + 'Pw').value;
    W.email = email;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(tl('Bitte eine gültige E-Mail eingeben.'));
    if (pw.length < 8) return fail(tl('Das Passwort braucht mindestens 8 Zeichen.'));
    if (!$('#' + p + 'Ok').checked) return fail(tl('Bitte stimme den Nutzungsbedingungen und dem Datenschutz zu.'));
    await busy(async () => {
      try { await register(email, pw); W.pw = pw; W.resendAt = Date.now() + 30000; W.notice = ''; stack.pop(); go({ type: 'wir', page: 'verify' }); }
      catch (x) { W.err = accountError(x, 'reg'); }
    });
  }
  else if (id === 'loginForm') {
    const email = val('loginEmail'), pw = $('#loginPw').value;
    W.email = email;
    await busy(async () => {
      try { await signIn(email, pw); afterSignIn(); toast(tl('Angemeldet.')); }
      catch (x) { W.err = accountError(x, 'login'); W.unverified = !!x.status; }
    });
  }
  else if (id === 'forgotForm') {
    const email = val('forgotEmail'); W.email = email;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(tl('Bitte eine gültige E-Mail eingeben.'));
    await busy(async () => { try { await requestReset(email); W.notice = tl('Wenn es ein Konto mit dieser E-Mail gibt, ist der Link unterwegs. Schau auch im Spam-Ordner nach.'); } catch (x) { W.err = accountError(x); } });
  }
  else if (id === 'newpwForm') {
    const pw = $('#newPw').value;
    if (pw.length < 8) return fail(tl('Das Passwort braucht mindestens 8 Zeichen.'));
    await busy(async () => {
      try { await confirmReset(W.resetToken, pw); W.resetToken = null; W.notice = tl('Neues Passwort gespeichert. Melde dich jetzt an.'); stack.pop(); go({ type: 'wir', page: 'login' }); }
      catch (x) { W.err = accountError(x); }
    });
  }
  else if (id === 'joinForm') {
    const name = val('joinName');
    W.joinName = name;
    if (!name) return fail(tl('Bitte gib deinen Vornamen oder Spitznamen an.'));
    await busy(async () => {
      try { await joinFamily(SY.invite, name, W.joinRole || ''); store.onboarded = true; save(); W.inviteInfo = null; openWir(); toast(tl('Willkommen in eurem Wir!')); runPending(); }
      catch (x) { W.err = accountError(x); }
    });
  }
  else if (id === 'pwForm') {
    const old = $('#pwOld').value, pw = $('#pwNew').value;
    if (pw.length < 8) return fail(tl('Das Passwort braucht mindestens 8 Zeichen.'));
    await busy(async () => { try { await changePassword(old, pw); back(); toast(tl('Passwort geändert.')); } catch (x) { W.err = accountError(x, 'pw'); } });
  }
  else if (id === 'emailForm') {
    const email = val('emNew'), pw = $('#emPw').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(tl('Bitte eine gültige E-Mail eingeben.'));
    await busy(async () => {
      try { await requestEmailChange(pw, email); W.notice = tl('Link an {email} geschickt. Bis du ihn öffnest, bleibt deine bisherige E-Mail gültig.', { email }); }
      catch (x) { W.err = accountError(x, 'check'); }
    });
  }
  else if (id === 'emailConfirmForm') {
    const pw = $('#ecPw').value;
    await busy(async () => {
      try { await confirmEmailChange(W.emailToken, pw); W.emailToken = null; if (hasToken()) logout(true); W.notice = tl('Neue E-Mail gespeichert. Bitte melde dich damit an.'); stack.pop(); go({ type: 'wir', page: 'login' }); }
      catch (x) { W.err = accountError(x, 'check'); }
    });
  }
  else if (id === 'delForm') {
    const pw = $('#delPw').value;
    await busy(async () => {
      try { await deleteAccount(pw); home(); toast(tl('Dein Konto ist gelöscht.')); }
      catch (x) { W.err = x.status === 400 ? tl('Das Passwort stimmt nicht.') : accountError(x); }
    });
  }
});
// guests: the heart and the places of the Wir need an account
document.addEventListener('click', e => {
  if (auth?.family) return;
  const t = e.target.closest('[data-saveoffer], [data-fav], [data-lock]');
  if (!t) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (t.dataset.lock) return lockSheet(t.dataset.lock);
  W.pendingAction = t.dataset.saveoffer ? { offer: t.dataset.saveoffer } : { place: t.dataset.fav };
  lockSheet('merken');
}, true);
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.lockclose) { closeLock(); W.pendingAction = null; }
  else if (d.lockgo) openWir(d.lockgo);
  else if (d.pweye) { const i = $('#' + d.pweye); i.type = i.type === 'password' ? 'text' : 'password'; t.classList.toggle('on', i.type === 'text'); }
  else if (d.resend) {
    const email = d.resend === 'login' ? val('loginEmail') : (W.email || pendingEmail());
    if (!email) return;
    try { await resendVerification(email); W.notice = tl('Neuer Link ist unterwegs.'); W.resendAt = Date.now() + 30000; } catch (x) { W.err = accountError(x); }
    renderPanel();
  }
  else if (d.joinrole) { W.joinName = val('joinName'); W.joinRole = W.joinRole === d.joinrole ? '' : d.joinrole; renderPanel(); }
  else if (d.invitedrop) { try { localStorage.removeItem('djuu.join'); } catch (x) { /* storage blocked */ } SY.invite = null; W.inviteInfo = null; home(); }
});
// the confirmation link was opened (maybe in another app): this page notices and continues by itself
setInterval(async () => {
  const v = view();
  if (v.type !== 'wir' || v.page !== 'verify') return;
  const left = Math.max(0, Math.ceil(((W.resendAt || 0) - Date.now()) / 1000)), b = $('#resendBtn'), n = $('#resendNote');
  if (b) b.disabled = !!left;
  if (n) n.textContent = left ? tl('Du kannst in {n} Sekunden einen neuen Link anfordern.', { n: left }) : tl('Kein Link angekommen? Fordere einen neuen an.');
  if (!W.pw || W.trying || document.visibilityState !== 'visible' || (Date.now() / 1000 | 0) % 5) return;
  W.trying = true;
  try { await signIn(W.email || pendingEmail(), W.pw); afterSignIn(); toast(tl('E-Mail bestätigt. Willkommen bei Djuu!')); } catch (x) { /* not confirmed yet */ }
  W.trying = false;
}, 1000);
// links from the mails: #verify=, #reset=, #email=; an invite link (sync.js) opens its page
(() => {
  const m = location.hash.match(/^#(verify|reset|email)=([\w.-]+)/);
  if (!m) { if (SY.invite && !auth?.family) { store.welcomed = true; setTimeout(() => { $('#welcome')?.remove(); openWir(hasToken() ? null : 'invite'); }, 900); } return; }
  history.replaceState(null, '', location.pathname);
  store.welcomed = true; save();
  const [, kind, token] = m;
  setTimeout(async () => {
    $('#welcome')?.remove();
    if (kind === 'verify') {
      try { await confirmVerification(token); W.notice = tl('E-Mail bestätigt. Du kannst dich jetzt anmelden.'); }
      catch (e) { W.err = tl('Der Link ist abgelaufen oder wurde schon benutzt. Melde dich an oder fordere einen neuen an.'); }
      openWir(hasToken() ? null : 'login');
    } else if (kind === 'reset') { W.resetToken = token; openWir('newpw'); }
    else { W.emailToken = token; openWir('emailconfirm'); }
  }, 900);
})();

showWelcome();
