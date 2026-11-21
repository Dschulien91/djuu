/// <reference path="../pb_data/types.d.ts" />
// Push messages (migration 1763970000; shared code in djuu_push.js). Topics, all off until switched on in the app:
// - cal: a reminder ("Erinnerung" = alarm) of a family calendar entry that involves me, at start minus the alarm;
// - pickup: a new Bringen/Abholen for me, someone takes over or changes one I was planned for, or it is cancelled;
// - lists: an entry added to a list I follow (queued by the lists hook, djuu_family.pb.js).
// The sender container (server/push/) polls POST /api/djuu/push/claim every 30 s from inside the server network with a
// secret (DJUU_PUSH_SECRET, a file on the server, never in the repo) and reports back through /api/djuu/push/done.
// Both routes answer 404 to anyone else, and the proxy does not forward them (see NOTES: Caddy).

// ---------- subscriptions: only https addresses of the known push services ----------
const pushSubCheck = (e) => {
  if (e.hasSuperuserAuth() || !e.auth) return e.next();
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const r = e.record, isNew = r.isNew();
    const bad = (code, msg) => u.fail(400, code, msg || "Mitteilungen konnten nicht eingerichtet werden.");
    const endpoint = r.getString("endpoint");
    const m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>\\]*)?$/.exec(endpoint);
    const HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;
    if (!m || !HOSTS.test(m[1]) || endpoint.length > 1000) throw bad("push_endpoint", "Dieser Browser bietet keine bekannten Mitteilungen an.");
    const keys = u.parseJson(toString(r.get("keys")));
    const B64 = /^[A-Za-z0-9_-]+=*$/;
    const p256dh = String(keys.p256dh || ""), auth = String(keys.auth || "");
    if (!B64.test(p256dh) || p256dh.length < 80 || p256dh.length > 100 || !B64.test(auth) || auth.length < 16 || auth.length > 32) throw bad("push_keys");
    r.set("keys", { p256dh, auth });
    let topics = [];
    try { topics = JSON.parse(toString(r.get("topics")) || "[]"); } catch (x) { throw bad("push_topics"); }
    if (!Array.isArray(topics) || topics.some((t) => !["cal", "pickup", "lists"].includes(t))) throw bad("push_topics");
    r.set("topics", [...new Set(topics)]);
    if (!["de", "en"].includes(r.getString("lang"))) r.set("lang", "de");
    if (isNew) {
      if (e.app.countRecords("push_subs", $dbx.hashExp({ user: e.auth.id })) >= 10) throw u.fail(400, "limit_reached", "Das Limit für diesen Bereich ist erreicht.");
      // The same browser signed in with another account before: the subscription moves to the account signed in now, but
      // only when the request proves it holds that browser subscription (the same secret `auth` key, which only the browser
      // and this server know). Someone who merely knows another person's endpoint address cannot take it over.
      for (const old of e.app.findRecordsByFilter("push_subs", "endpoint = {:p}", "", 5, 0, { p: endpoint })) {
        if (old.getString("user") !== e.auth.id && !$security.equal(String(u.parseJson(old.getString("keys")).auth || ""), auth)) {
          throw u.fail(400, "push_endpoint_taken", "Mitteilungen konnten nicht eingerichtet werden.");
        }
        e.app.delete(old);
      }
    }
    return e.next();
  });
};
onRecordCreateRequest(pushSubCheck, "push_subs");
onRecordUpdateRequest(pushSubCheck, "push_subs");
// the encryption keys of a subscription are never sent back (API answers, realtime)
onRecordEnrich((e) => {
  e.record.hide("keys");
  return e.next();
}, "push_subs");

// ---------- Bringen/Abholen: new, changed, taken over, cancelled ----------
// The person who changes something gets no message. Through the records API the hooks know them; the take-over route
// (djuu_cal.pb.js) may name them in the store key "djuu_actor:<entry id>", else the person now planned is assumed.
onRecordUpdateRequest((e) => {
  const key = "djuu_actor:" + e.record.id;
  try {
    const me = e.auth ? require(`${__hooks}/djuu_utils.js`).memberOf(e.app, e.auth.id) : null;
    if (me) e.app.store().set(key, me.id);
    return e.next();
  } finally { e.app.store().remove(key); }
}, "cal_entries");

onRecordUpdate((e) => {
  const p = require(`${__hooks}/djuu_push.js`);
  let before = null;
  try { before = p.entryOf(e.record.original()); } catch (x) { /* none */ }
  e.next();
  try {
    if (before) p.pickupChange(e.app, before, p.entryOf(e.record), String(e.app.store().get("djuu_actor:" + e.record.id) || ""));
  } catch (x) { e.app.logger().warn("djuu push pickup", "error", String(x)); }
}, "cal_entries");

onRecordCreateRequest((e) => {
  e.next();
  if (e.record.isNew()) return; // not saved (refused by a rule or a limit)
  try {
    const u = require(`${__hooks}/djuu_utils.js`), p = require(`${__hooks}/djuu_push.js`);
    const me = e.auth ? u.memberOf(e.app, e.auth.id) : null;
    p.pickupChange(e.app, null, p.entryOf(e.record), me ? me.id : "");
  } catch (x) { e.app.logger().warn("djuu push pickup", "error", String(x)); }
}, "cal_entries");

