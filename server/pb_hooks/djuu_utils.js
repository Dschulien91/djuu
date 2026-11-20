// Shared helpers for djuu.pb.js (loaded with require inside each handler).

// ---------- route errors ----------
// Every route error carries the German message (older app versions show it) and a stable code the app can translate.
function fail(status, code, message) { const err = new Error(message); err.djuuFail = { status, code, message }; return err; }
// runs a route body; a fail() thrown anywhere in it becomes { status, code, message, data } with that status
function handle(e, fn) {
  try { return fn(); } catch (x) {
    const f = x && x.djuuFail;
    if (f) return e.json(f.status, { status: f.status, code: f.code, message: f.message, data: {} });
    throw x;
  }
}
// a transaction whose fail() survives the rollback (an error thrown inside comes back from Go as a plain error)
function inTx(app, fn) {
  let failure = null;
  try { app.runInTransaction((tx) => { try { fn(tx); } catch (x) { if (x && x.djuuFail) failure = x; throw x; } }); }
  catch (x) { throw failure || x; }
}

// the member record of a user, or null
function memberOf(app, userId) {
  try { return app.findFirstRecordByFilter("members", "user = {:u}", { u: userId }); } catch (e) { return null; }
}

// ---------- iCalendar ----------
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([,;])/g, "\\$1");
const compact = (ymd) => String(ymd).replace(/-/g, "");
const pad = (n) => String(n).padStart(2, "0");
function ymdOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(ymd, n) { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return ymdOf(d); }
// first date on or after today the offer takes place
function firstDate(s) {
  const today = ymdOf(new Date());
  if (s.kind === "termin" || s.weekday == null) return s.start_date && s.start_date >= today ? s.start_date : (s.end_date && s.end_date >= today ? today : null);
  let d = s.start_date && s.start_date > today ? s.start_date : today;
  for (let i = 0; i < 7; i++) { const wd = (new Date(d + "T12:00:00").getDay() + 6) % 7; if (wd === s.weekday) break; d = addDays(d, 1); }
  return s.end_date && d > s.end_date ? null : d;
}
function fold(line) { const out = []; while (line.length > 60) { out.push(line.slice(0, 60)); line = " " + line.slice(60); } out.push(line); return out.join("\r\n"); }

