// Community contributions (collection `contributions`, see pb_migrations/1763950000_djuu_community.js): the checks shared by
// the create/update hooks and the moderation routes in djuu_community.pb.js. Loaded with require().
// Everything a person sends is rebuilt from known keys only (unknown keys are dropped), strings are cut to their limits,
// answers must be one of the app's own values, and photos (JPEG only, as the app re-encodes every photo) lose their
// metadata (EXIF with GPS position, XMP, comments) and anything after the end of the image before they are stored.

const KINDS = ["info", "new_place", "review", "report", "photo"];
const PUBLIC_KINDS = ["info", "new_place", "review", "photo"]; // reports are never public
const HIDE_AFTER_REPORTS = 3; // distinct reporters hide an approved review or photo until a moderator decides
const CAPS = { day: 40, newPlace: 5, withPhotos: 10, pending: 3000, photoFails: 10 };
// Hamburg and the Umland region (about 100 km around the city centre): the same box as the app (see NOTES, COMM_BOUNDS)
const BOUNDS = { south: 52.65, north: 54.45, west: 8.48, east: 11.51 };
// the app's own answers (app.js ATTRS / WIZ_TYPES / triRow): "Weiß nicht" ('unknown') says nothing and is dropped,
// unknown questions are dropped, any other value is refused
const ATTR_IDS = ["wickeltisch", "stillen", "hochstuhl", "spielecke", "kindermenue", "windeln", "kleinkind", "eingezaeunt", "schatten", "wc_nahe",
  "wasser", "kinderwagen", "toilette", "drinnen", "hund", "trinkwasser", "babyccino", "kinder_wc", "kinderbecken", "wasserrutsche", "babyschwimmen",
  "kostenlos", "sonntag_user"];
const ATTR_VALUES = ["yes", "no"], DOG_VALUES = ["yes", "no", "leashed"];
const AGE_IDS = ["0-2", "3-6", "7+"];
// new places: the categories and types of the app's "Ort eintragen" (WIZ_TYPES without events)
const NEW_PLACE_CATS = ["spielplatz", "cafe", "windeln", "wickel"];
const NEW_PLACE_TYPES = ["", "spielplatz", "essen", "laden", "service"];
const MAX_PHOTO = 1536 * 1024; // bytes per photo (the app sends JPEGs of about 1600 px, quality 0.85: 200-600 kB)
const MAX_MARKERS = 64;        // JPEG segments per photo (a camera JPEG has about 10-40)

function fail(status, code, message) { const err = new Error(message); err.djuuFail = { status, code, message }; return err; }
const bad = (message) => fail(400, "invalid_data", message || "Die Angaben sind nicht gültig.");

// plain text: no control characters, trimmed, cut to max
function str(v, max) {
  if (v == null) return "";
  if (typeof v !== "string" && typeof v !== "number") throw bad();
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}
const ID = /^[a-z0-9_]{1,40}$/;
function attrs(v) {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw bad();
  const out = {};
  const keys = Object.keys(v);
  if (keys.length > 80) throw bad();
  for (const k of keys) {
    const val = String(v[k] == null ? "" : v[k]);
    if (!ID.test(k)) throw bad();
    if (val === "unknown" || val === "") continue; // "Weiß nicht"
    if (!(k === "hund" ? DOG_VALUES : ATTR_VALUES).includes(val)) throw bad();
    if (ATTR_IDS.includes(k)) out[k] = val;
  }
  return out;
}
function ages(v) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > 10) throw bad();
  const out = [];
  for (const a of v) { const s = String(a); if (!AGE_IDS.includes(s)) throw bad(); if (!out.includes(s)) out.push(s); }
  return out;
}
function num(v, min, max) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!isFinite(n) || n < min || n > max) throw bad();
  return Math.round(n * 1e6) / 1e6;
}

