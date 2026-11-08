/// <reference path="../pb_data/types.d.ts" />
// Daily backup of the family database at 03:30, the last 7 kept (inside the data volume; Hetzner's server backup copies it off the machine).
migrate((app) => {
  const s = app.settings();
  s.backups.cron = "30 3 * * *";
  s.backups.cronMaxKeep = 7;
  app.save(s);
}, (app) => {
  const s = app.settings();
  s.backups.cron = "";
  app.save(s);
});
