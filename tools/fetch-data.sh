#!/bin/sh
# Downloads all Djuu places for Hamburg from OpenStreetMap (Overpass API).
# Retries with exponential backoff because the public servers are often busy.
cd "$(dirname "$0")/.."
fetch() {
  q="$1"; out="$2"; w=15
  for i in 1 2 3 4 5 6 7; do
    for u in https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter; do
      c=$(curl -s --max-time 300 -A "djuu-prototype/0.1" --data-urlencode data@"$q" "$u" -o "$out.tmp" -w "%{http_code}")
      echo "$out try $i -> $c"
      if [ "$c" = "200" ] && head -1 "$out.tmp" | grep -q "@lat"; then mv "$out.tmp" "$out"; return 0; fi
    done
    sleep $w; w=$((w*2))
  done
  return 1
}
fetch tools/orte.overpassql data/orte.tsv && fetch tools/geraete.overpassql data/geraete.tsv && wc -l data/*.tsv