// The data of one contribution, rebuilt from known keys. `ctx` = { app, record, userId } for the checks that need the database.
function cleanData(kind, raw) {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  switch (kind) {
    case "info": {
      const out = { attrs: attrs(d.attrs), ages: ages(d.ages), hours: str(d.hours, 300) };
      if (!Object.keys(out.attrs).length && !out.ages.length && !out.hours) throw bad("Bitte gib mindestens eine Angabe an.");
      return out;
    }
    case "new_place": {
      const name = str(d.name, 80);
      if (name.length < 2) throw bad("Bitte gib einen Namen an.");
      const cat = String(d.cat || ""), type = String(d.type || "");
      if (!NEW_PLACE_CATS.includes(cat) || !NEW_PLACE_TYPES.includes(type)) throw bad();
      return { name, cat, type, lat: num(d.lat, BOUNDS.south, BOUNDS.north), lon: num(d.lon, BOUNDS.west, BOUNDS.east), attrs: attrs(d.attrs), ages: ages(d.ages), hours: str(d.hours, 300) };
    }
    case "review": {
      const stars = Number(d.stars);
      if (!Number.isInteger(stars) || stars < 0 || stars > 5) throw bad();
      const text = str(d.text, 1000);
      if (!stars && !text) throw bad("Bitte gib Sterne oder einen Text an.");
      return { stars, text };
    }
    case "report": {
      const target = String(d.target || "");
      if (target !== "place" && !/^[a-z0-9]{15}$/.test(target)) throw bad();
      const reason = str(d.reason, 500);
      return { target, reason };
    }
    case "photo":
      return { caption: str(d.caption, 200) };
  }
  throw bad();
}

// how many photos a kind may carry
function photoLimits(kind) { return kind === "photo" ? [1, 3] : kind === "new_place" || kind === "review" ? [0, 3] : [0, 0]; }

// ---------- photos ----------
// JPEG only (the app re-encodes every photo with a canvas). Checked and cleaned in place without decoding the image:
// - at most MAX_MARKERS segments (a crafted file with thousands of tiny segments is refused),
// - APP1 (EXIF/XMP, incl. GPS), APP2 except colour profiles (e.g. MPF: offsets to further images), APP3-APP13
//   (vendor data, Photoshop/IPTC) and comments become empty APP15 blocks of zeros,
// - everything after the end of the image (EOI) is cut off: a second embedded image with its own EXIF, a motion-photo video.
// Returns { changed, end } (end = length of the image up to and including EOI), or null when it is not a readable JPEG.
function cleanJpeg(b) {
  const n = b.length;
  if (n < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2, changed = false, markers = 0, scan = false;
  while (i + 1 < n) {
    if (scan) {
      // entropy-coded data: skip to the next real marker (0xFF00 = a data byte, 0xFFD0-D7 = restart markers, 0xFFFF = fill)
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xff) { i++; continue; }
      scan = false; // a marker: the end of the image, or the tables/scan of the next pass (progressive JPEG)
      continue;
    }
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // fill byte
    if (++markers > MAX_MARKERS) return null;
    if (m === 0xd9) return { changed, end: i + 2 };
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xd8) return null; // not allowed outside the image data
    if (i + 4 > n) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > n) return null;
    let icc = false;
    if (m === 0xe2 && len >= 13) { icc = true; for (let k = 0; k < 11; k++) if (b[i + 4 + k] !== "ICC_PROFILE".charCodeAt(k)) { icc = false; break; } }
    if (m === 0xe1 || (m === 0xe2 && !icc) || (m >= 0xe3 && m <= 0xed) || m === 0xfe) {
      b[i + 1] = 0xef;
      for (let k = i + 4; k < i + 2 + len; k++) b[k] = 0;
      changed = true;
    }
    i += 2 + len;
    if (m === 0xda) scan = true; // start of scan: image data follows
  }
  return null; // no end of image
}

