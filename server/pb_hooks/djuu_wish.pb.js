/// <reference path="../pb_data/types.d.ts" />
// Wunschlisten (migration 1764000000; shared code in djuu_wish.js).
// - The wish fields of list entries are checked on every save through the API: link https only, givers cleaned
//   (at most 6, people only from the same Wir).
// - Push topic 'wish': a daily job queues the reminders (42 days before a child's birthday, 1 November). The sender
//   container needs no change: it sends whatever topic the queue holds.
// - POST /api/djuu/push/wish-scan { today?: 'YYYY-MM-DD' }: runs the same scan for one day, for the tests. Only with the
//   sender's secret and not through the proxy, like /api/djuu/push/claim (404 for everyone else).

const wishItemCheck = (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => { require(`${__hooks}/djuu_wish.js`).cleanItem(e.app, e.record); return e.next(); });
};
onRecordCreateRequest(wishItemCheck, "shop_items");
onRecordUpdateRequest(wishItemCheck, "shop_items");

// 08:07 UTC = 09:07 / 10:07 in Hamburg
cronAdd("djuu_wish_remind", "7 8 * * *", () => {
  try {
    const p = require(`${__hooks}/djuu_push.js`);
    require(`${__hooks}/djuu_wish.js`).wishScan($app, p.hamburgYmd(Date.now()));
  } catch (x) { $app.logger().warn("djuu wish reminders", "error", String(x)); }
});

routerAdd("POST", "/api/djuu/push/wish-scan", (e) => {
  const s = String($os.getenv("DJUU_PUSH_SECRET") || "");
  if (s.length < 32 || e.request.header.get("X-Forwarded-For") || !$security.equal(String(e.request.header.get("X-Djuu-Push") || ""), s)) {
    return e.json(404, { status: 404, message: "The requested resource wasn't found.", data: {} });
  }
  const p = require(`${__hooks}/djuu_push.js`);
  const body = e.requestInfo().body || {};
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today || "")) ? String(body.today) : p.hamburgYmd(Date.now());
  return e.json(200, { n: require(`${__hooks}/djuu_wish.js`).wishScan(e.app, today), today });
});
