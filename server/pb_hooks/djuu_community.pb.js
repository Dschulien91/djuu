/// <reference path="../pb_data/types.d.ts" />
// Community contributions and moderation (collection `contributions`, migrations 1763950000 and 1763980000; checks in
// djuu_community.js).
// - A signed-in, confirmed person sends Ergänzen / a new place / a review / a report / photos. The server cleans the data,
//   removes photo metadata, enforces the daily limits and always stores it as "pending".
// - Moderators (users.is_mod, set by a superuser) see the queue and approve or reject, optionally after editing the data.
//   A moderator may decide on their own items (there may be only one moderator); decided_by notes who decided.
// - GET /api/djuu/community: the approved items for everyone, without the person who sent them.
// - Three different people reporting an approved review or photo hide it until a moderator decides.
// - The author deletes an own item in any state (POST /api/djuu/contrib-delete); public items leave every phone.

// ---------- the person's own contributions (records API) ----------
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth || e.auth.collection().name !== "users") return e.next(); // the rules decide
  const u = require(`${__hooks}/djuu_utils.js`);
  const c = require(`${__hooks}/djuu_community.js`);
  return u.handle(e, () => {
    if (e.record.getString("user") !== e.auth.id) return e.next(); // refused by the create rule
    // failed uploads with photos are counted: after CAPS.photoFails within an hour, further uploads wait (no file is read)
    const withFiles = (e.record.getUnsavedFiles("photos") || []).length > 0;
    const store = e.app.store(), fkey = "photofail:" + e.auth.id, now = Date.now();
    const [n0, t0] = String(store.get(fkey) || "0|0").split("|").map(Number);
    const fresh = now - t0 < 3600e3;
    if (withFiles && fresh && n0 >= c.CAPS.photoFails) throw u.fail(429, "too_many_attempts", "Zu viele Versuche mit Fotos. Bitte warte eine Stunde.");
    try {
      c.checkCaps(e.app, e.record, e.auth.id);
      c.prepare(e.app, e.record, e.auth.id, true);
    } catch (x) {
      if (withFiles && x && x.djuuFail && ["invalid_photo", "photo_too_big"].includes(x.djuuFail.code)) store.set(fkey, fresh ? `${n0 + 1}|${t0}` : `1|${now}`);
      throw x;
    }
    e.record.set("status", "pending");
    e.record.set("mod_note", "");
    e.record.set("decided", "");
    e.next();
    // the third different reporter hides an approved review or photo until a moderator decides
    const target = e.record.getString("target");
    if (e.record.getString("kind") === "report" && target && target !== "place") {
      try {
        const t = e.app.findRecordById("contributions", target);
        if (["review", "photo"].includes(t.getString("kind")) && c.reporters(e.app, target) === c.HIDE_AFTER_REPORTS) c.tombstone(e.app, target);
      } catch (x) { /* gone */ }
    }
  });
}, "contributions");

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth || e.auth.collection().name !== "users") return e.next();
  const u = require(`${__hooks}/djuu_utils.js`);
  const c = require(`${__hooks}/djuu_community.js`);
  return u.handle(e, () => {
    const old = e.record.original();
    if (old.getString("user") !== e.auth.id || old.getString("status") !== "pending") return e.next(); // refused by the update rule
    if (e.record.getString("kind") !== old.getString("kind")) return e.next();
    // photos are added only when sending (the daily photo limit counts sent items); removing one is fine
    if ((e.record.getUnsavedFiles("photos") || []).length) throw u.fail(400, "photo_locked", "Fotos können nur beim Senden hinzugefügt werden.");
    c.prepare(e.app, e.record, e.auth.id, false);
    e.record.set("status", "pending");
    return e.next();
  });
}, "contributions");

// an approved item that is deleted (by its author or with the account) leaves the public list; a deleted new place takes
// what others sent about it along, and open reports on a deleted item are dismissed
onRecordAfterDeleteSuccess((e) => {
  try {
    const c = require(`${__hooks}/djuu_community.js`);
    if (e.record.getString("status") === "approved" && e.record.getString("kind") !== "report") c.tombstone(e.app, e.record.id);
    if (e.record.getString("kind") === "new_place") c.closeDependents(e.app, e.record.id, "");
    if (e.record.getString("kind") !== "report") c.dropReportsOn(e.app, e.record.id);
  } catch (x) { e.app.logger().warn("djuu contribution delete", "error", String(x)); }
  e.next();
}, "contributions");

