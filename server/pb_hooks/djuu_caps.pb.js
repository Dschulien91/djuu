/// <reference path="../pb_data/types.d.ts" />
// Upper limits per Wir (places: per account), so one account cannot fill the disk the server shares with other services.
// Far above what a family uses; a refused create answers 400 with code "limit_reached".
onRecordCreateRequest((e) => {
  const caps = { members: 30, shop_items: 500, errands: 300, saved_offers: 500, saved_places: 1000, visits: 2000, pings: 100, places: 50, cal_entries: 2000 };
  const max = caps[e.collection.name];
  const field = e.collection.name === "places" ? "owner" : "family";
  const value = e.record.getString(field);
  if (max && value && e.app.countRecords(e.collection.name, $dbx.hashExp({ [field]: value })) >= max) {
    return e.json(400, { status: 400, code: "limit_reached", message: "Das Limit für diesen Bereich ist erreicht.", data: {} });
  }
  return e.next();
}, "members", "shop_items", "errands", "saved_offers", "saved_places", "visits", "pings", "places", "cal_entries");
