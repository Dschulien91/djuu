#!/bin/sh
# Nightly: refresh the events, translate new titles, publish them at https://api.djuu.de/data/.
# tools/refresh.py keeps the previous files when a run looks broken, so copying afterwards is always safe.
cd /opt/djuu || exit 1
echo "== $(date -Is) start" >> pipeline/data/cron.log
docker compose -p djuu --profile jobs run --rm refresh >> pipeline/data/cron.log 2>&1
# the Anthropic key lives in the admin-only collection djuu_settings (entered in the dashboard), handed over as an environment variable
TOKEN=$(curl -s -X POST http://172.18.0.1:8090/api/collections/_superusers/auth-with-password -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$(sed -n 1p .admin)\",\"password\":\"$(sed -n 2p .admin)\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
ANTHROPIC_API_KEY=$(curl -s "http://172.18.0.1:8090/api/collections/djuu_settings/records?filter=(key='anthropic_api_key')" -H "Authorization: $TOKEN" \
  | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["value"] if i else "")' 2>/dev/null)
export ANTHROPIC_API_KEY
docker compose -p djuu --profile jobs run --rm -e ANTHROPIC_API_KEY --entrypoint python refresh db/translate_offers.py >> pipeline/data/cron.log 2>&1
unset ANTHROPIC_API_KEY TOKEN
mkdir -p public/data
for f in offers.json sources.json places.json; do
  [ -s "pipeline/data/$f" ] && cp "pipeline/data/$f" "public/data/$f.tmp" && mv "public/data/$f.tmp" "public/data/$f"
done
echo "== $(date -Is) published" >> pipeline/data/cron.log
tail -n 400 pipeline/data/cron.log > pipeline/data/cron.log.tmp && mv pipeline/data/cron.log.tmp pipeline/data/cron.log
