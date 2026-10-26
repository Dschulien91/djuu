#!/bin/sh
# Downloads the daily Hamburg OpenStreetMap extract from Geofabrik (~55 MB).
cd "$(dirname "$0")/../data" && mkdir -p raw && curl -sL -A "Djuu-Bot/0.1 (Familienkarte Hamburg, Open-Data-Import)" -o raw/hamburg-latest.osm.pbf https://download.geofabrik.de/europe/germany/hamburg-latest.osm.pbf && ls -la raw/hamburg-latest.osm.pbf
