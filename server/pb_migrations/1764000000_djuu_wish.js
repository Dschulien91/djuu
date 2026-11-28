/// <reference path="../pb_data/types.d.ts" />
// Wunschlisten (28 Nov 2026): gift wish lists in Wir › Listen.
// - lists.kind gets 'wish' (the old values stay, so every existing list stays valid). Access like shopping and packing lists:
//   every kind other than 'todo' follows "Einkauf" (perm_shop), so the rules' byKind()/area() need no change for 'wish'.
//   New list fields (empty on other kinds): kid (a child of the same Wir; empty = for the whole family), occasion
//   ('xmas', 'birthday', 'other') with occasion_name (free name for 'other', e.g. "Taufe"), date ('YYYY-MM-DD', optional),
//   avoid ("Bitte nicht", shown on top of the list) and surprise (the app shows only "vergeben" to everyone but the person
//   who added a giver; a display rule, not a security boundary).
// - shop_items get link (https only, checked in pb_hooks/djuu_wish.pb.js), price (free text), note, prio ("wünscht sich
//   sehr"), givers (JSON, at most 6 of { name, member, by, at }: member = the giver when they are in the Wir, by = who
//   entered it; cleaned by the hook) and wish_state ('' open, 'received', 'gone' = no longer needed, kept). On wish lists
//   `done` means "Danke gesagt".
// - members.size / members.shoe (the children's clothes and shoe sizes, since 1762500000) take up to 20 characters. Same
//   rules as before (whoever may edit the child); helpers get them through /api/djuu/kids (they are not birth data).
// - Push topic 'wish' (djuu_push.js TOPICS): a reminder 42 days before a child's birthday and on 1 November, for the adults
//   of a Wir who switched it on (daily cron in djuu_wish.pb.js).
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const FIXED = "@request.body.family:changed = false";
  const rd = (p) => `${ME}.${p} != 'none' && ${ME}.${p} != ''`;
  const ed = (p) => `${ME}.${p} = 'edit'`;
  const DAY = "^(\\d{4}-\\d{2}-\\d{2})?$";
  // the child of a wish list: empty, or a child of the same Wir
  const kidOk = "(@request.body.kid:isset = false || @request.body.kid = '' || (@request.body.kid.family = family && @request.body.kid.kind = 'kid'))";

  // ---------- lists ----------
  const lists = app.findCollectionByNameOrId("lists");
  lists.fields.getByName("kind").values = ["shop", "todo", "pack", "wish"];
  lists.fields.add(new RelationField({ name: "kid", collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  lists.fields.add(new SelectField({ name: "occasion", values: ["xmas", "birthday", "other"], maxSelect: 1 }));
  lists.fields.add(new TextField({ name: "occasion_name", max: 40 }));
  lists.fields.add(new TextField({ name: "date", max: 10, pattern: DAY }));
  lists.fields.add(new TextField({ name: "avoid", max: 300 }));
  lists.fields.add(new BoolField({ name: "surprise" }));
  const byKind = (k, how) => `((${k} != 'todo' && ${how("perm_shop")}) || (${k} = 'todo' && ${how("perm_errands")}))`;
  lists.listRule = `${ACTIVE} && ${byKind("kind", rd)}`;
  lists.viewRule = lists.listRule;
  lists.createRule = `${ACTIVE} && ${byKind("@request.body.kind", ed)} && ${kidOk}`;
  lists.updateRule = `${ACTIVE} && ${FIXED} && @request.body.kind:changed = false && ${byKind("kind", ed)} && ${kidOk}`;
  lists.deleteRule = `${ACTIVE} && ${byKind("kind", ed)}`;
  app.save(lists);

  // ---------- entries ----------
  const items = app.findCollectionByNameOrId("shop_items");
  items.fields.add(new TextField({ name: "link", max: 500 }));
  items.fields.add(new TextField({ name: "price", max: 30 }));
  items.fields.add(new TextField({ name: "note", max: 200 }));
  items.fields.add(new BoolField({ name: "prio" }));
  items.fields.add(new JSONField({ name: "givers", maxSize: 2000 }));
  items.fields.add(new SelectField({ name: "wish_state", values: ["received", "gone"], maxSelect: 1 }));
  app.save(items);

  // ---------- children's sizes ----------
  members.fields.getByName("size").max = 20;
  members.fields.getByName("shoe").max = 20;
  app.save(members);
}, (app) => {
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const FIXED = "@request.body.family:changed = false";
  const rd = (p) => `${ME}.${p} != 'none' && ${ME}.${p} != ''`;
  const ed = (p) => `${ME}.${p} = 'edit'`;
  // wish lists become shopping lists (their entries stay), so no record is left with a kind the field no longer knows
  for (const l of app.findRecordsByFilter("lists", "kind = 'wish'", "", 0, 0)) { l.set("kind", "shop"); app.saveNoValidate(l); }
  const lists = app.findCollectionByNameOrId("lists");
  for (const f of ["kid", "occasion", "occasion_name", "date", "avoid", "surprise"]) lists.fields.removeByName(f);
  lists.fields.getByName("kind").values = ["shop", "todo", "pack"];
  const byKind = (k, how) => `((${k} != 'todo' && ${how("perm_shop")}) || (${k} = 'todo' && ${how("perm_errands")}))`;
  lists.listRule = `${ACTIVE} && ${byKind("kind", rd)}`;
  lists.viewRule = lists.listRule;
  lists.createRule = `${ACTIVE} && ${byKind("@request.body.kind", ed)}`;
  lists.updateRule = `${ACTIVE} && ${FIXED} && @request.body.kind:changed = false && ${byKind("kind", ed)}`;
  lists.deleteRule = `${ACTIVE} && ${byKind("kind", ed)}`;
  app.save(lists);
  const items = app.findCollectionByNameOrId("shop_items");
  for (const f of ["link", "price", "note", "prio", "givers", "wish_state"]) items.fields.removeByName(f);
  app.save(items);
  // sizes back to 12 / 8 characters (longer values are cut, so the records stay valid)
  for (const m of app.findRecordsByFilter("members", "size != '' || shoe != ''", "", 0, 0)) {
    if (m.getString("size").length <= 12 && m.getString("shoe").length <= 8) continue;
    m.set("size", m.getString("size").slice(0, 12)); m.set("shoe", m.getString("shoe").slice(0, 8)); app.saveNoValidate(m);
  }
  const members = app.findCollectionByNameOrId("members");
  members.fields.getByName("size").max = 12;
  members.fields.getByName("shoe").max = 8;
  app.save(members);
});
