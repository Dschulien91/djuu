/// <reference path="../pb_data/types.d.ts" />
// Children: birth date as year, year and month, or full date (birth_ym holds "YYYY" or "YYYY-MM", birth_day the day).
// birth_approx marks a birth year that was worked out from an age entered earlier ("ca.").
// The day is kept only when it was entered (for birthday reminders later). Helpers never see these fields:
// the members rules hide children from them and /api/djuu/kids tells them name and age only.
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  members.fields.add(new BoolField({ name: "birth_approx" }));
  app.save(members);
}, (app) => {
  const members = app.findCollectionByNameOrId("members");
  members.fields.removeByName("birth_approx");
  app.save(members);
});
