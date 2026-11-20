// The family calendar in the calendar feed (/api/djuu/cal/{token}, see djuu.pb.js): own entries with repeats and alarms,
// Bringen/Abholen for the coming weeks (with the days someone else took over), Kita-Schließtage, birthdays (only for the
// family group: helpers never get birth dates) and, when the address asks for it (?ferien=1), the Hamburg school holidays.
// Loaded with require() from the feed route; returns finished, folded iCalendar lines (VEVENT blocks).

const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([,;])/g, "\\$1");
const compact = (ymd) => String(ymd).replace(/-/g, "");
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const isHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
function ymdOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(ymd, n) { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return ymdOf(d); }
function fold(line) { const out = []; while (line.length > 60) { out.push(line.slice(0, 60)); line = " " + line.slice(60); } out.push(line); return out.join("\r\n"); }
const json = (t, d) => { try { const v = JSON.parse(t || ""); return v == null ? d : v; } catch (e) { return d; } };

// Hamburg school holidays (Ferienordnung Hamburg; the same list as SCHOOL_HOLIDAYS in app.js – update both once a year)
const HH_HOLIDAYS = [["2026-10-19", "2026-10-30", "Herbstferien"], ["2026-12-21", "2027-01-01", "Weihnachtsferien"], ["2027-01-29", "2027-01-29", "Halbjahrespause"], ["2027-03-01", "2027-03-12", "Frühjahrsferien"], ["2027-05-07", "2027-05-14", "Maiferien"], ["2027-07-01", "2027-08-11", "Sommerferien"],
  ["2027-10-11", "2027-10-22", "Herbstferien"], ["2027-12-20", "2027-12-31", "Weihnachtsferien"], ["2028-01-28", "2028-01-28", "Halbjahrespause"], ["2028-03-06", "2028-03-17", "Frühjahrsferien"], ["2028-05-22", "2028-05-26", "Maiferien"], ["2028-07-03", "2028-08-11", "Sommerferien"],
  ["2028-10-02", "2028-10-13", "Herbstferien"], ["2028-12-18", "2028-12-29", "Weihnachtsferien"], ["2029-02-02", "2029-02-02", "Halbjahrespause"], ["2029-03-05", "2029-03-16", "Frühjahrsferien"], ["2029-05-11", "2029-05-18", "Maiferien"], ["2029-07-02", "2029-08-10", "Sommerferien"]];

// does a repeating entry happen on day k (the same rule as calOn() in the app)
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

