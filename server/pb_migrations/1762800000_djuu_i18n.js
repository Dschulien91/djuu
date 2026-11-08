/// <reference path="../pb_data/types.d.ts" />
// Login e-mail in German and English; admin-only settings (e.g. the Anthropic key for translating event titles).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.otp.emailTemplate.subject = "Dein Djuu-Code · Your Djuu code: {OTP}";
  users.otp.emailTemplate.body = `<p>Hallo,</p>
<p>dein Code für Djuu lautet:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">{OTP}</p>
<p>Er gilt 10 Minuten. Wenn du ihn nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.</p>
<hr style="border:0;border-top:1px solid #E4DFF5;margin:24px 0">
<p>Hello,</p>
<p>your Djuu code is <b>{OTP}</b>. It is valid for 10 minutes. If you didn’t ask for it, you can simply ignore this email.</p>
<p>Viele Grüße · Best wishes<br>Djuu</p>`;
  app.save(users);

  // only superusers can see and change these (all API rules empty = locked)
  const settings = new Collection({
    type: "base", name: "djuu_settings",
    fields: [{ name: "key", type: "text", required: true, max: 60 }, { name: "value", type: "text", max: 500 }, { name: "note", type: "text", max: 300 }],
    indexes: ["CREATE UNIQUE INDEX idx_djuu_settings_key ON djuu_settings (key)"],
  });
  app.save(settings);
  const r = new Record(settings);
  r.set("key", "anthropic_api_key");
  r.set("value", "");
  r.set("note", "Schlüssel von console.anthropic.com für die nächtliche Übersetzung der Termintitel. Leer = Titel bleiben deutsch.");
  app.save(r);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("djuu_settings")); } catch (e) { /* already gone */ }
});
