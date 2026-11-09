/// <reference path="../pb_data/types.d.ts" />
// Sign-in with e-mail and password (at least 8 characters) instead of an e-mail code.
// The account works only after the e-mail address is confirmed with the link from the confirmation mail.
// All links in the mails open the app (djuu.de), which finishes the step. Mails in German and English.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.passwordAuth.enabled = true;
  users.passwordAuth.identityFields = ["email"];
  users.otp.enabled = false;
  users.authRule = "verified = true";
  users.fields.getByName("password").min = 8;

  const mail = (de, button, url, en, enButton, note, enNote) => `<p>Hallo,</p>
<p>${de}</p>
<p style="margin:22px 0"><a href="${url}" style="background:#6B4EE6;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">${button}</a></p>
<p style="color:#4B5078;font-size:13px">${note}</p>
<hr style="border:0;border-top:1px solid #E4DFF5;margin:24px 0">
<p>Hello,</p>
<p>${en} <a href="${url}">${enButton}</a></p>
<p style="color:#4B5078;font-size:13px">${enNote}</p>
<p>Viele Grüße · Best wishes<br>Djuu</p>`;

  users.verificationTemplate.subject = "Bestätige deine E-Mail für Djuu · Confirm your email";
  users.verificationTemplate.body = mail(
    "schön, dass du da bist. Bitte bestätige deine E-Mail-Adresse, dann ist dein Djuu-Konto aktiv.", "E-Mail bestätigen", "https://djuu.de/#verify={TOKEN}",
    "please confirm your email address to activate your Djuu account:", "Confirm email",
    "Der Link gilt 3 Tage. Wenn du kein Konto angelegt hast, ignoriere diese E-Mail einfach.", "The link is valid for 3 days. If you didn’t create an account, simply ignore this email.");
  users.resetPasswordTemplate.subject = "Neues Passwort für Djuu · New password";
  users.resetPasswordTemplate.body = mail(
    "du möchtest ein neues Passwort für Djuu. Tippe auf den Knopf und wähle eins.", "Neues Passwort wählen", "https://djuu.de/#reset={TOKEN}",
    "to choose a new password for Djuu, open this link:", "Choose a new password",
    "Der Link gilt 30 Minuten. Wenn du das nicht warst, ignoriere diese E-Mail. Dein Passwort bleibt dann gleich.", "The link is valid for 30 minutes. If this wasn’t you, ignore this email and your password stays the same.");
  users.confirmEmailChangeTemplate.subject = "Neue E-Mail für Djuu bestätigen · Confirm your new email";
  users.confirmEmailChangeTemplate.body = mail(
    "bitte bestätige, dass Djuu ab jetzt diese E-Mail-Adresse verwenden soll.", "Neue E-Mail bestätigen", "https://djuu.de/#email={TOKEN}",
    "please confirm that Djuu should use this email address from now on:", "Confirm new email",
    "Wenn du das nicht warst, ignoriere diese E-Mail. Dann ändert sich nichts.", "If this wasn’t you, ignore this email and nothing changes.");
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.otp.enabled = true;
  users.passwordAuth.enabled = false;
  users.authRule = "";
  app.save(users);
});
