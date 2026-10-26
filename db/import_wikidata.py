"""Import family-relevant items in Hamburg from Wikidata (CC0). Bounding-box query (fast), filtered by direct class."""
import csv
import io
import re

from common import connect, fetch, register_source, replace_records, save_raw

ENDPOINT = 'https://query.wikidata.org/sparql'
TYPES = {  # direct Wikidata class (P31, no subclass walk: fast) -> Djuu category
    'Q33506': 'museum', 'Q207694': 'museum', 'Q17431399': 'museum', 'Q1595639': 'museum', 'Q588140': 'museum',
    'Q2087181': 'museum', 'Q43501': 'ausflug', 'Q2281788': 'ausflug', 'Q148319': 'ausflug', 'Q22698': 'park',
    'Q1107656': 'park', 'Q167346': 'park', 'Q11875349': 'spielplatz', 'Q194195': 'ausflug', 'Q1501': 'baden',
    'Q2085381': 'baden', 'Q24354': 'kultur', 'Q153562': 'kultur', 'Q41253': 'kultur', 'Q28564': 'buecherei',
    'Q1076486': 'indoor', 'Q2516357': 'ausflug', 'Q1060829': 'kultur',
}
QUERY = """SELECT ?item ?itemLabel ?type ?coord ?website ?image ?osm WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(9.72 53.39)"^^geo:wktLiteral ;
                    wikibase:cornerNorthEast "Point(10.33 53.75)"^^geo:wktLiteral . }
  VALUES ?type { %s }
  ?item wdt:P31 ?type .
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  OPTIONAL { ?item wdt:P856 ?website } OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P402 ?osm }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}"""


def run():
    con = connect()
    register_source(con, 'wikidata', 'Wikidata', 'https://www.wikidata.org', 'CC0 1.0', 'Wikidata (CC0)', priority=50)
    items, dump = {}, []
    values = ' '.join('wd:' + q for q in TYPES)
    r = fetch(ENDPOINT, params={'query': QUERY % values}, headers={'Accept': 'text/csv'}, timeout=120, retries=4)
    dump.append(r.text)
    for row in csv.DictReader(io.StringIO(r.text)):
        m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', row['coord'])
        if not m: continue
        ref = row['item'].rsplit('/', 1)[1]
        cat = TYPES[row['type'].rsplit('/', 1)[1]]
        if ref in items: continue
        if cat == 'buecherei' and not re.search(r'bücherhalle|stadtbibliothek|kinder', row['itemLabel'], re.I): continue
        items[ref] = {'ref': ref, 'category': cat, 'name': row['itemLabel'], 'lat': float(m[2]), 'lon': float(m[1]),
                      'url': row['item'], 'raw': row,
                      'facts': {'name': row['itemLabel'], 'website': row['website'], 'image': row['image'], 'osm_relation': row['osm']}}
    save_raw('wikidata.csv', '\n'.join(dump))
    print('wikidata:', replace_records(con, 'wikidata', items.values()))


if __name__ == '__main__':
    run()
