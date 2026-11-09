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
    u.makeAccount(me, { grp: "family", role: body.role, admin: true, perms: u.FULL, email: e.auth.email() });
    tx.save(me);
    u.linkUser(tx, e.auth.id, me.id);
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
  if (!me.getBool("is_admin")) throw new ForbiddenError("Nur der Admin kann Personen einladen.");
  const body = e.requestInfo().body || {};
  const grp = body.grp === "helper" ? "helper" : "family";
  const token = $security.randomString(32);
  const inv = new Record(e.app.findCollectionByNameOrId("invites"));
  inv.set("family", me.get("family")); inv.set("token_hash", $security.sha256(token)); inv.set("created_by", me.id);
  inv.set("grp", grp); inv.set("role", String(body.role || "").slice(0, 30)); inv.set("perms", u.cleanPerms(body.perms, grp));
  if (body.until) inv.set("access_until", u.endOfDay(body.until));
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
    const grp = inv.getString("grp") || "family";
    u.makeAccount(me, { grp, role: body.role || inv.getString("role"), admin: false, perms: u.cleanPerms(u.parseJson(inv.getString("perms")), grp), email: e.auth.email() });
    if (inv.getString("access_until")) me.set("access_until", inv.get("access_until"));
    tx.save(me);
    u.linkUser(tx, e.auth.id, me.id);
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
  if (!u.canSee(me, "perm_cal")) throw new ForbiddenError("Kein Zugriff auf den Kalender.");
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
  return e.string(200, u.ics(fam.get("name"), saved.map((r) => ({ id: r.getString("offer_id"), snap: u.parseJson(r.getString("snap")) }))));
});

// Positions are not kept: pings older than 24 hours are deleted every hour.
cronAdd("djuu_ping_cleanup", "17 * * * *", () => {
  $app.db().newQuery("DELETE FROM pings WHERE created < {:t}").bind({ t: new DateTime().addDate(0, 0, -1).string() }).execute();
});

// The admin changes a person's group, role, access, end date or admin flag. There is always at least one admin.
routerAdd("POST", "/api/djuu/member", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const me = u.memberOf(e.app, e.auth.id);
  if (!me || !me.getBool("is_admin")) throw new ForbiddenError("Nur der Admin kann den Zugang ändern.");
  const body = e.requestInfo().body || {};
  let m;
  try { m = e.app.findRecordById("members", String(body.id || "")); } catch (err) { throw new NotFoundError("Person nicht gefunden."); }
  if (m.getString("family") !== me.getString("family")) throw new NotFoundError("Person nicht gefunden.");
  if (m.getString("kind") === "kid") throw new BadRequestError("Kinder haben keinen Zugang.");
  if (body.grp === "family" || body.grp === "helper") m.set("grp", body.grp);
  if (body.role != null) m.set("role", String(body.role).slice(0, 30));
  if (body.perms) { const p = u.cleanPerms(body.perms, m.getString("grp")); for (const k in p) m.set(k, p[k]); }
  if (body.until !== undefined) m.set("access_until", body.until ? u.endOfDay(body.until) : "");
  if (body.admin !== undefined) {
    const on = !!body.admin;
    if (on && (!m.getString("user") || m.getString("grp") !== "family")) throw new BadRequestError("Admin kann nur ein Erwachsener aus der Familie mit eigenem Zugang sein.");
    if (!on && m.getBool("is_admin")) {
      const admins = e.app.findRecordsByFilter("members", "family = {:f} && is_admin = true", "", 0, 0, { f: m.getString("family") });
      if (admins.length < 2) throw new BadRequestError("Es muss immer mindestens einen Admin geben.");
    }
    m.set("is_admin", on);
  }
  if (m.getBool("is_admin")) { for (const p of u.PERMS) m.set(p, "edit"); m.set("access_until", ""); } // an admin always has full access
  e.app.save(m);
  return e.json(200, { ok: true });
}, $apis.requireAuth());

