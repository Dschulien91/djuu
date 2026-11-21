"""Child age of an offer when the provider gave none (used by export.py).

explicit_age(title, today)  ages the title states in words the importers' parser misses: 'bis 3 Jahre', '1-jährige',
                            'ab 2,5 Jahren', 'Jahrgang 2021', 'im ersten Lebensjahr'. These count as known (age_guess 0).
guess_age(...)              an estimate from what the offer is and who offers it (age_guess 1), only where the
                            group is clear:
  - open groups, cafés and baby/toddler offers of Eltern-Kind-Zentren: 0-3 years (the EKiZ programme serves families with
    children under 3)
  - 'Gedichte für Wichte' (language programme for toddlers): 0-3
  - Musikgarten, Krabbel-/Spiel-/Zwergen-/Krümelgruppen of Elternschulen, KiFaZ and Mütterzentren: 0-5 (these houses
    serve families with children up to school age)
  - Eltern-Kind-Turnen: 1-5; Kleinkind-/Eltern-Kind-Schwimmen: 1-3
  - Seepferdchen courses: 4-9; Bronze/Silber (Frei-/Fahrtenschwimmer): from 6
  - Grundschul-/Vorschulkinder: 6-10 / 5-6
  - events for the whole family (Krippenspiel, Laternenumzug, Kinderprogramm auf dem Weihnachtsmarkt, Familientag,
    Kinderflohmarkt ...): every age (0, open)
Ages in months, max exclusive, as in the offers table. Never applied to offers for parents.
"""
import re

ADULT = re.compile(r'deutschkurs|sprachkurs|beratung|hilfe beim|sozialarbeit|nähen|näh-|nähwerkstatt|stricken|häkeln|fit und fun|'
                   r'bodywork|mama fit|cardio|kraftraum|coaching|elterntalk|autorität|paar bleiben|energie im|yoga|pilates|'
                   r'frauentreff|frauenwelt|großeltern|geflüchtete eltern|väterkreis|für eltern von schulkindern|schwanger|spenderkind|sprachcaf|für [a-zäöü ]*mütter|mütter(treff|café|cafe)', re.I)
TODDLER = re.compile(r'krabbel|spielgruppe|spielkreis|spielen|freispiel|zwerg|krümel|wichte|morgenkreis|knie-?reiter|babyclub|'
                     r'baby|eltern-kind|offener (eltern-kind-)?treff|offenes angebot|offener treff|frühstück|café|cafe|'
                     r'bewegungs|turnen|musik(?!alische früh)|sing|klang|mini melodien|entdecker|kreativ', re.I)
WHOLE_FAMILY = re.compile(r'krippenspiel|christvesper|familiengottesdienst|kindergottesdienst|laterne|martinsumzug|lichterfest|'
                          r'weihnachtsparade|weihnachtsmann|nikolaus|kinderprogramm auf dem|auf dem weihnachtsmarkt|'
                          r'bastel-?(werkstatt|hütte|station).*weihnacht|weihnachtsbastel|familientag|familienfest|kinderfest|'
                          r'für (die )?ganze familie|für alle familien|für groß und klein|groß und klein|für jung und alt|'
                          r'kinderflohmarkt|spielzeugflohmarkt|kinderkleider|rund ums kind|kindersachen', re.I)
STRONG = re.compile(r'krabbel|spielgruppe|spielkreis|zwerg|krümel|wichte|klang|eltern-kind|baby|bewegungs|turnen', re.I)  # courses
EKIZ = re.compile(r'eltern-kind-zentrum|\bekiz\b', re.I)
HOUSE = re.compile(r'elternschule|kifaz|kinder- und familienzentrum|familienzentrum|mütterzentrum|müze|familienbildung', re.I)
EKIZ_SOURCES = {'elbkinder_ekiz', 'diakonie_ekiz', 'drk_harburg_ekiz'}
NUMBERS = {'ein': 1, 'eins': 1, 'zwei': 2, 'drei': 3, 'vier': 4, 'fünf': 5, 'sechs': 6, 'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10,
           'elf': 11, 'zwölf': 12}
