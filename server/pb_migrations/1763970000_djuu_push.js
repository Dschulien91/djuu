/// <reference path="../pb_data/types.d.ts" />
// Push messages (21 Nov 2026). All topics are off until the person switches them on (app push.js).
// - push_subs: one browser subscription per phone. The person reads and changes only their own. The endpoint must be an
//   https address of a known push service (checked in pb_hooks/djuu_push.pb.js: no requests to other servers).
//   The keys are never sent back by the API (hidden per answer by a hook; a hidden field could not be written by the app);
//   topics are 'cal', 'pickup', 'lists'; lang 'de' or 'en'.
// - push_queue: what is to be sent, written by hooks only (no API access). The sender container (server/push/) fetches due
//   messages through a secret-protected route inside the server network and reports back.
//   lang empty = to all of the person's subscriptions; dedup keeps one message per event.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const subs = new Collection({
    type: "base", name: "push_subs",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "endpoint", type: "text", max: 1000, required: true },
      { name: "keys", type: "json", maxSize: 400 }, // never sent back: djuu_push.pb.js hides it in every answer (onRecordEnrich)
      { name: "topics", type: "json", maxSize: 100 },
      { name: "lang", type: "select", values: ["de", "en"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_push_subs_endpoint ON push_subs (endpoint)", "CREATE INDEX idx_push_subs_user ON push_subs (user)"],
  });
  const ME = "@request.auth.id";
  subs.listRule = `user = ${ME}`;
  subs.viewRule = subs.listRule;
  subs.createRule = `${ME} != '' && @request.auth.collectionName = 'users' && @request.body.user = ${ME}`;
  subs.updateRule = `user = ${ME} && @request.body.user:changed = false && @request.body.endpoint:changed = false`;
  subs.deleteRule = `user = ${ME}`;
  app.save(subs);

  app.save(new Collection({
    type: "base", name: "push_queue", // hooks and the sender route only: all API rules locked
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "topic", type: "text", max: 20, required: true },
      { name: "title", type: "text", max: 120 },
      { name: "body", type: "text", max: 300 },
      { name: "url", type: "text", max: 300 },
      { name: "send_after", type: "date" },
      { name: "sent", type: "date" },
      { name: "lang", type: "text", max: 2 },
      { name: "dedup", type: "text", max: 200 },
      { name: "tries", type: "number", onlyInt: true },
      { name: "lease", type: "date" },
      { name: "error", type: "text", max: 200 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_push_queue_due ON push_queue (sent, send_after)", "CREATE UNIQUE INDEX idx_push_queue_dedup ON push_queue (dedup) WHERE dedup != ''",
      "CREATE INDEX idx_push_queue_user ON push_queue (user, topic, created)"],
  }));
}, (app) => {
  for (const n of ["push_queue", "push_subs"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (e) { /* gone */ } }
});
