"""Shared model for offers: courses, recurring groups (e.g. Krabbelgruppe) and single dated events.

Every importer builds a list of dicts and calls replace_offers(con, source_id, offers).
Only facts are stored (what, when, where, age, price, link); no long texts, no images, no personal names.
"""
import hashlib
import json
import re

from common import now

SCHEMA = """
CREATE TABLE IF NOT EXISTS offers (
  id           TEXT PRIMARY KEY,            -- 'of_' + hash(source_id, source_ref)
  source_id    TEXT NOT NULL,
  source_ref   TEXT NOT NULL,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL,               -- 'kurs' (course with fixed sessions), 'gruppe' (open recurring group), 'termin' (single event)
  topic        TEXT,                        -- see TOPICS
  age_min_m    INTEGER,                     -- child age in months, inclusive (NULL = unknown)
  age_max_m    INTEGER,                     -- exclusive upper bound in months (NULL = open)
  for_parents  INTEGER DEFAULT 0,           -- 1 = for (expecting) parents, e.g. Geburtsvorbereitung
  weekday      INTEGER,                     -- 0 = Monday … 6 = Sunday, for recurring offers
  time_from    TEXT,                        -- 'HH:MM'
  time_to      TEXT,
  start_date   TEXT,                        -- 'YYYY-MM-DD' first session / event date
  end_date     TEXT,
  sessions     INTEGER,
  schedule     TEXT,                        -- human readable, e.g. 'Mi 10:30–12:00, 8× ab 09.09.'
  price        TEXT,                        -- as published, e.g. '67,50 €' or 'kostenlos'
  free         INTEGER,                     -- 1 / 0 / NULL
  registration TEXT,                        -- 'nötig', 'offen', 'Warteliste'
  venue        TEXT,
  address      TEXT,
  lat          REAL,
  lon          REAL,
  place_id     TEXT,                        -- linked Djuu place (set by export)
  url          TEXT NOT NULL,               -- link to the provider page (always shown)
  provider     TEXT,
  fetched_at   TEXT NOT NULL,
  raw          TEXT,
  UNIQUE (source_id, source_ref)
);
CREATE INDEX IF NOT EXISTS offers_topic ON offers(topic);
"""

TOPICS = {  # topic id -> label, keyword regex (first match wins, order matters)
    'geburtsvorbereitung': ('Geburtsvorbereitung', r'geburtsvorbereit|schwanger|werdende'),
    'rueckbildung': ('Rückbildung', r'rückbildung|rueckbildung|beckenboden|nach der geburt'),
    'flohmarkt': ('Flohmarkt & Basar', r'flohmarkt|basar|trödel|kleiderbörse|kaufrausch|kaufrau'),
    'pekip': ('PEKiP & Bewegung', r'pekip|delfi|pikler|first step|eltern-kind-turnen|krabbelturnen|turnfrösche|bewegung|yoga'),
    'babymassage': ('Babymassage', r'babymassage|baby-massage'),
    'schwimmen': ('Babyschwimmen', r'babyschwimm|aqua baby|wassergewöhnung|schwimm'),
    'musik': ('Musik', r'musik|singen|lieder|klang'),
    'spiele': ('Spielen & Medien', r'brettspiel|spiele(treff|nachmittag|zimmer|universum|abend)|duplo|lego|switch|gaming|konsole|pokemon|medien|robot|coding|programmier'),
    'krabbelgruppe': ('Krabbel- & Spielgruppe', r'krabbel|spielgruppe|eltern-kind-gruppe|miniclub|spielkreis|kennenlern|treff'),
    'eltern_cafe': ('Eltern-Café & Frühstück', r'café|cafe|frühstück|fruehstueck|offener treff|elterncafé'),
    'beratung': ('Beratung', r'beratung|sprechstunde|mütterberatung|stillberatung|hebammensprechstunde'),
    'erste_hilfe': ('Erste Hilfe am Kind', r'erste hilfe|notfall'),
    'kreativ': ('Basteln & Kreatives', r'basteln|malen|kreativ|werkst'),
    'lesen': ('Vorlesen', r'vorlese|bilderbuch|geschichte|lesen|lese|märchen|kamishibai|gedicht|buch'),
    'theater': ('Theater, Kino & Zirkus', r'theater|puppen|zirkus|zauber|kino|film|konzert'),
}