// POST /api/djuu/contrib-delete { id }: the author deletes an own item in any state (waiting, published, not taken).
routerAdd("POST", "/api/djuu/contrib-delete", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    if (e.auth.collection().name !== "users") throw u.fail(403, "users_only", "Nur für Konten.");
    let r;
    try { r = e.app.findRecordById("contributions", String((e.requestInfo().body || {}).id || "")); } catch (x) { throw u.fail(404, "not_found", "Diesen Beitrag gibt es nicht mehr."); }
    if (r.getString("user") !== e.auth.id) throw u.fail(404, "not_found", "Diesen Beitrag gibt es nicht mehr.");
    e.app.delete(r); // photos go with it; the delete hook above updates the public list
    return e.json(200, { ok: true });
  });
}, $apis.requireAuth());

// ---------- public list ----------
// GET /api/djuu/community?since=<ISO>: approved items changed after `since` (all without it), never the person, and the ids
// that left the list since then. `until` is the server time to send as the next `since`; `full` = this is the whole list
// (no or a very old `since`): replace what is cached. `approved` is the month of the decision only ('YYYY-MM').
// An item counts as changed when its record changed (`updated`): approved, edited, or kept after reports.
routerAdd("GET", "/api/djuu/community", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const c = require(`${__hooks}/djuu_community.js`);
  return u.handle(e, () => {
    const raw = String(e.request.url.query().get("since") || "").trim();
    let since = "";
    if (raw) {
      if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(raw)) throw u.fail(400, "invalid_date", "Ungültiges Datum.");
      try { since = new DateTime(raw.replace(" ", "T")).string(); } catch (x) { throw u.fail(400, "invalid_date", "Ungültiges Datum."); }
      // removed ids are kept a year (cron below): an older `since` gets the whole list again (full = replace the cache)
      if (since < new DateTime().addDate(0, 0, -360).string()) since = "";
    }
    const until = new DateTime().string();
    const hidden = new Set(c.hiddenIds(e.app));
    const filter = "status = 'approved' && kind != 'report'" + (since ? " && updated > {:s}" : "");
    const items = [];
    const PAGE = 1000; // page by page, so nothing is ever cut off
    for (let offset = 0; ; offset += PAGE) {
      const recs = e.app.findRecordsByFilter("contributions", filter, "updated,id", PAGE, offset, { s: since });
      for (const r of recs) {
        if (hidden.has(r.id)) continue;
        items.push({ id: r.id, kind: r.getString("kind"), place_id: r.getString("place_id"), data: u.parseJson(r.getString("data")), photos: c.photoUrls(e, r, true),
          approved: r.getString("decided") ? r.getDateTime("decided").string().slice(0, 7) : "" });
      }
      if (recs.length < PAGE) break;
    }
    let removed = [];
    if (since) {
      const ids = new Set();
      for (let offset = 0; ; offset += PAGE) {
        const gone = e.app.findRecordsByFilter("contrib_removed", "created > {:s}", "created,id", PAGE, offset, { s: since });
        for (const r of gone) ids.add(r.getString("cid"));
        if (gone.length < PAGE) break;
      }
      const list = [...ids], visible = {};
      for (let i = 0; i < list.length; i += 500) {
        for (const r of e.app.findRecordsByIds("contributions", list.slice(i, i + 500))) visible[r.id] = r.getString("status") === "approved" && !hidden.has(r.id);
      }
      removed = list.filter((id) => !visible[id]);
    }
    e.response.header().set("Cache-Control", "public, max-age=120");
    return e.json(200, { ok: true, items, removed, full: !since, until: until.replace(" ", "T") });
  });
});

