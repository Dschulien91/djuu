/// <reference path="../pb_data/types.d.ts" />
// Photos and colours: everyone changes their own; the admin also those of children, dogs, helpers and people without an account.
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  const ME = "@request.auth.member";
  const SAME = `family = ${ME}.family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const managed = ["user", "grp", "is_admin", "access_until", "email", "perm_shop", "perm_errands", "perm_cal", "perm_saved"].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  const looks = `((@request.body.photo:changed = false && @request.body.color:changed = false) || id = ${ME}.id || (${ME}.is_admin = true && (user = '' || grp = 'helper')))`;
  members.updateRule = `${SAME} && ${managed} && (${ME}.is_admin = true || id = ${ME}.id || (${ME}.grp = 'family' && kind != 'adult')) && ${looks}`;
  app.save(members);
}, (app) => { /* the rule of 1763300000 stays usable */ });
