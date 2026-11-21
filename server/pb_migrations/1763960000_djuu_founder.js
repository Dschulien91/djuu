/// <reference path="../pb_data/types.d.ts" />
// Founder and e-mail privacy (21 Nov 2026, Julian's decisions):
// - families.founder: the person who created the Wir. Nobody can remove them, nobody can take away their admin role;
//   they can hand it over themselves (POST /api/djuu/founder). Set by /api/djuu/family, never through the records API.
//   Existing Wirs: the oldest admin (with an account, if there is one) becomes the founder.
// - members.email is hidden: helpers (and everyone else) no longer read the adults' e-mail addresses through the API.
//   Admins get them through GET /api/djuu/emails, everyone their own (see pb_hooks/djuu_account.pb.js).
migrate((app) => {
  const families = app.findCollectionByNameOrId("families");
  const members = app.findCollectionByNameOrId("members");
  families.fields.add(new RelationField({ name: "founder", collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  const fixed = "@request.body.founder:isset = false";
  families.updateRule = families.updateRule ? `(${families.updateRule}) && ${fixed}` : null;
  families.createRule = families.createRule ? `(${families.createRule}) && ${fixed}` : null;
  app.save(families);

  members.fields.getByName("email").hidden = true;
  app.save(members);

  for (const fam of app.findRecordsByFilter("families", "founder = ''", "", 0, 0)) {
    const admins = app.findRecordsByFilter("members", "family = {:f} && is_admin = true", "created", 0, 0, { f: fam.id });
    const pick = admins.find((m) => m.getString("user")) || admins[0];
    if (!pick) continue;
    fam.set("founder", pick.id);
    app.saveNoValidate(fam);
  }
}, (app) => {
  const families = app.findCollectionByNameOrId("families");
  families.fields.removeByName("founder");
  const strip = (r) => (r ? r.replace(/^\((.*)\) && @request\.body\.founder:isset = false$/, "$1") : r);
  families.updateRule = strip(families.updateRule);
  families.createRule = strip(families.createRule);
  app.save(families);
  const members = app.findCollectionByNameOrId("members");
  members.fields.getByName("email").hidden = false;
  app.save(members);
});
