/// <reference path="../pb_data/types.d.ts" />
// Djuu family data. Every record belongs to a family; only its members can read or change it.
// Children are members without an account. Families, members and invites are created by the routes in pb_hooks/djuu.pb.js.
migrate((app) => {
  // sign-in by a 6-digit code sent by e-mail, no passwords
  const users = app.findCollectionByNameOrId("users");
  users.otp.enabled = true;
  users.otp.duration = 600;
  users.otp.length = 6;
  users.passwordAuth.enabled = false;
  app.save(users);

  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
  const text = (name, max, extra = {}) => ({ name, type: "text", max, ...extra });

  const families = new Collection({
    type: "base", name: "families",
    fields: [text("name", 60, { required: true }), text("state_code", 8), text("cal_token", 64, { hidden: true }), ...stamps],
  });
  app.save(families);
  const rel = (name, collection, extra = {}) => ({ name, type: "relation", collectionId: collection.id, maxSelect: 1, ...extra });
  const famRel = rel("family", families, { required: true, cascadeDelete: true });

  const members = new Collection({
    type: "base", name: "members",
    fields: [famRel, rel("user", users), text("name", 30, { required: true }),
      { name: "kind", type: "select", values: ["adult", "kid"], maxSelect: 1, required: true },
      text("color", 9), text("birth_ym", 7), { name: "birth_day", type: "number", min: 1, max: 31, onlyInt: true },
      text("school", 60), text("size", 12), text("shoe", 8), text("work", 60), ...stamps],
    indexes: ["CREATE UNIQUE INDEX idx_members_user ON members (family, user) WHERE user != ''"],
  });
  app.save(members);

  const OWN = "family.members_via_family.user ?= @request.auth.id";
  const own = (c) => { c.listRule = OWN; c.viewRule = OWN; c.createRule = OWN; c.updateRule = OWN; c.deleteRule = OWN; return c; };
  const memberRel = (name) => rel(name, members);

  families.listRule = "members_via_family.user ?= @request.auth.id";
  families.viewRule = families.listRule;
  families.updateRule = families.listRule;
  app.save(families);
  // members: everyone in the family sees all; adding kids and editing is open to the family, joining only through an invite route
  members.listRule = OWN; members.viewRule = OWN; members.updateRule = OWN;
  members.createRule = OWN + " && @request.body.user:isset = false";
  members.deleteRule = OWN;
  app.save(members);

  app.save(new Collection({ // only used by routes, never through the API
    type: "base", name: "invites",
    fields: [famRel, text("token_hash", 64, { required: true }), memberRel("created_by"), { name: "expires", type: "date", required: true }, { name: "used", type: "date" }, ...stamps],
    indexes: ["CREATE UNIQUE INDEX idx_invites_hash ON invites (token_hash)"],
  }));

  app.save(own(new Collection({
    type: "base", name: "shop_items",
    fields: [famRel, text("name", 60, { required: true }), text("qty", 20), text("cat", 20), memberRel("added_by"), memberRel("done_by"),
      { name: "done", type: "bool" }, { name: "later", type: "bool" }, ...stamps],
  })));
  app.save(own(new Collection({
    type: "base", name: "shop_memory", // what was bought how often, learned aisles and aisle order
    fields: [famRel, { name: "history", type: "json", maxSize: 200000 }, { name: "learned", type: "json", maxSize: 50000 },
      { name: "rank", type: "json", maxSize: 5000 }, { name: "trips", type: "number", onlyInt: true }, ...stamps],
    indexes: ["CREATE UNIQUE INDEX idx_shop_memory_family ON shop_memory (family)"],
  })));
  app.save(own(new Collection({
    type: "base", name: "errands",
    fields: [famRel, text("title", 80, { required: true }), { name: "link", type: "url", onlyDomains: [], exceptDomains: [] }, memberRel("for_member"),
      text("price", 20), text("note", 140), { name: "state", type: "select", values: ["idee", "ja", "gekauft"], maxSelect: 1 }, memberRel("added_by"), ...stamps],
  })));
  app.save(own(new Collection({
    type: "base", name: "saved_offers", // snapshot keeps it readable and lets the calendar feed work without the offer file
    fields: [famRel, text("offer_id", 40, { required: true }), { name: "snap", type: "json", maxSize: 5000 }, memberRel("saved_by"), ...stamps],
    indexes: ["CREATE UNIQUE INDEX idx_saved_offers ON saved_offers (family, offer_id)"],
  })));
  app.save(own(new Collection({
    type: "base", name: "saved_places",
    fields: [famRel, text("place_id", 40, { required: true }), memberRel("saved_by"), ...stamps],
    indexes: ["CREATE UNIQUE INDEX idx_saved_places ON saved_places (family, place_id)"],
  })));
  app.save(own(new Collection({
    type: "base", name: "visits",
    fields: [famRel, text("offer_id", 40, { required: true }), text("day", 10, { required: true }), memberRel("added_by"), ...stamps],
    indexes: ["CREATE UNIQUE INDEX idx_visits ON visits (family, offer_id, day)"],
  })));

  // "Wo seid ihr?": a request and at most one answer with a position; only the two people involved see it, deleted after 24 hours
  const pings = new Collection({
    type: "base", name: "pings",
    fields: [famRel, memberRel("from"), memberRel("to"), { name: "answered", type: "date" },
      { name: "lat", type: "number" }, { name: "lon", type: "number" }, { name: "accuracy", type: "number" }, ...stamps],
  });
  const BOTH = "from.user = @request.auth.id || to.user = @request.auth.id";
  pings.listRule = BOTH; pings.viewRule = BOTH;
  pings.createRule = "from.user = @request.auth.id && " + OWN;
  pings.updateRule = "to.user = @request.auth.id";
  pings.deleteRule = BOTH;
  app.save(pings);
}, (app) => {
  for (const name of ["pings", "visits", "saved_places", "saved_offers", "errands", "shop_memory", "shop_items", "invites", "members", "families"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) { /* already gone */ }
  }
});
