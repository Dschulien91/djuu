"""Conservative place matching for commercial POI feeds (Overture), used by merge.py and import_overture.py.

merge.py's default rule (compatible category + 80 m + difflib ratio >= 0.6, unnamed always matches) is fine for
curated sources but too loose here: "Apotheke am Markt" and "Apotheke am Bahnhof" would merge. A wrong merge is worse
than a duplicate, so a record only joins a place on evidence that names the same business:

1. same phone number within CONTACT_M (number not shared by many places),
2. same website domain within CONTACT_M (domain not shared by many places),
3. same distinctive name within NAME_M, after dropping generic words such as "Apotheke" or "Praxis".

No name means no name match. The category must always be compatible. A shared phone or domain under a different name
is a conflict: the record joins nothing and creates nothing. If the best two candidates tie, nothing matches.
"""
import re
from collections import Counter, defaultdict
from urllib.parse import urlparse

STRICT_SOURCES = {'overture', 'overture_fsq', 'overture_atp'}
# Official registers or OSM are complete for these, or new records turn out to be offices rather than places to visit:
# a record that matches nothing stays unlinked and only ever adds contact data to an existing place.
ENRICH_ONLY = {'kita', 'schule', 'spielplatz', 'park', 'bolzplatz', 'buecherei', 'ausflug', 'wochenmarkt', 'baden', 'klinik', 'garten', 'naturschutz',
               'treffpunkt', 'beratung', 'kultur', 'windeln'}

NAME_M = 80
EXACT_NAME_M = 150   # identical non-chain name: geocoders put the point on another side of the block
PART_NAME_M = 40      # one name contains the other: "Ginya" and "Ginya Veganes Restaurant"
CONTACT_M = 150
SHARED_RECORDS = 6   # a phone or domain on more source records than this is a chain or head office, not evidence

GENERIC = set("""
hamburg hh gmbh mbh ug kg ohg ag gbr ek ev co und the der die das den dem des am an im in zum zur bei von vom auf fuer
cafe kaffee coffee restaurant bistro imbiss pizzeria apotheke drogerie markt praxis gemeinschaftspraxis
dr med prof dipl frau herr facharzt fachaerztin aerztin arzt zahnarzt zahnaerztin kinderarzt kinderaerztin kinderaerzte
kinderarztpraxis zahnarztpraxis hebamme hebammen hebammenpraxis physiotherapie physio ergotherapie logopaedie
kita kindertagesstaette kindergarten krippe schule grundschule stadtteilschule gymnasium spielplatz kinder jugend
sushi pizza doener kebab burger asia thai ristorante trattoria osteria eis eiscafe eisdiele gelato baeckerei
museum tanzschule musikschule sprachschule sportverein verein filiale standort
""".split())
# Generic words that still identify a place when nothing else is left, as in "Markt-Apotheke".
KEEP_IF_ONLY = {'markt', 'kaffee', 'museum'}
ALIASES = {'budnikowsky': 'budni', 'dmdrogerie': 'dm', 'rossmann': 'rossmann', 'mcdonalds': 'mcdonald', 'mcdonald': 'mcdonald'}
NON_SITES = re.compile(r'(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|linkedin|xing|pinterest|yelp|tripadvisor|jameda|doctolib|'
                       r'gelbeseiten|dasoertliche|11880|meinestadt|google|goo|wa|linktr|lieferando|opentable|thefork|booking|'
                       r'wordpress|wixsite|jimdo|jimdofree|parkopedia|foursquare|kennstdueinen|branchenbuch|golocal|cylex)\.[a-z.]+$')


def fold(s):
    s = (s or '').lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss'), ('é', 'e'), ('è', 'e'), ('à', 'a')):
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def tokens(name):
    """Distinctive words of a name. An empty result means the name says nothing about which place this is."""
    words = [ALIASES.get(w, w) for w in fold(name).split()]
    kept = [w for w in words if w not in GENERIC and len(w) > 1 or w == 'dm']
    if not kept:  # "Markt Apotheke": the only word left to tell it apart
        kept = [w for w in words if w in KEEP_IF_ONLY]
    return frozenset(kept)


def phone_key(s):
    """Last digits of a German number in national form; None if too short to be evidence."""
    d = re.sub(r'\D', '', s or '')
    if d.startswith('0049'): d = d[4:]
    elif d.startswith('49') and len(d) > 8: d = d[2:]
    d = d.lstrip('0')
    return d if len(d) >= 7 else None


