/// <reference path="../pb_data/types.d.ts" />
// Day-by-day changes of a calendar entry, inside a transaction, so two people changing different days at the same moment
// both stay (a normal PATCH of the whole JSON field would let the later one win). Same access as editing the calendar.
// - "Ich übernehme": taken-over days (cal_entries.overrides, { "YYYY-MM-DD": member id }): `set` / `del`.
// - Single occurrences of a repeating entry (cal_entries.changes, { "YYYY-MM-DD": { del: true } | { date, title, from, to,
//   place, who, kids, note } }, see djuu_cal.js cleanChange): `chg` (a day's whole change, null removes it) / `chgdel`.
// Body: { id, set: {day: member id}, del: [day], chg: {day: change|null}, chgdel: [day] } → the updated record.
routerAdd("POST", "/api/djuu/cal-take", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const cal = require(`${__hooks}/djuu_cal.js`);
  return u.handle(e, () => {
    const body = e.requestInfo().body || {};
    const me = u.memberOf(e.app, e.auth.id);
    if (!me) throw u.fail(400, "not_member", "Du bist in keinem Wir.");
    if (!u.canSee(me, "perm_cal") || me.getString("perm_cal") !== "edit") throw u.fail(403, "no_calendar_access", "Kein Zugriff auf den Kalender.");
    const day = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k));
    const map = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const parse = (r, f) => { try { return map(JSON.parse(r.getString(f) || "{}")); } catch (err) { return {}; } };
    let out = null, actorKey = "";
    try {
    u.inTx(e.app, (tx) => {
      let r;
      try { r = tx.findRecordById("cal_entries", String(body.id || "")); } catch (err) { throw u.fail(404, "entry_not_found", "Diesen Eintrag gibt es nicht mehr."); }
      if (r.getString("family") !== me.getString("family")) throw u.fail(404, "entry_not_found", "Diesen Eintrag gibt es nicht mehr.");
      const sameWir = (id) => { try { return tx.findRecordById("members", String(id || "")).getString("family") === me.getString("family"); } catch (err) { return false; } };
      // taken-over days
      const cur = parse(r, "overrides");
      for (const [k, v] of Object.entries(map(body.set))) if (day(k) && sameWir(v)) cur[k] = String(v);
      for (const k of Array.isArray(body.del) ? body.del : []) delete cur[String(k)];
      r.set("overrides", cal.pruneOld(cur)); // taken-over days long past are dropped
      // single occurrences (only on a server that has the field)
      if (r.collection().fields.getByName("changes") && (body.chg || body.chgdel)) {
        const ch = cal.cleanChanges(parse(r, "changes"));
        for (const [k, v] of Object.entries(map(body.chg))) {
          if (!day(k)) continue;
          const c = v == null ? null : cal.cleanChange(v);
          if (c && c.who) c.who = c.who.filter(sameWir);
          if (c && c.kids) c.kids = c.kids.filter(sameWir);
          if (c) ch[k] = c; else delete ch[k];
        }
        for (const k of Array.isArray(body.chgdel) ? body.chgdel : []) delete ch[String(k)];
        const kept = cal.limitChanges(ch); // days long past are dropped; at most cal.MAX_CHANGES changed days per entry
        if (!kept) throw u.fail(400, "limit_reached", "Das Limit für diesen Bereich ist erreicht.");
        r.set("changes", kept);
      }
      // djuu_push.js: no pickup message to the person who made this change
      actorKey = "djuu_actor:" + r.id;
      e.app.store().set(actorKey, me.id);
      tx.save(r);
      out = r;
    });
    } finally { if (actorKey) e.app.store().remove(actorKey); }
    return e.json(200, out);
  });
}, $apis.requireAuth());
