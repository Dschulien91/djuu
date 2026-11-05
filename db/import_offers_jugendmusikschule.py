"""Import the two pre-school offers of the Staatliche Jugendmusikschule Hamburg from its hamburg.de page.

The pages list the offer but no course dates; those come from the school's districts. So this keeps two recurring offers
without a schedule, and the link. Disallowed hamburg.de paths are not touched. Each offer is kept only while the page still
names it.
"""
import sys

from offers_util import clean, finish, get, group

SOURCE_ID = 'jugendmusikschule_hamburg'
PAGE = 'https://www.hamburg.de/politik-und-verwaltung/behoerden/bsfb/einrichtungen-beratung/staatliche-jugendmusikschule-hamburg/fachbereiche/grundfaecher-273234'
PROVIDER = 'Staatliche Jugendmusikschule Hamburg'
ADDRESS = 'Mittelweg 42, 20148 Hamburg'
OFFERS = [('Eltern-Kind-Kurse Musik', 'Eltern-Kind-Kurse', (6, 42)), ('Musikalische Früherziehung', 'Musikalische Früherziehung', (42, 84))]


def main():
    text = clean(get(PAGE).text)
    offers = [group(key, title, PAGE, PROVIDER, venue=PROVIDER, address=ADDRESS, age=age, registration='nötig', topic='musik',
                    schedule='Termine beim jeweiligen Stadtbereich der Musikschule')
              for title, key, age in OFFERS if key in text]
    return finish(SOURCE_ID, 'Staatliche Jugendmusikschule Hamburg: Grundfächer', PAGE, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