def topic_of(text):
    t = (text or '').lower()
    for tid, (_, rx) in TOPICS.items():
        if re.search(rx, t):
            return tid
    return 'sonstiges'


AGE_PATTERNS = [
    (r'(\d+)\s*[-–]\s*(\d+)\s*monat', lambda a, b: (int(a), int(b) + 1)),
    (r'(\d+)\s*[-–]\s*(\d+)\s*(jahr|j\.)', lambda a, b: (int(a) * 12, int(b) * 12 + 12)),
    (r'ab\s*(\d+)\s*monat', lambda a: (int(a), None)),
    (r'ab\s*(\d+)\s*(jahr|j\.)', lambda a: (int(a) * 12, None)),
    (r'bis\s*(\d+)\s*monat', lambda a: (0, int(a) + 1)),
    (r'(\d+)\s*monat', lambda a: (int(a), int(a) + 4)),
]


def age_range(text):
    """Child age range in months from phrases like '10–14 Monate', '1,5-3 J.', 'ab 6 Monaten'."""
    t = (text or '').lower().replace(',5', '.5')
    t = re.sub(r'(\d+)\.5', lambda m: str(int(m.group(1))), t)  # round half years down, good enough for matching
    for rx, f in AGE_PATTERNS:
        m = re.search(rx, t)
        if m:
            groups = [g for g in m.groups() if g and g[0].isdigit()]
            return f(*groups)
    if re.search(r'schwanger|werdende|geburtsvorbereit', t):
        return None, None
    if re.search(r'neugeboren|säugling|baby', t):
        return 0, 12
    if re.search(r'kleinkind|krabbel', t):
        return 6, 36
    return None, None


def parse_price(text):
    if not text:
        return None, None
    t = text.strip()
    if re.search(r'kostenlos|kostenfrei|gebührenfrei|frei\b|(?<![\d.,])0,00', t, re.I):
        return 'kostenlos', 1
    m = re.search(r'(\d+[.,]?\d*)\s*€|€\s*(\d+[.,]?\d*)', t)
    if m:
        return (m.group(1) or m.group(2)).replace('.', ',') + ' €', 0
    return t[:40], None


def offer_id(source_id, ref):
    return 'of_' + hashlib.sha1(f'{source_id}:{ref}'.encode()).hexdigest()[:12]


def ensure(con):
    con.executescript(SCHEMA)


def replace_offers(con, source_id, offers):
    """Replace all offers of one source. Each offer needs at least source_ref, title, kind, url."""
    ensure(con)
    ts = now()
    con.execute('DELETE FROM offers WHERE source_id=?', (source_id,))
    cols = ['id', 'source_id', 'source_ref', 'title', 'kind', 'topic', 'age_min_m', 'age_max_m', 'for_parents', 'weekday',
            'time_from', 'time_to', 'start_date', 'end_date', 'sessions', 'schedule', 'price', 'free', 'registration',
            'venue', 'address', 'lat', 'lon', 'place_id', 'url', 'provider', 'fetched_at', 'raw']
    n = 0
    for o in offers:
        o = dict(o)
        o['id'] = offer_id(source_id, o['source_ref'])
        o['source_id'] = source_id
        o.setdefault('topic', topic_of(o.get('title', '') + ' ' + (o.get('description') or '')))
        o['for_parents'] = 1 if o.get('topic') in ('geburtsvorbereitung', 'rueckbildung') else o.get('for_parents', 0)
        o['fetched_at'] = ts
        o['raw'] = json.dumps(o.get('raw'), ensure_ascii=False) if o.get('raw') is not None else None
        con.execute(f"INSERT OR REPLACE INTO offers({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", [o.get(c) for c in cols])
        n += 1
    con.execute('UPDATE sources SET fetched_at=?, record_count=? WHERE id=?', (ts, n, source_id))
    con.commit()
    return n
