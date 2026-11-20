/// <reference path="../pb_data/types.d.ts" />
// Djuu routes: create a family, invite and join, the calendar address and feed, access changes, leaving, "Frag Djuu", and cleanups.
// Each handler runs on its own, so shared code lives in djuu_utils.js and is loaded with require().
// Route errors answer { status, code, message, data }: `code` is stable for the app, `message` is the German text.

// Create a family and become its first member. One family per account.
routerAdd("POST", "/api/djuu/family", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const body = e.requestInfo().body || {};
    const myName = String(body.myName || "").trim().slice(0, 30);
    if (!myName) throw u.fail(400, "name_required", "Bitte gib deinen Namen an.");
    let out = {};
    u.inTx(e.app, (tx) => {
      const before = u.memberOf(tx, e.auth.id);
      if (before && !u.expired(before)) throw u.fail(400, "already_member", "Du bist schon in einer Familie.");
      if (before) u.leaveWir(tx, before); // a Wir whose access has ended is left automatically
      const fam = new Record(tx.findCollectionByNameOrId("families"));
      fam.set("name", String(body.name || "Familie").trim().slice(0, 60) || "Familie");
      fam.set("state_code", String(body.state || "DE-HH").slice(0, 8));
      tx.save(fam); // no family-wide calendar address any more: every person gets their own (/api/djuu/calendar)
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
  });
}, $apis.requireAuth());

// The admin creates an invite link. The plain token only exists in the link; the database keeps its hash.
routerAdd("POST", "/api/djuu/invite", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const me = u.memberOf(e.app, e.auth.id);
    if (!me) throw u.fail(400, "not_member", "Du bist in keiner Familie.");
    if (!me.getBool("is_admin")) throw u.fail(403, "admin_only", "Nur der Admin kann Personen einladen.");
    const open = e.app.countRecords("invites", $dbx.exp("family = {:f} AND used = '' AND expires > {:now}", { f: me.getString("family"), now: new DateTime().string() }));
    if (open >= 20) throw u.fail(400, "invite_limit", "Es gibt schon 20 offene Einladungen. Bitte warte, bis welche benutzt oder abgelaufen sind.");
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
  });
}, $apis.requireAuth());

// Join with an invite token. Looked up inside the transaction: writes are serialised, so one token works only once.
routerAdd("POST", "/api/djuu/join", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const body = e.requestInfo().body || {};
    const myName = String(body.myName || "").trim().slice(0, 30);
    if (!myName) throw u.fail(400, "name_required", "Bitte gib deinen Namen an.");
    let out = {};
    u.inTx(e.app, (tx) => {
      const before = u.memberOf(tx, e.auth.id);
      if (before && !u.expired(before)) throw u.fail(400, "already_member", "Du bist schon in einer Familie.");
      if (before) u.leaveWir(tx, before); // a Wir whose access has ended is left automatically
      let inv;
      try { inv = tx.findFirstRecordByFilter("invites", "token_hash = {:h} && used = ''", { h: $security.sha256(String(body.token || "")) }); }
      catch (err) { throw u.fail(400, "invite_invalid", "Diese Einladung gibt es nicht oder sie wurde schon benutzt."); }
      if (inv.getDateTime("expires").before(new DateTime())) throw u.fail(400, "invite_expired", "Diese Einladung ist abgelaufen. Bitte um eine neue.");
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
  });
}, $apis.requireAuth());

// My own secret calendar address (each person has one, so ending someone's access ends theirs only).
// Renewing makes my old address stop working; nobody else's subscription changes.
routerAdd("POST", "/api/djuu/calendar", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const me = u.memberOf(e.app, e.auth.id);
    if (!me) throw u.fail(400, "not_member", "Du bist in keiner Familie.");
    if (!u.canSee(me, "perm_cal")) throw u.fail(403, "no_calendar_access", "Kein Zugriff auf den Kalender.");
    if ((e.requestInfo().body || {}).renew || !me.getString("cal_token")) { me.set("cal_token", $security.randomString(40)); e.app.save(me); }
    return e.json(200, { token: me.getString("cal_token") });
  });
}, $apis.requireAuth());

