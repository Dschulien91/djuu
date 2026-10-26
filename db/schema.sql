-- Djuu database v0.1 (SQLite)
-- Principle: every source keeps its own records; every single value (fact) remembers where it came from.
-- Places are the merged view: one real-world place, linked to 1..n source records.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id           TEXT PRIMARY KEY,          -- e.g. 'osm', 'hh_gruenplan'
  name         TEXT NOT NULL,
  url          TEXT,
  license      TEXT,                      -- e.g. 'ODbL 1.0', 'DL-DE-BY-2.0'
  attribution  TEXT,                      -- text we must show in the app
  priority     INTEGER NOT NULL DEFAULT 50, -- higher wins when sources disagree
  fetched_at   TEXT,
  record_count INTEGER
);

CREATE TABLE IF NOT EXISTS places (
  id          TEXT PRIMARY KEY,           -- djuu id, stable: 'dj_' + first source key hash
  name        TEXT,
  category    TEXT NOT NULL,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  district    TEXT,                       -- Stadtteil
  borough     TEXT,                       -- Bezirk
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS places_cat ON places(category);
CREATE INDEX IF NOT EXISTS places_geo ON places(lat, lon);

CREATE TABLE IF NOT EXISTS source_records (
  source_id   TEXT NOT NULL REFERENCES sources(id),
  source_ref  TEXT NOT NULL,              -- id inside the source, e.g. 'node/123'
  place_id    TEXT REFERENCES places(id),
  category    TEXT,
  name        TEXT,
  lat         REAL,
  lon         REAL,
  url         TEXT,                       -- link to the record at the source
  raw         TEXT,                       -- original record as JSON
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (source_id, source_ref)
);
CREATE INDEX IF NOT EXISTS sr_place ON source_records(place_id);

CREATE TABLE IF NOT EXISTS facts (
  source_id   TEXT NOT NULL,
  source_ref  TEXT NOT NULL,
  key         TEXT NOT NULL,              -- normalized key, e.g. 'changing_table', 'dog', 'opening_hours'
  value       TEXT NOT NULL,              -- normalized value, e.g. 'yes', 'no', 'limited', free text
  method      TEXT NOT NULL DEFAULT 'source', -- 'source' (stated by source), 'ai' (extracted by AI), 'user' (app user)
  confidence  REAL NOT NULL DEFAULT 1.0,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (source_id, source_ref, key),
  FOREIGN KEY (source_id, source_ref) REFERENCES source_records(source_id, source_ref) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS facts_key ON facts(key, value);

-- Best value per place and key: highest priority source, then newest.
CREATE VIEW IF NOT EXISTS place_facts AS
SELECT place_id, key, value, source_id, method, observed_at, n_sources FROM (
  SELECT sr.place_id, f.key, f.value, f.source_id, f.method, f.observed_at,
         COUNT(*) OVER (PARTITION BY sr.place_id, f.key) AS n_sources,
         ROW_NUMBER() OVER (PARTITION BY sr.place_id, f.key ORDER BY s.priority DESC, f.confidence DESC, f.observed_at DESC) AS rk
  FROM facts f
  JOIN source_records sr ON sr.source_id = f.source_id AND sr.source_ref = f.source_ref
  JOIN sources s ON s.id = f.source_id
  WHERE sr.place_id IS NOT NULL
) WHERE rk = 1;

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES sources(id),
  source_ref  TEXT NOT NULL,
  title       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT,
  place_id    TEXT REFERENCES places(id),
  venue_name  TEXT,
  address     TEXT,
  lat         REAL,
  lon         REAL,
  kind        TEXT,                       -- 'flohmarkt', 'lesung', 'konzert', ...
  age_min     INTEGER,
  age_max     INTEGER,
  price       TEXT,
  url         TEXT,
  raw         TEXT,
  fetched_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_start ON events(starts_at);
