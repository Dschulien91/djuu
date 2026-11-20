#!/bin/sh
# Nightly: refresh the events, translate new titles, publish them at https://api.djuu.de/data/.
# tools/refresh.py keeps the previous files when a run looks broken, so copying afterwards is always safe.
# One lock with live.sh (pipeline/.lock): both write the same SQLite database. The exit code is the refresh's own,
# so systemd marks a broken night as failed.
cd /opt/djuu || exit 1
exec 9>pipeline/.lock
flock -w 1800 9 || { echo "== $(date -Is) lock busy, skipped" >> pipeline/data/cron.log; exit 75; }
echo "== $(date -Is) start" >> pipeline/data/cron.log
docker compose -p djuu --profile jobs run --rm refresh >> pipeline/data/cron.log 2>&1
rc=$?
# the Anthropic key lives in the admin-only collection djuu_settings (entered in the dashboard), handed over as an environment variable;
# python reads the login itself, so neither the password nor the token appears on a command line
ANTHROPIC_API_KEY=$(python3 - <<'EOF' 2>>pipeline/data/cron.log
import json, urllib.parse, urllib.request
API = 'http://172.18.0.1:8090'
lines = open('/opt/djuu/.admin', encoding='utf-8').read().splitlines()
def call(path, body=None, token=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': token} if token else {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)
try:
    token = call('/api/collections/_superusers/auth-with-password', {'identity': lines[0], 'password': lines[1]})['token']
    items = call('/api/collections/djuu_settings/records?filter=' + urllib.parse.quote("(key='anthropic_api_key')"), token=token).get('items', [])
    print(items[0]['value'] if items else '')
except Exception as e:  # no key: titles stay German
    print('')
    import sys; print(f'key not read: {type(e).__name__}', file=sys.stderr)
EOF
)
export ANTHROPIC_API_KEY
docker compose -p djuu --profile jobs run --rm -e ANTHROPIC_API_KEY --entrypoint python refresh db/translate_offers.py >> pipeline/data/cron.log 2>&1
unset ANTHROPIC_API_KEY
mkdir -p public/data
for f in offers.json sources.json places.json; do
  [ -s "pipeline/data/$f" ] && cp "pipeline/data/$f" "public/data/$f.tmp" && mv "public/data/$f.tmp" "public/data/$f"
done
echo "== $(date -Is) published (refresh exit $rc)" >> pipeline/data/cron.log
tail -n 400 pipeline/data/cron.log > pipeline/data/cron.log.tmp && mv pipeline/data/cron.log.tmp pipeline/data/cron.log
exit $rc
