/// <reference path="../pb_data/types.d.ts" />
// The confirmation link lives 3 days, as its mail says (PocketBase's default was 1 day).
// The "login from a new place" alert in German and English, in the style of the other Djuu mails ({ALERT_INFO} = device and address).
// The sender name and address stay as set in the dashboard (Settings → Mail settings).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.verificationToken.duration = 3 * 24 * 3600;
  users.authAlert.enabled = true;
  users.authAlert.emailTemplate.subject = "Neue Anmeldung bei Djuu · New sign-in to Djuu";
  users.authAlert.emailTemplate.body = `<p>Hallo,</p>
<p>dein Djuu-Konto wurde gerade auf einem neuen Gerät oder an einem neuen Ort angemeldet:</p>
<p style="color:#4B5078;font-size:13px"><em>{ALERT_INFO}</em></p>
<p>Wenn du das warst, ist alles in Ordnung.</p>
<p><b>Wenn du das nicht warst, wähle bitte gleich ein neues Passwort</b> (in Djuu unter Wir → Konto → Passwort ändern, oder über „Passwort vergessen?“). Dann werden alle anderen Anmeldungen beendet.</p>
<hr style="border:0;border-top:1px solid #E4DFF5;margin:24px 0">
<p>Hello,</p>
<p>your Djuu account was just signed in on a new device or from a new place: <em>{ALERT_INFO}</em></p>
<p>If this was you, everything is fine. <b>If it wasn’t you, please choose a new password right away</b> (in Djuu under Wir → Konto → Passwort ändern, or with “Passwort vergessen?”). This ends all other sign-ins.</p>
<p>Viele Grüße · Best wishes<br>Djuu</p>`;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.verificationToken.duration = 24 * 3600;
  app.save(users);
});
