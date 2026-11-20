/* Djuu family calendar (Wir › Kalender): own entries of the Wir, Bringen/Abholen with a weekly plan and "Ich übernehme",
   Kita-Schließtage per child, birthdays from the children's birth dates (family group only: helpers never get birth dates),
   and the school holidays as all-day rows (read from app.js, FAM_BREAKS).
   Entries live in store.cal and are synced like the lists (sync.js, collection cal_entries, access area "Kalender":
   'view' reads, 'edit' adds and changes). The calendar subscription (Einstellungen › Familienkalender) carries them too.
   Calm: no pop-ups, no badges; reminders only as alarms in the subscribed calendar.
   Loaded after looks.js. */
'use strict'; // i18n-skip

store.cal = Array.isArray(store.cal) ? store.cal : [];
const CAL = { span: 8, edit: null, plan: null }; // screen state, not saved
const CAL_KINDS = () => [['event', tl('Termin')], ['pickup', tl('Abholen')], ['dropoff', tl('Bringen')], ['closed', tl('Kita zu')]];
const CAL_REPEATS = () => [['', tl('Einmal')], ['weekly', tl('Jede Woche')], ['biweekly', tl('Alle zwei Wochen')], ['monthly', tl('Jeden Monat')], ['yearly', tl('Jedes Jahr')]];
const CAL_ALARMS = () => [['', tl('Keine Erinnerung')], ['PT15M', tl('15 Minuten vorher')], ['PT1H', tl('1 Stunde vorher')], ['P1D', tl('1 Tag vorher')]];
const PLAN_DAYS = [0, 1, 2, 3, 4]; // Mo–Fr
const calEdit = () => perm('cal') === 'edit';
// hidden while the server has no calendar yet (an app update before the server update)
const calSee = () => signedIn() && perm('cal') !== 'none' && !(typeof MISSING !== 'undefined' && MISSING.has('cal_entries'));
const dOf = k => new Date(k + 'T12:00');
const kOf = d => ymd(d);
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isHm = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));

// ---------- When does an entry happen ----------
// k = 'YYYY-MM-DD'. Kita zu and one-off entries with an end date cover every day in between.
function calOn(e, k) {
  if (!isYmd(e.date) || k < e.date) return false;
  if (e.kind === 'closed' || (!e.repeat && e.end)) return k <= (e.end && e.end >= e.date ? e.end : e.date);
  if (!e.repeat) return k === e.date;
  if (e.until && k > e.until) return false;
  const a = dOf(e.date), b = dOf(k), days = Math.round((b - a) / 864e5);
  if (e.repeat === 'weekly') return days % 7 === 0;
  if (e.repeat === 'biweekly') return days % 14 === 0;
  if (e.repeat === 'monthly') return a.getDate() === b.getDate();
  if (e.repeat === 'yearly') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  return false;
}
// who brings or picks up on that day: a taken-over day wins
const whoOn = (e, k) => (e.overrides && Object.prototype.hasOwnProperty.call(e.overrides, k) && e.overrides[k] ? [e.overrides[k]] : (e.who || []));
const isRun = e => e.kind === 'pickup' || e.kind === 'dropoff';
const nameList = ids => ids.map(id => memberById(id)?.name).filter(Boolean);
const joinNames = list => list.length <= 1 ? (list[0] || '') : `${list.slice(0, -1).join(', ')}${tl(' und ')}${list[list.length - 1]}`;
// birthdays need the full date (year, month, day) and are for the family group only (helpers get ages, never dates)
function birthdaysOn(k) {
  const d = dOf(k), out = [];
  for (const kid of store.profile.kids) {
    if (kid.remote || String(kid.ym || '').length !== 7 || !kid.d) continue;
    const [y, m] = kid.ym.split('-').map(Number);
    if (m === d.getMonth() + 1 && +kid.d === d.getDate() && d.getFullYear() > y) out.push({ kid, age: d.getFullYear() - y });
  }
  return out;
}
const breakOn = k => (typeof FAM_BREAKS !== 'undefined' && Array.isArray(FAM_BREAKS) ? FAM_BREAKS.find(([a, z]) => a <= k && k <= z) : null);
// everything of one day, in the order a family reads it: holidays, closed days, birthdays, all-day entries, then by time
function dayItems(k) {
  const out = [];
  const br = breakOn(k);
  if (br) out.push({ type: 'ferien', title: br[2], sort: 0 });
  for (const e of store.cal) {
    if (!calOn(e, k)) continue;
    out.push({ type: 'entry', e, who: isRun(e) ? whoOn(e, k) : (e.who || []), sort: e.kind === 'closed' ? 1 : e.from ? 10 + (+e.from.slice(0, 2)) * 60 + (+e.from.slice(3, 5)) : 3 });
  }
  for (const b of birthdaysOn(k)) out.push({ type: 'bday', ...b, sort: 2 });
  return out.sort((a, b) => a.sort - b.sort);
}
// a readable line for an entry
function entryTitle(e, k) {
  const kids = joinNames(nameList(e.kids || []));
  if (e.kind === 'closed') return e.title || (kids ? tl('Kita zu: {kids}', { kids }) : tl('Kita zu'));
  if (e.kind === 'pickup') return kids ? tl('{kids} abholen', { kids }) : (e.title || tl('Abholen'));
  if (e.kind === 'dropoff') return kids ? tl('{kids} bringen', { kids }) : (e.title || tl('Bringen'));
  return e.title || tl('Termin');
}
const timeText = e => e.from ? `${e.from}${e.to ? '–' + e.to : ''}` : tl('ganztags');
// the people of an entry as small avatars in their colour
const whoAvatars = ids => ids.map(id => members().find(m => m.id === id)).filter(Boolean).map(m => avatarHtml(m, 'xs')).join('');

