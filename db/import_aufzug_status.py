"""Current status of the station elevators (U-Bahn, S-Bahn, AKN, regional trains) from hvv's public elevator map (source 'hvv_aufzug').

Source: https://www.hvv.de/de/aufzuege. The page itself loads one public JSON file, https://www.hvv.de/elevators (no key, no
login; robots.txt of hvv.de only disallows /geofox, /meinhvv, /map, ... not /elevators). One request per run, ~95 KB, so it can
run every 15-30 minutes. The feed covers the Hochbahn stations and the DB-operated S-Bahn and regional stations of the hvv area
(Hochbahn, S-Bahn Hamburg/DB InfraGO, AKN), so no second source (DB FaSta needs a key; db.info/bahnhof.de loads its elevator
status in the browser from /api/*, which its robots.txt disallows) is needed.

Kept per elevator (facts only, the app links the hvv map):
  elevator_status  'in_betrieb' (state 1), 'ausser_betrieb' (state 0, or a description saying "dauerhaft außer Betrieb"),
                   'unbekannt' (state -1: the elevator reports no status). Mapping taken from hvv's own page script.
  status_at        time of the feed ('lastUpdate'), ISO 8601 with offset (Europe/Berlin).
  status_note      hvv's short notice for an elevator that is out of order (planned end, alternative), <= 200 characters.
  cabin_length_cm, cabin_width_cm, door_width_cm   cabin size (useful for prams), when hvv publishes it (0 = unknown, skipped).
  status_source_url  https://www.hvv.de/de/aufzuege
Records: one per hvv elevator that matches an existing 'aufzug' place, category 'aufzug', with the coordinates (and name) of
that place's OSM record, so merge.py joins it at distance 0. Matching: hvv publishes the OSM id of each elevator ('osmId');
it is looked up among our OSM elevator records (node/way). Where hvv's id is outdated or missing, MANUAL (checked by hand on
20 Nov 2026 against the OSM descriptions: same station, same platform direction) gives the OSM record. Everything else
(stations outside Hamburg, elevators not in our OSM extract) is skipped and counted. The place link is also written directly
(source_records.place_id) so a status run needs no merge.py run; merge.py arrives at the same link.
Priority 70.

Run: cd db && python import_aufzug_status.py      (1 request to hvv.de)
"""
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone

from common import connect, register_source, replace_records
from offers_util import get

SOURCE_ID = 'hvv_aufzug'
PAGE = 'https://www.hvv.de/de/aufzuege'
FEED = 'https://www.hvv.de/elevators'
STATE = {1: 'in_betrieb', 0: 'ausser_betrieb', -1: 'unbekannt'}
STALE_H = 6  # warn when the feed is older than this
# (hvv station name, elevator label) -> OSM ref of our elevator record, where hvv's osmId is outdated or missing.
MANUAL = {
    ('Hamburg Airport (Flughafen)', 'C'): 'node/12705125467',  # Straßenebene Terminal 1 <-> Zwischenebene <-> Bahnsteig
    ('Hamburg Airport (Flughafen)', 'D'): 'node/12705125464',  # Straßenebene Terminal 2 <-> Zwischenebene <-> Bahnsteig
    ('Hauptbahnhof Nord', 'A'): 'way/408843250',               # Bahnsteig U2 Ri. Mümmelmannsberg
    ('Hauptbahnhof Nord', 'B'): 'way/408843251',               # Bahnsteig U2 Ri. Niendorf Nord / U4 Ri. Elbbrücken
    ('Jungfernstieg', 'B'): 'way/1421127253',                  # Zugangsgebäude U2/U4 <-> Zwischenebene
    ('Jungfernstieg', 'C'): 'way/1421127251',                  # Zwischenebene <-> Bahnsteig U2 Ri. Mümmelmannsberg, U4 Ri. Billstedt
    ('Jungfernstieg', 'D'): 'way/1421127252',                  # Zwischenebene <-> Bahnsteig U2 Ri. Niendorf Nord, U4 Ri. Elbbrücken
    ('Neugraben', 'A'): 'node/3956631399',                     # Unterführung <-> Bahnsteig Gleis 1 (S3 Ri. Hauptbahnhof)
    ('Neugraben', 'B'): 'node/3956631402',                     # Unterführung <-> Bahnsteig Gleise 2/3 (also Ri. Stade)
}


def berlin(dt):
    """Aware datetime in Hamburg time (zoneinfo needs the tzdata package on Windows; fall back to the system zone)."""
    try:
        from zoneinfo import ZoneInfo
        return dt.astimezone(ZoneInfo('Europe/Berlin'))
    except Exception:
        return dt.astimezone()


def clean(s):
    s = re.sub(r'\s+', ' ', (s or '').replace('�', '')).strip()
    for a, b in (('ausser ', 'außer '), ('Fuer ', 'Für '), ('fuer ', 'für '), ('Unterstuetzung', 'Unterstützung'), ('regulaer', 'regulär'),
                 ('Mobilitaetseingeschraenkte', 'Mobilitätseingeschränkte'), ('koennen', 'können'), ('Aufzuege', 'Aufzüge'),
                 ('gestoert', 'gestört'), ('Maerz', 'März'), ('Uhlandstrasse', 'Uhlandstraße'), ('Verfuegung', 'Verfügung')):
        s = s.replace(a, b)  # hvv writes some notices without umlauts
    return s


