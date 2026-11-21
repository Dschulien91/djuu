/// <reference path="../pb_data/types.d.ts" />
// Wir, round 2 (21 Nov 2026):
// - More lists (`lists`): more shopping lists besides the main one (e.g. "Drogerie"), to-do lists and packing lists.
//   Their entries are shop_items with `list` (empty = the main shopping list, as before), to-dos also with `assignee`
//   and `due` ('YYYY-MM-DD'). Access: shopping and packing lists follow "Einkauf" (perm_shop), to-do lists follow
//   "Besorgungen" (perm_errands): 'view' reads, 'edit' writes. A list's kind and an entry's list are fixed after create.
// - Emergency information per child for helpers (`kid_care`): allergies, medicines, doctor, notes, emergency contacts.
//   Only admins write it, and only with consent (consent_by = the admin saving it; the server notes consent_at itself,
//   see pb_hooks/djuu_family.pb.js). Readable by every active adult of the Wir (family and helpers), so a babysitter has it.
//   Health data (Art. 9 GDPR): see NOTES for the legal text that has to cover it.
// - Single occurrences of a repeating calendar entry (`cal_entries.changes`): { "YYYY-MM-DD": { del: true } } removes one,
//   { "YYYY-MM-DD": { date, title, from, to, place, who, note } } changes one (only the given fields). Changed day by day
//   through /api/djuu/cal-take (pb_hooks/djuu_cal.pb.js), like the taken-over days in `overrides`.
// - `members.follow_lists`: the lists a person follows for push messages (list ids, 'main' = the main shopping list).
//   Only the person changes it (hook).
migrate((app) => {
  const families = app.findCollectionByNameOrId("families");
  const members = app.findCollectionByNameOrId("members");
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const FIXED = "@request.body.family:changed = false";
  const rd = (p) => `${ME}.${p} != 'none' && ${ME}.${p} != ''`;
  const ed = (p) => `${ME}.${p} = 'edit'`;
  const sameWir = (f) => `(@request.body.${f}:isset = false || @request.body.${f} = '' || @request.body.${f}.family = family)`;
  const DAY = "^(\\d{4}-\\d{2}-\\d{2})?$";

  // ---------- lists ----------
  const lists = new Collection({
    type: "base", name: "lists",
    fields: [
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "name", type: "text", max: 40, required: true },
      { name: "kind", type: "select", values: ["shop", "todo", "pack"], maxSelect: 1, required: true },
      { name: "sort", type: "number" },
      { name: "archived", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_lists_family ON lists (family)"],
  });
  const byKind = (k, how) => `((${k} != 'todo' && ${how("perm_shop")}) || (${k} = 'todo' && ${how("perm_errands")}))`;
  lists.listRule = `${ACTIVE} && ${byKind("kind", rd)}`;
  lists.viewRule = lists.listRule;
  lists.createRule = `${ACTIVE} && ${byKind("@request.body.kind", ed)}`;
  lists.updateRule = `${ACTIVE} && ${FIXED} && @request.body.kind:changed = false && ${byKind("kind", ed)}`;
  lists.deleteRule = `${ACTIVE} && ${byKind("kind", ed)}`;
  app.save(lists);

  // ---------- entries of the lists: shop_items ----------
  const items = app.findCollectionByNameOrId("shop_items");
  items.fields.add(new RelationField({ name: "list", collectionId: lists.id, maxSelect: 1, cascadeDelete: true }));
  items.fields.add(new RelationField({ name: "assignee", collectionId: members.id, maxSelect: 1, cascadeDelete: false }));
  items.fields.add(new TextField({ name: "due", max: 10, pattern: DAY }));
  // which area an entry belongs to: the main list and shopping/packing lists "Einkauf", to-do lists "Besorgungen"
  const area = (l, how) => `(((${l} = '' || ${l}.kind != 'todo') && ${how("perm_shop")}) || (${l}.kind = 'todo' && ${how("perm_errands")}))`;
  const bodyArea = `(((@request.body.list:isset = false || @request.body.list = '' || @request.body.list.kind != 'todo') && ${ed("perm_shop")}) || (@request.body.list.kind = 'todo' && ${ed("perm_errands")}))`;
  const rels = ["list", "added_by", "done_by", "assignee"].map(sameWir).join(" && ");
  items.listRule = `${ACTIVE} && ${area("list", rd)}`;
  items.viewRule = items.listRule;
  items.createRule = `${ACTIVE} && ${rels} && ${bodyArea}`;
  items.updateRule = `${ACTIVE} && ${FIXED} && @request.body.list:changed = false && ${rels} && ${area("list", ed)}`;
  items.deleteRule = `${ACTIVE} && ${area("list", ed)}`;
  app.save(items);

  // ---------- emergency information per child ----------
  const care = new Collection({
    type: "base", name: "kid_care",
    fields: [
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "kid", type: "relation", collectionId: members.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "allergies", type: "text", max: 300 },
      { name: "meds", type: "text", max: 300 },
      { name: "doctor", type: "text", max: 200 },
      { name: "notes", type: "text", max: 500 },
      { name: "emergency_contacts", type: "json", maxSize: 2000 },
      { name: "consent_by", type: "relation", collectionId: members.id, maxSelect: 1, cascadeDelete: false },
      { name: "consent_at", type: "date" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_kid_care_kid ON kid_care (kid)"],
  });
  const ADMIN = `${ACTIVE} && ${ME}.is_admin = true`;
  care.listRule = `${ACTIVE} && (${ME}.is_admin = true || ${ME}.grp = 'family' || ${ME}.grp = 'helper')`;
  care.viewRule = care.listRule;
  care.createRule = `${ADMIN} && @request.body.kid.family = family && @request.body.kid.kind = 'kid' && @request.body.consent_by = ${ME}`;
  care.updateRule = `${ADMIN} && ${FIXED} && @request.body.kid:changed = false && @request.body.consent_by = ${ME}`;
  care.deleteRule = ADMIN;
  app.save(care);

  // ---------- single occurrences of repeating calendar entries ----------
  const cal = app.findCollectionByNameOrId("cal_entries");
  cal.fields.add(new JSONField({ name: "changes", maxSize: 20000 }));
  app.save(cal);

  // ---------- lists a person follows (push) ----------
  members.fields.add(new JSONField({ name: "follow_lists", maxSize: 2000 }));
  app.save(members);
}, (app) => {
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const sameWir = (f) => `(@request.body.${f}:isset = false || @request.body.${f} = '' || @request.body.${f}.family = family)`;
  const items = app.findCollectionByNameOrId("shop_items");
  for (const f of ["list", "assignee", "due"]) items.fields.removeByName(f);
  const relOk = ["added_by", "done_by"].map((f) => " && " + sameWir(f)).join("");
  items.listRule = `${ACTIVE} && ${ME}.perm_shop != 'none' && ${ME}.perm_shop != ''`; items.viewRule = items.listRule;
  items.createRule = `${ACTIVE} && ${ME}.perm_shop = 'edit'` + relOk;
  items.updateRule = `${ACTIVE} && ${ME}.perm_shop = 'edit' && @request.body.family:changed = false` + relOk;
  items.deleteRule = `${ACTIVE} && ${ME}.perm_shop = 'edit'`;
  app.save(items);
  for (const n of ["lists", "kid_care"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (e) { /* gone */ } }
  const cal = app.findCollectionByNameOrId("cal_entries"); cal.fields.removeByName("changes"); app.save(cal);
  const members = app.findCollectionByNameOrId("members"); members.fields.removeByName("follow_lists"); app.save(members);
});
