"""Write data/live.json: the values that change during the day, kept out of places.json (which ships with the app).

  aufzug:    {place_id: [status, status_at, note]}  from db/import_aufzug_status.py (hvv, every 20 minutes on the server)
  notdienst: {place_id: [[from, to], ...]}          from db/import_notdienst.py (aponet.de, daily ~09:00)
The app loads it from the server (DJUU_API/data/live.json) and shows a status only while it is fresh.
Run: cd db && python export_live.py
"""
import json
from collections import defaultdict

from common import ROOT, connect, now


def facts_by_place(con, source_id):
    out = defaultdict(lambda: defaultdict(dict))
    rows = con.execute("""SELECT sr.place_id, sr.source_ref, f.key, f.value FROM facts f JOIN source_records sr USING (source_id, source_ref)
                          WHERE f.source_id = ? AND sr.place_id IS NOT NULL""", (source_id,))
    for pid, ref, key, value in rows:
        out[pid][ref][key] = value
    return out


def run():
    con = connect()
    flags = {r[0]: r[1] for r in con.execute("SELECT place_id, duplicate_of FROM place_flags WHERE status = 'duplikat' AND duplicate_of IS NOT NULL")}
    aufzug = {}
    for pid, recs in facts_by_place(con, 'hvv_aufzug').items():
        f = next(iter(recs.values()))
        if f.get('elevator_status'):
            aufzug[flags.get(pid, pid)] = [f['elevator_status'], f.get('status_at'), (f.get('status_note') or '')[:200]]
    notdienst = defaultdict(list)
    for pid, recs in facts_by_place(con, 'notdienst').items():
        for f in recs.values():
            if f.get('notdienst_from') and f.get('notdienst_to'):
                notdienst[flags.get(pid, pid)].append([f['notdienst_from'], f['notdienst_to']])
    out = {'generated': now(), 'aufzug': aufzug, 'notdienst': {k: sorted(v) for k, v in notdienst.items()},
           'sources': {'aufzug': 'https://www.hvv.de/de/aufzuege', 'notdienst': 'https://www.aponet.de/notdienstsuche'}}
    path = ROOT / 'data' / 'live.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(aufzug)} elevators, {len(notdienst)} pharmacies on duty -> {path}')


if __name__ == '__main__':
    run()
