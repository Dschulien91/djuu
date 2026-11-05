# Djuu v0.18

Kurse, Gruppen, Termine und Orte für Familien in Hamburg auf einer Karte (ca. 22.300 Orte und 1.800 Angebote aus 80 offenen Quellen, jede Angabe mit Quelle).
Installierbare Web-App (PWA): läuft auf Android, iPhone und Desktop aus demselben Code. Noch nicht öffentlich beworben, siehe „Vor dem öffentlichen Start“.

## Starten (lokal)

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Dann http://localhost:8765 im Browser öffnen.

## Daten aktualisieren

Kurse, Gruppen und Termine aktualisiert und veröffentlicht `tools/refresh.py`. Wöchentlich läuft es, nachdem `tools/refresh-task.ps1` einmal ausgeführt wurde: Windows-Aufgabe „Djuu weekly refresh“, montags 05:00, oder sobald der Rechner wieder an ist. Protokoll: `data/refresh.log`. Sieht das Ergebnis kaputt aus (unter 70 % der Angebote oder 95 % der Orte), bleibt der alte Stand online.

Orte von Hand (alle paar Monate):

```
sh tools/download-osm.sh
cd db
python import_osm.py; python import_spieli.py; python import_mangrove.py; python import_hamburg.py; python import_wikidata.py; python import_overture.py
python import_gtfs.py
python merge.py; python import_websites.py; python merge.py
python derive_names.py
python export.py; python stats.py
```

Die Datenbank (`data/djuu.db`) bleibt lokal, die App liest `data/places.json` (Orte) und `data/offers.json` (Kurse, Gruppen, Termine).
`import_offers_elbphilharmonie.py` ist abgeschaltet: elbphilharmonie.de schließt ClaudeBot aus.

## Vor dem öffentlichen Start

- `config.js`: Name, Anschrift und E-Mail eintragen. Erst dann erscheinen Impressum, „Ort melden“ und „Feedback geben“ vollständig.
- `legal.html` rechtlich prüfen lassen, dann den Entwurfshinweis entfernen. Ebenso die Quellenlizenzen (ODbL-Mischung) und die Fotonennung.
- Einträge, Bewertungen und Favoriten bleiben bisher auf dem Gerät. Sollen andere sie sehen, braucht es einen Server mit Prüfung gegen Missbrauch.
- Kartenkacheln: OpenFreeMap als Standard; bei vielen Nutzern Bedingungen prüfen.

Daten © OpenStreetMap-Mitwirkende, ODbL. Alle Quellen und Lizenzen: `legal.html`.

## Bereinigung

Unpassende Einträge und Dubletten werden nicht gelöscht, sondern in `place_flags` und `offer_flags` markiert (`db/flags.py`). `db/export.py` lässt sie aus der App. Listen stehen in `data/cleaning/`.

```
python flags.py unflag <id>     # einzelne Markierung aufheben
python flags.py undo review-2026-11-05   # ganze Runde aufheben (auch dup-2026-11-05, rule-2026-11-05)
python export.py
```

Weitere Angebots-Importer: `db/import_offers_*.py`, Overture: `db/import_overture.py`.
