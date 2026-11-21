"""'neu' from the start: estimate when each current offer first appeared, from saved snapshots, for export.py.

Tracking of first_seen started on 20/21 Nov 2026, so every offer known then counts as 'before tracking'. This script looks
at older snapshots and writes data/raw/offer_first_seen_seed.json, which export.py merges into its state
(data/raw/offer_first_seen.json) once: offers that really appeared after the oldest snapshot get a date, everything
else stays 'before tracking'.

Snapshots read (all optional):
  data/backups/*.db                 offers tables of saved databases (dated by their newest fetched_at)
  data/backups/**/offers.json       saved exports (dated by 'generated')
  extra files given as arguments    other offers.json copies (e.g. the live file of a day)
  --git                             every committed version of data/offers.json (git log/show, read only; the coordinator
                                    runs this, agents do not use git)
and the current database (data/djuu.db) as the newest state.

Rules per current offer (id, or series = same provider/title/venue under a new id):
  - known in the oldest snapshot: before tracking ('')
  - first seen in a later snapshot: date = middle of the gap since the previous snapshot (it appeared somewhere in there)
  - but '' when its provider (source + provider name) first shows up in that snapshot, or the provider's offer count grew
    by more than half (+5) in that step, or 10+ of its offers (over a quarter) are new at once: a new or rewritten
    importer, not new offers
Usage: python first_seen_seed.py [--git] [extra offers.json ...]
"""
import glob
import json
import os
import sqlite3
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta

from common import ROOT
from export import clean_title, series_key

OUT = ROOT / 'data' / 'raw' / 'offer_first_seen_seed.json'


def rows_db(path):
    con = sqlite3.connect(path)
    try:
        day = (con.execute('SELECT MAX(fetched_at) FROM offers').fetchone()[0] or '')[:10]
        rows = con.execute('SELECT id, source_id, provider, title, venue FROM offers').fetchall()
    finally:
        con.close()
    return day, [(i, s, p or '', series_key(p, clean_title(t)[0], v)) for i, s, p, t, v in rows]


def rows_json(data, owner):
    c = {k: i for i, k in enumerate(data['cols'])}
    out = []
    for o in data['offers']:
        i = o[c['id']]
        out.append((i, owner.get(i, '?'), o[c['provider']] or '', series_key(o[c['provider']], clean_title(o[c['title']])[0], o[c['venue']])))
    return (data.get('generated') or '')[:10], out


def git_versions():
    """(date, offers.json data) of every commit that changed data/offers.json."""
    log = subprocess.run(['git', 'log', '--format=%H %cs', '--', 'data/offers.json'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    for line in log.stdout.split('\n'):
        if not line.strip(): continue
        sha, day = line.split()
        show = subprocess.run(['git', 'show', f'{sha}:data/offers.json'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
        try: yield day, json.loads(show.stdout)
        except ValueError: continue


def run(args):
    use_git = '--git' in args
    extra = [a for a in args if not a.startswith('--')]
    snaps = defaultdict(list)  # day -> rows
    owner = {}  # offer id -> source id (offers.json holds only an index into its own sources list)
    for path in sorted(glob.glob(str(ROOT / 'data' / 'backups' / '*.db'))):
        day, rows = rows_db(path)
        snaps[day] += rows
        owner.update({r[0]: r[1] for r in rows})
    day_now, now_rows = rows_db(ROOT / 'data' / 'djuu.db')
    owner.update({r[0]: r[1] for r in now_rows})
    jsons = glob.glob(str(ROOT / 'data' / 'backups' / '**' / 'offers.json'), recursive=True) + extra
    for path in jsons:
        day, rows = rows_json(json.load(open(path, encoding='utf-8')), owner)
        snaps[day] += rows
    if use_git:
        for day, data in git_versions():
            snaps[day] += rows_json(data, owner)[1]
    snaps[day_now] += now_rows
    days = sorted(d for d in snaps if d)
    seen_id, seen_se, first_prov, counts = {}, {}, {}, defaultdict(dict)
    for d in days:
        prov = Counter()
        for i, s, p, se in snaps[d]:
            seen_id.setdefault(i, d); seen_se.setdefault(se, d); first_prov.setdefault((s, p), d)
        for i, s, p, se in {r[0]: r for r in snaps[d]}.values(): prov[(s, p)] += 1
        for k, n in prov.items(): counts[k][d] = n
    new_in = Counter()  # (source, provider, day) -> offers first seen that day (id and series unknown before)
    for i, s, p, se in now_rows:
        new_in[(s, p, min(seen_id.get(i, day_now), seen_se.get(se, day_now)))] += 1
    est = {}
    for a, b in zip(days, days[1:]):
        ga, gb = date.fromisoformat(a), date.fromisoformat(b)
        est[b] = (ga + timedelta(days=max(1, (gb - ga).days // 2))).isoformat() if (gb - ga).days > 1 else b
    offers, series, why = {}, {}, Counter()
    for i, s, p, se in now_rows:
        d = min(seen_id.get(i, day_now), seen_se.get(se, day_now))
        if d == days[0]: v, w = '', 'before oldest snapshot'
        elif first_prov.get((s, p)) == d: v, w = '', 'provider first imported then'
        else:
            prev = days[days.index(d) - 1]
            before, after = counts[(s, p)].get(prev, 0), counts[(s, p)].get(d, 0)
            if after > before * 1.5 + 5 or (new_in[(s, p, d)] >= 10 and new_in[(s, p, d)] > 0.25 * after): v, w = '', 'importer grew'
            else: v, w = est[d], 'new'
        offers[i] = v; why[w] += 1
        series[se] = v if se not in series else ('' if '' in (v, series[se]) else min(v, series[se]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'made': date.today().isoformat(), 'snapshots': days, 'offers': offers, 'series': series},
                              separators=(',', ':')), encoding='utf-8')
    print('snapshots:', {d: len({r[0] for r in snaps[d]}) for d in days})
    print('current offers:', len(offers), dict(why), '| dates:', dict(Counter(v for v in offers.values() if v)), '->', OUT)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    run(sys.argv[1:])
