/// <reference path="../pb_data/types.d.ts" />
// Community contributions with moderation (21 Nov 2026): Ergänzen (info), new places, reviews, reports and photos are sent
// to the server instead of staying on one phone. Every contribution waits for a moderator ("pending"); only approved ones
// are public, through GET /api/djuu/community (without the person). See pb_hooks/djuu_community.pb.js.
// - contributions: the person reads, changes and deletes only their own, and only while they wait. status, mod_note,
//   decided and target are set by the server (hooks and the moderation routes), never by the person.
// - users.is_mod: who moderates. Only a superuser sets it (dashboard); nobody can set it through the API.
// - contrib_removed: ids of public items that left the public list (rejected, deleted, hidden by reports), so clients
//   drop them on their next update. No API access.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "is_mod" }));
  const noMod = "@request.body.is_mod:isset = false";
  users.createRule = users.createRule ? `(${users.createRule}) && ${noMod}` : noMod;
  users.updateRule = users.updateRule ? `(${users.updateRule}) && ${noMod}` : null;
  app.save(users);

  const c = new Collection({
    type: "base", name: "contributions",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "kind", type: "select", values: ["info", "new_place", "review", "report", "photo"], maxSelect: 1, required: true },
      { name: "place_id", type: "text", max: 40, pattern: "^[A-Za-z0-9_-]*$" },
      { name: "data", type: "json", maxSize: 8000 },
      { name: "photos", type: "file", maxSelect: 3, maxSize: 3 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["400x0"] },
      { name: "status", type: "select", values: ["pending", "approved", "rejected"], maxSelect: 1 },
      { name: "mod_note", type: "text", max: 300 },
      { name: "target", type: "text", max: 15, pattern: "^([a-z0-9]{15}|place)?$" }, // reports: the reported contribution (or 'place')
      { name: "decided", type: "date" }, // when a moderator decided (the public list is updated by this time)
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_contrib_user ON contributions (user, created)",
      "CREATE INDEX idx_contrib_status ON contributions (status, decided)",
      "CREATE INDEX idx_contrib_target ON contributions (target) WHERE target != ''",
    ],
  });
  const ME = "@request.auth.id";
  const serverOnly = ["status", "mod_note", "target", "decided"];
  c.listRule = `user = ${ME}`;
  c.viewRule = c.listRule;
  c.createRule = `${ME} != '' && @request.auth.collectionName = 'users' && @request.auth.verified = true && @request.body.user = ${ME}` +
    ` && (@request.body.status:isset = false || @request.body.status = 'pending')` +
    serverOnly.filter((f) => f !== "status").map((f) => ` && @request.body.${f}:isset = false`).join("");
  c.updateRule = `user = ${ME} && status = 'pending' && @request.body.user:changed = false && @request.body.kind:changed = false` +
    serverOnly.map((f) => ` && @request.body.${f}:changed = false`).join("");
  c.deleteRule = `user = ${ME} && status = 'pending'`;
  app.save(c);

  app.save(new Collection({
    type: "base", name: "contrib_removed",
    fields: [
      { name: "cid", type: "text", max: 15, required: true },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_contrib_removed ON contrib_removed (created)"],
  }));
}, (app) => {
  for (const n of ["contrib_removed", "contributions"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (e) { /* gone */ } }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("is_mod");
  const strip = (r) => (r ? r.replace(/^\((.*)\) && @request\.body\.is_mod:isset = false$/, "$1").replace(/^@request\.body\.is_mod:isset = false$/, "") : r);
  users.createRule = strip(users.createRule);
  users.updateRule = strip(users.updateRule);
  app.save(users);
});
