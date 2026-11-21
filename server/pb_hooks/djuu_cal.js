// The family calendar in the calendar feed (/api/djuu/cal/{token}, see djuu.pb.js): own entries with repeats and alarms,
// Bringen/Abholen for the coming weeks (with the days someone else took over), Kita-Schließtage, birthdays (only for the
// family group: helpers never get birth dates) and, when the address asks for it (?ferien=1), the Hamburg school holidays.
// Single occurrences of a repeating entry that were changed or removed (cal_entries.changes) appear as such: a removed day
// as EXDATE, a changed one as its own VEVENT with RECURRENCE-ID (Abholen/Bringen are single events anyway).
// Texts in German, or in English with ?lang=en (opts.lang, passed through by the feed route).
// Loaded with require() from the feed route and from djuu_cal.pb.js / djuu_family.pb.js (cleanChanges).
// feedLines returns finished, folded iCalendar lines (VEVENT blocks).

const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([,;])/g, "\\$1");
const compact = (ymd) => String(ymd).replace(/-/g, "");
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const isHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
const isId = (s) => typeof s === "string" && /^[a-z0-9]{15}$/.test(s);
function ymdOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(ymd, n) { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return ymdOf(d); }
function fold(line) { const out = []; while (line.length > 60) { out.push(line.slice(0, 60)); line = " " + line.slice(60); } out.push(line); return out.join("\r\n"); }
const json = (t, d) => { try { const v = JSON.parse(t || ""); return v == null ? d : v; } catch (e) { return d; } };
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// Hamburg school holidays (Ferienordnung Hamburg; the same list as SCHOOL_HOLIDAYS in app.js – update both once a year)
const HH_HOLIDAYS = [["2026-10-19", "2026-10-30", "Herbstferien"], ["2026-12-21", "2027-01-01", "Weihnachtsferien"], ["2027-01-29", "2027-01-29", "Halbjahrespause"], ["2027-03-01", "2027-03-12", "Frühjahrsferien"], ["2027-05-07", "2027-05-14", "Maiferien"], ["2027-07-01", "2027-08-11", "Sommerferien"],
  ["2027-10-11", "2027-10-22", "Herbstferien"], ["2027-12-20", "2027-12-31", "Weihnachtsferien"], ["2028-01-28", "2028-01-28", "Halbjahrespause"], ["2028-03-06", "2028-03-17", "Frühjahrsferien"], ["2028-05-22", "2028-05-26", "Maiferien"], ["2028-07-03", "2028-08-11", "Sommerferien"],
  ["2028-10-02", "2028-10-13", "Herbstferien"], ["2028-12-18", "2028-12-29", "Weihnachtsferien"], ["2029-02-02", "2029-02-02", "Halbjahrespause"], ["2029-03-05", "2029-03-16", "Frühjahrsferien"], ["2029-05-11", "2029-05-18", "Maiferien"], ["2029-07-02", "2029-08-10", "Sommerferien"]];