// member: the person whose address this is (null for the old family-wide address: treated like a helper, no birthdays)
function feedLines(app, fam, member, opts) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = [];
  const people = {};
  for (const m of app.findRecordsByFilter("members", "family = {:f}", "created", 100, 0, { f: fam.id })) people[m.id] = m;
  const nameOf = (id) => (people[id] ? people[id].getString("name") : "");
  const names = (ids) => { const l = (Array.isArray(ids) ? ids : []).map(nameOf).filter(Boolean); return l.length <= 1 ? (l[0] || "") : l.slice(0, -1).join(", ") + " und " + l[l.length - 1]; };
  const family = !!member && member.getString("grp") !== "helper";
  const event = (uid, start, end, timed, summary, extra) => {
    const tz = timed ? ";TZID=Europe/Berlin" : ";VALUE=DATE";
    L.push("BEGIN:VEVENT", `UID:${uid}@djuu`, `DTSTAMP:${stamp}`, `DTSTART${tz}:${start}`, `DTEND${tz}:${end}`, `SUMMARY:${esc(summary)}`, ...(extra || []), "END:VEVENT");
  };
  const times = (day, e) => {
    if (!isHm(e.time_from)) return [compact(day), compact(addDays(day, 1)), false];
    const to = isHm(e.time_to) && e.time_to > e.time_from ? e.time_to : `${pad(Math.min(23, +e.time_from.slice(0, 2) + 1))}${e.time_from.slice(2)}`;
    return [`${compact(day)}T${e.time_from.replace(":", "")}00`, `${compact(day)}T${to.replace(":", "")}00`, true];
  };
  const today = ymdOf(new Date());
  const entries = app.findRecordsByFilter("cal_entries", "family = {:f}", "date", 2000, 0, { f: fam.id });
  for (const r of entries) {
    const e = { id: r.id, kind: r.getString("kind"), title: r.getString("title"), date: r.getString("date"), end: r.getString("end_date"), time_from: r.getString("time_from"),
      time_to: r.getString("time_to"), repeat: r.getString("repeat"), until: r.getString("until"), who: json(r.getString("who"), []), kids: json(r.getString("kids"), []),
      overrides: json(r.getString("overrides"), {}), place: r.getString("place"), alarm: r.getString("alarm"), note: r.getString("note") };
    if (!isYmd(e.date)) continue;
    const where = e.place ? [`LOCATION:${esc(e.place)}`] : [];
    const alarm = e.alarm && /^(PT15M|PT1H|P1D)$/.test(e.alarm) ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title || "Djuu")}`, `TRIGGER:-${e.alarm}`, "END:VALARM"] : [];
    if (e.kind === "closed") {
      const end = isYmd(e.end) && e.end >= e.date ? e.end : e.date;
      if (end < addDays(today, -60)) continue;
      const kids = names(e.kids);
      event(e.id, compact(e.date), compact(addDays(end, 1)), false, e.title || (kids ? `Kita zu: ${kids}` : "Kita zu"), where);
      continue;
    }
    if (e.kind === "pickup" || e.kind === "dropoff") {
      // single events for the next eight weeks, so a day someone took over shows the right person
      const kids = names(e.kids) || "Kind";
      for (let i = -7; i <= 56; i++) {
        const day = addDays(today, i);
        if (!happens(e, day)) continue;
        const who = Object.prototype.hasOwnProperty.call(e.overrides || {}, day) && e.overrides[day] ? [e.overrides[day]] : e.who;
        const [s, t, timed] = times(day, e);
        const person = names(who);
        const summary = (e.kind === "pickup" ? `${kids} abholen` : `${kids} bringen`) + (person ? `: ${person}` : "");
        event(`${e.id}-${compact(day)}`, s, t, timed, summary, where.concat(alarm));
      }
      continue;
    }
    // own entries: one VEVENT, repeating ones with RRULE (and UNTIL)
    if (!e.repeat && (isYmd(e.end) ? e.end : e.date) < addDays(today, -60)) continue;
    const [s, t, timed] = times(e.date, e);
    const extra = where.concat(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []);
    if (e.repeat && RRULE[e.repeat]) extra.push(`RRULE:${RRULE[e.repeat]}${isYmd(e.until) ? `;UNTIL=${compact(e.until)}${timed ? "T225959Z" : ""}` : ""}`);
    const who = names(e.who.concat(e.kids));
    event(e.id, s, isYmd(e.end) && !e.repeat && !timed ? compact(addDays(e.end, 1)) : t, timed, e.title + (who ? ` (${who})` : ""), extra.concat(alarm));
  }
  // birthdays of the children with a full date: family group only
  if (family) {
    for (const m of Object.values(people)) {
      const ym = m.getString("birth_ym"), d = m.getInt("birth_day");
      if (m.getString("kind") !== "kid" || ym.length !== 7 || !d) continue;
      const day = `${ym}-${pad(d)}`;
      if (!isYmd(day)) continue;
      event(`bday-${m.id}`, compact(day), compact(addDays(day, 1)), false, `Geburtstag ${m.getString("name") || "Kind"}`, ["RRULE:FREQ=YEARLY"]);
    }
  }
  // school holidays, when the address asks for them (Hamburg only: the list is built in)
  if (opts && opts.ferien && (fam.getString("state_code") || "DE-HH") === "DE-HH") {
    for (const [a, z, n] of HH_HOLIDAYS) if (z >= addDays(today, -30)) event(`ferien-${compact(a)}`, compact(a), compact(addDays(z, 1)), false, `${n} (Schulferien)`, ["TRANSP:TRANSPARENT"]);
  }
  return L.map(fold);
}

module.exports = { feedLines, happens };
