/// <reference path="../pb_data/types.d.ts" />
// Account fields for the app:
// - join_token: the invite a person signed up with, kept until the join is done (also when the confirm link opens on another
//   device). Only the owner reads it (users rules); it can be cleared but not changed later, and /api/djuu/join clears it.
// - terms_version / terms_accepted: which terms were accepted on sign-up; set only then (the server notes the time itself,
//   see djuu.pb.js), never changed afterwards through the API.
// - ev_prefs: the person's Termine preferences (hidden topics, providers and series, mode, home area), like news_prefs.
// - The sign-in alert names the page "Konto" (the app's page title).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "join_token", max: 64, pattern: "^[A-Za-z0-9]*$" }));
  users.fields.add(new TextField({ name: "terms_version", max: 20 }));
  users.fields.add(new DateField({ name: "terms_accepted" }));
  users.fields.add(new JSONField({ name: "ev_prefs", maxSize: 8000 }));
  users.updateRule = "id = @request.auth.id && @request.body.member:isset = false" +
    " && @request.body.terms_version:isset = false && @request.body.terms_accepted:isset = false" +
    " && (@request.body.join_token:isset = false || @request.body.join_token = '')";
  users.authAlert.emailTemplate.body = users.authAlert.emailTemplate.body.split("Wir → Konto &amp; Anmeldung → Passwort ändern").join("Wir → Konto → Passwort ändern");
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["join_token", "terms_version", "terms_accepted", "ev_prefs"]) users.fields.removeByName(f);
  users.updateRule = "id = @request.auth.id && @request.body.member:isset = false";
  app.save(users);
});
