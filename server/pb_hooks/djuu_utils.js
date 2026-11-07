// Shared helpers for djuu.pb.js (loaded with require inside each handler).

// the member record of a user, or null
function memberOf(app, userId) {
  try { return app.findFirstRecordByFilter("members", "user = {:u}", { u: userId }); } catch (e) { return null; }
}

// ---------- iCalendar ----------
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
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
    if (s.url && /^https?:\/\//.test(s.url)) L.push(`URL:${s.url}`);
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

module.exports = { memberOf, ics };
