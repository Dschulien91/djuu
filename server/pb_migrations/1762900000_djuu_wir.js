/// <reference path="../pb_data/types.d.ts" />
// "Wir": people in three groups (family, kid, helper), an admin, access per area (none, view, edit) with an optional end date,
// and "Meine Orte" (postcode places, private unless shared with the Wir).
// The account knows its member record (users.member), so every rule can ask "what may this person do here?".
// Group, admin, access and e-mail of a member are only changed by the routes in pb_hooks/djuu.pb.js.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const members = app.findCollectionByNameOrId("members");
  const families = app.findCollectionByNameOrId("families");
  const invites = app.findCollectionByNameOrId("invites");
  const LEVELS = ["none", "view", "edit"];
  const PERMS = ["perm_shop", "perm_errands", "perm_cal", "perm_saved"];

  members.fields.add(new SelectField({ name: "grp", values: ["family", "kid", "helper"], maxSelect: 1 }));
  members.fields.add(new TextField({ name: "role", max: 30 }));
  members.fields.add(new BoolField({ name: "is_admin" }));
  for (const p of PERMS) members.fields.add(new SelectField({ name: p, values: LEVELS, maxSelect: 1 }));
  members.fields.add(new DateField({ name: "access_until" }));
  members.fields.add(new TextField({ name: "email", max: 120 }));
  app.save(members);

  invites.fields.add(new SelectField({ name: "grp", values: ["family", "helper"], maxSelect: 1 }));
  invites.fields.add(new TextField({ name: "role", max: 30 }));
  invites.fields.add(new JSONField({ name: "perms", maxSize: 500 }));
  invites.fields.add(new DateField({ name: "access_until" }));
  app.save(invites);

  users.fields.add(new RelationField({ name: "member", collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  users.createRule = "@request.body.member:isset = false";
  users.updateRule = "id = @request.auth.id && @request.body.member:isset = false";
  app.save(users);

  // existing families: every account gets full access, the first account of a family is its admin
  const all = app.findRecordsByFilter("members", "id != ''", "created", 0, 0);
  const firstAdult = {};
  for (const m of all) {
    const fam = m.getString("family"), isKid = m.getString("kind") === "kid";
    m.set("grp", isKid ? "kid" : "family");
    for (const p of PERMS) m.set(p, isKid ? "none" : "edit");
    if (!isKid && m.getString("user") && !firstAdult[fam]) { firstAdult[fam] = m.id; m.set("is_admin", true); }
    app.save(m);
    if (m.getString("user")) {
      try { const u = app.findRecordById("users", m.getString("user")); u.set("member", m.id); m.set("email", u.email()); app.save(u); app.save(m); } catch (e) { /* user gone */ }
    }
  }

  // ---------- rules ----------
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const canRead = (p) => `${ACTIVE} && ${ME}.${p} != 'none' && ${ME}.${p} != ''`;
  const canEdit = (p) => `${ACTIVE} && ${ME}.${p} = 'edit'`;
  const guard = (c, p) => { c.listRule = canRead(p); c.viewRule = canRead(p); c.createRule = canEdit(p); c.updateRule = canEdit(p); c.deleteRule = canEdit(p); app.save(c); };
  guard(app.findCollectionByNameOrId("shop_items"), "perm_shop");
  guard(app.findCollectionByNameOrId("shop_memory"), "perm_shop");
  guard(app.findCollectionByNameOrId("errands"), "perm_errands");
  guard(app.findCollectionByNameOrId("saved_offers"), "perm_saved");
  guard(app.findCollectionByNameOrId("saved_places"), "perm_saved");
  guard(app.findCollectionByNameOrId("visits"), "perm_cal");

  families.listRule = `id = ${ME}.family`;
  families.viewRule = families.listRule;
  families.updateRule = `id = ${ME}.family && ${ME}.is_admin = true`;
  app.save(families);

  // members: helpers see the adults only (children's data stays private); fields managed by routes cannot be set here
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", ...PERMS].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  members.listRule = `${SAME} && (${ME}.grp != 'helper' || kind = 'adult')`;
  members.viewRule = members.listRule;
  members.createRule = `@request.body.family = ${ME}.family && ${managed} && (${ME}.is_admin = true || (${ME}.grp = 'family' && @request.body.kind = 'kid'))`;
  members.updateRule = `${SAME} && ${managed} && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind = 'kid'))`;
  members.deleteRule = `${SAME} && ${ME}.is_admin = true && user = ''`;
  app.save(members);

  // ---------- Meine Orte ----------
  const places = new Collection({
    type: "base", name: "places",
    fields: [
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, cascadeDelete: true },
      { name: "name", type: "text", max: 40, required: true },
      { name: "plz", type: "text", max: 5 },
      { name: "address", type: "text", max: 120 },
      { name: "lat", type: "number" }, { name: "lon", type: "number" },
      { name: "shared", type: "bool" }, { name: "is_default", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  const famOk = (b) => `(${b}family:isset = false || ${b}family = '' || ${b}family = ${ME}.family)`;
  places.listRule = `owner = @request.auth.id || (shared = true && family != '' && family = ${ME}.family && ${ME}.grp != 'helper')`;
  places.viewRule = places.listRule;
  places.createRule = `@request.body.owner = @request.auth.id && ${famOk("@request.body.")}`;
  places.updateRule = `owner = @request.auth.id && @request.body.owner:isset = false && ${famOk("@request.body.")}`;
  places.deleteRule = "owner = @request.auth.id";
  app.save(places);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("places")); } catch (e) { /* gone */ }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("member"); users.createRule = ""; users.updateRule = "id = @request.auth.id"; app.save(users);
});