HOUSE_SOURCES = {'hh_elternschulen_programme', 'elternschule_niendorf_offen', 'muetterzentrum_bergedorf', 'awo_hamburg'}


def explicit_age(title, today):
    """(min, max) months from age words in the title that the importers' parser does not read, else (None, None)."""
    t = (title or '').lower().replace('‑', '-')
    t = re.sub(r'(\d),5', r'\1.5', t)
    t = re.sub(r'\b(eins|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)(?=\s*(jahr|-?j(?:ä|ae)hrig))',
               lambda m: str(NUMBERS[m.group(1)]), t)  # 'ab vier Jahren'
    num = lambda s: float(s)
    m = re.search(r'(\d+(?:\.5)?)\s*-?\s*(?:bis|[-–])\s*(\d+(?:\.5)?)\s*-?\s*j(?:ä|ae)hrig', t)  # '2-bis 5-jährigen', '1-3 Jährige'
    if m: return int(num(m.group(1)) * 12), int(num(m.group(2)) * 12) + 12
    m = re.search(r'(\d+(?:\.5)?)\s*-\s*j(?:ä|ae)hrig', t)  # 'mit 1-jährigen Kindern'
    if m: return int(num(m.group(1)) * 12), int(num(m.group(1)) * 12) + 12
    m = re.search(r'\bab\s*(\d+(?:\.5)?)\s*(jahr|j\.)', t)
    if m: return int(num(m.group(1)) * 12), None
    m = re.search(r'\bbis\s*(?:ca\.\s*)?(\d+)\s*(jahr|j\.)', t)  # 'Kinder bis 3 Jahre'
    if m and int(m.group(1)) <= 12: return 0, int(m.group(1)) * 12 + 12
    m = re.search(r'\bjahrg(?:ang|\.)\s*(20[12]\d)', t)  # 'Jahrgang 2021': age from the birth year
    if m:
        age = int(today[:4]) - int(m.group(1))
        if 0 <= age <= 14: return max(0, (age - 1) * 12), age * 12 + 12
    if re.search(r'(im )?ersten lebensjahr|1\. lebensjahr', t): return 0, 12
    if re.search(r'\bu\s?3\b|unter (drei|3) jahren?', t): return 0, 36
    return None, None


def guess_age(title, venue, provider, source, kind, topic):
    """(min, max) months estimated from the kind of offer and the provider, or (None, None) when not clear."""
    t = title or ''
    where = f'{venue or ""} {provider or ""}'
    if ADULT.search(t): return None, None
    if WHOLE_FAMILY.search(t): return 0, None
    if re.search(r'gedichte für wichte', t, re.I): return 0, 48
    if re.search(r'musikgarten', t, re.I): return 0, 48
    if re.search(r'(kleinkind|eltern-kind|baby)[- ]?(eltern-)?schwimm', t, re.I): return 12, 48
    if re.search(r'seepferdchen|frühschwimmer|kinderschwimm|schwimmschule für kinder anfänger|schwimmen anfänger kinder', t, re.I): return 48, 120
    if re.search(r'\b(bronze|silber|freischwimmer)\b', t, re.I): return 72, None
    if re.search(r'eltern-kind-turnen|krabbelturnen|turnzwerge', t, re.I): return 12, 72
    if re.search(r'vor- und grundschul', t, re.I): return 60, 132
    if re.search(r'grundschul(alter|kind|er\b)', t, re.I): return 72, 132
    if re.search(r'vorschul(alter|kind|e\b)', t, re.I): return 60, 84
    toddler = (kind == 'gruppe' and TODDLER.search(t)) or (kind == 'kurs' and STRONG.search(t))
    if toddler and (source in EKIZ_SOURCES or EKIZ.search(where)) and not re.search(r'früherziehung|väter', t, re.I): return 0, 36
    if toddler and (source in HOUSE_SOURCES or HOUSE.search(where)) and topic in ('krabbelgruppe', 'eltern_cafe', 'musik', 'pekip', 'lesen'):
        return 0, 72
    return None, None