// Calendar feed (webcal): all saved offers of the family and the family calendar. No login, the token is the key.
// A person's token works only while that person is in the Wir with calendar access. The old family-wide token
// (families.cal_token, from before per-person addresses) still works until someone leaves or their access changes.
routerAdd("GET", "/api/djuu/cal/{token}", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  const token = String(e.request.pathValue("token") || "").replace(/\.ics$/, "");
  let fam = null, member = null;
  if (token.length >= 20) {
    try {
      const m = e.app.findFirstRecordByFilter("members", "cal_token = {:t} && cal_token != ''", { t: token });
      if (u.canSee(m, "perm_cal")) { fam = e.app.findRecordById("families", m.getString("family")); member = m; }
    } catch (err) { /* not a person's token */ }
    if (!fam) { try { fam = e.app.findFirstRecordByFilter("families", "cal_token = {:t} && cal_token != ''", { t: token }); } catch (err) { /* none */ } }
  }
  if (!fam) return e.json(404, { status: 404, code: "calendar_not_found", message: "Kalender nicht gefunden.", data: {} });
  const saved = e.app.findRecordsByFilter("saved_offers", "family = {:f}", "-created", 500, 0, { f: fam.id });
  e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
  e.response.header().set("Cache-Control", "private, max-age=900");
  const body = u.ics(fam.get("name"), saved.map((r) => ({ id: r.getString("offer_id"), snap: u.parseJson(r.getString("snap")) })));
  // the family calendar (djuu_cal.js): own entries, Bringen/Abholen, Kita-Schließtage, birthdays (family group), school holidays (?ferien=1)
  let extra = [];
  try { extra = require(`${__hooks}/djuu_cal.js`).feedLines(e.app, fam, member, { ferien: String(e.request.url.query().get("ferien") || "") === "1" }); }
  catch (err) { e.app.logger().warn("djuu calendar feed", "error", String(err)); }
  return e.string(200, extra.length ? body.replace(/END:VCALENDAR\r\n$/, extra.join("\r\n") + "\r\nEND:VCALENDAR\r\n") : body);
});

// Positions are not kept: pings older than 24 hours are deleted every hour.
cronAdd("djuu_ping_cleanup", "17 * * * *", () => {
  $app.db().newQuery("DELETE FROM pings WHERE created < {:t}").bind({ t: new DateTime().addDate(0, 0, -1).string() }).execute();
});

// Invites are kept one day after they expired or were used, then deleted.
cronAdd("djuu_invite_cleanup", "41 3 * * *", () => {
  $app.db().newQuery("DELETE FROM invites WHERE expires < {:t} OR (used != '' AND used < {:t})").bind({ t: new DateTime().addDate(0, 0, -1).string() }).execute();
});

// The admin changes a person's group, role, access, end date or admin flag. There is always at least one admin.
routerAdd("POST", "/api/djuu/member", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const me = u.memberOf(e.app, e.auth.id);
    if (!me || !me.getBool("is_admin")) throw u.fail(403, "admin_only", "Nur der Admin kann den Zugang ändern.");
    const body = e.requestInfo().body || {};
    let m;
    try { m = e.app.findRecordById("members", String(body.id || "")); } catch (err) { throw u.fail(404, "member_not_found", "Person nicht gefunden."); }
    if (m.getString("family") !== me.getString("family")) throw u.fail(404, "member_not_found", "Person nicht gefunden.");
    if (m.getString("kind") !== "adult") throw u.fail(400, "kid_no_access", "Kinder haben keinen Zugang.");
    const grp = body.grp === "family" || body.grp === "helper" ? body.grp : m.getString("grp");
    const admin = body.admin !== undefined ? !!body.admin : m.getBool("is_admin");
    if (admin && grp === "helper") throw u.fail(400, "admin_not_helper", "Ein Admin gehört immer zur Familie.");
    if (admin && !m.getBool("is_admin") && !m.getString("user")) throw u.fail(400, "admin_needs_account", "Admin kann nur ein Erwachsener aus der Familie mit eigenem Zugang sein.");
    if (!admin && m.getBool("is_admin")) {
      const admins = e.app.findRecordsByFilter("members", "family = {:f} && is_admin = true", "", 0, 0, { f: m.getString("family") });
      if (admins.length < 2) throw u.fail(400, "last_admin", "Es muss immer mindestens einen Admin geben.");
    }
    m.set("grp", grp);
    if (body.role != null) m.set("role", String(body.role).slice(0, 30));
    if (body.perms) { const p = u.cleanPerms(body.perms, grp); for (const k in p) m.set(k, p[k]); }
    if (body.until !== undefined) m.set("access_until", body.until ? u.endOfDay(body.until) : "");
    m.set("is_admin", admin);
    if (admin) { for (const p of u.PERMS) m.set(p, "edit"); m.set("access_until", ""); } // an admin always has full access
    e.app.save(m);
    if (body.grp !== undefined || body.perms || body.until !== undefined) u.retireFamilyCalendar(e.app, m.getString("family"));
    return e.json(200, { ok: true });
  });
}, $apis.requireAuth());

