/// <reference path="../pb_data/types.d.ts" />
// Fixes after the review of 21 Nov 2026 (v0.65):
// - members.perm_care: access to the children's emergency information (kid_care), like the other areas: 'none', 'view',
//   'edit'. Family group 'edit', helpers 'none' (existing people get exactly that). Set only through /api/djuu/member and
//   invites, never through the records API. kid_care: read with 'view'/'edit', write with 'edit' (admins always), only
//   while the access is active; consent_by = the person saving (the server notes consent_at itself, djuu_family.pb.js).
// - The founder's own person record (name, photo, colour, …) is changed by the founder only.
// - invites.name: an optional name the admin gives an invite, shown in the list of open invites (GET /api/djuu/invites).
// - contributions: photos are JPEG only, at most 1.5 MB each (the app re-encodes every photo as a JPEG); the moderator's
//   note is hidden from the sender (K5); decided_by notes which moderator decided (also hidden); an index for the public
//   list, which is now updated by `updated` (an item that was hidden by reports and kept comes back to every phone).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const members = app.findCollectionByNameOrId("members");
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const FIXED = "@request.body.family:changed = false";

  // ---------- people: access to the emergency information ----------
  members.fields.add(new SelectField({ name: "perm_care", values: ["none", "view", "edit"], maxSelect: 1 }));
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "cal_token", "perm_shop", "perm_errands", "perm_cal", "perm_saved", "perm_care"]
    .map((f) => `@request.body.${f}:isset = false`).join(" && ");
  const looks = `((@request.body.photo:changed = false && @request.body.color:changed = false) || id = ${ME}.id || (${ME}.is_admin = true && (user = '' || grp = 'helper')))`;
  const founderOwn = `(family.founder = '' || family.founder != id || id = ${ME}.id)`;
  members.createRule = `@request.body.family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now) && ${managed}` +
    ` && (${ME}.is_admin = true || (${ME}.grp = 'family' && (@request.body.kind = 'kid' || @request.body.kind = 'dog')))`;
  members.updateRule = `${SAME} && ${managed} && ${FIXED} && @request.body.kind:changed = false` +
    ` && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult')) && ${looks} && ${founderOwn}`;
  app.save(members);
  for (const m of app.findRecordsByFilter("members", "kind = 'adult'", "", 0, 0)) {
    m.set("perm_care", m.getBool("is_admin") || m.getString("grp") !== "helper" ? "edit" : "none");
    app.saveNoValidate(m);
  }
  // open invites keep what they promised: family 'edit', helpers 'none'
  for (const inv of app.findRecordsByFilter("invites", "used = ''", "", 0, 0)) {
    let p = {};
    try { p = JSON.parse(inv.getString("perms") || "{}") || {}; } catch (e) { p = {}; }
    if (!p.perm_care) { p.perm_care = inv.getString("grp") === "helper" ? "none" : "edit"; inv.set("perms", p); app.saveNoValidate(inv); }
  }

  // ---------- emergency information ----------
  const care = app.findCollectionByNameOrId("kid_care");
  const READ = `(${ME}.is_admin = true || ${ME}.perm_care = 'view' || ${ME}.perm_care = 'edit')`;
  const WRITE = `(${ME}.is_admin = true || ${ME}.perm_care = 'edit')`;
  care.listRule = `${ACTIVE} && ${READ}`;
  care.viewRule = care.listRule;
  care.createRule = `${ACTIVE} && ${WRITE} && @request.body.kid.family = family && @request.body.kid.kind = 'kid' && @request.body.consent_by = ${ME}`;
  care.updateRule = `${ACTIVE} && ${WRITE} && ${FIXED} && @request.body.kid:changed = false && @request.body.consent_by = ${ME}`;
  care.deleteRule = `${ACTIVE} && ${WRITE}`;
  app.save(care);

  // ---------- invites: a name for the list of open invites ----------
  const invites = app.findCollectionByNameOrId("invites");
  invites.fields.add(new TextField({ name: "name", max: 30 }));
  app.save(invites);

  // ---------- contributions ----------
  const c = app.findCollectionByNameOrId("contributions");
  const photos = c.fields.getByName("photos");
  photos.mimeTypes = ["image/jpeg"];
  photos.maxSize = 1536 * 1024;
  c.fields.getByName("mod_note").hidden = true;
  c.fields.add(new RelationField({ name: "decided_by", collectionId: users.id, maxSelect: 1, cascadeDelete: false, hidden: true }));
  const AUTH = "@request.auth.id";
  const serverOnly = ["status", "mod_note", "target", "decided", "decided_by"];
  c.createRule = `${AUTH} != '' && @request.auth.collectionName = 'users' && @request.auth.verified = true && @request.body.user = ${AUTH}` +
    ` && (@request.body.status:isset = false || @request.body.status = 'pending')` +
    serverOnly.filter((f) => f !== "status").map((f) => ` && @request.body.${f}:isset = false`).join("");
  c.updateRule = `user = ${AUTH} && status = 'pending' && @request.body.user:changed = false && @request.body.kind:changed = false` +
    serverOnly.map((f) => ` && @request.body.${f}:changed = false`).join("");
  c.addIndex("idx_contrib_status_upd", false, "status, updated", "");
  app.save(c);
}, (app) => {
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const FIXED = "@request.body.family:changed = false";
  const members = app.findCollectionByNameOrId("members");
  members.fields.removeByName("perm_care");
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "cal_token", "perm_shop", "perm_errands", "perm_cal", "perm_saved"]
    .map((f) => `@request.body.${f}:isset = false`).join(" && ");
  const looks = `((@request.body.photo:changed = false && @request.body.color:changed = false) || id = ${ME}.id || (${ME}.is_admin = true && (user = '' || grp = 'helper')))`;
  members.createRule = `@request.body.family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now) && ${managed}` +
    ` && (${ME}.is_admin = true || (${ME}.grp = 'family' && (@request.body.kind = 'kid' || @request.body.kind = 'dog')))`;
  members.updateRule = `${SAME} && ${managed} && ${FIXED} && @request.body.kind:changed = false` +
    ` && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult')) && ${looks}`;
  app.save(members);
  const care = app.findCollectionByNameOrId("kid_care");
  const ADMIN = `${ACTIVE} && ${ME}.is_admin = true`;
  care.listRule = `${ACTIVE} && (${ME}.is_admin = true || ${ME}.grp = 'family' || ${ME}.grp = 'helper')`;
  care.viewRule = care.listRule;
  care.createRule = `${ADMIN} && @request.body.kid.family = family && @request.body.kid.kind = 'kid' && @request.body.consent_by = ${ME}`;
  care.updateRule = `${ADMIN} && ${FIXED} && @request.body.kid:changed = false && @request.body.consent_by = ${ME}`;
  care.deleteRule = ADMIN;
  app.save(care);
  const invites = app.findCollectionByNameOrId("invites");
  invites.fields.removeByName("name");
  app.save(invites);
  const c = app.findCollectionByNameOrId("contributions");
  const photos = c.fields.getByName("photos");
  photos.mimeTypes = ["image/jpeg", "image/png", "image/webp"];
  photos.maxSize = 3 * 1024 * 1024;
  c.fields.getByName("mod_note").hidden = false;
  c.fields.removeByName("decided_by");
  c.removeIndex("idx_contrib_status_upd");
  const AUTH = "@request.auth.id";
  const serverOnly = ["status", "mod_note", "target", "decided"];
  c.createRule = `${AUTH} != '' && @request.auth.collectionName = 'users' && @request.auth.verified = true && @request.body.user = ${AUTH}` +
    ` && (@request.body.status:isset = false || @request.body.status = 'pending')` +
    serverOnly.filter((f) => f !== "status").map((f) => ` && @request.body.${f}:isset = false`).join("");
  c.updateRule = `user = ${AUTH} && status = 'pending' && @request.body.user:changed = false && @request.body.kind:changed = false` +
    serverOnly.map((f) => ` && @request.body.${f}:changed = false`).join("");
  app.save(c);
});