// ---------- moderation ----------
// The queue: waiting items, oldest first (at most 100), with the sender's display name for context only (never the e-mail).
// Items about a new place that is not public yet name it (place_name). A new place comes with `near`: community places
// (approved or waiting) within 100 m, nearest first, `similar` = the name looks alike (the mod page adds places.json).
routerAdd("GET", "/api/djuu/mod/queue", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const c = require(`${__hooks}/djuu_community.js`);
  return u.handle(e, () => {
    if (!e.hasSuperuserAuth() && !e.auth.getBool("is_mod")) throw u.fail(403, "mod_only", "Nur für Moderation.");
    const recs = e.app.findRecordsByFilter("contributions", "status = 'pending'", "created", 100, 0);
    const names = {};
    const nameOf = (id) => {
      if (names[id] != null) return names[id];
      let n = "";
      try {
        const usr = e.app.findRecordById("users", id);
        n = usr.getString("name");
        if (!n && usr.getString("member")) { try { n = e.app.findRecordById("members", usr.getString("member")).getString("name"); } catch (x) { /* gone */ } }
      } catch (x) { /* gone */ }
      return (names[id] = String(n || "").slice(0, 40));
    };
    // community places (approved and waiting), read once when the queue has a new place
    let places = null;
    const placesNow = () => places || (places = e.app.findRecordsByFilter("contributions", "kind = 'new_place' && status != 'rejected'", "", 0, 0)
      .map((r) => { const d = u.parseJson(r.getString("data")); return { id: r.id, name: String(d.name || ""), cat: String(d.cat || ""), lat: +d.lat, lon: +d.lon, status: r.getString("status") }; })
      .filter((p) => isFinite(p.lat) && isFinite(p.lon)));
    const placeNames = {};
    const placeName = (pid) => {
      if (placeNames[pid] != null) return placeNames[pid];
      let n = "";
      try { n = String(u.parseJson(e.app.findRecordById("contributions", pid.slice(2)).getString("data")).name || ""); } catch (x) { /* gone */ }
      return (placeNames[pid] = n.slice(0, 80));
    };
    const total = e.app.countRecords("contributions", $dbx.hashExp({ status: "pending" }));
    const items = recs.map((r) => {
      const data = u.parseJson(r.getString("data")), pid = r.getString("place_id");
      const item = { id: r.id, kind: r.getString("kind"), place_id: pid, data,
        photos: c.photoUrls(e, r, false), created: r.getDateTime("created").string().replace(" ", "T"), user_name: nameOf(r.getString("user")) };
      if (/^u_[a-z0-9]{15}$/.test(pid)) item.place_name = placeName(pid);
      if (item.kind === "new_place" && isFinite(+data.lat) && isFinite(+data.lon)) {
        item.near = placesNow().filter((p) => p.id !== r.id).map((p) => ({ ...p, dist: Math.round(c.distM(+data.lat, +data.lon, p.lat, p.lon)), similar: c.similarName(data.name, p.name) }))
          .filter((p) => p.dist <= 100).sort((a, b) => b.similar - a.similar || a.dist - b.dist).slice(0, 5);
      }
      const t = r.getString("target");
      if (t && t !== "place") {
        try {
          const tr = e.app.findRecordById("contributions", t);
          item.target = { id: tr.id, kind: tr.getString("kind"), status: tr.getString("status"), data: u.parseJson(tr.getString("data")), photos: c.photoUrls(e, tr, false), reporters: c.reporters(e.app, t) };
        } catch (x) { item.target = null; }
      }
      return item;
    });
    e.response.header().set("Cache-Control", "no-store");
    return e.json(200, { ok: true, total, items });
  });
}, $apis.requireAuth());

