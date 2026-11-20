"""Djuu-Tipps: places that (almost) every parent loves.

Two kinds of entries:
- EDITORIAL: hand-picked by the Djuu team (place name + district + the categories it may have, short reason). Edit this list to curate.
  The category check keeps a tip on the place that is meant: 'Hof Bullerbü' is the café, not 'Kita Hof Bullerbü' next door.
- automatic candidates by clear rules from the data (marked 'auto'), so the team can review them. Kitas never get one
  (their playgrounds are for the Kita's own children).
Reasons only state what the data supports; no invented claims.
"""
import re

GASTRO = ('cafe', 'restaurant', 'imbiss', 'eis', 'familienfreundlich')
INDOOR = ('indoor', 'freizeit', 'spielhaus')
EDITORIAL = [
    # (name substring, district or None, allowed categories, reason)
    ('KIKAKU Kinderkaffeekuchen', 'Lurup', GASTRO, 'Kindercafé: ganz auf Kinder ausgerichtet, mit Spielbereich.'),
    ('Kinder Glück - SpieleCafé', 'Rahlstedt', GASTRO, 'Spielecafé: Kinder spielen, Eltern trinken in Ruhe Kaffee.'),
    ('Familiencafé Krümel', 'Dulsberg', GASTRO, 'Familiencafé für Eltern mit kleinen Kindern.'),
    ('Lille Kinder Buchhandel', 'Altona-Nord', GASTRO + ('laden',), 'Kinderbuchladen mit Café und Spielecke.'),
    ('Café am Planschbecken', 'Winterhude', GASTRO, 'Café direkt am Planschbecken im Stadtpark.'),
    ('Hof Bullerbü', 'Steilshoop', GASTRO + ('tierhof',), 'Hofcafé mit Hofladen, Kinder können draußen toben.'),
    ('Restaurant am Spielplatz', 'Stellingen', GASTRO, 'Essen gehen mit Blick auf den Spielplatz.'),
    ('Bambini City', 'Eppendorf', INDOOR, 'Indoor-Spielwelt für Kleinkinder.'),
    ('Monkey Island', 'Lohbrügge', INDOOR, 'Großer Indoorspielplatz für Regentage.'),
    ('Falgas - Kids Play', 'Barmbek-Süd', INDOOR, 'Indoorspielplatz für Regentage.'),
    ('SpielScheune der Geschichten', 'Neuallermöhe', INDOOR, 'Indoor-Spielscheune für Regentage.'),
    ('JUMP House', None, INDOOR, 'Trampolinhalle: auspowern bei jedem Wetter.'),
    ('Großer Spielplatz Bullerberge', 'St. Pauli', ('spielplatz', 'abenteuer'), 'Riesiger Spielplatz in Planten un Blomen mit Wasserspiel.'),
    ('Wasserspielplatz', 'St. Pauli', ('spielplatz',), 'Wasserspielplatz in Planten un Blomen.'),
    ('Geburtshaus Hamburg', 'Ottensen', ('geburtshaus', 'kurs'), 'Geburtshaus mit Kursen rund um Schwangerschaft und Baby.'),
]
KITA_NAME = re.compile(r'\bkita\b|\bkiga\b|kindergarten|kindertagesst|krippe|\bkts\b', re.I)


def editorial_match(name, district, cat=None):
    for sub, dist, cats, reason in EDITORIAL:
        if name and sub.lower() in name.lower() and (dist is None or dist == district) and (cat is None or cat in cats):
            return reason
    return None


def auto_reason(cat, facts, name=None):
    """Rule-based candidates: adventure playgrounds, very large playgrounds. Never Kitas or a Kita's own playground."""
    if cat == 'kita' or (name and KITA_NAME.search(name)):
        return None
    if cat == 'abenteuer':
        return 'Betreuter Abenteuer- oder Bauspielplatz: bauen, werken, draußen sein (Stadt Hamburg).'
    if cat == 'spielplatz':
        n = int(facts.get('device_count', [0])[0] or 0)
        water = facts.get('water_play', [None])[0] == 'yes'
        if n >= 20 or (n >= 12 and water):
            return f'Großer Spielplatz mit {n} Spielgeräten' + (' und Wasserspiel.' if water else '.')
    return None
