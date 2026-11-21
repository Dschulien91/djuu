// Push messages: shared code for djuu_push.pb.js (and any other hook that wants to send, e.g. the lists hook):
// enqueue(), the alarm scan for the family calendar, the texts for Bringen/Abholen changes, Hamburg time.
// Loaded with require(). Nothing here sends anything itself: the sender container fetches due messages (see server/push/).

const TOPICS = ["cal", "pickup", "lists"];
const ALARM_MS = { PT15M: 15 * 60e3, PT1H: 60 * 60e3, P1D: 24 * 60 * 60e3 };
const pad = (n) => String(n).padStart(2, "0");
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const isHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
const json = (t, d) => { try { const v = JSON.parse(t || ""); return v == null ? d : v; } catch (e) { return d; } };
const pbTime = (ms) => new Date(ms).toISOString().replace("T", " ");
// shared code, loaded once when this module is loaded (never inside the hot loops below)
const CAL = (() => { try { return require(`${__hooks}/djuu_cal.js`); } catch (e) { return null; } })();
const UTILS = require(`${__hooks}/djuu_utils.js`);

// ---------- Hamburg time (the server runs in UTC; entries are local times) ----------
function lastSunday(y, m) { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
// minutes Hamburg is ahead of UTC at this moment (CEST from the last Sunday of March to the last Sunday of October, 01:00 UTC)
function offsetMin(ms) {
  const y = new Date(ms).getUTCFullYear();
  return ms >= Date.UTC(y, 2, lastSunday(y, 2), 1) && ms < Date.UTC(y, 9, lastSunday(y, 9), 1) ? 120 : 60;
}
// a Hamburg wall-clock time as UTC milliseconds
function hamburgMs(ymd, hm) {
  const [Y, M, D] = ymd.split("-").map(Number), [h, mi] = (hm || "00:00").split(":").map(Number);
  const wall = Date.UTC(Y, M - 1, D, h, mi);
  return wall - offsetMin(wall - 60 * 60e3) * 60e3;
}
function hamburgYmd(ms) { return new Date(ms + offsetMin(ms) * 60e3).toISOString().slice(0, 10); }
function addDays(ymd, n) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const weekday = (ymd) => (new Date(ymd + "T12:00:00Z").getUTCDay() + 6) % 7; // 0 = Monday

// ---------- texts ----------
const WD = { de: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };
const WD_LONG = { de: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"], en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] };
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayText(ymd, lang, nowMs) {
  const today = hamburgYmd(nowMs || Date.now());
  if (ymd === today) return lang === "en" ? "today" : "heute";
  if (ymd === addDays(today, 1)) return lang === "en" ? "tomorrow" : "morgen";
  const [, m, d] = ymd.split("-").map(Number);
  return lang === "en" ? `${WD.en[weekday(ymd)]} ${d} ${MON_EN[m - 1]}` : `${WD.de[weekday(ymd)]} ${pad(d)}.${pad(m)}.`;
}
const timeText = (hm, lang) => (isHm(hm) ? (lang === "en" ? ` ${hm}` : ` ${hm} Uhr`) : "");
function names(list, lang) {
  const l = list.filter(Boolean);
  return l.length <= 1 ? (l[0] || "") : l.slice(0, -1).join(", ") + (lang === "en" ? " and " : " und ") + l[l.length - 1];
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- queue ----------
const topicsOf = (sub) => { const t = json(sub.getString("topics"), []); return Array.isArray(t) ? t.map(String) : []; };

// One message per language among the person's subscriptions that have this topic switched on.
// texts: { de: [title, body], en: [title, body] }. key: a stable id of the event (one message per event and language).
// At most 30 messages per person and topic in an hour (a flood of changes must not flood a phone).
function enqueue(app, { user, topic, texts, url, sendAfter, key }) {
  if (!user || !TOPICS.includes(topic)) return 0;
  const subs = app.findRecordsByFilter("push_subs", "user = {:u}", "", 20, 0, { u: user }).filter((s) => topicsOf(s).includes(topic));
  if (!subs.length) return 0;
  if (app.countRecords("push_queue", $dbx.exp("user = {:u} AND topic = {:t} AND created > {:c}", { u: user, t: topic, c: pbTime(Date.now() - 3600e3) })) >= 30) return 0;
  const coll = app.findCollectionByNameOrId("push_queue");
  let n = 0;
  for (const lang of [...new Set(subs.map((s) => s.getString("lang") || "de"))]) {
    const [title, body] = texts[lang] || texts.de;
    const dedup = key ? `${String(key).slice(0, 190)}:${lang}` : "";
    if (dedup && app.countRecords("push_queue", $dbx.hashExp({ dedup })) > 0) continue;
    const q = new Record(coll);
    q.set("user", user); q.set("topic", topic); q.set("lang", lang);
    q.set("title", String(title || "Djuu").slice(0, 120)); q.set("body", String(body || "").slice(0, 300));
    q.set("url", String(url || "./").slice(0, 300)); q.set("send_after", sendAfter || new DateTime()); q.set("dedup", dedup); q.set("tries", 0);
    try { app.save(q); n++; } catch (e) { /* the same event at the same moment: already queued */ }
  }
  return n;
}

// ---------- the family calendar ----------
function entryOf(r) {
  return { id: r.id, family: r.getString("family"), kind: r.getString("kind"), title: r.getString("title"), date: r.getString("date"), time_from: r.getString("time_from"),
    repeat: r.getString("repeat"), until: r.getString("until"), place: r.getString("place"), alarm: r.getString("alarm"),
    who: arr(json(r.getString("who"), [])), kids: arr(json(r.getString("kids"), [])), overrides: obj(json(r.getString("overrides"), {})), changes: obj(json(r.getString("changes"), {})) };
}
const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// does a repeating entry happen on day k (the rule of djuu_cal.js / the app)
function happens(e, k) {
  if (CAL && CAL.happens) return CAL.happens(e, k);
  if (!isYmd(e.date) || k < e.date) return false;
  if (!e.repeat) return k === e.date;
  if (e.until && k > e.until) return false;
  const a = new Date(e.date + "T12:00:00Z"), b = new Date(k + "T12:00:00Z"), days = Math.round((b - a) / 864e5);
  if (e.repeat === "weekly") return days % 7 === 0;
  if (e.repeat === "biweekly") return days % 14 === 0;
  if (e.repeat === "monthly") return a.getUTCDate() === b.getUTCDate();
  if (e.repeat === "yearly") return a.getUTCDate() === b.getUTCDate() && a.getUTCMonth() === b.getUTCMonth();
  return false;
}
// one occurrence (planned on day k) after the single-day changes (cal_entries.changes) and take-overs (overrides);
// null when that occurrence is removed
function occurrence(e, k) {
  const ch = obj(e.changes[k]);
  if (ch.del) return null;
  const who = Array.isArray(ch.who) ? arr(ch.who) : e.overrides[k] ? [String(e.overrides[k])] : e.who;
  return { day: k, date: isYmd(ch.date) ? ch.date : k, from: ch.from === "" ? "" : isHm(ch.from) ? ch.from : e.time_from, title: ch.title ? String(ch.title) : e.title,
    place: ch.place ? String(ch.place) : e.place, who, kids: Array.isArray(ch.kids) ? arr(ch.kids) : e.kids };
}

// the people of a Wir who get calendar news: an account, calendar access, access not ended
function calPeople(app, familyId) {
  const out = {};
  for (const m of app.findRecordsByFilter("members", "family = {:f}", "created", 200, 0, { f: familyId })) {
    out[m.id] = { id: m.id, name: m.getString("name"), user: m.getString("user"), ok: !!m.getString("user") && UTILS.canSee(m, "perm_cal") };
  }
  return out;
}

function entryTitle(e, kidsText, lang) {
  if (e.kind === "pickup") return lang === "en" ? `Pick up ${kidsText || "child"}` : `${kidsText || "Kind"} abholen`;
  if (e.kind === "dropoff") return lang === "en" ? `Drop off ${kidsText || "child"}` : `${kidsText || "Kind"} bringen`;
  if (e.kind === "closed") return e.title || (lang === "en" ? "Daycare closed" : "Kita zu");
  return e.title || (lang === "en" ? "Event" : "Termin");
}

// Alarms of the family calendar ("Erinnerung"): every occurrence whose reminder time lies between 15 minutes ago and one
// minute ahead is queued for the people it involves (who contains them, or nobody named = everyone with calendar access).
// Runs before every fetch of the sender (every 30 s); dedup keeps it to one message per occurrence. Entries without a time
// remind as if they started at 09:00.
// Cost: the database picks the candidates (entries with an alarm that happen on one of the 2-3 days in question by their
// rule, or whose single-day changes name one of those days); only those are read, page by page. At most 200 entries
// with an alarm per Wir (djuu_family.pb.js).
function candidateIds(app, days) {
  const p = {}, ors = [];
  days.forEach((d, i) => { p["d" + i] = d; p["l" + i] = `%"${d}"%`; });
  const onDay = days.map((d, i) => {
    const D = `{:d${i}}`, diff = `CAST(julianday(${D}) - julianday(date) AS INTEGER)`;
    return `(date <= ${D} AND (until = '' OR until >= ${D}) AND (` +
      `(repeat = 'weekly' AND ${diff} % 7 = 0) OR (repeat = 'biweekly' AND ${diff} % 14 = 0) OR ` +
      `(repeat = 'monthly' AND substr(date, 9, 2) = substr(${D}, 9, 2)) OR (repeat = 'yearly' AND substr(date, 6, 5) = substr(${D}, 6, 5))))`;
  });
  ors.push(`date IN (${days.map((d, i) => `{:d${i}}`).join(", ")})`);
  ors.push(`(repeat != '' AND (${onDay.join(" OR ")}))`);
  const coll = app.findCollectionByNameOrId("cal_entries");
  if (coll.fields.getByName("changes")) ors.push(`(${days.map((d, i) => `changes LIKE {:l${i}}`).join(" OR ")})`);
  const rows = arrayOf(new DynamicModel({ id: "" }));
  app.db().newQuery(`SELECT id FROM cal_entries WHERE alarm IN ('PT15M', 'PT1H', 'P1D') AND date != '' AND (${ors.join(" OR ")}) ORDER BY id LIMIT 20000`)
    .bind(p).all(rows);
  return rows.map((r) => r.id);
}

function scanAlarms(app, nowMs) {
  const lo = nowMs - 15 * 60e3, hi = nowMs + 60e3;
  // the days an occurrence can fall on: the reminder's day(s), and the day after (a reminder one day before)
  const days = [...new Set([hamburgYmd(lo), hamburgYmd(hi), addDays(hamburgYmd(lo), 1), addDays(hamburgYmd(hi), 1)])].sort();
  const daySet = new Set(days);
  const people = {};
  let n = 0;
  const ids = candidateIds(app, days);
  for (let i = 0; i < ids.length; i += 100) {
    for (const r of app.findRecordsByIds("cal_entries", ids.slice(i, i + 100))) {
      const before = ALARM_MS[r.getString("alarm")];
      if (!before) continue;
      // cheap look first (no JSON read): does the rule put a reminder into the window, or do changes name one of the days?
      const raw = { date: r.getString("date"), repeat: r.getString("repeat"), until: r.getString("until") }, from0 = r.getString("time_from");
      const chText = r.getString("changes") || "";
      const ruleHit = days.some((d) => { if (!happens(raw, d)) return false; const at = hamburgMs(d, isHm(from0) ? from0 : "09:00") - before; return at > lo && at <= hi; });
      if (!ruleHit && !days.some((d) => chText.includes(`"${d}"`))) continue;
      const e = entryOf(r);
      // the window's days, and days whose occurrence was moved into the window (only those: never all changed days)
      const cands = new Set(days);
      for (const k of Object.keys(e.changes)) { const d = obj(e.changes[k]).date; if (isYmd(k) && isYmd(d) && daySet.has(d)) cands.add(k); }
      for (const k of cands) {
        if (!happens(e, k)) continue;
        const o = occurrence(e, k);
        if (!o || !daySet.has(o.date)) continue;
        const at = hamburgMs(o.date, isHm(o.from) ? o.from : "09:00") - before;
        if (at <= lo || at > hi) continue;
        const ppl = people[e.family] || (people[e.family] = calPeople(app, e.family));
        const kidsDe = names(o.kids.map((id) => ppl[id] && ppl[id].name), "de"), kidsEn = names(o.kids.map((id) => ppl[id] && ppl[id].name), "en");
        const whereDe = o.place ? ` · ${o.place}` : "", oe = { ...e, title: o.title };
        const texts = {
          de: [entryTitle(oe, kidsDe, "de"), cap(dayText(o.date, "de", nowMs)) + (isHm(o.from) ? timeText(o.from, "de") : " (ganztägig)") + whereDe],
          en: [entryTitle(oe, kidsEn, "en"), cap(dayText(o.date, "en", nowMs)) + (isHm(o.from) ? timeText(o.from, "en") : " (all day)") + whereDe],
        };
        for (const p of Object.values(ppl)) {
          if (!p.ok || (o.who.length && !o.who.includes(p.id))) continue;
          n += enqueue(app, { user: p.user, topic: "cal", texts, url: "./#wir=cal", key: `cal:${e.id}:${k}:${o.date}:${o.from}:${p.id}` });
        }
      }
    }
  }
  return n;
}

// ---------- Bringen/Abholen changes ----------
// who is planned on day k
function plannedOn(e, k) { if (!happens(e, k)) return []; const o = occurrence(e, k); return o ? o.who : []; }
function pattern(e, lang) {
  const t = timeText(e.time_from, lang);
  if (e.repeat === "weekly") return (lang === "en" ? `every ${WD_LONG.en[weekday(e.date)]}` : `jeden ${WD_LONG.de[weekday(e.date)]}`) + t;
  if (e.repeat === "biweekly") return (lang === "en" ? `every other ${WD_LONG.en[weekday(e.date)]}` : `jeden zweiten ${WD_LONG.de[weekday(e.date)]}`) + t;
  return dayText(e.date, lang) + t;
}

// Messages for a new, changed or deleted Bringen/Abholen entry. before/after: entryOf() or null; actor: member id of the
// person who made the change (they get no message). Only days from today on, at most 8 days and 10 messages per change.
function pickupChange(app, before, after, actor) {
  const e = after || before;
  if (!e || !["pickup", "dropoff"].includes(e.kind) || (before && after && !["pickup", "dropoff"].includes(before.kind))) return 0;
  const ppl = calPeople(app, e.family);
  const nm = (id) => (ppl[id] ? ppl[id].name : "");
  const kids = { de: names(e.kids.map(nm), "de"), en: names(e.kids.map(nm), "en") };
  const title = (lang) => entryTitle(e, kids[lang], lang);
  const by = actor && nm(actor) ? { de: ` (${nm(actor)})`, en: ` (${nm(actor)})` } : { de: "", en: "" };
  const msgs = []; // [memberId, de body, en body, key]
  const today = hamburgYmd(Date.now());
  if (!before) {
    for (const id of after.who) msgs.push([id, `Neu für dich: ${pattern(after, "de")}${by.de}`, `New for you: ${pattern(after, "en")}${by.en}`, "new"]);
  } else if (!after) {
    for (const id of before.who) msgs.push([id, `Entfällt: ${pattern(before, "de")}${by.de}`, `Cancelled: ${pattern(before, "en")}${by.en}`, "del"]);
  } else {
    const base = ["date", "time_from", "repeat", "until", "place"].some((k) => before[k] !== after[k]);
    const added = after.who.filter((id) => !before.who.includes(id)), gone = before.who.filter((id) => !after.who.includes(id));
    for (const id of added) msgs.push([id, `Neu für dich: ${pattern(after, "de")}${by.de}`, `New for you: ${pattern(after, "en")}${by.en}`, "add"]);
    for (const id of gone) msgs.push([id, `Du bist nicht mehr eingeplant: ${pattern(before, "de")}${by.de}`, `You are no longer planned: ${pattern(before, "en")}${by.en}`, "gone"]);
    if (base) for (const id of after.who.filter((x) => before.who.includes(x))) msgs.push([id, `Geändert: ${pattern(after, "de")}${after.place ? " · " + after.place : ""}${by.de}`, `Changed: ${pattern(after, "en")}${after.place ? " · " + after.place : ""}${by.en}`, "chg"]);
    // single days: taken over (overrides) or changed / removed (changes)
    const days = new Set([...Object.keys(before.overrides), ...Object.keys(after.overrides), ...Object.keys(before.changes), ...Object.keys(after.changes)]);
    let count = 0;
    for (const k of [...days].filter((d) => isYmd(d) && d >= today).sort()) {
      const sameOv = String(before.overrides[k] || "") === String(after.overrides[k] || "");
      const sameCh = JSON.stringify(before.changes[k] || null) === JSON.stringify(after.changes[k] || null);
      if (sameOv && sameCh) continue;
      if (++count > 8) break;
      const was = plannedOn(before, k), now = plannedOn(after, k);
      const o = happens(after, k) ? occurrence(after, k) : null;
      const when = (lang) => dayText(o ? o.date : k, lang) + timeText(o ? o.from : after.time_from, lang);
      // without a known actor, the person now planned on a taken-over day is the one who took it over
      const who = actor || (!sameOv && sameCh && now.length === 1 ? now[0] : "");
      const byDay = who && nm(who) ? ` (${nm(who)})` : "";
      if (!o && was.length) { for (const id of was) if (id !== who) msgs.push([id, `Entfällt ${when("de")}${byDay}`, `Cancelled ${when("en")}${byDay}`, "x" + k]); continue; }
      for (const id of now.filter((x) => !was.includes(x))) if (id !== who) msgs.push([id, `Du bist dran: ${when("de")}${byDay}`, `Your turn: ${when("en")}${byDay}`, "on" + k]);
      const takers = names(now.map(nm), "de"), takersEn = names(now.map(nm), "en");
      for (const id of was.filter((x) => !now.includes(x))) if (id !== who) msgs.push([id, `${takers || "Jemand"} übernimmt ${when("de")}`, `${takersEn || "Someone"} takes over ${when("en")}`, "off" + k]);
      if (!sameCh && o) for (const id of now.filter((x) => was.includes(x))) if (id !== who) msgs.push([id, `Geändert: ${when("de")}${o.place ? " · " + o.place : ""}${byDay}`, `Changed: ${when("en")}${o.place ? " · " + o.place : ""}${byDay}`, "chg" + k]);
    }
  }
  let n = 0, sent = 0;
  const stamp = Date.now();
  for (const [id, de, en, tag] of msgs) {
    const p = ppl[id];
    if (!p || !p.ok || id === actor || sent >= 10) continue;
    sent++;
    n += enqueue(app, { user: p.user, topic: "pickup", texts: { de: [title("de"), de], en: [title("en"), en] }, url: "./#wir=cal", key: `pickup:${e.id}:${tag}:${id}:${stamp}` });
  }
  return n;
}

module.exports = { TOPICS, enqueue, scanAlarms, candidateIds, pickupChange, entryOf, hamburgMs, hamburgYmd, offsetMin, addDays, dayText, pbTime };
