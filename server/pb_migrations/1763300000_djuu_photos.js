/// <reference path="../pb_data/types.d.ts" />
// Photos and colours: the Wir has a photo (everyone in the Wir sees it, only the admin changes it),
// every person may have a photo and a colour. Photos are small round JPEGs (at most 512 px) kept as data URLs.
// Who sees a person's photo follows the members rules: children and dogs are never sent to helpers.
// Each adult with an account changes only their own photo and colour; for children, dogs and people without
// an account the admin does (dogs also the family group). No face recognition, nothing is passed on.
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  members.fields.add(new TextField({ name: "photo", max: 200000 }));
  const ME = "@request.auth.member";
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "perm_shop", "perm_errands", "perm_cal", "perm_saved"].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  const looks = `((@request.body.photo:changed = false && @request.body.color:changed = false) || id = ${ME}.id || (user = '' && (${ME}.is_admin = true || (${ME}.grp = 'family' && kind = 'dog'))))`;
  members.updateRule = `${SAME} && ${managed} && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult')) && ${looks}`;
  app.save(members);

  const families = app.findCollectionByNameOrId("families");
  families.fields.add(new TextField({ name: "photo", max: 200000 }));
  app.save(families);
}, (app) => {
  const members = app.findCollectionByNameOrId("members");
  members.fields.removeByName("photo");
  app.save(members);
  const families = app.findCollectionByNameOrId("families");
  families.fields.removeByName("photo");
  app.save(families);
});