def status_of(e):
    desc = e.get('description') or ''
    if re.search(r'dauerhaft au(ß|ss)er Betrieb', desc, re.I):
        return 'ausser_betrieb'
    return STATE.get(e.get('state'), 'unbekannt')


def note_of(e, status):
    if status == 'in_betrieb':
        return None
    parts = [clean(e.get('instCause'))]
    m = re.search(r'\|\s*(.+)$', e.get('description') or '')  # "... | Aufzug dauerhaft außer Betrieb: ..."
    if m:
        parts.append(clean(m.group(1)))
    s = ' '.join(p for p in parts if p)
    s = re.sub(r'^\*\s*', '', s).strip()
    return (s[:197] + '...') if len(s) > 200 else (s or None)


def osm_elevators(con):
    """OSM elevator records: numeric id -> list of (ref, name, lat, lon, place_id)."""
    out = {}
    for ref, name, la, lo, pid in con.execute(
            "SELECT source_ref, name, lat, lon, place_id FROM source_records WHERE source_id='osm' AND category='aufzug'"):
        out.setdefault(ref.split('/')[1], []).append((ref, name, la, lo, pid))
    return out


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    r = get(FEED, headers={'Accept': 'application/json', 'Referer': PAGE})
    data = r.json()
    stations = data.get('stations') or []
    if not stations:
        print(f'{SOURCE_ID}: empty feed; keeping existing data')
        return 0
    at = berlin(datetime.fromtimestamp(data['lastUpdate'] / 1000, timezone.utc))
    age_h = (datetime.now(timezone.utc) - at).total_seconds() / 3600
    con = connect()
    register_source(con, SOURCE_ID, 'hvv: Aufzugsstatus an Haltestellen', PAGE, 'Fakten mit Link',
                    'Hamburger Verkehrsverbund GmbH, hvv.de', 70)
    osm = osm_elevators(con)
    by_ref = {ref: (ref, name, la, lo, pid) for lst in osm.values() for ref, name, la, lo, pid in lst}
    records, seen, missing, ambiguous, total = [], set(), [], [], 0
    for s in stations:
        st = clean((s.get('mainSubStation') or {}).get('stationName'))
        for label, e in sorted((s.get('elevators') or {}).items()):
            total += 1
            hit = None
            manual = MANUAL.get((st, label))
            if manual:
                hit = by_ref.get(manual)
            elif e.get('osmId'):
                cands = osm.get(str(e['osmId']), [])
                if len(cands) == 1:
                    hit = cands[0]
                elif len(cands) > 1:
                    ambiguous.append(f'{st} {label}')
            if not hit or hit[0] in seen:
                if not hit:
                    missing.append(f'{st} {label}')
                continue
            seen.add(hit[0])
            ref, name, la, lo, pid = hit
            status = status_of(e)
            facts = {'elevator_status': status, 'status_at': at.isoformat(timespec='seconds'), 'status_note': note_of(e, status),
                     'status_source_url': PAGE}
            for k, key in (('cabinLength', 'cabin_length_cm'), ('cabinWidth', 'cabin_width_cm'), ('doorWidth', 'door_width_cm')):
                if isinstance(e.get(k), (int, float)) and e[k] > 0:
                    facts[key] = int(e[k])
            records.append({'ref': f"{(s.get('mainSubStation') or {}).get('linkId') or st}/{label}", 'category': 'aufzug',
                            'name': name, 'lat': la, 'lon': lo, 'url': PAGE, 'facts': facts, '_pid': pid,
                            'raw': {'station': st, 'label': label, 'osm': ref, 'hvv_osm_id': e.get('osmId'), 'state': e.get('state'),
                                    'lines': e.get('lines'), 'description': clean(e.get('description'))[:200], 'type': e.get('type')}})
    for attempt in range(6):
        try:
            n = replace_records(con, SOURCE_ID, records)
            con.executemany('UPDATE source_records SET place_id=? WHERE source_id=? AND source_ref=? AND place_id IS NULL',
                            [(r['_pid'], SOURCE_ID, r['ref']) for r in records if r['_pid']])
            con.commit()
            break
        except sqlite3.OperationalError as ex:
            if 'locked' not in str(ex) or attempt == 5:
                raise
            con.rollback()
            print(f'  database locked, retry {attempt + 1}')
            time.sleep(10 * (attempt + 1))
    from collections import Counter
    c = Counter(r['facts']['elevator_status'] for r in records)
    print(f'{SOURCE_ID}: {n} of {total} hvv elevators matched to our elevator places ({dict(c)}); feed time {at:%d.%m.%Y %H:%M}'
          + (f'  !! feed is {age_h:.0f} h old' if age_h > STALE_H else ''))
    print(f'  not matched ({len(missing)}, mostly stations outside Hamburg): {", ".join(missing[:60])}' + (' ...' if len(missing) > 60 else ''))
    if ambiguous:
        print(f'  ambiguous OSM id (skipped): {ambiguous}')
    for r in records:
        if r['facts']['elevator_status'] != 'in_betrieb':
            print(f"  {r['raw']['station']} {r['raw']['label']}: {r['facts']['elevator_status']} - {r['facts'].get('status_note') or ''}"[:200])
    return n


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