// Decide: { id, status: 'approved'|'rejected', note?, data? }. `data` replaces the data (same checks as on sending).
// - Rejecting removes the photos; rejecting a new place also closes what others sent about it.
// - Deciding on a review or photo closes the open reports on it.
// - A report: 'approved' = the report is right (the reported item is rejected, all reports on it closed); 'rejected'
//   ("Behalten") = the item stays: every open report on it is dismissed and the item is sent to every phone again.
routerAdd("POST", "/api/djuu/mod/decide", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const c = require(`${__hooks}/djuu_community.js`);
  return u.handle(e, () => {
    if (!e.hasSuperuserAuth() && !e.auth.getBool("is_mod")) throw u.fail(403, "mod_only", "Nur für Moderation.");
    const body = e.requestInfo().body || {};
    const status = String(body.status || "");
    if (status !== "approved" && status !== "rejected") throw u.fail(400, "invalid_status", "Bitte freigeben oder ablehnen.");
    const note = String(body.note == null ? "" : body.note).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300);
    const by = e.hasSuperuserAuth() ? "" : e.auth.id;
    u.inTx(e.app, (tx) => {
      let r;
      try { r = tx.findRecordById("contributions", String(body.id || "")); } catch (x) { throw u.fail(404, "not_found", "Diesen Beitrag gibt es nicht mehr."); }
      const kind = r.getString("kind");
      if (body.data !== undefined) {
        if (kind === "report") throw u.fail(400, "invalid_data", "Meldungen werden nicht bearbeitet.");
        r.set("data", c.cleanData(kind, body.data));
      }
      const now = new DateTime();
      const hasBy = !!r.collection().fields.getByName("decided_by");
      const decide = (rec, st, why) => {
        const wasPublic = rec.getString("status") === "approved" && rec.getString("kind") !== "report";
        rec.set("status", st); rec.set("decided", now);
        if (hasBy && by) rec.set("decided_by", by);
        if (why != null) rec.set("mod_note", why);
        if (st === "rejected") rec.set("photos", []); // rejected photos are deleted
        tx.save(rec);
        if (wasPublic && st === "rejected") c.tombstone(tx, rec.id);
        if (st === "rejected" && rec.getString("kind") === "new_place") c.closeDependents(tx, rec.id, by);
      };
      // open reports on an item: closed by the decision on that item (the reports were right if it is rejected)
      const closeReports = (targetId, st) => {
        for (const rep of tx.findRecordsByFilter("contributions", "kind = 'report' && status = 'pending' && target = {:t}", "", 0, 0, { t: targetId })) {
          if (rep.id !== r.id) decide(rep, st === "rejected" ? "approved" : "rejected", null);
        }
      };
      if (kind === "report") {
        decide(r, status, note);
        const t = r.getString("target");
        if (t && t !== "place") {
          let tr = null;
          try { tr = tx.findRecordById("contributions", t); } catch (x) { /* gone */ }
          if (tr && status === "approved") {
            if (tr.getString("status") !== "rejected") decide(tr, "rejected", note || tr.getString("mod_note"));
            closeReports(t, "rejected");
          }
          if (tr && status === "rejected") {
            closeReports(t, "approved"); // kept: all other reports on it are dismissed too
            if (tr.getString("status") === "approved") tx.save(tr); // a new `updated`: phones that dropped it get it again
          }
        }
      } else {
        decide(r, status, note);
        closeReports(r.id, status);
      }
      // the photos really are gone from storage when the queue no longer shows them (PocketBase deletes them after the save)
      if (!c.photoLimits(kind)[0] || status === "rejected") return;
      if (!r.getStringSlice("photos").length) throw u.fail(400, "photo_required", "Bitte füge ein Foto hinzu.");
    });
    return e.json(200, { ok: true });
  });
}, $apis.requireAuth());

// Removed ids are kept a year; a phone that was offline longer gets the whole list again (see `full` above).
cronAdd("djuu_contrib_removed_cleanup", "47 3 * * *", () => {
  $app.db().newQuery("DELETE FROM contrib_removed WHERE created < {:t}").bind({ t: new DateTime().addDate(-1, 0, 0).string() }).execute();
});

// Rejected items and handled reports are kept 90 days (legal.html, storage table), then deleted with their photos.
// Pending ones stay until a moderator decides; approved ones until the author deletes them or the account.
cronAdd("djuu_contrib_retention", "53 3 * * *", () => {
  const t = new DateTime().addDate(0, 0, -90).string();
  for (let round = 0; round < 20; round++) {
    const old = $app.findRecordsByFilter("contributions", "updated < {:t} && (status = 'rejected' || (kind = 'report' && status != 'pending'))", "updated", 200, 0, { t });
    if (!old.length) break;
    for (const r of old) { try { $app.delete(r); } catch (err) { console.log("djuu_contrib_retention:", r.id, err); } }
  }
});
