"""Djuu-Tipps: places that (almost) every parent loves.

Two kinds of entries:
- EDITORIAL: hand-picked by the Djuu team (place name + district, short reason). Edit this list to curate.
- automatic candidates by clear rules from the data (marked 'auto'), so the team can review them.
Reasons only state what the data supports; no invented claims.
"""
import re

EDITORIAL = [
    # (name substring, district or None, reason)
    ('KIKAKU Kinderkaffeekuchen', 'Lurup', 'Kindercafé: ganz auf Kinder ausgerichtet, mit Spielbereich.'),
    ('Kinder Glück - SpieleCafé', 'Rahlstedt', 'Spielecafé: Kinder spielen, Eltern trinken in Ruhe Kaffee.'),
    ('Familiencafé Krümel', 'Dulsberg', 'Familiencafé für Eltern mit kleinen Kindern.'),
    ('Lille Kinder Buchhandel', 'Altona-Nord', 'Kinderbuchladen mit Café und Spielecke.'),
    ('Café am Planschbecken', 'Winterhude', 'Café direkt am Planschbecken im Stadtpark.'),
    ('Hof Bullerbü', 'Steilshoop', 'Hofcafé mit Hofladen, Kinder können draußen toben.'),
    ('Restaurant am Spielplatz', 'Stellingen', 'Essen gehen mit Blick auf den Spielplatz.'),
    ('Bambini City', 'Eppendorf', 'Indoor-Spielwelt für Kleinkinder.'),
    ('Monkey Island', 'Lohbrügge', 'Großer Indoorspielplatz für Regentage.'),
    ('Falgas - Kids Play', 'Barmbek-Süd', 'Indoorspielplatz für Regentage.'),
    ('SpielScheune der Geschichten', 'Neuallermöhe', 'Indoor-Spielscheune für Regentage.'),
    ('JUMP House', None, 'Trampolinhalle: auspowern bei jedem Wetter.'),
    ('Großer Spielplatz Bullerberge', 'St. Pauli', 'Riesiger Spielplatz in Planten un Blomen mit Wasserspiel.'),
    ('Wasserspielplatz', 'St. Pauli', 'Wasserspielplatz in Planten un Blomen.'),
    ('Geburtshaus Hamburg', 'Ottensen', 'Geburtshaus mit Kursen rund um Schwangerschaft und Baby.'),
]


def editorial_match(name, district):
    for sub, dist, reason in EDITORIAL:
        if name and sub.lower() in name.lower() and (dist is None or dist == district):
            return reason
    return None


def auto_reason(cat, facts):
    """Rule-based candidates: adventure playgrounds, very large playgrounds, family centres with groups."""
    if cat == 'abenteuer':
        return 'Betreuter Abenteuer- oder Bauspielplatz: bauen, werken, draußen sein (Stadt Hamburg).'
    if cat == 'spielplatz':
        n = int(facts.get('device_count', [0])[0] or 0)
        water = facts.get('water_play', [None])[0] == 'yes'
        if n >= 20 or (n >= 12 and water):
            return f'Großer Spielplatz mit {n} Spielgeräten' + (' und Wasserspiel.' if water else '.')
    return None
