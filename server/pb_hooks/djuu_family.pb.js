/// <reference path="../pb_data/types.d.ts" />
// Wir, round 2 (see migration 1763900000_djuu_family2.js): checks and small jobs around lists, emergency information,
// single calendar occurrences, followed lists and push messages for new list entries.
// Route errors answer { status, code, message, data } like djuu.pb.js.

// More lists: at most 50 per Wir (far above what a family uses; the disk is shared with other services).
onRecordCreateRequest((e) => {
  const fam = e.record.getString("family");
  if (fam && e.app.countRecords("lists", $dbx.hashExp({ family: fam })) >= 50) {
    return e.json(400, { status: 400, code: "limit_reached", message: "Das Limit für diesen Bereich ist erreicht.", data: {} });
  }
  return e.next();
}, "lists");

// Emergency information: the moment of consent is the server's (each save needs the consent box again, the rules ask
// for consent_by = the admin saving); emergency contacts are a short list of { name, phone, rel }.
// (Handlers run on their own: shared code is in djuu_cal.js, loaded with require().)
onRecordCreateRequest((e) => { require(`${__hooks}/djuu_cal.js`).cleanCare(e.record); return e.next(); }, "kid_care");
onRecordUpdateRequest((e) => { require(`${__hooks}/djuu_cal.js`).cleanCare(e.record); return e.next(); }, "kid_care");

// Single occurrences written through the records API are cleaned the same way as through /api/djuu/cal-take (at most
// 60 changed days per entry, days long past dropped). Reminders: at most 200 entries with an alarm per Wir (the alarm scan
// of the push sender looks at them every 30 seconds).
const calEntryCheck = (e) => {
  const limit = () => e.json(400, { status: 400, code: "limit_reached", message: "Das Limit für diesen Bereich ist erreicht.", data: {} });
  if (!require(`${__hooks}/djuu_cal.js`).cleanRecordChanges(e.record)) return limit();
  const fam = e.record.getString("family");
  const alarmNew = e.record.getString("alarm") && (e.record.isNew() || !e.record.original().getString("alarm"));
  if (alarmNew && fam && e.app.countRecords("cal_entries", $dbx.exp("family = {:f} AND alarm != ''", { f: fam })) >= 200) return limit();
  return e.next();
};
onRecordCreateRequest(calEntryCheck, "cal_entries");
onRecordUpdateRequest(calEntryCheck, "cal_entries");

// Followed lists: only the person changes them (an admin may change other fields of a person, not this one).
onRecordUpdateRequest((e) => {
  const before = e.record.original().getString("follow_lists"), now = e.record.getString("follow_lists");
  if (before !== now) {
    const su = e.auth && e.auth.collection().name === "_superusers";
    if (!su && (!e.auth || e.record.getString("user") !== e.auth.id)) {
      return e.json(403, { status: 403, code: "not_allowed", message: "Das kann nur die Person selbst ändern.", data: {} });
    }
    let list = [];
    try { list = JSON.parse(now || "[]"); } catch (err) { list = []; }
    e.record.set("follow_lists", [...new Set((Array.isArray(list) ? list : []).map(String).filter((x) => x === "main" || /^[a-z0-9]{15}$/.test(x)))].slice(0, 50));
  }
  return e.next();
}, "members");

// Push topic "lists": a new entry in a list someone follows becomes a push message (push_queue through enqueue() of
// djuu_push.js: one message per language of the person's subscriptions with "lists", hourly cap). Only for people of the Wir
// who can read that list, follow it, and did not add the entry themselves. Entries typed in a row become one message:
// it waits a minute, and further entries are added to it while the sender has not taken it yet.
onRecordAfterCreateSuccess((e) => {
  try {
    const r = e.record, app = e.app;
    let push = null;
    try { app.findCollectionByNameOrId("push_queue"); push = require(`${__hooks}/djuu_push.js`); } catch (err) { return e.next(); }
    const u = require(`${__hooks}/djuu_utils.js`), cal = require(`${__hooks}/djuu_cal.js`);
    const listId = r.getString("list"), key = listId || "main";
    let list = null;
    if (listId) { try { list = app.findRecordById("lists", listId); } catch (err) { return e.next(); } }
    const perm = list && list.getString("kind") === "todo" ? "perm_errands" : "perm_shop";
    const by = r.getString("added_by");
    let byName = "";
    try { if (by) byName = app.findRecordById("members", by).getString("name"); } catch (err) { /* gone */ }
    const url = listId ? `./#wir=list-${listId}` : "./#wir=shop";
    const what = r.getString("name").slice(0, 60);
    const title = (lang) => (list ? list.getString("name") : lang === "en" ? "Shopping" : "Einkauf");
    for (const m of app.findRecordsByFilter("members", "family = {:f} && user != ''", "", 100, 0, { f: r.getString("family") })) {
      if (m.id === by || !u.canSee(m, perm)) continue;
      let follow = [];
      try { follow = JSON.parse(m.getString("follow_lists") || "[]"); } catch (err) { follow = []; }
      if (!Array.isArray(follow) || !follow.includes(key)) continue;
      const user = m.getString("user");
      // messages for this list that still wait (not sent, not taken by the sender): add this entry to them
      const waiting = app.findRecordsByFilter("push_queue", "user = {:u} && topic = 'lists' && url = {:url} && sent = '' && lease = ''", "-created", 4, 0, { u: user, url });
      if (waiting.length) {
        for (const q of waiting) {
          let items = [];
          try { items = JSON.parse(app.store().get("djuu_push_items:" + q.id) || "[]"); } catch (err) { items = []; }
          items.push(what);
          app.store().set("djuu_push_items:" + q.id, JSON.stringify(items.slice(-20)));
          q.set("body", cal.listBody(byName, items, q.getString("lang") === "en"));
          app.save(q);
        }
        continue;
      }
      push.enqueue(app, { user, topic: "lists", url, key: `lists:${r.id}:${m.id}`,
        texts: { de: [title("de"), cal.listBody(byName, [what], false)], en: [title("en"), cal.listBody(byName, [what], true)] },
        sendAfter: new DateTime(new Date(Date.now() + 60000).toISOString().replace("T", " ")) }); // one minute: entries typed in a row go out together
      for (const q of app.findRecordsByFilter("push_queue", "user = {:u} && topic = 'lists' && url = {:url} && sent = ''", "-created", 4, 0, { u: user, url })) {
        if (!app.store().get("djuu_push_items:" + q.id)) app.store().set("djuu_push_items:" + q.id, JSON.stringify([what]));
      }
    }
  } catch (err) { e.app.logger().warn("djuu list push", "error", String(err)); }
  return e.next();
}, "shop_items");