onRecordDeleteRequest((e) => {
  const p = require(`${__hooks}/djuu_push.js`);
  const before = p.entryOf(e.record);
  e.next();
  try { e.app.findRecordById("cal_entries", before.id); return; } catch (x) { /* deleted: go on */ }
  try {
    const me = e.auth ? require(`${__hooks}/djuu_utils.js`).memberOf(e.app, e.auth.id) : null;
    p.pickupChange(e.app, before, null, me ? me.id : "");
  } catch (x) { e.app.logger().warn("djuu push pickup", "error", String(x)); }
}, "cal_entries");

// ---------- the app: public key of the server ----------
routerAdd("GET", "/api/djuu/push/key", (e) => {
  const key = String($os.getenv("DJUU_VAPID_PUBLIC") || "");
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(key)) return e.json(503, { status: 503, code: "push_off", message: "Mitteilungen sind gerade nicht verfügbar.", data: {} });
  e.response.header().set("Cache-Control", "public, max-age=3600");
  return e.json(200, { key });
});

// ---------- the sender (inside the server network only) ----------
// claim: runs the alarm scan, then hands out due messages (at most 100) with the subscriptions they go to; a message is
// leased for 2 minutes (a crashed sender's messages come back) and tried at most 5 times.
routerAdd("POST", "/api/djuu/push/claim", (e) => {
  const s = String($os.getenv("DJUU_PUSH_SECRET") || "");
  if (s.length < 32 || e.request.header.get("X-Forwarded-For") || !$security.equal(String(e.request.header.get("X-Djuu-Push") || ""), s)) {
    return e.json(404, { status: 404, message: "The requested resource wasn't found.", data: {} });
  }
  const p = require(`${__hooks}/djuu_push.js`), u = require(`${__hooks}/djuu_utils.js`);
  try { p.scanAlarms(e.app, Date.now()); } catch (x) { e.app.logger().warn("djuu push alarms", "error", String(x)); }
  const now = Date.now(); // after the scan, so what it just queued is due now
  const due = e.app.findRecordsByFilter("push_queue", "sent = '' && send_after <= {:n} && tries < 5 && (lease = '' || lease < {:n})", "send_after", 100, 0, { n: p.pbTime(now) });
  const items = [];
  for (const q of due) {
    const subs = e.app.findRecordsByFilter("push_subs", "user = {:u}", "", 20, 0, { u: q.getString("user") }).filter((sub) => {
      let t = [];
      try { t = JSON.parse(sub.getString("topics") || "[]"); } catch (x) { /* none */ }
      return Array.isArray(t) && t.includes(q.getString("topic")) && (!q.getString("lang") || (sub.getString("lang") || "de") === q.getString("lang"));
    });
    if (!subs.length) { q.set("sent", new DateTime()); q.set("error", "no subscription"); e.app.save(q); continue; }
    q.set("tries", q.getInt("tries") + 1); q.set("lease", p.pbTime(now + 120e3));
    e.app.save(q);
    items.push({ id: q.id, topic: q.getString("topic"), title: q.getString("title"), body: q.getString("body"), url: q.getString("url"),
      subs: subs.map((sub) => { const k = u.parseJson(sub.getString("keys")); return { id: sub.id, endpoint: sub.getString("endpoint"), p256dh: k.p256dh || "", auth: k.auth || "" }; }) });
  }
  return e.json(200, { items });
});

// done: { sent: [queue ids], failed: [{ id, error }], gone: [subscription ids the push service no longer knows] }
routerAdd("POST", "/api/djuu/push/done", (e) => {
  const s = String($os.getenv("DJUU_PUSH_SECRET") || "");
  if (s.length < 32 || e.request.header.get("X-Forwarded-For") || !$security.equal(String(e.request.header.get("X-Djuu-Push") || ""), s)) {
    return e.json(404, { status: 404, message: "The requested resource wasn't found.", data: {} });
  }
  const body = e.requestInfo().body || {};
  const list = (v) => (Array.isArray(v) ? v.slice(0, 500) : []);
  let n = 0;
  for (const id of list(body.sent)) { try { const q = e.app.findRecordById("push_queue", String(id)); q.set("sent", new DateTime()); q.set("lease", ""); e.app.save(q); n++; } catch (x) { /* gone */ } }
  for (const f of list(body.failed)) { try { const q = e.app.findRecordById("push_queue", String(f && f.id)); q.set("error", String((f && f.error) || "").slice(0, 200)); q.set("lease", ""); e.app.save(q); } catch (x) { /* gone */ } }
  for (const id of list(body.gone)) { try { e.app.delete(e.app.findRecordById("push_subs", String(id))); } catch (x) { /* gone */ } }
  return e.json(200, { ok: true, n });
});

// sent messages are kept 7 days, unsent ones 3 days, then deleted
cronAdd("djuu_push_cleanup", "53 3 * * *", () => {
  const t = (d) => new DateTime().addDate(0, 0, -d).string();
  $app.db().newQuery("DELETE FROM push_queue WHERE (sent != '' AND sent < {:a}) OR created < {:b}").bind({ a: t(7), b: t(3) }).execute();
});