// The admin removes a person from the Wir. Their account stays, without a Wir.
routerAdd("POST", "/api/djuu/remove", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const me = u.memberOf(e.app, e.auth.id);
  if (!me || !me.getBool("is_admin")) throw new ForbiddenError("Nur der Admin kann Personen entfernen.");
  const id = String((e.requestInfo().body || {}).id || "");
  if (id === me.id) throw new BadRequestError("Du kannst dich nicht selbst entfernen. Lösche dazu dein Konto.");
  let m;
  try { m = e.app.findRecordById("members", id); } catch (err) { throw new NotFoundError("Person nicht gefunden."); }
  if (m.getString("family") !== me.getString("family")) throw new NotFoundError("Person nicht gefunden.");
  e.app.runInTransaction((tx) => {
    if (m.getString("user")) {
      try { const usr = tx.findRecordById("users", m.getString("user")); usr.set("member", ""); tx.save(usr); } catch (err) { /* gone */ }
      for (const pl of tx.findRecordsByFilter("places", "owner = {:o} && family != ''", "", 0, 0, { o: m.getString("user") })) { pl.set("family", ""); pl.set("shared", false); tx.save(pl); }
    }
    tx.delete(m);
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth());

// Delete my account. The admin deletes the whole Wir with everything in it (the app warns and lists who is affected);
// everyone else deletes their own person, their places and what they saved.
routerAdd("POST", "/api/djuu/delete-account", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  // a sensitive step: the password is asked again
  if (!e.auth.validatePassword(String((e.requestInfo().body || {}).password || ""))) throw new BadRequestError("Das Passwort stimmt nicht.");
  const me = u.memberOf(e.app, e.auth.id);
  const userId = e.auth.id;
  e.app.runInTransaction((tx) => {
    if (me && me.getBool("is_admin")) {
      const fam = tx.findRecordById("families", me.getString("family"));
      for (const m of tx.findRecordsByFilter("members", "family = {:f} && user != ''", "", 0, 0, { f: fam.id })) {
        try { const usr = tx.findRecordById("users", m.getString("user")); usr.set("member", ""); tx.save(usr); } catch (err) { /* gone */ }
      }
      tx.delete(fam); // members, lists, saved, visits, invites and shared places go with it (cascade)
    } else if (me) {
      for (const coll of ["saved_offers", "saved_places"]) for (const r of tx.findRecordsByFilter(coll, "saved_by = {:m}", "", 0, 0, { m: me.id })) tx.delete(r);
      tx.delete(me);
    }
    tx.delete(tx.findRecordById("users", userId)); // own places go with it (cascade)
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth());

// What an invite link shows before signing in: who invites, and the initials of the people in that Wir. Nothing else.
routerAdd("GET", "/api/djuu/invite-info/{token}", (e) => {
  let inv;
  try { inv = e.app.findFirstRecordByFilter("invites", "token_hash = {:h} && used = ''", { h: $security.sha256(String(e.request.pathValue("token") || "")) }); }
  catch (err) { throw new NotFoundError("Diese Einladung gibt es nicht oder sie wurde schon benutzt."); }
  if (inv.getDateTime("expires").before(new DateTime())) throw new NotFoundError("Diese Einladung ist abgelaufen. Bitte um eine neue.");
  let inviter = "";
  try { inviter = e.app.findRecordById("members", inv.getString("created_by")).getString("name"); } catch (err) { /* gone */ }
  const people = e.app.findRecordsByFilter("members", "family = {:f}", "created", 12, 0, { f: inv.getString("family") }).map((m) => m.getString("name").slice(0, 1).toUpperCase());
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { inviter, grp: inv.getString("grp") || "family", people });
});

// Accounts that were never confirmed are deleted after 7 days.
cronAdd("djuu_unverified_cleanup", "23 3 * * *", () => {
  const old = $app.findRecordsByFilter("users", "verified = false && created < {:t}", "", 500, 0, { t: new DateTime().addDate(0, 0, -7).string() });
  for (const usr of old) { try { $app.delete(usr); } catch (err) { /* in use */ } }
});

// The children of my Wir with name and age in months only (no birth date): for helpers, who cannot read the children's records.
// With the birth year only, the age is a range (born in January ... December of that year).
routerAdd("GET", "/api/djuu/kids", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const me = u.memberOf(e.app, e.auth.id);
  if (!me) throw new BadRequestError("Du bist in keinem Wir.");
  if (me.getString("access_until") && me.getDateTime("access_until").before(new DateTime())) return e.json(200, { kids: [] });
  const kids = e.app.findRecordsByFilter("members", "family = {:f} && kind = 'kid'", "created", 50, 0, { f: me.getString("family") });
  e.response.header().set("Cache-Control", "no-store");
  return e.json(200, { kids: kids.map((k) => ({ id: k.id, name: k.getString("name"), ...u.ageRange(k.getString("birth_ym"), k.getInt("birth_day")) })) });
}, $apis.requireAuth());
