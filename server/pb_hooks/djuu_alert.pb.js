/// <reference path="../pb_data/types.d.ts" />
// Failure alerts of the nightly jobs (server/alert.py, started by systemd OnFailure= and by refresh.sh when far fewer offers
// or places were published than the day before). Superusers only; the mail goes to the calling superuser's own address
// through PocketBase's mailer (Settings → Mail settings). At most 20 alerts a day. { dry: true } checks without sending.
routerAdd("POST", "/api/djuu/alert", (e) => {
  const body = e.requestInfo().body || {};
  const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
  const subject = clean(body.subject, 150).replace(/[\r\n]+/g, " ").trim();
  const text = clean(body.text, 20000);
  if (!subject) return e.json(400, { status: 400, code: "subject_required", message: "subject fehlt.", data: {} });
  const to = e.auth.email();
  if (body.dry) return e.json(200, { ok: true, dry: true, to: to.replace(/^(.).*(@.*)$/, "$1…$2") });
  const store = e.app.store(), key = "alerts:" + new Date().toISOString().slice(0, 10), n = (store.get(key) || 0) + 1;
  if (n > 20) return e.json(429, { status: 429, code: "limit", message: "Für heute sind genug Warnungen verschickt.", data: {} });
  store.set(key, n);
  const meta = e.app.settings().meta;
  const html = "<pre style=\"font:13px/1.45 monospace;white-space:pre-wrap\">" + text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre>";
  try {
    e.app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName || "Djuu" },
      to: [{ address: to }],
      subject: "[Djuu] " + subject,
      html,
      text,
    }));
  } catch (x) {
    e.app.logger().error("djuu alert mail", "error", String(x));
    return e.json(502, { status: 502, code: "mail_failed", message: "Die Mail konnte nicht verschickt werden.", data: {} });
  }
  return e.json(200, { ok: true });
}, $apis.requireSuperuserAuth());
