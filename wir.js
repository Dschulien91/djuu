/* Djuu "Wir": the hub of a family. People in three groups (Familie, Kinder, Helfer:innen) with access per area,
   the first steps, Meine Orte, "Was passt zu euch?", Gemerkt, settings, account and "Über Djuu".
   Einkauf and Besorgungen are unchanged (family.js); they only open from the tiles here and follow the access rules.
   Without an account everything stays on this device and this person counts as admin.
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
store.favBy = store.favBy || {};
store.kidPhotos = store.kidPhotos || {}; // children's photos stay on this device, never synced
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
const isAdmin = () => !signedIn() || !!meAdult()?.admin;
// what this person may do in an area: 'none', 'view' or 'edit'. Without an account: everything, it is your device.
function perm(area) {
  if (!signedIn()) return 'edit';
  const me = meAdult();
  if (!me) return 'none';
  if (me.admin) return 'edit';
  if (expired(me)) return 'none';
  return me.perms?.[area] || 'edit';
}
const W = { onb: 1, add: { grp: 'family', role: '', perms: null, until: '', name: '' }, place: null, fitDraft: null, savedTab: 'orte', savedWho: '', remind: null, busy: false };

const kidAgeText = k => { if (!k.ym) return tl('Alter fehlt'); const [y, m] = k.ym.split('-').map(Number), now = new Date(); const months = (now.getFullYear() - y) * 12 + now.getMonth() + 1 - m; return months < 0 ? tl('unterwegs') : kidLabel(months); };
function avatarHtml(m, size = '') {
  const photo = m.kid && store.kidPhotos[m.id];
  return photo ? `<span class="av ${size}"><img src="${photo}" alt=""></span>` : `<span class="av ${size}" style="--c:${m.color}" aria-hidden="true">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span>`;
}
const adultById = id => store.profile.adults.find(a => a.id === id);
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
  if (!store.onboarded) return onboardingView();
  const ms = members(), kids = ms.filter(m => m.kid), adults = store.profile.adults;
  const fam = adults.filter(a => a.grp !== 'helper').length, help = adults.filter(a => a.grp === 'helper').length;
  const count = [fam && `${fam} ${tl('Familie')}`, kids.length && `${kids.length} ${kids.length === 1 ? tl('Kind') : tl('Kinder')}`, help && `${help} ${help === 1 ? tl('Helfer:in') : tl('Helfer:innen')}`].filter(Boolean).join(' · ');
  const shop = perm('shop'), err = perm('errands');
  const n = openItems().length, e = store.errands.filter(x => x.state !== 'gekauft').length;
  const tile = (open, icon, title, n_) => `<button type="button" class="tile" data-wir="${open}"><span class="navic">${svg(icon)}</span>${n_ ? `<span class="n">${n_}</span>` : ''}<b>${title}</b><small>${signedIn() ? tl('Gemeinsam') : tl('Auf diesem Gerät')}</small></button>`;
  const placesSub = store.places.filter(p => p.mine !== false).map(p => tl(p.name)).slice(0, 3).join(', ');
  const me = meAdult();
  return `<div class="wirhead"><h2>${tl('Wir')}<span class="sub">${signedIn() ? esc(auth.familyName || tl('Deine Familie in Djuu')) : tl('Deine Familie in Djuu · nur auf diesem Gerät')}</span></h2>
      <button type="button" class="round" data-wir="bell" aria-label="${tl('Benachrichtigungen')}">${svg('bell')}</button></div>
    ${expired(me) && signedIn() ? hint(tl('Dein Zugang ist abgelaufen. Der Admin kann ihn verlängern.')) : ''}
    <div class="card people"><div class="cardhead"><h4>${tl('Personen')}</h4><button type="button" class="linkbtn" data-wir="people">${tl('Verwalten')}</button></div>
      <div class="avrow">${ms.map(m => `<button type="button" class="avbtn" data-wirperson="${m.id}" aria-label="${esc(m.name)}">${avatarHtml(m)}</button>`).join('')}
        ${isAdmin() ? `<button type="button" class="avbtn" data-wir="add" aria-label="${tl('Person hinzufügen')}"><span class="av add">${svg('plus')}</span></button>` : ''}</div>
      <p class="note">${count || tl('Noch niemand eingetragen.')}</p></div>
    ${shop !== 'none' || err !== 'none' ? `<div class="tiles">${shop !== 'none' ? tile('shop', 'cart', tl('Einkauf'), n) : ''}${err !== 'none' ? tile('errands', 'list', tl('Besorgungen'), e) : ''}</div>` : ''}
    ${ferienCard(9999, true)}
    <div class="card navlist">
      ${navRow('places', 'pin', tl('Meine Orte'), esc(placesSub ? placesSub + (store.places.length > 3 ? ' …' : '') : tl('Zuhause, Arbeit, Kita …')))}
      ${navRow('fit', 'star', tl('Was passt zu euch?'), tl('Freiwillig · für passende Vorschläge'))}
      ${navRow('settings', 'gear', tl('Einstellungen'), tl('Benachrichtigungen, Karte, Sprache'))}
      ${navRow('account', 'card', tl('Konto & Abo'), signedIn() || (typeof auth !== 'undefined' && auth?.token) ? tl('E-Mail, Abo, Abmelden') : tl('Nicht angemeldet · Teilen mit der Familie'))}
      ${navRow('about', 'info', tl('Über Djuu'), tl('Feedback, Rechtliches, Version'))}</div>`;
}

// ---------- First steps (name is the only thing that is needed) ----------
function onboardingView() {
  const dots = `<div class="dots" aria-label="${tl('Schritt')} ${W.onb} / 3">${[1, 2, 3].map(i => `<i class="${i === W.onb ? 'on' : ''}"></i>`).join('')}</div>`;
  const me = meAdult();
  if (W.onb === 1) {
    return `${dots}<h2 class="big">${tl('Wer bist du?')}</h2><p class="muted text">${tl('Damit deine Familie dich erkennt.')}</p>
      <div class="field"><label for="onbName">${tl('Vorname oder Spitzname')}</label><input id="onbName" maxlength="30" autocomplete="given-name" value="${esc(me?.name || '')}"></div>
      <div class="field"><label>${tl('Deine Rolle')} <small class="muted">${tl('Freiwillig')}</small></label>${chipRow(ROLES_ME, me?.role, 'data-onbrole')}</div>
      <div class="stick"><button type="button" class="btn big primary" data-onb="2">${tl('Weiter')}</button></div>`;
  }
  if (W.onb === 2) {
    const home = store.places.find(p => p.def);
    return `${dots}<h2 class="big">${tl('Euer Wir')}</h2><p class="muted text">${tl('Trag deine Kinder ein, dann zeigen wir passende Termine. Ein Spitzname reicht.')}</p>
      ${store.profile.kids.map((k, i) => `<div class="kidline"><input data-kid="${i}" data-k="name" value="${esc(k.name || '')}" placeholder="${tl('Name')}" maxlength="20" aria-label="${tl('Name')}">
        <select data-kidage="${i}" aria-label="${tl('Alter')}">${ageOptions(k)}</select></div>`).join('')}
      <button type="button" class="linkbtn plus" data-addkid="1">${svg('plus')}${tl('Kind hinzufügen')}</button>
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
function ageOptions(k) {
  const now = new Date(), cur = k.ym ? Math.floor(((now.getFullYear() - +k.ym.slice(0, 4)) * 12 + now.getMonth() + 1 - +k.ym.slice(5, 7)) / 12) : '';
  return `<option value="">${tl('Alter')}</option>` + Array.from({ length: 18 }, (_, y) => `<option value="${y}"${cur === y ? ' selected' : ''}>${y === 0 ? tl('unter 1 Jahr') : y === 1 ? tl('1 Jahr') : `${y} ${tl('Jahre')}`}</option>`).join('');
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
    ${group(tl('Kinder'), tl('Nur ein Eintrag, kein Zugang'), kids.map(m => row(m, kidAgeText(kidById(m.id)), null)))}
    ${group(tl('Helfer:innen'), tl('Du bestimmst, was sie sehen'), adults.filter(a => a.grp === 'helper').map(adultRow))}
    ${moreAboutHtml()}
    ${isAdmin() ? `<div class="stick"><button type="button" class="btn big primary" data-wir="add">${svg('plus')}${tl('Person hinzufügen')}</button></div>` : ''}`;
}
// family details that are not people: baby on the way, school holidays, dogs (kept from before)
function moreAboutHtml() {
  const pr = store.profile;
  return `<details class="fold"><summary>${tl('Mehr über euch')} <small class="muted">${tl('freiwillig')}</small></summary>
    <div class="field"><label for="expecting">${tl('Baby unterwegs? Errechneter Termin (optional)')}</label><input id="expecting" type="date" value="${esc(pr.expecting || '')}" min="${ymd(today0())}"></div>
    <div class="field"><label for="fedState">${tl('Bundesland (für eure Schulferien)')}</label><select id="fedState">${Object.entries(STATES).map(([c, n]) => `<option value="${c}"${(pr.state || 'DE-HH') === c ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="field"><label for="dogs">${tl('Hunde in der Familie')}</label>
      <div class="stepper"><button type="button" data-dogs="-1" aria-label="${tl('Weniger')}">–</button><b id="dogsN">${pr.dogs || 0}</b><button type="button" data-dogs="1" aria-label="${tl('Mehr')}">+</button></div></div></details>`;
}

function addPersonView() {
  const A = W.add, seg = `<div class="segs" role="tablist">${[['family', tl('Familie')], ['kid', tl('Kind')], ['helper', tl('Helfer:in')]].map(([g, l]) =>
    `<button type="button" role="tab" aria-selected="${A.grp === g}" class="${A.grp === g ? 'on' : ''}" data-addgrp="${g}">${l}</button>`).join('')}</div>`;
  if (A.grp === 'kid') {
    return `${head(tl('Person hinzufügen'))}${seg}<p class="muted text">${tl('Nur ein Eintrag für passende Vorschläge. Kinder haben keinen Zugang.')}</p>
      <div class="field"><label for="addName">${tl('Vorname oder Spitzname')}</label><input id="addName" maxlength="20" value="${esc(A.name)}"></div>
      <div class="field"><label for="addYm">${tl('Geburtsmonat')}</label><input id="addYm" type="month" value="${esc(A.ym || '')}" max="${ymd(today0()).slice(0, 7)}"><p class="note">${tl('Monat und Jahr reichen.')}</p></div>
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
  return `${head(esc(a.name || tl('Person')), esc(a.role ? tl(a.role) : (a.grp === 'helper' ? tl('Helfer:in') : tl('Familie'))))}
    <div class="card who">${avatarHtml(m, 'lg')}<span class="navtx"><b>${a.account || !signedIn() && self ? tl('Eigener Zugang') : tl('Ohne eigenen Zugang')}</b>
      <small>${[invited && `${a.account ? tl('Eingeladen am') : tl('Eingetragen am')} ${invited}`, a.email].filter(Boolean).map(esc).join(' · ') || (a.admin ? tl('Admin dieses Wir') : '')}</small></span></div>
    ${canEditName ? `<div class="field"><label for="pName">${tl('Vorname oder Spitzname')}</label><input id="pName" data-adult="${i}" data-k="name" maxlength="30" value="${esc(a.name || '')}"></div>
      <div class="field"><label>${tl('Rolle')} <small class="muted">${tl('Freiwillig')}</small></label>${chipRow(a.grp === 'helper' ? ROLES_HELPER : self ? ROLES_ME : ROLES_FAMILY, a.role, 'data-prole')}</div>
      <div class="field"><label for="pWork">${tl('Arbeitszeiten')} <small class="muted">${tl('Freiwillig')}</small></label><input id="pWork" data-adult="${i}" data-k="work" maxlength="60" placeholder="${tl('z. B. Mo–Fr 8–16')}" value="${esc(a.work || '')}"></div>` : ''}
    <div class="sec"><h4>${tl('Zugang')}<small>${a.admin ? tl('Admins sehen und bearbeiten alles.') : admin ? `${tl('Du bestimmst als Admin, was')} ${esc(a.name || tl('diese Person'))} ${tl('sieht')}` : tl('Nur der Admin kann das ändern.')}</small></h4>
      <div class="card perms">${AREAS.map(([k, l]) => `<div class="permrow"><span>${l}</span>${levelSelect(id, k, a.admin ? 'edit' : a.perms?.[k] || 'edit', !canEditAccess)}</div>`).join('')}</div>
      <p class="note"><b>${tl('Ansehen')}</b>: ${tl('nur lesen')} · <b>${tl('Mitbearbeiten')}</b>: ${tl('hinzufügen, abhaken, ändern. Orte und Kinderdaten bleiben privat.')}</p></div>
    ${canEditAccess ? toggleRow(`data-puntil="${id}"`, !!a.until, tl('Zugang befristet'), a.until ? `${tl('Endet am')} ${fmtUntil(a.until)}${expired(a) ? ` · ${tl('abgelaufen')}` : ''}` : tl('Endet automatisch an einem Tag deiner Wahl')) +
      (a.until ? `<div class="field"><input id="pUntil" data-puntildate="${id}" type="date" value="${esc(a.until)}" aria-label="${tl('Endet am')}"></div>` : '') : ''}
    ${admin && signedIn() && a.account && a.grp !== 'helper' && !self ? toggleRow(`data-padmin="${id}"`, !!a.admin, tl('Zweiter Admin'), tl('Darf Personen einladen und den Zugang ändern')) : ''}
    ${signedIn() && a.account && !self ? `<button type="button" class="btn wide" data-syask="${id}">${svg('pin')}${tl('Fragen: Wo bist du?')}</button><p class="note">${tl('Die Person entscheidet selbst, ob sie ihren Standort einmal schickt. Er wird nach 24 Stunden gelöscht.')}</p>` : ''}
    ${admin && !self ? `<button type="button" class="btn wide danger" data-premove="${id}">${tl('Person entfernen')}</button>` : ''}`;
}
function kidView(k) {
  const i = store.profile.kids.indexOf(k), m = members().find(x => x.id === k.id), photo = store.kidPhotos[k.id];
  return `${head(esc(k.name || tl('Kind')), esc(kidAgeText(k)))}
    <div class="card who">${avatarHtml(m, 'lg')}<span class="navtx"><b>${tl('Kind')}</b><small>${tl('Nur ein Eintrag, kein Zugang')}</small></span>
      <label class="btn sm">${svg('camera')}${photo ? tl('Foto ändern') : tl('Foto (optional)')}<input type="file" accept="image/*" data-kidphoto="${k.id}" hidden></label></div>
    ${photo ? `<p class="note">${tl('Das Foto bleibt nur auf diesem Handy und wird nicht geteilt.')} <button type="button" class="linkbtn" data-kidphotodel="${k.id}">${tl('Entfernen')}</button></p>` : `<p class="note">${tl('Ein Foto bleibt nur auf diesem Handy und wird nicht geteilt.')}</p>`}
    <div class="field"><label for="kName">${tl('Vorname oder Spitzname')}</label><input id="kName" data-kid="${i}" data-k="name" maxlength="20" value="${esc(k.name || '')}"></div>
    <div class="kidline"><div class="field"><label for="kYm">${tl('Geburtsmonat')}</label><input id="kYm" data-kid="${i}" data-k="ym" type="month" value="${esc(k.ym || '')}" max="${ymd(today0()).slice(0, 7)}"></div>
      <div class="field"><label for="kD">${tl('Tag (optional)')}</label><select id="kD" data-kid="${i}" data-k="d"><option value="">–</option>${Array.from({ length: 31 }, (_, j) => `<option${+k.d === j + 1 ? ' selected' : ''}>${j + 1}</option>`).join('')}</select></div></div>
    <div class="field"><label for="kSchool">${tl('Kita oder Schule')}</label><input id="kSchool" data-kid="${i}" data-k="school" maxlength="60" placeholder="${tl('Kita oder Schule, Klasse')}" value="${esc(k.school || '')}"></div>
    <div class="kidline"><div class="field"><label for="kSize">${tl('Kleidergröße')}</label><input id="kSize" data-kid="${i}" data-k="size" maxlength="12" placeholder="104" value="${esc(k.size || '')}"></div>
      <div class="field"><label for="kShoe">${tl('Schuhgröße')}</label><input id="kShoe" data-kid="${i}" data-k="shoe" maxlength="8" placeholder="28" value="${esc(k.shoe || '')}"></div></div>
    <p class="note">${tl('Die Größen stehen bei Besorgungen für dieses Kind.')}</p>
    ${isAdmin() || meAdult()?.grp === 'family' ? `<button type="button" class="btn wide danger" data-kidremove="${k.id}">${tl('Eintrag entfernen')}</button>` : ''}`;
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
    body = offers.length ? `<ol class="savedlist">${offers.map(([d, o, s]) => `<li class="savedcard ev"><button type="button" class="savedmain" data-offer="${esc(o.id)}"><span class="datebox"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString(LOCALE, { month: 'short' }))}</small></span><span class="navtx"><b>${esc(titleOf(o))}</b><small>${esc([fmtDay(d), o.time_from && o.time_from + tl(' Uhr'), o.venue].filter(Boolean).join(' · '))}</small></span></button>
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
const bellView = () => `${head(tl('Benachrichtigungen'))}<div class="empty"><b>${tl('Noch keine Mitteilungen.')}</b>${tl('Hier erscheinen bald Erinnerungen an gemerkte Termine und Neuigkeiten aus eurem Wir.')}</div>`;
const mapSetView = () => `${head(tl('Karte'), tl('Standardansicht'))}<div class="stylegrid">${MAP_STYLES.map(m => m.sec ? `<p class="stylesec">${esc(m.sec)}</p>` : `<button type="button" class="stylecard${mapStyle().id === m.id ? ' on' : ''}" data-mapstyle="${m.id}"><img src="icons/maps/${m.id}.jpg" alt="" loading="lazy" width="150" height="100"><span>${esc(m.label)}</span></button>`).join('')}</div>
  <p class="note">${tl('Alle Kartenstile sind kostenlos und brauchen kein Konto.')}</p>`;
const langView = () => `${head(tl('Sprache'), 'Language')}<div class="card navlist">${Object.entries(LANGS).map(([c, n]) => `<button type="button" class="navrow" data-setlang="${c}"><span class="navtx"><b>${esc(n)}</b></span>${c === LANG ? svg('check') : ''}</button>`).join('')}</div>
  <p class="note">${tl('Termine und Orte stehen in der Sprache der Anbieter. Titel von Terminen übersetzt Djuu automatisch.')}</p>`;
const calSubView = () => `${head(tl('Familienkalender'))}${typeof calHtml === 'function' ? calHtml() : ''}`;
function accountView() {
  return `${head(tl('Konto & Anmeldung'))}${typeof syncHtml === 'function' ? syncHtml() : ''}`;
}
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
  const sub = signedIn() ? (p === 'view' ? tl('Gemeinsam · nur ansehen') : tl('Gemeinsam mit ') + esc(auth.familyName || tl('der Familie'))) : tl('Bisher nur auf diesem Gerät');
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
  if (next === 'account') { stack = [{ type: 'list' }]; go({ type: 'me' }, 'full'); setTab('me'); store.onboarded = true; go({ type: 'wir', page: 'account' }); }
}

// ---------- Rendering ----------
const WIR_PAGES = { people: peopleView, add: addPersonView, places: placesView, place: placeEditView, fit: fitView, settings: settingsView, bell: bellView, mapset: mapSetView, lang: langView, calsub: calSubView, account: accountView, about: aboutView, shop: () => listView_('shop'), errands: () => listView_('errands') };
// every page fills the sheet, so the main button sits at the bottom like on the phone screens
function wirRender(v) {
  const html = v.type === 'me' ? wirHub() : v.type === 'favs' ? gemerktView() : v.type === 'person' ? personView(v.id) : (WIR_PAGES[v.page] || wirHub)();
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
// resize a photo to a small square on this device; it never leaves the phone
function readPhoto(file, id) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const s = 192, c = document.createElement('canvas'), k = Math.min(img.width, img.height);
    c.width = c.height = s;
    c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, s, s);
    store.kidPhotos[id] = c.toDataURL('image/jpeg', .82); URL.revokeObjectURL(url); save(); renderPanel();
  };
  img.onerror = () => toast(tl('Dieses Bild lässt sich nicht öffnen.'));
  img.src = url;
}
function finishOnboarding() { store.onboarded = true; save(); W.onb = 1; renderPanel(); }

// ---------- Interaction ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.wir) {
    if (d.wir === 'add') { W.add = { grp: 'family', role: '', perms: null, until: '', name: '' }; }
    if (d.wir === 'shop' || d.wir === 'errands') SH.menu = SH.pending = SH.editing = null;
    go({ type: 'wir', page: d.wir });
  }
  else if (d.wirperson) go({ type: 'person', id: d.wirperson });
  else if (d.welcome) closeWelcome(d.welcome);
  else if (d.onbrole) { const me = ensureMe(); me.role = me.role === d.onbrole ? '' : d.onbrole; save(); renderPanel(); }
  else if (d.onb) {
    if (W.onb === 1) {
      const name = $('#onbName').value.trim();
      if (!name) { toast(tl('Bitte gib deinen Vornamen oder Spitznamen an.')); return $('#onbName').focus(); }
      ensureMe().name = name; save();
    }
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
      if (!name) return toast(tl('Bitte gib einen Namen an.'));
      store.profile.kids.push({ id: pbId(), name, ym: $('#addYm').value || '' }); save(); back(); return;
    }
    if (d.addsave === 'invite') return sendInvite();
    if (!name) return toast(tl('Bitte gib einen Namen an.'));
    store.profile.adults.push({ id: pbId(), name, work: '', role: A.role, grp: A.grp, perms: { ...A.perms }, until: A.grp === 'helper' ? A.until : '', at: Date.now() });
    save(); back();
  }
  else if (d.prole) { const a = adultById(view().id); if (a) { a.role = a.role === d.prole ? '' : d.prole; save(); renderPanel(); } }
  else if (d.premove) removePerson(d.premove);
  else if (d.kidremove) { if (!confirm(tl('Diesen Eintrag entfernen?'))) return; store.profile.kids = store.profile.kids.filter(k => k.id !== d.kidremove); delete store.kidPhotos[d.kidremove]; save(); back(); }
  else if (d.kidphotodel) { delete store.kidPhotos[d.kidphotodel]; save(); renderPanel(); }
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
// the person using this phone: created on the first step if there is none yet
function ensureMe() {
  let me = meAdult();
  if (!me) { me = { id: pbId(), name: '', work: '', grp: 'family', perms: { ...DEFAULT_PERMS.family }, admin: true }; store.profile.adults.unshift(me); store.profile.me = me.id; }
  return me;
}
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
  else if (d.plshared) W.place.shared = el.checked;
  else if (d.pldef) W.place.def = el.checked;
  else if (d.kidage) {
    const k = store.profile.kids[+d.kidage], y = +el.value, now = new Date();
    if (el.value === '') return;
    const dt = new Date(now.getFullYear() - y, now.getMonth() - (y === 0 ? 6 : 0), 1);
    k.ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; save();
  }
  else if (d.kidphoto && el.files[0]) readPhoto(el.files[0], d.kidphoto);
  else if (el.id === 'plName' && W.place) W.place.name = el.value.trim();
  else if (el.id === 'plPlz' && W.place) W.place.plz = el.value.trim();
  else if (el.id === 'plAddr' && W.place) W.place.address = el.value.trim();
});
showWelcome();
