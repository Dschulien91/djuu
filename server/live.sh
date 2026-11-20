#!/bin/sh
# Live values for the app: every 20 minutes the hvv elevator status (djuu-live.timer), with the argument 'notdienst'
# the emergency pharmacies (djuu-notdienst.timer, daily 09:05). Publishes https://api.djuu.de/data/live.json.
cd /opt/djuu || exit 1
systemctl is-active --quiet djuu-refresh.service && exit 0  # the nightly refresh holds the database
if [ "$1" = notdienst ]; then step=import_notdienst.py; else step=import_aufzug_status.py; fi
echo "== $(date -Is) $step" >> pipeline/data/live.log
docker compose -p djuu --profile jobs run --rm --entrypoint sh refresh -c "cd db && python $step && python export_live.py" >> pipeline/data/live.log 2>&1
mkdir -p public/data
[ -s pipeline/data/live.json ] && cp pipeline/data/live.json public/data/live.json.tmp && mv public/data/live.json.tmp public/data/live.json
tail -n 300 pipeline/data/live.log > pipeline/data/live.log.tmp && mv pipeline/data/live.log.tmp pipeline/data/live.log