// The admin removes a person from the Wir. Their account stays, without a Wir.
routerAdd("POST", "/api/djuu/remove", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const me = u.memberOf(e.app, e.auth.id);
    if (!me || !me.getBool("is_admin")) throw u.fail(403, "admin_only", "Nur der Admin kann Personen entfernen.");
    const id = String((e.requestInfo().body || {}).id || "");
    if (id === me.id) throw u.fail(400, "cannot_remove_self", "Du kannst dich nicht selbst entfernen. Lösche dazu dein Konto.");
    let m;
    try { m = e.app.findRecordById("members", id); } catch (err) { throw u.fail(404, "member_not_found", "Person nicht gefunden."); }
    if (m.getString("family") !== me.getString("family")) throw u.fail(404, "member_not_found", "Person nicht gefunden.");
    u.inTx(e.app, (tx) => u.leaveWir(tx, m)); // their own calendar address goes with the record
    return e.json(200, { ok: true });
  });
}, $apis.requireAuth());

// I leave my Wir and keep my account (also after my access ended). The last admin cannot leave: they first make someone else
// admin, or delete the Wir by deleting their account. What I saved stays for the others; my places are no longer shared.
routerAdd("POST", "/api/djuu/leave", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    u.inTx(e.app, (tx) => {
      const me = u.memberOf(tx, e.auth.id);
      if (!me) throw u.fail(400, "not_member", "Du bist in keinem Wir.");
      if (me.getBool("is_admin")) {
        const admins = tx.findRecordsByFilter("members", "family = {:f} && is_admin = true && user != ''", "", 0, 0, { f: me.getString("family") });
        if (admins.length < 2) throw u.fail(400, "last_admin", "Du bist der einzige Admin. Mach zuerst jemand anderen zum Admin.");
      }
      u.leaveWir(tx, me);
    });
    return e.json(200, { ok: true });
  });
}, $apis.requireAuth());

// Sign out everywhere: a new token key makes every existing sign-in invalid; this phone gets a fresh token and stays signed in.
routerAdd("POST", "/api/djuu/logout-all", (e) => {
  const usr = e.app.findRecordById("users", e.auth.id);
  usr.refreshTokenKey();
  e.app.save(usr);
  return e.json(200, { ok: true, token: usr.newAuthToken() });
}, $apis.requireAuth());

