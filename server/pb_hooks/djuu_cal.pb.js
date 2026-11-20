/// <reference path="../pb_data/types.d.ts" />
// "Ich übernehme": taken-over days of a calendar entry (cal_entries.overrides, { "YYYY-MM-DD": member id }) change through this
// route, day by day and inside a transaction, so two people taking over different days at the same moment both stay
// (a normal PATCH of the whole JSON field would let the later one win). Same access as editing the calendar.
// Body: { id, set: { "YYYY-MM-DD": member id }, del: ["YYYY-MM-DD"] } → the updated record.
routerAdd("POST", "/api/djuu/cal-take", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const body = e.requestInfo().body || {};
    const me = u.memberOf(e.app, e.auth.id);
    if (!me) throw u.fail(400, "not_member", "Du bist in keinem Wir.");
    if (!u.canSee(me, "perm_cal") || me.getString("perm_cal") !== "edit") throw u.fail(403, "no_calendar_access", "Kein Zugriff auf den Kalender.");
    const day = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k));
    let out = null;
    u.inTx(e.app, (tx) => {
      let r;
      try { r = tx.findRecordById("cal_entries", String(body.id || "")); } catch (err) { throw u.fail(404, "entry_not_found", "Diesen Eintrag gibt es nicht mehr."); }
      if (r.getString("family") !== me.getString("family")) throw u.fail(404, "entry_not_found", "Diesen Eintrag gibt es nicht mehr.");
      let cur = {};
      try { cur = JSON.parse(r.getString("overrides") || "{}") || {}; } catch (err) { cur = {}; }
      if (typeof cur !== "object" || Array.isArray(cur)) cur = {};
      const set = body.set && typeof body.set === "object" && !Array.isArray(body.set) ? body.set : {};
      for (const k of Object.keys(set)) {
        const who = String(set[k] || "");
        if (!day(k)) continue;
        // only people of the same Wir
        try { if (tx.findRecordById("members", who).getString("family") !== me.getString("family")) continue; } catch (err) { continue; }
        cur[k] = who;
      }
      for (const k of Array.isArray(body.del) ? body.del : []) delete cur[String(k)];
      r.set("overrides", cur);
      tx.save(r);
      out = r;
    });
    return e.json(200, out);
  });
}, $apis.requireAuth());
