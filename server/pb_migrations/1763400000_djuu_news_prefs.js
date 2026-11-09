/// <reference path="../pb_data/types.d.ts" />
// Which news topics a person switched off ({ off: ["shop", ...] }). Personal: stored with the account, so it holds on
// every phone of that person, and only that person reads or changes it (users rules: own record only).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new JSONField({ name: "news_prefs", maxSize: 2000 }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("news_prefs");
  app.save(users);
});
