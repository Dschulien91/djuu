/// <reference path="../pb_data/types.d.ts" />
// The family calendar (Wir › Kalender, app cal.js): own entries of the Wir, Bringen/Abholen with a weekly plan and days
// someone else takes over ("overrides": { "YYYY-MM-DD": member id }), and Kita-Schließtage per child (kind "closed",
// date to end_date). Birthdays are not stored here: they come from the children's birth dates (family group only).
// Access follows the area "Kalender" (perm_cal): 'view' reads, 'edit' adds, changes and deletes – the same pattern as the
// lists in 1763600000_djuu_harden.js: only active people of the Wir, `family` fixed after create, added_by inside the Wir.
// who / kids hold member ids of the same Wir (JSON lists; the app and the feed only show ids they find in that Wir).
migrate((app) => {
  const families = app.findCollectionByNameOrId("families");
  const members = app.findCollectionByNameOrId("members");
  const ME = "@request.auth.member";
  const ACTIVE = `${ME}.family = family && (${ME}.access_until = '' || ${ME}.access_until > @now)`;
  const canRead = `${ACTIVE} && ${ME}.perm_cal != 'none' && ${ME}.perm_cal != ''`;
  const canEdit = `${ACTIVE} && ${ME}.perm_cal = 'edit'`;
  const FIXED = "@request.body.family:changed = false";
  const sameWir = (f) => `(@request.body.${f}:isset = false || @request.body.${f} = '' || @request.body.${f}.family = family)`;
  const DAY = "^(\\d{4}-\\d{2}-\\d{2})?$", TIME = "^(([01]\\d|2[0-3]):[0-5]\\d)?$";

  const cal = new Collection({
    type: "base", name: "cal_entries",
    fields: [
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "kind", type: "select", values: ["event", "pickup", "dropoff", "closed"], maxSelect: 1, required: true },
      { name: "title", type: "text", max: 80 },
      { name: "date", type: "text", max: 10, required: true, pattern: DAY },
      { name: "end_date", type: "text", max: 10, pattern: DAY },
      { name: "time_from", type: "text", max: 5, pattern: TIME },
      { name: "time_to", type: "text", max: 5, pattern: TIME },
      { name: "repeat", type: "select", values: ["weekly", "biweekly", "monthly", "yearly"], maxSelect: 1 }, // empty: once
      { name: "until", type: "text", max: 10, pattern: DAY },
      { name: "who", type: "json", maxSize: 2000 },
      { name: "kids", type: "json", maxSize: 2000 },
      { name: "overrides", type: "json", maxSize: 20000 },
      { name: "plan", type: "text", max: 15 }, // the child of a weekly Abholplan (one entry per weekday)
      { name: "place", type: "text", max: 80 },
      { name: "alarm", type: "select", values: ["PT15M", "PT1H", "P1D"], maxSelect: 1 },
      { name: "note", type: "text", max: 200 },
      { name: "offer_id", type: "text", max: 40 }, // an event of the Termine the family goes to
      { name: "added_by", type: "relation", collectionId: members.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_cal_entries_family ON cal_entries (family, date)"],
  });
  cal.listRule = canRead;
  cal.viewRule = canRead;
  cal.createRule = `${canEdit} && ${sameWir("added_by")}`;
  cal.updateRule = `${canEdit} && ${FIXED} && ${sameWir("added_by")}`;
  cal.deleteRule = canEdit;
  app.save(cal);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("cal_entries")); } catch (e) { /* already gone */ }
});
