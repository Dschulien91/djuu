"""Reversible data cleaning: records marked as unsuitable or duplicate stay in the database but leave the app.

Tables
  place_flags  one row per flagged place; survives merge.py because it is keyed by the stable place id
               and also remembers name, category and position for review
  offer_flags  the same for courses, groups and events

Status values
  unpassend  does not belong in a family app (reason says why)
  duplikat   same real place as duplicate_of; the kept place inherits nothing automatically, export just skips this one
  datenschutz  private person's data (e.g. name and home address from a data broker)

Undo:  python flags.py unflag <place_id|offer_id> ...    removes single flags
       python flags.py undo <batch>                      removes all flags of one batch
       python flags.py list [status]                     prints flags as CSV
"""
import csv
import sys

from common import connect, now

SCHEMA = """
CREATE TABLE IF NOT EXISTS place_flags (
  place_id     TEXT PRIMARY KEY,
  status       TEXT NOT NULL,
  reason       TEXT NOT NULL,
  duplicate_of TEXT,
  method       TEXT NOT NULL,        -- 'rule' or 'review'
  batch        TEXT NOT NULL,
  name         TEXT,
  category     TEXT,
  district     TEXT,
  lat          REAL,
  lon          REAL,
  flagged_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offer_flags (
  offer_id   TEXT PRIMARY KEY,
  status     TEXT NOT NULL,
  reason     TEXT NOT NULL,
  method     TEXT NOT NULL,
  batch      TEXT NOT NULL,
  title      TEXT,
  source_id  TEXT,
  flagged_at TEXT NOT NULL
);
"""


def ensure(con):
    con.executescript(SCHEMA)


def flag_place(con, place_id, status, reason, method, batch, duplicate_of=None):
    """Keep the first decision for a place: an explicit undo is needed to change it."""
    row = con.execute('SELECT name, category, district, lat, lon FROM places WHERE id=?', (place_id,)).fetchone()
    if not row: return False
    cur = con.execute('INSERT OR IGNORE INTO place_flags VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                      (place_id, status, reason, duplicate_of, method, batch, *row, now()))
    return cur.rowcount == 1


def flag_offer(con, offer_id, status, reason, method, batch):
    row = con.execute('SELECT title, source_id FROM offers WHERE id=?', (offer_id,)).fetchone()
    if not row: return False
    cur = con.execute('INSERT OR IGNORE INTO offer_flags VALUES (?,?,?,?,?,?,?,?)', (offer_id, status, reason, method, batch, *row, now()))
    return cur.rowcount == 1


def flagged_places(con):
    ensure(con)
    return {r[0] for r in con.execute('SELECT place_id FROM place_flags')}


def flagged_offers(con):
    ensure(con)
    return {r[0] for r in con.execute('SELECT offer_id FROM offer_flags')}


if __name__ == '__main__':
    con = connect()
    ensure(con)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'unflag':
        for i in sys.argv[2:]:
            con.execute('DELETE FROM place_flags WHERE place_id=?', (i,))
            con.execute('DELETE FROM offer_flags WHERE offer_id=?', (i,))
        con.commit()
    elif cmd == 'undo':
        for t in ('place_flags', 'offer_flags'):
            print(t, con.execute(f'DELETE FROM {t} WHERE batch=?', (sys.argv[2],)).rowcount)
        con.commit()
    else:
        status = sys.argv[2] if len(sys.argv) > 2 else None
        w = csv.writer(sys.stdout)
        w.writerow(['id', 'status', 'grund', 'duplikat_von', 'methode', 'name', 'kategorie', 'stadtteil'])
        q = 'SELECT place_id, status, reason, duplicate_of, method, name, category, district FROM place_flags' + (' WHERE status=?' if status else '')
        for r in con.execute(q, (status,) if status else ()):
            w.writerow(r)