// Delete my account. When the last admin leaves, the whole Wir is deleted with everything in it (the app warns and lists
// who is affected); if another admin remains, an admin leaves like everyone else: their person and their own places go,
// what they saved for the Wir stays (saved_by is emptied). The password is asked again; 5 wrong tries lock for 15 minutes.
routerAdd("POST", "/api/djuu/delete-account", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const store = e.app.store(), key = "delpw:" + e.auth.id, now = Date.now(), WINDOW = 15 * 60 * 1000;
    const [n0, t0] = String(store.get(key) || "0|0").split("|").map(Number);
    const fresh = now - t0 < WINDOW;
    if (fresh && n0 >= 5) throw u.fail(429, "too_many_attempts", "Zu viele falsche Versuche. Bitte warte eine Viertelstunde.");
    if (!e.auth.validatePassword(String((e.requestInfo().body || {}).password || ""))) {
      store.set(key, fresh ? `${n0 + 1}|${t0}` : `1|${now}`);
      throw u.fail(400, "wrong_password", "Das Passwort stimmt nicht.");
    }
    store.remove(key);
    const me = u.memberOf(e.app, e.auth.id);
    const userId = e.auth.id;
    let wirDeleted = false;
    u.inTx(e.app, (tx) => {
      const admins = me && me.getBool("is_admin")
        ? tx.findRecordsByFilter("members", "family = {:f} && is_admin = true && user != ''", "", 0, 0, { f: me.getString("family") }) : [];
      if (me && me.getBool("is_admin") && admins.length < 2) {
        const fam = tx.findRecordById("families", me.getString("family"));
        for (const m of tx.findRecordsByFilter("members", "family = {:f} && user != ''", "", 0, 0, { f: fam.id })) {
          try { const usr = tx.findRecordById("users", m.getString("user")); usr.set("member", ""); tx.save(usr); } catch (err) { /* gone */ }
        }
        tx.delete(fam); // members, lists, saved, visits, invites and shared places go with it (cascade)
        wirDeleted = true;
      } else if (me) {
        tx.delete(me); // saved_by / added_by of the Wir's entries are emptied, the entries stay
        u.retireFamilyCalendar(tx, me.getString("family"));
      }
      tx.delete(tx.findRecordById("users", userId)); // own places go with it (cascade)
    });
    return e.json(200, { ok: true, wir_deleted: wirDeleted });
  });
}, $apis.requireAuth());

// What an invite link shows before signing in: who invites, and the initials of the people in that Wir. Nothing else.
routerAdd("GET", "/api/djuu/invite-info/{token}", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    let inv;
    try { inv = e.app.findFirstRecordByFilter("invites", "token_hash = {:h} && used = ''", { h: $security.sha256(String(e.request.pathValue("token") || "")) }); }
    catch (err) { throw u.fail(404, "invite_invalid", "Diese Einladung gibt es nicht oder sie wurde schon benutzt."); }
    if (inv.getDateTime("expires").before(new DateTime())) throw u.fail(404, "invite_expired", "Diese Einladung ist abgelaufen. Bitte um eine neue.");
    let inviter = "";
    try { inviter = e.app.findRecordById("members", inv.getString("created_by")).getString("name"); } catch (err) { /* gone */ }
    const people = e.app.findRecordsByFilter("members", "family = {:f}", "created", 12, 0, { f: inv.getString("family") }).map((m) => m.getString("name").slice(0, 1).toUpperCase());
    e.response.header().set("Cache-Control", "no-store");
    return e.json(200, { inviter, grp: inv.getString("grp") || "family", people });
  });
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
  return u.handle(e, () => {
    const me = u.memberOf(e.app, e.auth.id);
    if (!me) throw u.fail(400, "not_member", "Du bist in keinem Wir.");
    if (me.getString("access_until") && me.getDateTime("access_until").before(new DateTime())) return e.json(200, { kids: [] });
    const kids = e.app.findRecordsByFilter("members", "family = {:f} && kind = 'kid'", "created", 50, 0, { f: me.getString("family") });
    e.response.header().set("Cache-Control", "no-store");
    return e.json(200, { kids: kids.map((k) => ({ id: k.id, name: k.getString("name"), ...u.ageRange(k.getString("birth_ym"), k.getInt("birth_day")) })) });
  });
}, $apis.requireAuth());

