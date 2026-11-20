/// <reference path="../pb_data/types.d.ts" />
// Hardening after the security review of 20 Nov 2026. All rules are written out in full here (not appended), so this file
// is the one place that says who may do what.
// - Nothing moves to another Wir: `family` is fixed after create, and relations to people must stay inside the same Wir.
// - A person's kind is fixed (a child cannot become an adult that helpers would then see).
// - Photos are data:image URLs only, colours #RRGGBB (the app puts both into HTML).
// - Everyone reads their own person record, also after their access ended (the app needs it to show that).
// - "Wo seid ihr?" only between active people of the family group in the same Wir; the answer cannot change who or where.
// - Accounts are deleted only through /api/djuu/delete-account (password, Wir handling); not through the records API.
// - Every person gets their own calendar address (members.cal_token, hidden; see /api/djuu/calendar).
// - The client's address is taken from X-Forwarded-For as set by the proxy (rightmost entry), for rate limits and /ask.
// - Request logs: warnings and errors only, 3 days (successful requests with tokens in the URL are not kept).
migrate((app) => {
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const FIXED = "@request.body.family:changed = false";
  const sameWir = (f) => `(@request.body.${f}:isset = false || @request.body.${f} = '' || @request.body.${f}.family = family)`;

  // ---------- lists, errands, saved, visits ----------
  const canRead = (p) => `${ACTIVE} && ${ME}.${p} != 'none' && ${ME}.${p} != ''`;
  const canEdit = (p) => `${ACTIVE} && ${ME}.${p} = 'edit'`;
  const areas = {
    shop_items: ["perm_shop", ["added_by", "done_by"]], shop_memory: ["perm_shop", []], errands: ["perm_errands", ["for_member", "added_by"]],
    saved_offers: ["perm_saved", ["saved_by"]], saved_places: ["perm_saved", ["saved_by"]], visits: ["perm_cal", ["added_by"]],
  };
  for (const [name, [perm, rels]] of Object.entries(areas)) {
    const c = app.findCollectionByNameOrId(name);
    const relOk = rels.map((f) => " && " + sameWir(f)).join("");
    c.listRule = canRead(perm); c.viewRule = canRead(perm);
    c.createRule = canEdit(perm) + relOk;
    c.updateRule = canEdit(perm) + ` && ${FIXED}` + relOk;
    c.deleteRule = canEdit(perm);
    app.save(c);
  }

  // ---------- people ----------
  const members = app.findCollectionByNameOrId("members");
  members.fields.add(new TextField({ name: "cal_token", max: 64, hidden: true }));
  members.fields.getByName("photo").pattern = "^(data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)?$";
  members.fields.getByName("color").pattern = "^(#[0-9A-Fa-f]{6})?$";
  members.addIndex("idx_members_cal", true, "cal_token", "cal_token != ''");
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "cal_token", "perm_shop", "perm_errands", "perm_cal", "perm_saved"]
    .map((f) => `@request.body.${f}:isset = false`).join(" && ");
  const looks = `((@request.body.photo:changed = false && @request.body.color:changed = false) || id = ${ME}.id || (${ME}.is_admin = true && (user = '' || grp = 'helper')))`;
  members.listRule = `(${SAME} && (${ME}.grp != 'helper' || kind = 'adult')) || id = ${ME}.id`;
  members.viewRule = members.listRule;
  members.createRule = `@request.body.family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now) && ${managed}` +
    ` && (${ME}.is_admin = true || (${ME}.grp = 'family' && (@request.body.kind = 'kid' || @request.body.kind = 'dog')))`;
  members.updateRule = `${SAME} && ${managed} && ${FIXED} && @request.body.kind:changed = false` +
    ` && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult')) && ${looks}`;
  members.deleteRule = `${SAME} && user = '' && (${ME}.is_admin = true || (${ME}.grp = 'family' && kind != 'adult'))`;
  app.save(members);

  // ---------- the Wir ----------
  const families = app.findCollectionByNameOrId("families");
  families.fields.getByName("photo").pattern = "^(data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)?$";
  families.listRule = `id = ${ME}.family`; // also after access ended: the app shows the Wir's name (only name, photo, state)
  families.viewRule = families.listRule;
  families.updateRule = `id = ${ME}.family && ${ME}.is_admin = true && @request.body.cal_token:isset = false`;
  app.save(families);

  // ---------- "Wo seid ihr?" ----------
  const pings = app.findCollectionByNameOrId("pings");
  const MINE = `${ME}.family = family && (from = ${ME}.id || to = ${ME}.id)`;
  pings.listRule = MINE; pings.viewRule = MINE; pings.deleteRule = MINE;
  pings.createRule = `${ACTIVE} && ${ME}.grp = 'family' && @request.body.from = ${ME}.id && @request.body.to.family = family` +
    ` && @request.body.to.user != '' && @request.body.to != ${ME}.id`;
  pings.updateRule = `${ACTIVE} && to = ${ME}.id && ${FIXED} && @request.body.from:changed = false && @request.body.to:changed = false`;
  app.save(pings);

  // ---------- accounts ----------
  const users = app.findCollectionByNameOrId("users");
  users.deleteRule = null;
  app.save(users);

  // ---------- client address, logs ----------
  const s = app.settings();
  s.trustedProxy.headers = ["X-Forwarded-For"];
  s.trustedProxy.useLeftmostIP = false;
  s.logs.minLevel = 4;
  s.logs.maxDays = 3;
  app.save(s);
}, (app) => {
  // back to the rules of 1762500000-1763500000 (the per-person calendar field stays, it is harmless)
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const canRead = (p) => `${ACTIVE} && ${ME}.${p} != 'none' && ${ME}.${p} != ''`;
  const canEdit = (p) => `${ACTIVE} && ${ME}.${p} = 'edit'`;
  for (const [name, perm] of Object.entries({ shop_items: "perm_shop", shop_memory: "perm_shop", errands: "perm_errands", saved_offers: "perm_saved", saved_places: "perm_saved", visits: "perm_cal" })) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = canRead(perm); c.viewRule = canRead(perm); c.createRule = canEdit(perm); c.updateRule = canEdit(perm); c.deleteRule = canEdit(perm);
    app.save(c);
  }
  const members = app.findCollectionByNameOrId("members");
  members.fields.getByName("photo").pattern = ""; members.fields.getByName("color").pattern = "";
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "perm_shop", "perm_errands", "perm_cal", "perm_saved"].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  const looks = `((@request.body.photo:changed = false && @request.body.color:changed = false) || id = ${ME}.id || (${ME}.is_admin = true && (user = '' || grp = 'helper')))`;
  members.listRule = `${SAME} && (${ME}.grp != 'helper' || kind = 'adult')`; members.viewRule = members.listRule;
  members.createRule = `@request.body.family = ${ME}.family && ${managed} && (${ME}.is_admin = true || (${ME}.grp = 'family' && (@request.body.kind = 'kid' || @request.body.kind = 'dog')))`;
  members.updateRule = `${SAME} && ${managed} && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult')) && ${looks}`;
  app.save(members);
  const families = app.findCollectionByNameOrId("families");
  families.fields.getByName("photo").pattern = "";
  families.updateRule = `id = ${ME}.family && ${ME}.is_admin = true`;
  app.save(families);
  const pings = app.findCollectionByNameOrId("pings");
  const OWN = "family.members_via_family.user ?= @request.auth.id", BOTH = "from.user = @request.auth.id || to.user = @request.auth.id";
  pings.listRule = BOTH; pings.viewRule = BOTH; pings.createRule = "from.user = @request.auth.id && " + OWN; pings.updateRule = "to.user = @request.auth.id"; pings.deleteRule = BOTH;
  app.save(pings);
  const users = app.findCollectionByNameOrId("users");
  users.deleteRule = "id = @request.auth.id";
  app.save(users);
});
