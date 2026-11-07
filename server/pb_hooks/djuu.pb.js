/// <reference path="../pb_data/types.d.ts" />
// Djuu routes: create a family, invite and join, renew the calendar address, the family calendar feed, and the ping cleanup.
// Each handler runs on its own, so shared code lives in djuu_utils.js and is loaded with require().

// Create a family and become its first member. One family per account.
routerAdd("POST", "/api/djuu/family", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const body = e.requestInfo().body || {};
  const myName = String(body.myName || "").trim().slice(0, 30);
  if (!myName) throw new BadRequestError("Bitte gib deinen Namen an.");
  if (u.memberOf(e.app, e.auth.id)) throw new BadRequestError("Du bist schon in einer Familie.");
  let out = {};
  e.app.runInTransaction((tx) => {
    const fam = new Record(tx.findCollectionByNameOrId("families"));
    fam.set("name", String(body.name || "Familie").trim().slice(0, 60) || "Familie");
    fam.set("state_code", String(body.state || "DE-HH").slice(0, 8));
    fam.set("cal_token", $security.randomString(40));
    tx.save(fam);
    const me = new Record(tx.findCollectionByNameOrId("members"));
    me.set("family", fam.id); me.set("user", e.auth.id); me.set("name", myName); me.set("kind", "adult"); me.set("color", "#6B4EE6");
    tx.save(me);
    const mem = new Record(tx.findCollectionByNameOrId("shop_memory"));
    mem.set("family", fam.id); mem.set("history", {}); mem.set("learned", {}); mem.set("rank", {}); mem.set("trips", 0);
    tx.save(mem);
    out = { family: fam.id, member: me.id };
  });
  return e.json(200, out);
}, $apis.requireAuth());

// A member creates an invite link. The plain token only exists in the link; the database keeps its hash.
routerAdd("POST", "/api/djuu/invite", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const me = u.memberOf(e.app, e.auth.id);
  if (!me) throw new BadRequestError("Du bist in keiner Familie.");
  const token = $security.randomString(32);
  const inv = new Record(e.app.findCollectionByNameOrId("invites"));
  inv.set("family", me.get("family")); inv.set("token_hash", $security.sha256(token)); inv.set("created_by", me.id);
  inv.set("expires", new DateTime().addDate(0, 0, 7));
  e.app.save(inv);
  return e.json(200, { token });
}, $apis.requireAuth());

// Join with an invite token.
routerAdd("POST", "/api/djuu/join", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const body = e.requestInfo().body || {};
  const myName = String(body.myName || "").trim().slice(0, 30);
  if (!myName) throw new BadRequestError("Bitte gib deinen Namen an.");
  if (u.memberOf(e.app, e.auth.id)) throw new BadRequestError("Du bist schon in einer Familie.");
  let inv;
  try { inv = e.app.findFirstRecordByFilter("invites", "token_hash = {:h} && used = ''", { h: $security.sha256(String(body.token || "")) }); }
  catch (err) { throw new BadRequestError("Diese Einladung gibt es nicht oder sie wurde schon benutzt."); }
  if (inv.getDateTime("expires").before(new DateTime())) throw new BadRequestError("Diese Einladung ist abgelaufen. Bitte um eine neue.");
  let out = {};
  e.app.runInTransaction((tx) => {
    const me = new Record(tx.findCollectionByNameOrId("members"));
    me.set("family", inv.get("family")); me.set("user", e.auth.id); me.set("name", myName); me.set("kind", "adult");
    tx.save(me);
    inv.set("used", new DateTime());
    tx.save(inv);
    out = { family: inv.get("family"), member: me.id };
  });
  return e.json(200, out);
}, $apis.requireAuth());

// The secret address of the family calendar; renewing makes the old address stop working.
routerAdd("POST", "/api/djuu/calendar", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const me = u.memberOf(e.app, e.auth.id);
  if (!me) throw new BadRequestError("Du bist in keiner Familie.");
  const fam = e.app.findRecordById("families", me.get("family"));
  if ((e.requestInfo().body || {}).renew || !fam.get("cal_token")) { fam.set("cal_token", $security.randomString(40)); e.app.save(fam); }
  return e.json(200, { token: fam.get("cal_token") });
}, $apis.requireAuth());

// Family calendar feed (webcal): all saved offers of the family. No login, the token is the key.
routerAdd("GET", "/api/djuu/cal/{token}", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const token = String(e.request.pathValue("token") || "").replace(/\.ics$/, "");
  let fam;
  try { fam = e.app.findFirstRecordByFilter("families", "cal_token = {:t} && cal_token != ''", { t: token }); }
  catch (err) { throw new NotFoundError("Kalender nicht gefunden."); }
  const saved = e.app.findRecordsByFilter("saved_offers", "family = {:f}", "-created", 500, 0, { f: fam.id });
  e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
  e.response.header().set("Cache-Control", "private, max-age=900");
  return e.string(200, u.ics(fam.get("name"), saved.map((r) => ({ id: r.get("offer_id"), snap: r.get("snap") }))));
});

// Positions are not kept: pings older than 24 hours are deleted every hour.
cronAdd("djuu_ping_cleanup", "17 * * * *", () => {
  $app.db().newQuery("DELETE FROM pings WHERE created < {:t}").bind({ t: new DateTime().addDate(0, 0, -1).string() }).execute();
});
