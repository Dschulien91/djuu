// Wunschlisten (migration 1764000000): shared code for djuu_wish.pb.js, loaded with require().
// - cleanItem(): the wish fields of a list entry (link https only, givers cleaned).
// - wishScan(): the reminders of the push topic 'wish' for one Hamburg day.

const U = require(`${__hooks}/djuu_utils.js`);
const P = require(`${__hooks}/djuu_push.js`);

const MAX_GIVERS = 6;
const isId = (s) => /^[a-z0-9]{15}$/.test(String(s || ""));
// https only, a host with a dot, no spaces, quotes or angle brackets (the app opens it in a new tab)
const LINK = /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?([/?#][^\s"'<>\\]*)?$/;
const json = (t, d) => { try { const v = JSON.parse(t || ""); return v == null ? d : v; } catch (e) { return d; } };

// a person of this Wir, or null
function memberIn(app, id, familyId) {
  if (!isId(id)) return null;
  try { const m = app.findRecordById("members", id); return m.getString("family") === familyId ? m : null; } catch (e) { return null; }
}

// Checks and cleans the wish fields of a shop_items record before it is saved (create and update through the API).
// A link that is not https is refused (400 invalid_link); more than 6 givers are refused (400 limit_reached).
// Givers: { name ≤ 40, member: a person of the same Wir or '', by: who entered it (same Wir) or '', at: ms }.
function cleanItem(app, r) {
  const isNew = r.isNew(), orig = isNew ? null : r.original();
  const link = r.getString("link").trim();
  if (isNew || link !== orig.getString("link")) {
    if (link && (link.length > 500 || !LINK.test(link))) throw U.fail(400, "invalid_link", "Der Link muss mit https:// beginnen.");
    r.set("link", link);
  }
  const raw = toString(r.get("givers"));
  if (!isNew && raw === toString(orig.get("givers"))) return;
  const list = json(raw, []);
  if (!Array.isArray(list)) { r.set("givers", []); return; }
  if (list.length > MAX_GIVERS) throw U.fail(400, "limit_reached", "Das Limit für diesen Bereich ist erreicht.");
  const fam = r.getString("family"), out = [];
  for (const g of list) {
    if (!g || typeof g !== "object") continue;
    const m = memberIn(app, g.member, fam), by = memberIn(app, g.by, fam);
    const name = String(g.name || "").trim().slice(0, 40) || (m ? m.getString("name") : "");
    if (!name) continue;
    const at = Number(g.at);
    out.push({ name, member: m ? m.id : "", by: by ? by.id : "", at: Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now() });
  }
  r.set("givers", out);
}

// ---------- reminders (push topic 'wish') ----------
const TEXTS = {
  bday: (name) => ({ de: ["Wunschliste", `Bald hat ${name || "euer Kind"} Geburtstag. Möchtet ihr eine Wunschliste anlegen oder ergänzen?`],
    en: ["Wish list", `${name ? name + "'s" : "Your child's"} birthday is coming up. Would you like to start a wish list or add to one?`] }),
  xmas: () => ({ de: ["Wunschliste", "Bald ist Weihnachten. Möchtet ihr eine Wunschliste anlegen oder ergänzen?"],
    en: ["Wish list", "Christmas is coming. Would you like to start a wish list or add to one?"] }),
};
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// For one Hamburg day ('YYYY-MM-DD'): 42 days before a child's birthday (month and day known) and on 1 November, one
// message per event and year (dedup key) to every adult of the Wir who switched the topic on: not helpers, access not
// ended, with access to "Einkauf" (wish lists live there). Starts from the subscriptions with the topic, so the cost
// grows with the people who use it, not with all Wirs. Returns the number of queued messages.
function wishScan(app, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return 0;
  const target = P.addDays(today, 42), tY = +target.slice(0, 4), tM = target.slice(5, 7), tD = +target.slice(8, 10);
  const days = [tD];
  if (tM === "02" && tD === 28 && !leap(tY)) days.push(29); // born on 29 February: reminded with the 28th
  const xmas = today.slice(5) === "11-01";
  const users = new Set();
  for (const s of app.findRecordsByFilter("push_subs", "topics ~ {:t}", "", 0, 0, { t: '"wish"' })) users.add(s.getString("user"));
  const kidsOf = {};
  let n = 0;
  for (const user of users) {
    const m = U.memberOf(app, user);
    if (!m || m.getString("kind") !== "adult" || m.getString("grp") === "helper" || !U.canSee(m, "perm_shop")) continue;
    const fam = m.getString("family");
    if (xmas) n += P.enqueue(app, { user, topic: "wish", texts: TEXTS.xmas(), url: "./#wir=lists", key: `wish:xmas:${today.slice(0, 4)}:${m.id}` });
    const kids = kidsOf[fam] || (kidsOf[fam] = app.findRecordsByFilter("members", "family = {:f} && kind = 'kid' && birth_day > 0 && birth_ym ~ {:m}", "", 50, 0, { f: fam, m: "-" + tM })
      .filter((k) => k.getString("birth_ym").length === 7 && k.getString("birth_ym").slice(5) === tM && days.includes(k.getInt("birth_day"))));
    for (const k of kids) {
      n += P.enqueue(app, { user, topic: "wish", texts: TEXTS.bday(k.getString("name")), url: "./#wir=lists", key: `wish:bday:${k.id}:${tY}:${m.id}` });
    }
  }
  return n;
}

module.exports = { cleanItem, wishScan, LINK, MAX_GIVERS };
