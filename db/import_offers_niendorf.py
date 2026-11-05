"""Import the open weekly offers of Elternschule Niendorf from its 2026 flyer.

The half-year programme PDF of this school still ends in summer 2026, so hh_elternschulen_programme does not cover it. This
one-page flyer (elternschulen-eimsbuettel.de, robots.txt has no rule against it) is laid out freely and has no reliable text
order, so the facts are listed here by hand and each is kept only if the current flyer still contains its keyword. All end with
2026; the flyer is valid for that year and a new one needs a new URL.
"""
import re
import sys
from datetime import date

import io

import pdfplumber

from offers_util import WEEKDAYS, clean, finish, get, group, osm_coords

SOURCE_ID = 'elternschule_niendorf_offen'
PDF = 'https://elternschulen-eimsbuettel.de/wp-content/uploads/2026/01/offene-Angebote-2026.pdf'
LINK = 'https://elternschulen-eimsbuettel.de/elternschule-niendorf/'
PROVIDER = 'Elternschule Niendorf (Bezirksamt Eimsbüttel)'
END = date(2026, 12, 31)
# title, keyword in flyer, weekday, from, to, age in months
OFFERS = [
    ('Frühstückstreff', 'Frühstückstreff', 1, '10:00', '12:00', (None, None)),
    ('Welt erforschen für Krabbelkinder', 'Welt erforschen', 2, '10:00', '11:30', (6, 36)),
    ('Spiel und Spaß ab 1 Jahr mit Geschwistern', 'Spiel und Spaß', 2, '16:00', '17:30', (12, None)),
    ('Spiel und Spaß 1–3 Jahre mit Geschwistern', 'Spiel und Spaß', 3, '16:00', '18:00', (12, 48)),
    ('Frühstück mit „Gedichte für Wichte“', 'Gedichte für Wichte', 3, '10:00', '12:00', (None, None)),
]


def main():
    lat, lon = osm_coords('Elternschule Niendorf')
    with pdfplumber.open(io.BytesIO(get(PDF, timeout=60).content)) as pdf:
        text = clean(' '.join(p.extract_text() or '' for p in pdf.pages))
    offers = [group(f'{wd}:{tf}:{title[:30]}', title, LINK, PROVIDER, weekday=wd, time_from=tf, time_to=tt, venue='Elternschule Niendorf', lat=lat, lon=lon,
                    schedule=f'{WEEKDAYS[wd]} {tf}–{tt}, wöchentlich, offen', registration='offen', age=age, end=END)
              for title, key, wd, tf, tt, age in OFFERS if re.search(re.escape(key), text)]
    return finish(SOURCE_ID, 'Elternschule Niendorf: offene Angebote 2026', LINK, PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