def domain_key(url):
    if not url: return None
    try:
        host = urlparse(url if '//' in url else '//' + url).hostname or ''
    except ValueError:
        return None
    host = host.lower().removeprefix('www.')
    if '.' not in host or NON_SITES.search(host): return None
    return '.'.join(host.split('.')[-2:]) if not re.search(r'\.(co|com)\.[a-z]{2}$', host) else '.'.join(host.split('.')[-3:])


def contact_index(con, extra=()):
    """(source_id, source_ref) -> {'phones': set, 'domains': set} without evidence used by many records.

    `extra` adds (source_id, source_ref, key, value) rows that are not in the database, for dry runs.
    """
    index = defaultdict(lambda: {'phones': set(), 'domains': set()})
    seen = {'phones': defaultdict(set), 'domains': defaultdict(set)}
    rows = con.execute("SELECT source_id, source_ref, key, value FROM facts WHERE key IN ('phone','website')").fetchall()
    for src, ref, key, value in list(rows) + list(extra):
        kind, k = ('phones', phone_key(value)) if key == 'phone' else ('domains', domain_key(value))
        if k:
            index[(src, ref)][kind].add(k)
            seen[kind][k].add((src, ref))
    for entry in index.values():
        for kind in ('phones', 'domains'):
            entry[kind] = {k for k in entry[kind] if len(seen[kind][k]) <= SHARED_RECORDS}
    return index


def attach_contacts(place, contacts):
    """Remember a linked record's phones and domains on the merged place dict."""
    if contacts:
        place.setdefault('phones', set()).update(contacts['phones'])
        place.setdefault('domains', set()).update(contacts['domains'])


def names_agree(a, b):
    """True if two names can be the same business: a shared distinctive word, or one contained in the other."""
    ta, tb = tokens(a), tokens(b)
    if ta & tb:
        return True
    ca, cb = ''.join(sorted(ta)), ''.join(sorted(tb))
    fa, fb = fold(a).replace(' ', ''), fold(b).replace(' ', '')
    return bool(ca and cb) and (ca == cb or (len(fa) >= 5 and len(fb) >= 5 and (fa in fb or fb in fa)))


def find_match(name, phones, domains, lat, lon, candidates, compatible, dist, chain_names=()):
    """Best place for a record among nearby candidates (dicts with id, name, category, lat, lon, phones, domains).

    Returns (place, reason). (None, None) means no such place is known: the record may become a new one.
    (None, 'conflict') means the evidence contradicts itself, for example the same phone under another name, and
    (None, 'ambiguous') that two places fit equally well: such records stay unlinked rather than risk either error.
    """
    mine = tokens(name)
    chain = mine in chain_names
    hits, conflict = [], False
    for q in candidates:
        if not compatible(q['category']): continue
        d = dist(lat, lon, q['lat'], q['lon'])
        if d > max(CONTACT_M, EXACT_NAME_M): continue
        q_phones, q_domains = q.get('phones', set()), q.get('domains', set())
        same_phone, same_domain = bool(phones & q_phones), bool(domains & q_domains)
        if d <= CONTACT_M and (same_phone or same_domain):
            if names_agree(name, q.get('name')):
                hits.append((0 if same_phone else 1, d, q, 'phone' if same_phone else 'domain'))
            else:
                conflict = True
            continue
        if phones and q_phones and domains and q_domains:
            continue  # both state their contacts and none agrees: another business, whatever the name says
        theirs = tokens(q.get('name'))
        if mine and mine == theirs and d <= (NAME_M if chain else EXACT_NAME_M):
            hits.append((2, d, q, 'name'))
        elif mine and theirs and (mine < theirs or theirs < mine) and d <= PART_NAME_M and max(map(len, mine & theirs), default=0) >= 5:
            hits.append((3, d, q, 'name_part'))
    if not hits:
        return None, 'conflict' if conflict else None
    hits.sort(key=lambda h: h[:2])
    best, second = hits[0], hits[1] if len(hits) > 1 else None
    if second and best[0] == second[0] and best[0] >= 2 and second[1] - best[1] < 15 and best[2]['id'] != second[2]['id']:
        return None, 'ambiguous'
    return best[2], best[3]


def chain_token_sets(names, limit=3):
    """Token sets used by more than `limit` records: store chains, where the same name nearby can be another branch."""
    counts = Counter(t for t in map(tokens, names) if t)
    return {t for t, n in counts.items() if n > limit}
