#!/bin/sh
# Downloads the daily Hamburg OpenStreetMap extract from Geofabrik (~55 MB).
cd "$(dirname "$0")/../data" && mkdir -p raw && curl -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" -o raw/hamburg-latest.osm.pbf https://download.geofabrik.de/europe/germany/hamburg-latest.osm.pbf && ls -la raw/hamburg-latest.osm.pbf
