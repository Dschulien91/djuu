"""Write data/live.json: the values that change during the day, kept out of places.json (which ships with the app).

  aufzug:    {place_id: [status, status_at, note]}  from db/import_aufzug_status.py (hvv, every 20 minutes on the server)
  notdienst: {place_id: [[from, to], ...]}          from db/import_notdienst.py (aponet.de, daily ~09:00)
  stationen: {place_id: [ok, broken, unknown, cabin_min_cm, door_min_cm, [lift place ids]]}
             per stop or station (haltestelle / bahnhof): how many of its hvv lifts are in service, out of service or
             without status, and the narrowest cabin and door of them (None = not published). A lift belongs to the stop with
             the same name within 400 m (hvv station name vs. our stop name), else to the nearest stop within 150 m.
Only ids that exist in data/places.json are written (lifts of stations outside Hamburg have no place in the app).
The app loads it from the server (DJUU_API/data/live.json) and shows a status only while it is fresh.
Run: cd db && python export_live.py   (after export.py, which writes data/places.json)
"""
import json
import math
import re
from collections import defaultdict
from difflib import SequenceMatcher

from common import ROOT, connect, now


def facts_by_place(con, source_id):
    out = defaultdict(lambda: defaultdict(dict))
    rows = con.execute("""SELECT sr.place_id, sr.source_ref, f.key, f.value FROM facts f JOIN source_records sr USING (source_id, source_ref)
                          WHERE f.source_id = ? AND sr.place_id IS NOT NULL""", (source_id,))
    for pid, ref, key, value in rows:
        out[pid][ref][key] = value
    return out


def dist(la1, lo1, la2, lo2):
    k = math.pi / 180
    return 6371000 * math.hypot((lo2 - lo1) * k * math.cos((la1 + la2) * k / 2), (la2 - la1) * k)


def station_key(name):
    """'S Hamburg Hbf', 'Bf. Dammtor', 'Hauptbahnhof Nord' -> comparable station words."""
    n = (name or '').lower()
    n = re.sub(r'\(.*?\)', ' ', n)
    n = re.sub(r'^(s|u|a|s\+u|u\+s|bf\.?|bahnhof)\s+|\b(hamburg|bahnhof|bf\.?)\b', ' ', n)
    n = n.replace('hbf', 'hauptbahnhof').replace('straße', 'str').replace('strasse', 'str')
    return re.sub(r'[^a-z0-9äöüß]+', ' ', n).strip()


def stations(con, places, aufzug, flags):
    """Lift status per stop (see the module doc)."""
    stops = [p for p in places.values() if p[2] in ('haltestelle', 'bahnhof') and p[1]]
    grid = defaultdict(list)
    for p in stops: grid[(int(p[3] / 0.004), int(p[4] / 0.007))].append(p)
    size = {}
    for pid, recs in facts_by_place(con, 'hvv_aufzug').items():
        f = next(iter(recs.values()))
        size[flags.get(pid, pid)] = (int(f['cabin_width_cm']) if f.get('cabin_width_cm') else None, int(f['door_width_cm']) if f.get('door_width_cm') else None)
    station_of = {}
    for pid, raw in con.execute("SELECT place_id, raw FROM source_records WHERE source_id = 'hvv_aufzug' AND place_id IS NOT NULL AND raw IS NOT NULL"):
        station_of[flags.get(pid, pid)] = json.loads(raw).get('station') or ''
    out = {}
    for lift, st in station_of.items():
        lp = places.get(lift)
        if not lp or lift not in aufzug: continue
        gi, gj = int(lp[3] / 0.004), int(lp[4] / 0.007)
        cands = [(dist(lp[3], lp[4], s[3], s[4]), s) for i in (-1, 0, 1) for j in (-1, 0, 1) for s in grid.get((gi + i, gj + j), ())]
        cands = [c for c in cands if c[0] <= 400]
        k = station_key(st)
        named = [c for c in cands if k and station_key(c[1][1]) == k] or \
                [c for c in cands if k and SequenceMatcher(None, k, station_key(c[1][1])).ratio() >= 0.75]
        best = min(named, key=lambda c: c[0]) if named else min((c for c in cands if c[0] <= 150), key=lambda c: c[0], default=None)
        if not best: continue
        e = out.setdefault(best[1][0], [0, 0, 0, None, None, []])
        status = aufzug[lift][0]
        e[0 if status == 'in_betrieb' else 1 if status == 'ausser_betrieb' else 2] += 1
        cw, dw = size.get(lift, (None, None))
        if cw: e[3] = min(e[3] or cw, cw)
        if dw: e[4] = min(e[4] or dw, dw)
        e[5].append(lift)
    return out


def run():
    con = connect()
    flags = {r[0]: r[1] for r in con.execute("SELECT place_id, duplicate_of FROM place_flags WHERE status = 'duplikat' AND duplicate_of IS NOT NULL")}
    path_places = ROOT / 'data' / 'places.json'
    places = {p[0]: p for p in json.loads(path_places.read_text(encoding='utf-8'))['places']} if path_places.exists() else None
    known = (lambda pid: pid in places) if places is not None else (lambda pid: True)
    aufzug, skipped = {}, []
    for pid, recs in facts_by_place(con, 'hvv_aufzug').items():
        f = next(iter(recs.values()))
        pid = flags.get(pid, pid)
        if not known(pid):
            skipped.append(pid)
            continue
        if f.get('elevator_status'):
            aufzug[pid] = [f['elevator_status'], f.get('status_at'), (f.get('status_note') or '')[:200]]
    notdienst = defaultdict(list)
    for pid, recs in facts_by_place(con, 'notdienst').items():
        pid = flags.get(pid, pid)
        if not known(pid):
            skipped.append(pid)
            continue
        for f in recs.values():
            if f.get('notdienst_from') and f.get('notdienst_to'):
                notdienst[pid].append([f['notdienst_from'], f['notdienst_to']])
    out = {'generated': now(), 'aufzug': aufzug, 'notdienst': {k: sorted(v) for k, v in notdienst.items()},
           'stationen': stations(con, places, aufzug, flags) if places else {},
           'sources': {'aufzug': 'https://www.hvv.de/de/aufzuege', 'notdienst': 'https://www.aponet.de/notdienstsuche'}}
    path = ROOT / 'data' / 'live.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    st = out['stationen']
    print(f'{len(aufzug)} elevators, {len(notdienst)} pharmacies on duty, {len(st)} stations with lifts '
          f'({sum(1 for v in st.values() if v[1])} with a lift out of service) -> {path}')
    if skipped:
        print(f'  {len(skipped)} ids not in places.json (outside Hamburg / not exported), left out: {skipped}')


if __name__ == '__main__':
    run()
