/// <reference path="../pb_data/types.d.ts" />
// Account routes (21 Nov 2026): data export, e-mail addresses for admins, handing over the founder role.

// GET /api/djuu/export: everything stored about me as a JSON download (Art. 15/20 GDPR). What the Wir holds is included
// exactly as far as I may read it: every collection with a `family` field is filtered through its own view rule, as me,
// so helpers get no children, nobody gets other adults' e-mail addresses (members.email is hidden), and new collections
// are included automatically. Secrets stay out (password hash, token key, calendar addresses, push keys).
routerAdd("GET", "/api/djuu/export", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    if (e.auth.collection().name !== "users") throw u.fail(403, "users_only", "Nur für Konten.");
    const store = e.app.store(), key = "export:" + e.auth.id, now = Date.now();
    if (now - (store.get(key) || 0) < 20000) throw u.fail(429, "too_many_requests", "Bitte warte einen Moment.");
    // one export at a time on the whole server (a Wir can hold some MB; the server has little memory)
    if (now < Number(store.get("export:busy") || 0)) throw u.fail(429, "too_many_requests", "Bitte warte einen Moment.");
    store.set(key, now);
    store.set("export:busy", now + 60000);
    try {
      // The answer is written to the client piece by piece, record by record and page by page: the server never holds
      // the whole export (a Wir can hold some MB; the server has little memory). JSON.stringify of a record is the API's
      // public form: hidden fields are left out.
      const J = (v) => JSON.stringify(v);
      let buf = [], size = 0;
      const out = (str) => { buf.push(str); size += str.length; if (size > 256 * 1024) flush(); };
      const flush = () => { if (buf.length) { e.response.write(toBytes(buf.join(""))); buf = []; size = 0; } };
      const user = JSON.parse(J(e.auth));
      user.email = e.auth.email();
      for (const k of ["password", "tokenKey", "passwordHash"]) delete user[k];
      const info = e.requestInfo();
      const me = u.memberOf(e.app, e.auth.id);
      const PAGE = 200;
      // all records of a filter, page by page, written as a JSON list (keep: which records may go out)
      const list = (coll, filter, params, keep) => {
        let n = 0;
        for (let offset = 0; ; offset += PAGE) {
          let recs = [];
          try { recs = e.app.findRecordsByFilter(coll, filter, "created,id", PAGE, offset, params); } catch (x) { break; }
          for (const r of recs) if (!keep || keep(r)) { out((n ? "," : "[") + J(r)); n++; }
          if (recs.length < PAGE) break;
        }
        return n;
      };
      e.response.header().set("Content-Type", "application/json; charset=utf-8");
      e.response.header().set("Content-Disposition", 'attachment; filename="djuu-daten.json"');
      e.response.header().set("Cache-Control", "no-store");
      e.response.writeHeader(200);
      out(`{"exported":${J(new DateTime().string().replace(" ", "T"))},"app":"Djuu","user":${J(user)},"wir":`);
      if (me) {
        const fam = me.getString("family");
        const member = JSON.parse(J(me));
        member.email = me.getString("email");
        out(`{"member":${J(member)},"collections":{`);
        let first = true;
        for (const col of e.app.findAllCollections("base")) {
          const f = col.fields.getByName("family");
          if (!f || f.type() !== "relation") continue;
          if (col.viewRule == null) continue; // server-only collections (invites, …)
          // the collection's name is written only when it has records the person may read
          let opened = false;
          const keep = (r) => {
            let ok = false;
            try { ok = e.app.canAccessRecord(r, info, col.viewRule); } catch (x) { ok = false; }
            if (ok && !opened) { out(`${first ? "" : ","}${J(col.name)}:`); opened = true; first = false; }
            return ok;
          };
          if (list(col.name, "family = {:f}", { f: fam }, keep)) out("]");
        }
        out("}");
        try {
          const famRec = e.app.findRecordById("families", fam);
          if (e.app.canAccessRecord(famRec, info, famRec.collection().viewRule)) out(`,"family":${J(famRec)}`);
        } catch (x) { /* gone */ }
        // helpers do not read the children's records: they see name and age only (as in the app)
        if (!u.expired(me) && me.getString("grp") === "helper") {
          const kids = e.app.findRecordsByFilter("members", "family = {:f} && kind = 'kid'", "created", 50, 0, { f: fam })
            .map((k) => ({ name: k.getString("name"), ...u.ageRange(k.getString("birth_ym"), k.getInt("birth_day")) }));
          out(`,"children":${J(kids)}`);
        }
        out("}");
      } else out("null");
      const mine = { u: e.auth.id };
      out(`,"own_places":`); if (!list("places", "owner = {:u}", mine)) out("["); out("]"); // Meine Orte, also the private ones
      out(`,"contributions":`); if (!list("contributions", "user = {:u}", mine)) out("["); out("]");
      const subs = e.app.findRecordsByFilter("push_subs", "user = {:u}", "created", 50, 0, mine).map((r) => {
        let host = "";
        try { host = String(r.getString("endpoint")).split("/")[2] || ""; } catch (x) { /* none */ }
        return { id: r.id, service: host, topics: u.parseJson(r.getString("topics")), lang: r.getString("lang"), created: r.getDateTime("created").string() };
      });
      out(`,"push_subscriptions":${J(subs)}}`);
      flush();
      return null;
    } finally { store.remove("export:busy"); }
  });
}, $apis.requireAuth());

// GET /api/djuu/emails: { memberId: email }. Admins of my Wir get every address in it; everyone else only their own.
routerAdd("GET", "/api/djuu/emails", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const me = u.memberOf(e.app, e.auth.id);
    const emails = {};
    if (me) {
      if (me.getBool("is_admin") && !u.expired(me)) {
        for (const m of e.app.findRecordsByFilter("members", "family = {:f} && email != ''", "created", 200, 0, { f: me.getString("family") })) emails[m.id] = m.getString("email");
      }
      emails[me.id] = me.getString("email") || e.auth.email();
    }
    e.response.header().set("Cache-Control", "no-store");
    return e.json(200, { ok: true, emails });
  });
}, $apis.requireAuth());

// POST /api/djuu/founder { member }: the founder hands over to another admin with an account.
routerAdd("POST", "/api/djuu/founder", (e) => {
  const u = require(`${__hooks}/djuu_utils.js`);
  return u.handle(e, () => {
    const target = String((e.requestInfo().body || {}).member || "");
    u.inTx(e.app, (tx) => {
      const me = u.memberOf(tx, e.auth.id);
      if (!me) throw u.fail(400, "not_member", "Du bist in keinem Wir.");
      const fam = tx.findRecordById("families", me.getString("family"));
      if (fam.getString("founder") !== me.id) throw u.fail(403, "founder_only", "Nur die Person, die das Wir angelegt hat, kann es übergeben.");
      let m;
      try { m = tx.findRecordById("members", target); } catch (x) { throw u.fail(404, "member_not_found", "Person nicht gefunden."); }
      if (m.getString("family") !== fam.id) throw u.fail(404, "member_not_found", "Person nicht gefunden.");
      if (m.id === me.id) throw u.fail(400, "already_founder", "Das Wir gehört schon dir.");
      if (!m.getBool("is_admin") || !m.getString("user") || u.expired(m)) throw u.fail(400, "founder_needs_admin", "Übergeben geht nur an einen Admin mit eigenem Zugang.");
      fam.set("founder", m.id);
      tx.save(fam);
    });
    return e.json(200, { ok: true });
  });
}, $apis.requireAuth());