// "Frag Djuu": turns a free question into the app's own filters with Claude Haiku. Only the typed text is sent
// (no account, no names, no children, no position). The answer is checked against the known ids; anything else is dropped.
// Limits: 40 questions per address and day, 3000 per day in total; the address is the client's (trusted proxy header, see
// migration 1763600000). The id lists the app sends are capped (the app sends about 120 ids, 1.2 kB).
// Without a key or on any error the app uses its own simple recognition instead (503 / 502).
routerAdd("POST", "/api/djuu/ask", (e) => {
  const body = e.requestInfo().body || {};
  const q = String(body.q || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const vocab = body.vocab || {};
  const err = (status, code, message) => e.json(status, { status, code, error: code, message, data: {} });
  if (q.length < 2) return err(400, "empty_question", "Leere Frage.");
  let key = "";
  try { key = e.app.findFirstRecordByFilter("djuu_settings", "key = 'anthropic_api_key'").getString("value"); } catch (x) { /* none */ }
  if (!key) return err(503, "no_key", "Die KI-Suche ist gerade nicht verfügbar.");
  const ip = e.realIP();
  const day = new Date().toISOString().slice(0, 10), store = e.app.store();
  const mine = (store.get("ask:" + day + ":" + ip) || 0) + 1, all = (store.get("ask:" + day) || 0) + 1;
  if (mine > 40 || all > 3000) return err(429, "limit", "Für heute sind genug Fragen gestellt.");
  store.set("ask:" + day + ":" + ip, mine); store.set("ask:" + day, all);
  // what the app knows: ids sent by the app, checked here to be short plain words, and capped in number and total size
  let budget = 3000;
  const ids = (list, max) => (Array.isArray(list) ? list : []).map(String).filter((x) => /^[a-z0-9_:]{1,30}$/.test(x)).slice(0, max)
    .filter((x) => (budget -= x.length + 2) >= 0);
  const groups = ids(vocab.groups, 30), tags = ids(vocab.tags, 200), filters = ids(vocab.filters, 80);
  const system = "You turn a parent's question about places for children in Hamburg into filters of the Djuu app. " +
    "Answer with JSON only, no other text: {\"group\": string|null, \"tags\": string[], \"filters\": string[], \"io\": \"drinnen\"|\"draussen\"|null, \"age_months\": [from, to]|null}. " +
    "Use only these ids. group (one category): " + groups.join(", ") + ". tags (inside the category): " + tags.join(", ") + ". filters (properties): " + filters.join(", ") + ". " +
    "io: drinnen for indoor, roofed or 'bei Regen', draussen for outdoor. age_months: the child's age range in months, e.g. a 2-year-old is [24, 36]. " +
    "Leave out what the question does not say. Ignore names or personal details. The question may be in any language.";
  let res;
  try {
    res = $http.send({
      url: "https://api.anthropic.com/v1/messages", method: "POST", timeout: 12,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 300, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: q }] }),
    });
  } catch (x) { return err(502, "unreachable", "Die KI-Suche ist gerade nicht erreichbar."); }
  if (res.statusCode !== 200) return e.json(502, { status: 502, code: "upstream", error: "upstream", upstream: res.statusCode, message: "Die KI-Suche ist gerade nicht erreichbar.", data: {} });
  let out = {};
  try {
    const text = (res.json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch (x) { return err(502, "unreadable", "Die Antwort der KI-Suche war nicht lesbar."); }
  const keep = (list, allowed) => (Array.isArray(list) ? list : []).map(String).filter((x) => allowed.includes(x)).slice(0, 8);
  const age = Array.isArray(out.age_months) && out.age_months.length === 2 ? out.age_months.map((n) => Math.max(0, Math.min(216, Math.round(+n || 0)))) : null;
  return e.json(200, {
    group: groups.includes(String(out.group)) ? String(out.group) : null,
    tags: keep(out.tags, tags), filters: keep(out.filters, filters),
    io: out.io === "drinnen" || out.io === "draussen" ? out.io : null, age_months: age,
  });
});

// The person record keeps a copy of the account's e-mail (shown to the admin): follow every change (confirm link, dashboard).
onRecordAfterUpdateSuccess((e) => {
  const email = e.record.getString("email").slice(0, 120);
  for (const m of e.app.findRecordsByFilter("members", "user = {:u} && email != {:e}", "", 0, 0, { u: e.record.id, e: email })) {
    m.set("email", email);
    e.app.save(m);
  }
  e.next();
}, "users");

// Consent to the terms on sign-up: the app sends the version, the server notes the time itself.
onRecordCreateRequest((e) => {
  e.record.set("terms_accepted", e.record.getString("terms_version") ? new DateTime() : "");
  return e.next();
}, "users");