// Checks and cleans the new (unsaved) photos. Size first (before reading anything), then the JPEG structure.
function stripPhotos(record) {
  const files = record.getUnsavedFiles("photos");
  if (!files || !files.length) return;
  const tooBig = () => fail(400, "photo_too_big", "Das Foto ist zu groß (höchstens 1,5 MB).");
  for (const f of files) if (!(f.size > 0) || f.size > MAX_PHOTO) throw tooBig();
  for (const f of files) {
    const rd = f.reader.open();
    let b;
    try { b = toBytes(rd, MAX_PHOTO + 1); } finally { try { rd.close(); } catch (x) { /* closed */ } }
    if (b.length > MAX_PHOTO) throw tooBig();
    const r = cleanJpeg(b);
    if (!r) throw fail(400, "invalid_photo", "Das Foto konnte nicht gelesen werden. Bitte nimm ein JPEG-Bild.");
    if (!r.changed && r.end === b.length) continue;
    if (r.end < b.length) b.length = r.end; // cut after the end of the image (shortens the byte slice in place, no copy)
    // the file objects are the ones the record saves: swap their content (name and random suffix stay)
    const nf = $filesystem.fileFromBytes(b, f.name);
    f.reader = nf.reader;
    f.size = nf.size;
  }
}

// number of photos the record will have after saving (kept names + new files)
function photoCount(record) {
  const v = record.get("photos");
  if (!v) return 0;
  return typeof v === "string" ? 1 : v.length || 0;
}

// Checks a create or update of a person's own contribution and prepares the record (data cleaned, target, photos).
function prepare(app, record, userId, isNew) {
  const kind = record.getString("kind");
  if (!KINDS.includes(kind)) throw bad();
  const placeId = record.getString("place_id");
  if (kind === "new_place" && placeId) throw bad();
  if (kind !== "new_place" && !placeId && kind !== "report") throw bad();
  const text = toString(record.get("data")) || "{}";
  if (text.length > 8000) throw bad("Die Angaben sind zu lang.");
  let raw;
  try { raw = JSON.parse(text); } catch (x) { throw bad(); }
  const data = cleanData(kind, raw);
  record.set("target", "");
  if (kind === "report") {
    if (data.target === "place") {
      if (!placeId) throw bad();
    } else {
      let t;
      try { t = app.findRecordById("contributions", data.target); } catch (x) { throw fail(404, "not_found", "Diesen Beitrag gibt es nicht mehr."); }
      if (t.getString("status") !== "approved" || t.getString("kind") === "report") throw fail(404, "not_found", "Diesen Beitrag gibt es nicht mehr.");
      record.set("place_id", t.getString("place_id"));
      if (isNew) {
        const dup = app.countRecords("contributions", $dbx.exp("kind = 'report' AND target = {:t} AND user = {:u} AND status = 'pending'", { t: data.target, u: userId }));
        if (dup > 0) throw fail(400, "already_reported", "Du hast das schon gemeldet.");
      }
    }
    record.set("target", data.target);
  }
  record.set("data", data);
  const [min, max] = photoLimits(kind);
  const n = photoCount(record);
  if (n < min) throw fail(400, "photo_required", "Bitte füge ein Foto hinzu.");
  if (n > max) throw fail(400, "too_many_photos", max ? `Höchstens ${max} Fotos.` : "Hier sind keine Fotos möglich.");
  stripPhotos(record);
}

// Create limits for one person (rolling 24 hours) and for the whole queue.
function checkCaps(app, record, userId) {
  const since = new DateTime().addDate(0, 0, -1).string();
  const recent = app.findRecordsByFilter("contributions", "user = {:u} && created > {:t}", "", CAPS.day + 1, 0, { u: userId, t: since });
  const limit = () => fail(400, "limit_reached", "Für heute hast du schon genug beigetragen. Danke! Morgen geht es weiter.");
  if (recent.length >= CAPS.day) throw limit();
  if (record.getString("kind") === "new_place" && recent.filter((r) => r.getString("kind") === "new_place").length >= CAPS.newPlace) throw limit();
  if (photoCount(record) && recent.filter((r) => r.getStringSlice("photos").length).length >= CAPS.withPhotos) throw limit();
  if (app.countRecords("contributions", $dbx.hashExp({ status: "pending" })) >= CAPS.pending) throw fail(503, "queue_full", "Gerade kommen sehr viele Beiträge an. Bitte versuch es später noch einmal.");
}

