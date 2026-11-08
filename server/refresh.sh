#!/bin/sh
# Nightly: refresh the events and publish them at https://api.djuu.de/data/.
# tools/refresh.py keeps the previous files when a run looks broken, so copying afterwards is always safe.
cd /opt/djuu || exit 1
echo "== $(date -Is) start" >> pipeline/data/cron.log
docker compose -p djuu --profile jobs run --rm refresh >> pipeline/data/cron.log 2>&1
mkdir -p public/data
for f in offers.json sources.json places.json; do
  [ -s "pipeline/data/$f" ] && cp "pipeline/data/$f" "public/data/$f.tmp" && mv "public/data/$f.tmp" "public/data/$f"
done
echo "== $(date -Is) published" >> pipeline/data/cron.log
tail -n 400 pipeline/data/cron.log > pipeline/data/cron.log.tmp && mv pipeline/data/cron.log.tmp pipeline/data/cron.log