function ics(name, items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Djuu//Familienkalender//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc("Djuu " + (name || "Familie"))}`, "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "BEGIN:VTIMEZONE", "TZID:Europe/Berlin", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT", "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
    "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"];
  for (const { id, snap } of items) {
    const s = snap || {};
    const day = firstDate(s);
    if (!day || !s.title) continue;
    const hm = (t) => t.replace(":", "") + "00";
    const end = s.time_to && s.time_to > (s.time_from || "") ? s.time_to : s.time_from ? `${pad(Math.min(23, +s.time_from.slice(0, 2) + 1))}${s.time_from.slice(2)}` : null;
    const timed = !!s.time_from, tz = timed ? ";TZID=Europe/Berlin" : ";VALUE=DATE";
    L.push("BEGIN:VEVENT", `UID:${id}@djuu`, `DTSTAMP:${stamp}`,
      `DTSTART${tz}:${compact(day)}${timed ? "T" + hm(s.time_from) : ""}`,
      `DTEND${tz}:${timed ? compact(day) + "T" + hm(end) : compact(addDays(day, 1))}`,
      `SUMMARY:${esc(s.title)}`, `LOCATION:${esc([s.venue, s.address].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${esc([s.provider, s.url, "Ohne Gewähr, bitte beim Anbieter prüfen."].filter(Boolean).join("\n"))}`);
    if (s.url && /^https?:\/\/\S+$/.test(s.url)) L.push(`URL:${s.url}`); // no line breaks in a raw property
    const recurring = s.kind !== "termin" && s.weekday != null && !(s.start_date && s.start_date === s.end_date);
    if (recurring) {
      const cap = addDays(day, 7 * 11), until = s.end_date && s.end_date < cap ? s.end_date : cap;
      L.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[s.weekday]};UNTIL=${compact(until)}${timed ? "T225959Z" : ""}`);
    }
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

// JSON fields come back as raw text in hooks
function parseJson(t) { try { return JSON.parse(t || "{}"); } catch (e) { return {}; } }

// ---------- Wir: access per area ----------
const PERMS = ["perm_shop", "perm_errands", "perm_cal", "perm_saved"];
const FULL = { perm_shop: "edit", perm_errands: "edit", perm_cal: "edit", perm_saved: "edit" };
const HELPER = { perm_shop: "view", perm_errands: "view", perm_cal: "view", perm_saved: "none" };
// only known areas and levels; missing ones get the default of the group
function cleanPerms(p, grp) {
  const base = grp === "helper" ? HELPER : FULL, out = {};
  for (const k of PERMS) { const v = p && p[k]; out[k] = ["none", "view", "edit"].includes(v) ? v : base[k]; }
  return out;
}
function makeAccount(m, { grp, role, admin, perms, email }) {
  m.set("grp", grp); m.set("role", String(role || "").slice(0, 30)); m.set("is_admin", !!admin); m.set("email", String(email || "").slice(0, 120));
  for (const k of PERMS) m.set(k, perms[k]);
}
// the account points at its person record; a stored invite (join_token, kept for the confirm flow) is used up with it
function linkUser(tx, userId, memberId) { const usr = tx.findRecordById("users", userId); usr.set("member", memberId); usr.set("join_token", ""); tx.save(usr); }
function expired(m) { return !!m.getString("access_until") && m.getDateTime("access_until").before(new DateTime()); }
// A person leaves their Wir (inside a transaction): the account stays without a Wir, own places are no longer shared,
// what they saved stays for the others (saved_by is emptied), and the old family-wide calendar address stops working.
function leaveWir(tx, m) {
  if (m.getString("user")) {
    try { const usr = tx.findRecordById("users", m.getString("user")); usr.set("member", ""); tx.save(usr); } catch (e) { /* gone */ }
    for (const pl of tx.findRecordsByFilter("places", "owner = {:o} && family != ''", "", 0, 0, { o: m.getString("user") })) { pl.set("family", ""); pl.set("shared", false); tx.save(pl); }
  }
  tx.delete(m);
  retireFamilyCalendar(tx, m.getString("family"));
}
function canSee(m, perm) {
  if (expired(m)) return false;
  const v = m.getString(perm);
  return v === "view" || v === "edit";
}
// the old family-wide calendar address (from before per-person addresses) stops working when someone leaves or their access changes
function retireFamilyCalendar(app, familyId) {
  try { const fam = app.findRecordById("families", familyId); if (fam.getString("cal_token")) { fam.set("cal_token", ""); app.save(fam); } } catch (e) { /* gone */ }
}
// "2026-11-30" -> the end of that day in Hamburg (stored in UTC; 23:59 winter time)
function endOfDay(ymd) {
  const s = String(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail(400, "invalid_date", "Ungültiges Datum.");
  return new DateTime(s + " 22:59:59.000Z");
}

// age in months from "YYYY" / "YYYY-MM" and an optional day, as { min, max } (the same rule as the app)
function ageRange(ym, day) {
  const now = new Date(), parts = String(ym || "").split("-"), y = +parts[0], m = +parts[1];
  if (!y) return { min: null, max: null };
  const base = (now.getFullYear() - y) * 12 + now.getMonth() + 1;
  if (!m) return { min: Math.max(0, base - 12), max: Math.max(0, base - 1) };
  let months = base - m;
  if (day && now.getDate() < day) months--;
  return { min: months, max: months };
}

module.exports = { fail, handle, inTx, memberOf, ics, parseJson, PERMS, FULL, cleanPerms, makeAccount, linkUser, canSee, expired, leaveWir, retireFamilyCalendar, endOfDay, ageRange };