// ---------- moderation helpers ----------
// A new place leaves (rejected by a moderator, deleted by its author or with the account): what others sent about it
// (Ergänzen, reviews, photos, reports with place id 'u_<id>') is closed too; public ones leave the public list.
function closeDependents(app, placeContribId, decidedBy) {
  const now = new DateTime();
  for (const x of app.findRecordsByFilter("contributions", "place_id = {:p} && status != 'rejected'", "", 0, 0, { p: "u_" + placeContribId })) {
    const wasPublic = x.getString("status") === "approved" && x.getString("kind") !== "report";
    x.set("status", "rejected"); x.set("decided", now); x.set("photos", []);
    if (decidedBy && x.collection().fields.getByName("decided_by")) x.set("decided_by", decidedBy);
    app.save(x);
    if (wasPublic) tombstone(app, x.id);
    dropReportsOn(app, x.id);
  }
}
// open reports on an item that is gone: dismissed
function dropReportsOn(app, targetId) {
  const now = new DateTime();
  for (const rep of app.findRecordsByFilter("contributions", "kind = 'report' && status = 'pending' && target = {:t}", "", 0, 0, { t: targetId })) {
    rep.set("status", "rejected"); rep.set("decided", now); app.save(rep);
  }
}
// similar names: the same after simple normalising, one inside the other, or most letter pairs shared
function normName(s) {
  return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
}
function similarName(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return false;
  if (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))) return true;
  const pairs = (s) => { const t = s.replace(/ /g, ""), out = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; };
  const pa = pairs(a), pb = pairs(b);
  if (!pa.length || !pb.length) return false;
  const rest = pb.slice();
  let hit = 0;
  for (const p of pa) { const k = rest.indexOf(p); if (k >= 0) { hit++; rest.splice(k, 1); } }
  return (2 * hit) / (pa.length + pb.length) >= 0.6;
}
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// distinct people with an open report on a contribution
function reporters(app, targetId) {
  const rows = arrayOf(new DynamicModel({ n: 0 }));
  app.db().newQuery("SELECT COUNT(DISTINCT user) AS n FROM contributions WHERE kind = 'report' AND status = 'pending' AND target = {:t}").bind({ t: targetId }).all(rows);
  return rows.length ? rows[0].n : 0;
}
// ids of approved reviews/photos hidden by open reports
function hiddenIds(app) {
  const rows = arrayOf(new DynamicModel({ target: "" }));
  app.db().newQuery("SELECT target FROM contributions WHERE kind = 'report' AND status = 'pending' AND target != '' AND target != 'place' GROUP BY target HAVING COUNT(DISTINCT user) >= {:n}")
    .bind({ n: HIDE_AFTER_REPORTS }).all(rows);
  return rows.map((r) => r.target);
}
// a public item that left /api/djuu/community (rejected, deleted, hidden): clients drop it on their next update
function tombstone(app, id) {
  const r = new Record(app.findCollectionByNameOrId("contrib_removed"));
  r.set("cid", id);
  app.save(r);
}

// Where photos are served: the address of this server for local tests, else the public API (never taken from an
// arbitrary Host header, so a forged header cannot put foreign addresses into answers).
function baseUrl(e) {
  const host = String(e.request.host || "");
  return /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host) ? "http://" + host : "https://api.djuu.de";
}
function photoUrls(e, r, thumbOnly) {
  const base = baseUrl(e) + "/api/files/" + r.collection().id + "/" + r.id + "/";
  return r.getStringSlice("photos").map((n) => (thumbOnly ? base + encodeURIComponent(n) + "?thumb=400x0" : { url: base + encodeURIComponent(n), thumb: base + encodeURIComponent(n) + "?thumb=400x0" }));
}

module.exports = { KINDS, PUBLIC_KINDS, HIDE_AFTER_REPORTS, CAPS, BOUNDS, MAX_PHOTO, fail, cleanData, cleanJpeg, photoLimits, prepare, checkCaps, reporters, hiddenIds, tombstone,
  photoUrls, closeDependents, dropReportsOn, similarName, distM };
