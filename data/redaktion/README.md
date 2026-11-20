# Redaktion: hand-checked events

`termine.json` holds single events found by targeted search (web search, hints from Facebook search results)
and checked at a source we can link to. The server pipeline (`db/import_offers_redaktion.py`) reads the copy
published at https://djuu.de/data/redaktion/termine.json every night, so a push to `main` is enough to add events.

Rules (decided 19 Nov 2026):

- `url` is the organiser's own page or document. Never Facebook, Instagram or an aggregator/competitor
  (kinderflohmarkt.com, meine-flohmarkt-termine.de, rausgegangen.de, Kindaling, weekend-willi.de,
  hh-mit-kindern.de, flohsonntag.de, kinder-in-hamburg.de …). No linkable source = no entry.
- Platforms (Facebook, Instagram, Reddit …) are only for finding events: search for the organiser's own page; an event that is
  only on Facebook is not added. Sites whose robots.txt blocks us are read only if listed in `PERMITTED_HOSTS` (db/common.py).
- robots.txt of the organiser is honoured. Only facts, no texts, no photos, no names of private persons.
- `found_via` and `checked` are internal and not shown in the app.

Add a batch: put the research file(s) into the scratchpad and run
`python tools/redaktion_build.py <file.json> …` – it validates, drops weekday-morning school performances
and past dates, adds coordinates offline (OSM names, then an address index from the local OSM extract) and merges into `termine.json`.
- Requests stay anonymous: browser User-Agent, never "Djuu" in a request or search query.
