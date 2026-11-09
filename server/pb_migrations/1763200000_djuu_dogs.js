/// <reference path="../pb_data/types.d.ts" />
// Dogs are entries of the Wir (members with kind "dog"); a name is optional, nothing else is stored.
// Like children, the family group adds and changes them; helpers do not see them (members rules: helpers see adults only).
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  const kind = members.fields.getByName("kind");
  kind.values = ["adult", "kid", "dog"];
  members.fields.getByName("name").required = false; // a dog may have no name; people always get one from the app
  const ME = "@request.auth.member";
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "perm_shop", "perm_errands", "perm_cal", "perm_saved"].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  members.createRule = `@request.body.family = ${ME}.family && ${managed} && (${ME}.is_admin = true || (${ME}.grp = 'family' && (@request.body.kind = 'kid' || @request.body.kind = 'dog')))`;
  members.updateRule = `${SAME} && ${managed} && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult'))`;
  members.deleteRule = `${SAME} && user = '' && (${ME}.is_admin = true || (${ME}.grp = 'family' && kind != 'adult'))`;
  app.save(members);
}, (app) => {
  const members = app.findCollectionByNameOrId("members");
  members.fields.getByName("kind").values = ["adult", "kid"];
  members.fields.getByName("name").required = true;
  app.save(members);
});