// ---------- Wir › Kalender: today and the next days ----------
function calView() {
  if (!calSee()) return `${head(tl('Kalender'))}<div class="empty"><b>${tl('Der Kalender ist für dich nicht freigegeben.')}</b>${tl('Der Admin eures Wir kann ihn für dich freigeben.')}</div>`;
  const t0 = today0(), days = [];
  for (let i = 0; i < CAL.span; i++) { const d = addDays(t0, i), k = kOf(d); days.push([d, k, dayItems(k)]); }
  const me = meId(), edit = calEdit();
  const row = (it, k) => {
    if (it.type === 'ferien') return `<li class="calrow allday ferien"><span class="caltime">${svg('star')}</span><span class="navtx"><b>${esc(it.title)}</b><small>${tl('Schulferien')}</small></span></li>`;
    if (it.type === 'bday') return `<li class="calrow allday bday"><span class="caltime">${svg('heart')}</span><span class="navtx"><b>${esc(tl('{name} wird {age}', { name: it.kid.name || tl('Kind'), age: it.age }))}</b><small>${tl('Geburtstag')}</small></span>${whoAvatars([it.kid.id])}</li>`;
    const e = it.e, run = isRun(e), mine = it.who.includes(me);
    const sub = [run ? (it.who.length ? (e.kind === 'pickup' ? tl('holt ab: {who}', { who: joinNames(nameList(it.who)) }) : tl('bringt: {who}', { who: joinNames(nameList(it.who)) })) : tl('Noch niemand eingetragen')) : '', e.place,
      e.repeat ? CAL_REPEATS().find(r => r[0] === e.repeat)?.[1] : ''].filter(Boolean).join(' · ');
    const take = run && edit && !mine && k >= kOf(t0) ? `<button type="button" class="chip" data-caltake="${esc(e.id)}|${k}">${tl('Ich übernehme')}</button>` : '';
    const undo = run && edit && e.overrides?.[k] === me ? `<button type="button" class="linkbtn" data-calgive="${esc(e.id)}|${k}">${tl('Doch nicht')}</button>` : '';
    const open = edit ? ` data-calopen="${esc(e.id)}"` : '';
    return `<li class="calrow${e.kind === 'closed' ? ' allday closed' : ''}${e.unsaved ? ' unsavedrow' : ''}"><button type="button" class="calmain"${open}${edit ? '' : ' disabled'}><span class="caltime">${e.kind === 'closed' ? svg('house') : esc(e.from || tl('ganztags'))}</span>
      <span class="navtx"><b>${esc(entryTitle(e, k))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${whoAvatars(run ? it.who : (e.kind === 'closed' ? e.kids || [] : (e.who || []).concat(e.kids || [])))}</button>
      ${take || undo ? `<div class="calacts">${take}${undo}</div>` : ''}${unsavedMark(e)}</li>`;
  };
  const sections = days.filter(([, k, items], i) => i === 0 || items.length).map(([d, k, items]) =>
    `<div class="sec"><h4>${esc(dayHead(d))}</h4>${items.length ? `<ol class="card plist callist">${items.map(it => row(it, k)).join('')}</ol>` : `<p class="muted text">${tl('Heute ist nichts eingetragen.')}</p>`}</div>`).join('');
  const any = days.some(([, , items]) => items.length);
  return `${head(tl('Kalender'), CAL.span === 8 ? tl('Heute und die nächsten 7 Tage') : tl('Die nächsten {n} Tage', { n: CAL.span }))}
    ${sections}
    ${!any && CAL.span > 8 ? `<div class="empty"><b>${tl('Noch nichts eingetragen.')}</b></div>` : ''}
    ${CAL.span < 57 ? `<p class="center"><button type="button" class="linkbtn strong" data-calmore="1">${tl('Weitere 7 Tage')}</button></p>` : ''}
    <p class="note">${tl('Termine, Abholen und Kita-Schließtage erscheinen auch im Familienkalender eurer Kalender-App (Einstellungen › Familienkalender).')}</p>
    ${edit ? `<div class="stick"><button type="button" class="btn big primary" data-calnew="event">${svg('plus')}${tl('Eintrag')}</button><button type="button" class="btn" data-calplan="1">${svg('repeat')}${tl('Abholplan')}</button></div>` : ''}`;
}

