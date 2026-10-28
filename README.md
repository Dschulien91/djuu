# Djuu – Prototyp v0.6

Karte mit allen familienrelevanten Orten in Hamburg (ca. 16.400 Orte aus 34 offenen Quellen, jede Angabe mit Quelle) mit Filtern.
Installierbare Web-App (PWA): läuft auf Android, iPhone und Desktop aus demselben Code.

## Starten (lokal)

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Dann http://localhost:8765 im Browser öffnen.

## Daten aktualisieren

```
sh tools/download-osm.sh
cd db
python import_osm.py; python import_spieli.py; python import_mangrove.py; python import_hamburg.py; python import_wikidata.py
python merge.py; python import_websites.py; python merge.py
python import_offers_elbkinder.py; python import_offers_kathfbs.py; python import_offers_elternschulen.py
python import_offers_buecherhallen.py; python import_offers_flohmaerkte.py
python export.py; python stats.py
```

Die Datenbank (`data/djuu.db`) bleibt lokal, die App liest `data/places.json` (Orte) und `data/offers.json` (Kurse, Gruppen, Termine).
`import_offers_elbphilharmonie.py` ist abgeschaltet: elbphilharmonie.de schließt ClaudeBot aus.

## Was der Prototyp kann

- 15 Kategorien: Spielplätze, Indoor, Cafés, Restaurants, Eis, Windeln & Drogerie (inkl. Tankstellen, Spätis), Apotheken, Kinderärzte, Toiletten, Wickelplätze, Aufzüge, Baden, Bücherhallen, Zoo & Museum, Spielzeug
- Filter: Wickeltisch, Kinderwagen/stufenlos, Hochstuhl, Spielecke, Hund erlaubt, Toilette, Jetzt geöffnet, Sonntags geöffnet, Spielgeräte (Schaukel, Rutsche, Sandkasten, Klettern, Wasser, Seilbahn, Wippe)
- Schnelle Fragen: "Jetzt Windeln kaufen", "Windeln am Sonntag", "Wickeln unterwegs", "Café mit Kind und Hund", "Es regnet", "Wasserspielplatz"
- Zähler "x passen · y ohne Angabe", Orte ohne Angabe blass einblendbar
- Detail: Öffnungszeiten, Route, Quelle jeder Angabe (OSM oder Nutzer), "Stimmt das noch?", Sterne + Kommentar, fehlende Angaben ergänzen
- Orte eintragen
- Events-Tab (nur Beispiele)

## Grenzen (bewusst)

- Nutzereingaben werden nur auf dem eigenen Gerät gespeichert (kein Server).
- Feiertage bei Öffnungszeiten nicht berücksichtigt; komplexe Öffnungszeiten gelten als "unbekannt".
- Events sind Beispieldaten.
- Kartenkacheln kommen vom OSM-Server, dessen Nutzungsregeln nur geringe Last erlauben. Für echte Nutzer braucht es einen eigenen oder bezahlten Kachel-Dienst.

Daten © OpenStreetMap-Mitwirkende, ODbL.