// the feed's own words (German is the default; ?lang=en)
const TEXTS = {
  de: { and: " und ", kid: "Kind", pickup: "{kids} abholen", dropoff: "{kids} bringen", closed: "Kita zu", closedKids: "Kita zu: {kids}", bday: "Geburtstag {name}", ferien: "{name} (Schulferien)", reminder: "Erinnerung",
    holidays: {} },
  en: { and: " and ", kid: "Child", pickup: "Pick up {kids}", dropoff: "Drop off {kids}", closed: "Daycare closed", closedKids: "Daycare closed: {kids}", bday: "Birthday: {name}", ferien: "{name} (school holidays)", reminder: "Reminder",
    holidays: { Herbstferien: "Autumn holidays", Weihnachtsferien: "Christmas holidays", Halbjahrespause: "Half-term break", "Frühjahrsferien": "Spring holidays", Maiferien: "May holidays", Sommerferien: "Summer holidays" } },
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

// does a repeating entry happen on day k by its rule (the same rule as calOn() in the app; single changes not applied)
function happens(e, k) {
  if (!isYmd(e.date) || k < e.date) return false;
  if (!e.repeat) return k === e.date;
  if (e.until && k > e.until) return false;
  const a = new Date(e.date + "T12:00:00"), b = new Date(k + "T12:00:00"), days = Math.round((b - a) / 864e5);
  if (e.repeat === "weekly") return days % 7 === 0;
  if (e.repeat === "biweekly") return days % 14 === 0;
  if (e.repeat === "monthly") return a.getDate() === b.getDate();
  if (e.repeat === "yearly") return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  return false;
}
const RRULE = { weekly: "FREQ=WEEKLY", biweekly: "FREQ=WEEKLY;INTERVAL=2", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" };

// ---------- limits (a family calendar must never cost the server much, whatever someone stores) ----------
const MAX_CHANGES = 60;        // changed or removed single days per entry (days older than KEEP_DAYS are dropped on save)
const KEEP_DAYS = 90;          // single-day changes further back than this are dropped when an entry is saved
const FEED_BACK = 60, FEED_AHEAD = 400; // the feed shows changed days from 60 days ago to 400 days ahead
const MAX_EVENTS = 3000;       // VEVENTs of the family calendar in one feed (the saved offers come on top, at most 500)
const PAGE = 200;              // entries read at a time

// ---------- single occurrences (cal_entries.changes) ----------
// one change, cleaned: { del: true } or only known fields with valid values (null when nothing is left)
function cleanChange(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  if (c.del === true) return { del: true };
  const out = {};
  if (isYmd(c.date)) out.date = c.date;
  for (const [k, max] of [["title", 80], ["place", 80], ["note", 200]]) if (typeof c[k] === "string") out[k] = c[k].slice(0, max);
  for (const k of ["from", "to"]) if (c[k] === "" || isHm(c[k])) out[k] = c[k];
  for (const k of ["who", "kids"]) if (Array.isArray(c[k])) out[k] = c[k].filter(isId).slice(0, 20);
  return Object.keys(out).length ? out : null;
}
// all changes of an entry, cleaned: day keys 'YYYY-MM-DD' only, at most 400 read
function cleanChanges(v) {
  const out = {};
  for (const k of Object.keys(obj(v)).slice(0, 400)) { if (!isYmd(k)) continue; const c = cleanChange(v[k]); if (c) out[k] = c; }
  return out;
}
// before saving: days long past are dropped; null when more than MAX_CHANGES days are left (the caller refuses the save)
function limitChanges(ch) {
  const oldest = addDays(ymdOf(new Date()), -KEEP_DAYS), out = {};
  for (const k of Object.keys(ch).sort()) if (k >= oldest) out[k] = ch[k];
  return Object.keys(out).length > MAX_CHANGES ? null : out;
}
// the occurrences of an entry between two days with single changes applied: [{ k0 (the day by the rule), day, c }]
function occurrences(e, from, to) {
  const ch = obj(e.changes), out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!happens(e, day)) continue;
    const c = obj(ch[day]);
    if (c.del) continue;
    if (c.date && c.date !== day) continue; // moved away: listed on its new day below
    out.push({ k0: day, day, c });
  }
  for (const [k0, c] of Object.entries(ch)) {
    if (!c || c.del || !c.date || c.date === k0 || c.date < from || c.date > to || !happens(e, k0)) continue;
    out.push({ k0, day: c.date, c });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// member: the person whose address this is (null for the old family-wide address: treated like a helper, no birthdays)
function feedLines(app, fam, member, opts) {
  const T = TEXTS[opts && opts.lang === "en" ? "en" : "de"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = [];
  let count = 0;
  const people = {};
  for (const m of app.findRecordsByFilter("members", "family = {:f}", "created", 100, 0, { f: fam.id })) people[m.id] = m;
  const nameOf = (id) => (people[id] ? people[id].getString("name") : "");
  const names = (ids) => { const l = (Array.isArray(ids) ? ids : []).map(nameOf).filter(Boolean); return l.length <= 1 ? (l[0] || "") : l.slice(0, -1).join(", ") + T.and + l[l.length - 1]; };
  const family = !!member && member.getString("grp") !== "helper";
  const event = (uid, start, end, timed, summary, extra, recurrence) => {
    count++;
    const tz = timed ? ";TZID=Europe/Berlin" : ";VALUE=DATE";
    L.push("BEGIN:VEVENT", `UID:${uid}@djuu`, `DTSTAMP:${stamp}`, ...(recurrence ? [recurrence] : []), `DTSTART${tz}:${start}`, `DTEND${tz}:${end}`, `SUMMARY:${esc(summary)}`, ...(extra || []), "END:VEVENT");
  };
  const times = (day, e) => {
    if (!isHm(e.time_from)) return [compact(day), compact(addDays(day, 1)), false];
    const to = isHm(e.time_to) && e.time_to > e.time_from ? e.time_to : `${pad(Math.min(23, +e.time_from.slice(0, 2) + 1))}${e.time_from.slice(2)}`;
    return [`${compact(day)}T${e.time_from.replace(":", "")}00`, `${compact(day)}T${to.replace(":", "")}00`, true];
  };
  // an entry with one occurrence's changes on top
  const merged = (e, c) => ({ ...e, title: c.title != null ? c.title : e.title, time_from: c.from != null ? c.from : e.time_from, time_to: c.to != null ? c.to : (c.from != null ? "" : e.time_to),
    place: c.place != null ? c.place : e.place, note: c.note != null ? c.note : e.note, who: c.who || e.who, kids: c.kids || e.kids });
  const alarmOf = (e) => (e.alarm && /^(PT15M|PT1H|P1D)$/.test(e.alarm) ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title || T.reminder)}`, `TRIGGER:-${e.alarm}`, "END:VALARM"] : []);
  const whereOf = (e) => (e.place ? [`LOCATION:${esc(e.place)}`] : []);
  const today = ymdOf(new Date()), from = addDays(today, -FEED_BACK), to = addDays(today, FEED_AHEAD);
  // read page by page (an entry may carry up to ~40 kB of JSON); stop at MAX_EVENTS
  let full = false; // the feed is full: the rest of the entries is not read
  for (let offset = 0; !full && count < MAX_EVENTS; offset += PAGE) {
    const entries = app.findRecordsByFilter("cal_entries", "family = {:f}", "date,id", PAGE, offset, { f: fam.id });
    if (!entries.length) break;
    for (const r of entries) {
      if (count >= MAX_EVENTS) { full = true; break; }
      const kind = r.getString("kind"), byDay = kind === "pickup" || kind === "dropoff";
      // the JSON fields are read only where they are used (taken-over days: Bringen/Abholen; single days: repeating entries)
      const e = { id: r.id, kind, title: r.getString("title"), date: r.getString("date"), end: r.getString("end_date"), time_from: r.getString("time_from"),
        time_to: r.getString("time_to"), repeat: r.getString("repeat"), until: r.getString("until"), who: json(r.getString("who"), []), kids: json(r.getString("kids"), []),
        overrides: byDay ? obj(json(r.getString("overrides"), {})) : {}, changes: byDay || r.getString("repeat") ? e0Changes(r) : {}, place: r.getString("place"), alarm: r.getString("alarm"), note: r.getString("note") };
      if (!isYmd(e.date)) continue;
      if (e.kind === "closed") {
        const end = isYmd(e.end) && e.end >= e.date ? e.end : e.date;
        if (end < from) continue;
        const kids = names(e.kids);
        event(e.id, compact(e.date), compact(addDays(end, 1)), false, e.title || (kids ? fill(T.closedKids, { kids }) : T.closed), whereOf(e));
        continue;
      }
      if (e.kind === "pickup" || e.kind === "dropoff") {
        // single events for the next eight weeks, so a day someone took over (or changed) shows the right person and time
        for (const { k0, day, c } of occurrences(e, addDays(today, -7), addDays(today, 56))) {
          if (count >= MAX_EVENTS) { full = true; break; }
          const x = merged(e, c);
          const who = Object.prototype.hasOwnProperty.call(e.overrides, k0) && e.overrides[k0] ? [e.overrides[k0]] : x.who;
          const [s, t, timed] = times(day, x);
          const person = names(who), kids = names(x.kids) || T.kid;
          const summary = fill(e.kind === "pickup" ? T.pickup : T.dropoff, { kids }) + (person ? `: ${person}` : "");
          event(`${e.id}-${compact(k0)}`, s, t, timed, summary, whereOf(x).concat(alarmOf(x)));
        }
        continue;
      }
      // own entries: one VEVENT, repeating ones with RRULE (and UNTIL); removed days as EXDATE, changed days as their own VEVENT
      if (!e.repeat && (isYmd(e.end) ? e.end : e.date) < from) continue;
      const [s, t, timed] = times(e.date, e);
      const extra = whereOf(e).concat(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []);
      const summaryOf = (x) => x.title + (names(x.who.concat(x.kids)) ? ` (${names(x.who.concat(x.kids))})` : "");
      const startKey = (k) => (timed ? `${compact(k)}T${e.time_from.replace(":", "")}00` : compact(k));
      const valueType = timed ? ";TZID=Europe/Berlin" : ";VALUE=DATE";
      // only changed days inside the feed's window (and never more than MAX_CHANGES)
      const changed = e.repeat ? Object.entries(e.changes).filter(([k]) => k >= from && k <= to && happens(e, k)).slice(0, MAX_CHANGES) : [];
      if (count + 1 + changed.filter(([, c]) => !c.del).length > MAX_EVENTS) { full = true; break; }
      if (e.repeat && RRULE[e.repeat]) extra.push(`RRULE:${RRULE[e.repeat]}${isYmd(e.until) ? `;UNTIL=${compact(e.until)}${timed ? "T225959Z" : ""}` : ""}`);
      const removed = changed.filter(([, c]) => c.del).map(([k]) => startKey(k));
      if (removed.length) extra.push(`EXDATE${valueType}:${removed.join(",")}`);
      event(e.id, s, isYmd(e.end) && !e.repeat && !timed ? compact(addDays(e.end, 1)) : t, timed, summaryOf(e), extra.concat(alarmOf(e)));
      for (const [k0, c] of changed) {
        if (c.del) continue;
        const x = merged(e, c), [s2, t2, timed2] = times(c.date || k0, x);
        event(e.id, s2, t2, timed2, summaryOf(x), whereOf(x).concat(x.note ? [`DESCRIPTION:${esc(x.note)}`] : [], alarmOf(x)), `RECURRENCE-ID${valueType}:${startKey(k0)}`);
      }
    }
    if (entries.length < PAGE) break;
  }
  // birthdays of the children with a full date: family group only
  if (family) {
    for (const m of Object.values(people)) {
      const ym = m.getString("birth_ym"), d = m.getInt("birth_day");
      if (m.getString("kind") !== "kid" || ym.length !== 7 || !d) continue;
      const day = `${ym}-${pad(d)}`;
      if (!isYmd(day)) continue;
      event(`bday-${m.id}`, compact(day), compact(addDays(day, 1)), false, fill(T.bday, { name: m.getString("name") || T.kid }), ["RRULE:FREQ=YEARLY"]);
    }
  }
  // school holidays, when the address asks for them (Hamburg only: the list is built in)
  if (opts && opts.ferien && (fam.getString("state_code") || "DE-HH") === "DE-HH") {
    for (const [a, z, n] of HH_HOLIDAYS) if (z >= addDays(today, -30)) event(`ferien-${compact(a)}`, compact(a), compact(addDays(z, 1)), false, fill(T.ferien, { name: T.holidays[n] || n }), ["TRANSP:TRANSPARENT"]);
  }
  return L.map(fold);
}
// the changes of a record, cleaned (the field may be missing on a server before the migration)
function e0Changes(r) { try { return cleanChanges(json(r.getString("changes"), {})); } catch (e) { return {}; } }

// ---------- helpers for djuu_family.pb.js ----------
// taken-over days long past are dropped (otherwise the field would fill up over the years and every save would fail)
function pruneOld(map) {
  const oldest = addDays(ymdOf(new Date()), -KEEP_DAYS), out = {};
  for (const [k, v] of Object.entries(obj(map))) if (isYmd(k) && k >= oldest) out[k] = v;
  return out;
}
// a record's changes, cleaned in place (create/update through the records API); false when there are too many
function cleanRecordChanges(rec) {
  const ov = json(rec.getString("overrides"), null);
  if (ov && typeof ov === "object" && !Array.isArray(ov)) rec.set("overrides", pruneOld(ov));
  if (!rec.collection().fields.getByName("changes")) return true;
  const ch = limitChanges(cleanChanges(json(rec.getString("changes"), {})));
  if (!ch) return false;
  rec.set("changes", ch);
  return true;
}
// emergency information: contacts as a short list of { name, phone, rel }; the moment of consent is the server's
function cleanCare(rec) {
  const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const list = json(rec.getString("emergency_contacts"), []);
  rec.set("emergency_contacts", (Array.isArray(list) ? list : []).filter((c) => c && typeof c === "object")
    .map((c) => ({ name: s(c.name, 60), phone: s(c.phone, 30).replace(/[^0-9+()/ .-]/g, ""), rel: s(c.rel, 40) }))
    .filter((c) => c.name || c.phone).slice(0, 5));
  rec.set("consent_at", new DateTime());
}
// a push message for new list entries: "Anna: Milch, Brot und 2 weitere" / "Anna: Milk, bread and 2 more"
function listBody(name, items, en) {
  const shown = items.slice(0, 3).join(", "), more = items.length - 3;
  return (name ? `${name}: ` : "") + (more > 0 ? `${shown} ${en ? "and" : "und"} ${more} ${en ? "more" : "weitere"}` : shown);
}

module.exports = { feedLines, happens, occurrences, cleanChange, cleanChanges, limitChanges, cleanRecordChanges, pruneOld, cleanCare, listBody, MAX_CHANGES };