// ---------- One screen: Was, Wann, Wiederholen, Wer, Wo, Erinnerung ----------
function calDraft(kind, extra = {}) {
  return { id: '', kind, title: '', date: kOf(today0()), end: '', from: '', to: '', repeat: '', until: '', who: [], kids: [], place: '', alarm: '', note: '', overrides: {}, ...extra };
}
function calEntryView() {
  const D = CAL.edit;
  if (!D) return calView();
  const ms = members(), adults = ms.filter(m => !m.kid), kids = ms.filter(m => m.kid), run = isRun(D), closed = D.kind === 'closed';
  const chips = (list, on, attr) => `<div class="fgrid">${list.map(m => `<button type="button" class="chip${on.includes(m.id) ? ' on' : ''}" ${attr}="${esc(m.id)}" aria-pressed="${on.includes(m.id)}">${on.includes(m.id) ? svg('check') : ''}${esc(m.name)}</button>`).join('')}</div>`;
  const places = [...new Set((store.places || []).map(p => tl(p.name)).concat(store.profile.kids.map(k => k.school).filter(Boolean)))].slice(0, 6);
  return `${head(D.id ? tl('Eintrag bearbeiten') : tl('Neuer Eintrag'))}
    <div class="segs" role="tablist">${CAL_KINDS().map(([k, l]) => `<button type="button" role="tab" aria-selected="${D.kind === k}" class="${D.kind === k ? 'on' : ''}" data-calkind="${k}">${l}</button>`).join('')}</div>
    ${run || closed ? `<div class="field"><label>${tl('Für wen')}</label>${kids.length ? chips(kids, D.kids, 'data-calkid') : `<p class="muted text">${tl('Noch keine Kinder eingetragen.')}</p>`}</div>` : ''}
    ${run || closed ? '' : `<div class="field"><label for="calTitle">${tl('Was')}</label><input id="calTitle" maxlength="80" value="${esc(D.title)}" placeholder="${tl('z. B. Elternabend')}"></div>`}
    <div class="field"><label>${closed ? tl('Von – bis') : tl('Wann')}</label><div class="calwhen"><input id="calDate" type="date" value="${esc(D.date)}" aria-label="${tl('Datum')}">
      ${closed ? `<input id="calEnd" type="date" value="${esc(D.end || D.date)}" min="${esc(D.date)}" aria-label="${tl('Bis')}">` : `<input id="calFrom" type="time" value="${esc(D.from)}" aria-label="${tl('Von')}"><input id="calTo" type="time" value="${esc(D.to)}" aria-label="${tl('Bis')}">`}</div>
      ${closed ? '' : `<p class="note">${tl('Ohne Uhrzeit gilt der Eintrag den ganzen Tag.')}</p>`}</div>
    ${closed ? '' : `<div class="field"><label for="calRepeat">${tl('Wiederholen')}</label><select id="calRepeat">${CAL_REPEATS().map(([v, l]) => `<option value="${v}"${D.repeat === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${D.repeat ? `<label class="small" for="calUntil">${tl('Bis (freiwillig)')}</label><input id="calUntil" type="date" value="${esc(D.until)}" min="${esc(D.date)}">` : ''}</div>`}
    ${closed ? '' : `<div class="field"><label>${run ? (D.kind === 'pickup' ? tl('Wer holt ab?') : tl('Wer bringt?')) : tl('Wer')}</label>${chips(run ? adults : adults.concat(kids), run ? D.who : D.who.concat(D.kids), run ? 'data-calrun' : 'data-calwho')}</div>`}
    <div class="field"><label for="calPlace">${tl('Wo')} <small class="muted">${tl('freiwillig')}</small></label><input id="calPlace" maxlength="80" value="${esc(D.place)}" placeholder="${closed ? tl('z. B. Kita Sonnenschein') : tl('z. B. Schule')}">
      ${places.length ? `<div class="fgrid">${places.map(p => `<button type="button" class="chip" data-calplace="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}</div>
    ${closed ? '' : `<div class="field"><label for="calAlarm">${tl('Erinnerung')}</label><select id="calAlarm">${CAL_ALARMS().map(([v, l]) => `<option value="${v}"${D.alarm === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <p class="note">${tl('Die Erinnerung kommt von der Kalender-App, in der ihr den Familienkalender abonniert habt.')}</p></div>`}
    <div class="stick"><button type="button" class="btn big primary" data-calsave="1">${tl('Speichern')}</button>${D.id ? `<button type="button" class="btn ghost" data-caldel="1">${tl('Löschen')}</button>` : ''}</div>
    ${D.id && D.repeat ? `<p class="note center">${tl('Ändern und Löschen gilt für alle Wiederholungen.')}</p>` : ''}`;
}
// what is typed stays when a chip or tab redraws the page
function calReadForm() {
  const D = CAL.edit; if (!D) return;
  const v = id => document.getElementById(id)?.value;
  if (v('calTitle') != null) D.title = v('calTitle').trim();
  if (v('calDate') != null) D.date = v('calDate');
  if (v('calEnd') != null) D.end = v('calEnd');
  if (v('calFrom') != null) D.from = v('calFrom');
  if (v('calTo') != null) D.to = v('calTo');
  if (v('calRepeat') != null) D.repeat = v('calRepeat');
  if (v('calUntil') != null) D.until = v('calUntil');
  if (v('calPlace') != null) D.place = v('calPlace').trim();
  if (v('calAlarm') != null) D.alarm = v('calAlarm');
}
function calSave() {
  calReadForm();
  const D = CAL.edit, run = isRun(D), closed = D.kind === 'closed';
  if (!isYmd(D.date)) return toast(tl('Bitte ein Datum wählen.'));
  if (!run && !closed && !D.title) return toast(tl('Bitte schreib, was ansteht.'));
  if ((run || closed) && !D.kids.length && !D.title) return toast(tl('Bitte wähle das Kind.'));
  if (D.from && !isHm(D.from)) return toast(tl('Die Uhrzeit stimmt nicht.'));
  if (D.to && (!isHm(D.to) || !D.from || D.to <= D.from)) D.to = '';
  if (closed) { D.from = D.to = D.repeat = D.until = D.alarm = ''; if (!isYmd(D.end) || D.end < D.date) D.end = D.date; }
  else D.end = '';
  if (!D.repeat) D.until = '';
  if (D.until && D.until < D.date) D.until = '';
  if (run) D.title = '';
  const rec = { ...D, id: D.id || pbId(), by: D.by || meId(), at: D.at || Date.now() };
  const i = store.cal.findIndex(e => e.id === rec.id);
  if (i >= 0) store.cal[i] = rec; else store.cal.push(rec);
  CAL.edit = null; save(); toast(tl('Gespeichert.')); back();
}

// ---------- Abholplan: who brings or picks up a child on which weekday ----------
function calPlanDraft(kidId, kind = 'pickup') {
  const kid = kidById(kidId) || store.profile.kids[0];
  const P = { kid: kid?.id || '', kind, time: kind === 'pickup' ? '15:00' : '08:00', place: kid?.school || '', who: {} };
  const old = store.cal.filter(e => e.plan && e.plan === P.kid && e.kind === kind);
  for (const e of old) { P.who[dayIdx(dOf(e.date))] = e.who?.[0] || ''; P.time = e.from || P.time; P.place = e.place || P.place; }
  return P;
}
function calPlanView() {
  const P = CAL.plan;
  if (!P) return calView();
  const kids = members().filter(m => m.kid), adults = members().filter(m => !m.kid);
  if (!kids.length) return `${head(tl('Abholplan'))}<div class="empty"><b>${tl('Noch keine Kinder eingetragen.')}</b>${tl('Trag zuerst ein Kind unter Personen ein.')}</div>`;
  return `${head(tl('Abholplan'), tl('Jede Woche gleich, einzelne Tage tauscht ihr im Kalender'))}
    <div class="segs" role="tablist">${[['pickup', tl('Abholen')], ['dropoff', tl('Bringen')]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${P.kind === k}" class="${P.kind === k ? 'on' : ''}" data-plankind="${k}">${l}</button>`).join('')}</div>
    <div class="field"><label>${tl('Kind')}</label><div class="fgrid">${kids.map(m => `<button type="button" class="chip${P.kid === m.id ? ' on' : ''}" data-plankid="${esc(m.id)}">${P.kid === m.id ? svg('check') : ''}${esc(m.name)}</button>`).join('')}</div></div>
    <div class="field"><label for="planPlace">${tl('Wo')}</label><input id="planPlace" maxlength="80" value="${esc(P.place)}" placeholder="${tl('z. B. Kita Sonnenschein')}"></div>
    <div class="field"><label for="planTime">${P.kind === 'pickup' ? tl('Abholen um') : tl('Bringen um')}</label><input id="planTime" type="time" value="${esc(P.time)}"></div>
    <div class="field"><label>${P.kind === 'pickup' ? tl('Wer holt ab?') : tl('Wer bringt?')}</label>
      <div class="card perms">${PLAN_DAYS.map(i => `<div class="permrow"><span>${esc(I18N_DAYS_LONG[i])}</span><select class="lvl" data-planday="${i}" aria-label="${esc(I18N_DAYS_LONG[i])}"><option value="">–</option>${adults.map(a => `<option value="${esc(a.id)}"${P.who[i] === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>`).join('')}</div></div>
    <p class="note">${tl('Kann jemand an einem Tag nicht, übernimmt ein anderer im Kalender mit „Ich übernehme“. Der Plan bleibt.')}</p>
    <div class="stick"><button type="button" class="btn big primary" data-plansave="1">${tl('Speichern')}</button></div>`;
}
function calPlanSave() {
  const P = CAL.plan;
  P.place = ($('#planPlace')?.value || '').trim(); P.time = $('#planTime')?.value || P.time;
  for (const s of document.querySelectorAll('[data-planday]')) P.who[+s.dataset.planday] = s.value;
  if (!P.kid) return toast(tl('Bitte wähle das Kind.'));
  if (!isHm(P.time)) return toast(tl('Die Uhrzeit stimmt nicht.'));
  const old = store.cal.filter(e => e.plan === P.kid && e.kind === P.kind), t0 = today0();
  for (const i of PLAN_DAYS) {
    const cur = old.find(e => dayIdx(dOf(e.date)) === i), who = P.who[i] || '';
    if (!who) { if (cur) store.cal = store.cal.filter(e => e !== cur); continue; }
    if (cur) Object.assign(cur, { who: [who], from: P.time, place: P.place });
    else {
      let d = new Date(t0); while (dayIdx(d) !== i) d = addDays(d, 1);
      store.cal.push({ ...calDraft(P.kind), id: pbId(), date: kOf(d), from: P.time, repeat: 'weekly', who: [who], kids: [P.kid], place: P.place, plan: P.kid, by: meId(), at: Date.now() });
    }
  }
  CAL.plan = null; save(); toast(tl('Abholplan gespeichert.')); back();
}

// ---------- Small pieces for other pages ----------
// Wir hub: my own runs today, one calm line ("Heute: Mia um 15:00 von der Kita abholen")
function calTodayHtml() {
  if (!calSee()) return '';
  const k = kOf(today0()), me = meId();
  const runs = store.cal.filter(e => isRun(e) && calOn(e, k) && whoOn(e, k).includes(me)).sort((a, b) => (a.from || '').localeCompare(b.from || ''));
  if (!runs.length) return '';
  const line = e => {
    const kids = joinNames(nameList(e.kids || [])) || tl('Kind'), time = e.from || '';
    if (e.kind === 'pickup') return e.place ? tl('Heute: {kids} um {time} von {place} abholen', { kids, time, place: e.place }) : tl('Heute: {kids} um {time} abholen', { kids, time });
    return e.place ? tl('Heute: {kids} um {time} zu {place} bringen', { kids, time, place: e.place }) : tl('Heute: {kids} um {time} bringen', { kids, time });
  };
  return `<button type="button" class="card caltoday" data-wir="cal">${svg('clock')}<span class="navtx">${runs.map(e => `<b>${esc(line(e))}</b>`).join('')}</span>${svg('next')}</button>`;
}
// child page: the Kita-Schließtage of this child
function calKidHtml(k) {
  if (!calSee() || k.remote) return '';
  const today = kOf(today0());
  const list = store.cal.filter(e => e.kind === 'closed' && (e.kids || []).includes(k.id) && (e.end || e.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  const range = e => { const a = dOf(e.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }); return e.end && e.end !== e.date ? `${a} – ${dOf(e.end).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}` : a; };
  return `<div class="sec"><h4>${tl('Kita-Schließtage')}<small>${tl('Erscheinen im Kalender')}</small></h4>
    ${list.length ? `<ol class="card plist">${list.map(e => `<li><button type="button" class="prow" data-calopen="${esc(e.id)}"${calEdit() ? '' : ' disabled'}><span class="navic">${svg('house')}</span><span class="navtx"><b>${esc(range(e))}</b>${e.place || e.title ? `<small>${esc(e.title || e.place)}</small>` : ''}</span></button></li>`).join('')}</ol>` : `<p class="muted text">${tl('Keine eingetragen.')}</p>`}
    ${calEdit() ? `<button type="button" class="linkbtn plus" data-calclosed="${esc(k.id)}">${svg('plus')}${tl('Schließtage eintragen')}</button>` : ''}</div>`;
}
// for the offer page (app.js): "Wir gehen hin" on one date makes a calendar entry linked to the offer
function calAddFromOffer(offerId, date) {
  const o = OFFER_BY_ID.get(offerId); if (!o || !calSee() || !calEdit()) return false;
  CAL.edit = calDraft('event', { title: titleOf(o).slice(0, 80), date: isYmd(date) ? date : kOf(today0()), from: isHm(o.time_from) ? o.time_from : '', to: isHm(o.time_to) ? o.time_to : '', place: String(o.venue || '').slice(0, 80), offer: offerId, who: meId() ? [meId()] : [] });
  openWir('calentry');
  return true;
}
// birthdays: one news item a week before (family group only)
function birthdayNews() {
  if (!signedIn() || perm('cal') === 'none') return;
  const t0 = today0();
  for (let i = 1; i <= 7; i++) {
    const d = addDays(t0, i), k = kOf(d);
    for (const b of birthdaysOn(k)) addNews({ area: 'cal', key: `bday:${b.kid.id}:${d.getFullYear()}`, text: tl('Bald Geburtstag: {name} wird am {date} {age}.', { name: b.kid.name || tl('Kind'), date: d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }), age: b.age }), target: { page: 'cal' } });
  }
}

// ---------- Pages and interaction ----------
Object.assign(WIR_PAGES, { cal: calView, calentry: calEntryView, calplan: calPlanView });
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.calnew) { CAL.edit = calDraft(d.calnew); go({ type: 'wir', page: 'calentry' }); }
  else if (d.calopen) { const x = store.cal.find(y => y.id === d.calopen); if (x && calEdit()) { CAL.edit = JSON.parse(JSON.stringify({ ...calDraft(x.kind), ...x })); go({ type: 'wir', page: 'calentry' }); } }
  else if (d.calclosed) { CAL.edit = calDraft('closed', { kids: [d.calclosed], place: kidById(d.calclosed)?.school || '' }); go({ type: 'wir', page: 'calentry' }); }
  else if (d.calkind) { calReadForm(); CAL.edit.kind = d.calkind; if (isRun(CAL.edit)) CAL.edit.who = CAL.edit.who.slice(0, 1); renderPanel(); }
  else if (d.calkid) { calReadForm(); const L = CAL.edit.kids; CAL.edit.kids = L.includes(d.calkid) ? L.filter(x => x !== d.calkid) : L.concat(d.calkid); renderPanel(); }
  else if (d.calrun) { calReadForm(); CAL.edit.who = CAL.edit.who[0] === d.calrun ? [] : [d.calrun]; renderPanel(); }
  else if (d.calwho) {
    calReadForm(); const D = CAL.edit, kid = !!kidById(d.calwho), L = kid ? D.kids : D.who;
    const next = L.includes(d.calwho) ? L.filter(x => x !== d.calwho) : L.concat(d.calwho);
    if (kid) D.kids = next; else D.who = next; renderPanel();
  }
  else if (d.calplace) { calReadForm(); CAL.edit.place = d.calplace.slice(0, 80); renderPanel(); }
  else if (d.calsave) calSave();
  else if (d.caldel) { if (!confirm(tl('Diesen Eintrag löschen?'))) return; store.cal = store.cal.filter(x => x.id !== CAL.edit.id); CAL.edit = null; save(); back(); }
  else if (d.caltake || d.calgive) {
    const [id, k] = (d.caltake || d.calgive).split('|'), x = store.cal.find(y => y.id === id);
    if (!x || !calEdit()) return;
    const o = { ...(x.overrides || {}) };
    if (d.caltake) o[k] = meId(); else delete o[k];
    // overrides of days long gone are not kept
    const old = kOf(addDays(today0(), -30));
    for (const day of Object.keys(o)) if (day < old) delete o[day];
    x.overrides = o; save(); renderPanel();
    if (d.caltake) toast(tl('Eingetragen: Du übernimmst.'));
  }
  else if (d.calmore) { CAL.span = Math.min(57, CAL.span + 7); renderPanel(); }
  else if (d.calplan) { CAL.plan = calPlanDraft(store.profile.kids[0]?.id); go({ type: 'wir', page: 'calplan' }); }
  else if (d.plankind) { CAL.plan = calPlanDraft(CAL.plan.kid, d.plankind); renderPanel(); }
  else if (d.plankid) { CAL.plan = calPlanDraft(d.plankid, CAL.plan.kind); renderPanel(); }
  else if (d.plansave) calPlanSave();
});
document.addEventListener('change', e => {
  if (e.target.id === 'calRepeat' && CAL.edit) { calReadForm(); renderPanel(); }
  if (e.target.id === 'calDate' && CAL.edit) { calReadForm(); if (CAL.edit.kind === 'closed' && (!CAL.edit.end || CAL.edit.end < CAL.edit.date)) { CAL.edit.end = CAL.edit.date; renderPanel(); } }
});
