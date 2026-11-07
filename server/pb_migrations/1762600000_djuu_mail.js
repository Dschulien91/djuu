/// <reference path="../pb_data/types.d.ts" />
// German login e-mail, app name and address, 90-day sessions, and request limits against abuse.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.otp.emailTemplate.subject = "Dein Djuu-Code: {OTP}";
  users.otp.emailTemplate.body = `<p>Hallo,</p>
<p>dein Code für Djuu lautet:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">{OTP}</p>
<p>Er gilt 10 Minuten. Wenn du ihn nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.</p>
<p>Viele Grüße<br>Djuu</p>`;
  users.authToken.duration = 90 * 24 * 3600; // families should not have to log in again every week
  app.save(users);

  const s = app.settings();
  s.meta.appName = "Djuu";
  s.meta.appURL = "https://djuu.de";
  s.rateLimits.enabled = true;
  app.save(s);
}, (app) => {
  // nothing to undo: texts and limits can be changed in the dashboard
});
