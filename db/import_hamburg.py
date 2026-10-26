"""Import official open data of the Free and Hanseatic City of Hamburg (geodienste.hamburg.de WFS).

License: Datenlizenz Deutschland Namensnennung 2.0 (dl-de/by-2-0), attribution "Freie und Hansestadt Hamburg".
Each layer becomes its own source id ('hh_<layer>') so every value can be traced to the exact dataset.
"""
import json
import re
import sys

from common import connect, fetch, register_source, replace_records, save_raw

BASE = 'https://geodienste.hamburg.de/'
ATTR = 'Freie und Hansestadt Hamburg (dl-de/by-2-0)'


def g(p, *keys):
    for k in keys:
        v = p.get(k)
        if v not in (None, '', ' '): return str(v).strip()
    return None


def jn(v):
    if v is None: return None
    v = str(v).strip().lower()
    return 'yes' if v in ('ja', 'j', 'true', '1', 'yes', 'x') else 'no' if v in ('nein', 'n', 'false', '0', 'no') else None


def addr(p):
    return {'address': g(p, 'adresse', 'Adresse', 'belegenheit', 'standort'),
            'phone': g(p, 'telefonnummer', 'telefon', 'Telefon', 'schul_telefonnr'),
            'website': g(p, 'link', 'homepage', 'website', 'internet', 'link_zu_details'),
            'email': g(p, 'e_mail', 'email')}


def okja(cat):
    def f(p):
        ages = [k for k, lbl in (('kinder_0_bis_unter3_jahre', '0-3'), ('kinder_3_bis_unter_6_jahre', '3-6'),
                                 ('kinder_6_bis_unter_10_jahre', '6-10'), ('kinder_10_bis_unter_14_jahre', '10-14'),
                                 ('jugendliche_14_bis_unter_18_jahre', '14-18')) if jn(p.get(k)) == 'yes' for k in [lbl]]
        return g(p, 'einrichtung'), {**addr(p), 'operator': g(p, 'traeger'), 'type': g(p, 'typ_der_einrichtung'),
                                     'age_groups': ','.join(ages) or None,
                                     'weekend_share': g(p, 'wochenende_tagsueber_prozent')}
    return cat, f


def family(cat):
    return cat, lambda p: (g(p, 'einrichtung'), {**addr(p), 'operator': g(p, 'traeger', 'traeger_name'), 'type': g(p, 'kategorie', 'kategorie_2')})


LAYERS = {
    # source id: (service, layer, (category, mapper), filter or None)
    'hh_kitas': ('HH_WFS_KitaEinrichtung', 'app:KitaEinrichtungen', ('kita', lambda p: (g(p, 'Name'), {
        'address': ' '.join(filter(None, [g(p, 'Strasse'), g(p, 'Hausnr')])), 'postcode': g(p, 'PLZ'), 'phone': g(p, 'Telefon'),
        'care_types': g(p, 'Leistungsarten'), 'children': g(p, 'Anzahl_betreuter_Kinder'), 'description': g(p, 'Zusatztextkita'),
        'as_of': g(p, 'Erhebungsstichtag')})), None),
    'hh_spielhaus': ('HH_WFS_OKJA', 'de.hh.up:spielhaus', okja('spielhaus'), None),
    'hh_bauspielplatz': ('HH_WFS_OKJA', 'de.hh.up:bauspielplatz', okja('spielplatz'), None),
    'hh_kindertreff': ('HH_WFS_OKJA', 'de.hh.up:kindertreff', okja('treffpunkt'), None),
    'hh_spielmobil': ('HH_WFS_OKJA', 'de.hh.up:spielmobil', okja('treffpunkt'), None),
    'hh_haus_der_jugend': ('HH_WFS_OKJA', 'de.hh.up:haus_der_jugend', okja('treffpunkt'), None),
    'hh_kinderangebot_kultur': ('HH_WFS_OKJA', 'de.hh.up:kinderangebot_stadtteil_kulturzentrum', okja('treffpunkt'), None),
    'hh_ekiz': ('HH_WFS_Familien_Angebote', 'de.hh.up:eltern_kind_zentrum', family('treffpunkt'), None),
    'hh_familienteam': ('HH_WFS_Familien_Angebote', 'de.hh.up:familienteam', family('beratung'), None),
    'hh_elternschule': ('HH_WFS_Familien_Angebote', 'de.hh.up:familienbildung_und_beratung', family('treffpunkt'), None),
    'hh_familienbildung_konf': ('HH_WFS_Familien_Angebote', 'de.hh.up:konfessionelle_familienbildungsstaette', family('treffpunkt'), None),
    'hh_lotsendienst': ('HH_WFS_Familien_Angebote', 'de.hh.up:lotsendienst_geburtsklinik', family('beratung'), None),
    'hh_erziehungsberatung': ('HH_WFS_Familien_Angebote', 'de.hh.up:institutionelle_erziehungsberatung', family('beratung'), None),
    'hh_muetterberatung': ('wfs_muetterberatung', 'de.hh.up:muetterberatung', ('beratung', lambda p: (
        ' – '.join(filter(None, [g(p, 'objektname'), g(p, 'zusatz_einrichtungsname')])), {**addr(p), 'services': g(p, 'leistungen'),
        'audience': g(p, 'zielgruppenbeschreibung'), 'fee_text': g(p, 'kosten'), 'opening_days': g(p, 'oeffnungstage')})), None),
    'hh_spielplaetze_highlights': ('wfs_spielplaetze', 'de.hh.up:spielplaetze_hh', ('spielplatz', lambda p: (g(p, 'name'), {
        'description': g(p, 'beschreibung'), 'website': g(p, 'link'), 'image': g(p, 'bild'), 'transit': g(p, 'anbindung'),
        'water_play': 'yes' if re.search('wasser', g(p, 'beschreibung') or '', re.I) else None})), None),
    'hh_wc': ('wfs_wc_mit_trinkbrunnen', 'de.hh.up:wc_mit_trinkbrunnen', ('wc', lambda p: (g(p, 'standort', 'toilette'), {
        **addr(p), 'changing_table': jn(p.get('wickeltisch')), 'fee': 'no' if jn(p.get('kostenlos')) == 'yes' else jn(p.get('kostenlos')) and 'yes',
        'wheelchair': jn(p.get('behindertengerecht')), 'unisex': jn(p.get('genderneutral')), 'drinking_water': 'yes', 'type': g(p, 'toilette')})), None),
    'hh_bibliotheken': ('HH_WFS_Oeffentliche_Bibliotheken', 'de.hh.up:oeffentliche_bibs', ('buecherei', lambda p: (g(p, 'bezeichnung'), {
        **addr(p), 'website': g(p, 'homepage', 'link'), 'services': g(p, 'angebote'), 'profile': g(p, 'profil')})), None),
    'hh_sportstaetten': ('HH_WFS_Sportstaetten', 'de.hh.up:sportstaetten', ('baden', lambda p: (g(p, 'name', 'einrichtung'), {
        **addr(p), 'type': g(p, 'typ'), 'operator': g(p, 'vereinsname')})), ('typ', ['Schwimmbad', 'Kletteranlage', 'Skateanlage', 'Bewegungsinsel'])),
    'hh_badestellen': ('HH_WFS_Badegewaesser', 'app:badegewaesser', ('baden', lambda p: (g(p, 'name'), {
        'season': g(p, 'badesaison'), 'water_quality_eu': g(p, 'eg_einstufung'), 'water_status': g(p, 'bemerkung_bsu'),
        'note': g(p, 'hinweis'), 'website': g(p, 'link_zu_details'), 'type': 'Badestelle'})), None),
    'hh_wasser_spass': ('HH_WFS_Spass_im_und_am_Wasser', 'app:spass_im_und_am_wasser', ('baden', lambda p: (g(p, 'name'), {
        **addr(p), 'type': g(p, 'kategorie'), 'description': g(p, 'kurztext')})), None),
    'hh_hundeauslauf_p8': ('HH_WFS_Hundeauslaufzonen_Paragraf_8', 'de.hh.up:hundeauslaufzonen_paragraf_8', ('hundeauslauf', lambda p: (
        g(p, 'bezeichnung', 'gesamtanlage'), {'address': g(p, 'belegenheit'), 'dog': 'offleash', 'dog_rule': 'Auslaufzone §8: alle Hunde', 'area_m2': g(p, 'flaeche_in_qm')})), None),
    'hh_hundeauslauf_p9': ('HH_WFS_Hundeauslaufzonen_Paragraf_9', 'de.hh.up:hundeauslaufzonen_paragraf_9', ('hundeauslauf', lambda p: (
        g(p, 'anlagenname', 'gesamtanlage'), {'address': g(p, 'belegenheit'), 'dog': 'offleash', 'dog_rule': 'Auslauf §9: nur geprüfte Hunde', 'area_m2': g(p, 'flaeche_in_qm')})), None),
    'hh_trinkbrunnen': ('wfs_trinkwasserbrunnen', 'de.hh.up:trinkwasserbrunnen', ('trinkwasser', lambda p: (
        'Trinkbrunnen', {'address': g(p, 'adresse'), 'description': g(p, 'angebot'), 'drinking_water': 'yes'})), None),
    'hh_refill': ('wfs_refill_station_hamburg', 'de.hh.up:refill_station_hamburg', ('trinkwasser', lambda p: (
        g(p, 'Einrichtung'), {'description': g(p, 'Beschreibung'), 'drinking_water': 'refill'})), None),
    'hh_museen': ('wfs_museen', 'de.hh.up:museen', ('museum', lambda p: (g(p, 'einrichtung'), addr(p))), None),
    'hh_theater': ('wfs_theater', 'de.hh.up:theater', ('kultur', lambda p: (g(p, 'einrichtung'), {**addr(p), 'seats': g(p, 'gesamtplaetze')})), None),
    'hh_krankenhaeuser': ('HH_WFS_Krankenhaeuser', 'de.hh.up:gesundheit_krankenhaeuser', ('klinik', lambda p: (g(p, 'name'), {
        **addr(p), 'maternity': jn(p.get('geburtshilfe')), 'emergency': jn(p.get('not_und_unfallversorgung'))})), None),
    'hh_gruenplan': ('HH_WFS_Gruenplan', 'de.hh.up:verzeichnis_oeffentlicher_gruenanlagen', ('park', lambda p: (g(p, 'benennung'), {
        'address': g(p, 'belegenheit'), 'type': g(p, 'gruen_art'), 'area_ha': g(p, 'flaeche_ha'), 'gruen_id': g(p, 'idnr'),
        'as_of': g(p, 'aktualitaet')})), ('gruen_art', ['Spielplätze', 'Parkanlagen'])),
}


def centroid(geom):
    pts = []
    def walk(c):
        if c and isinstance(c[0], (int, float)): pts.append(c)
        else:
            for x in c or []: walk(x)
    walk(geom['coordinates'] if geom else [])
    if not pts: return None
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


def features(service, layer):
    out, start = [], 0
    while True:
        r = fetch(BASE + service, params={'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature', 'typeNames': layer,
                                          'outputFormat': 'application/geo+json', 'srsName': 'EPSG:4326', 'count': 2000, 'startIndex': start},
                  timeout=300)
        batch = r.json().get('features', [])
        out += batch
        if len(batch) < 2000: return out
        start += 2000


def run(only=None):
    con = connect()
    for sid, (service, layer, (cat, mapper), filt) in LAYERS.items():
        if only and sid not in only: continue
        try:
            feats = features(service, layer)
        except Exception as e:
            print(f'{sid}: FAILED {e}'); continue
        save_raw(f'{sid}.geojson', json.dumps(feats, ensure_ascii=False))
        register_source(con, sid, f'Hamburg Open Data: {layer.split(":")[1]}', f'{BASE}{service}', 'dl-de/by-2-0', ATTR, priority=70)
        recs = []
        for i, f in enumerate(feats):
            p = f.get('properties') or {}
            if filt and p.get(filt[0]) not in filt[1]: continue
            c = centroid(f.get('geometry'))
            if not c: continue
            name, facts = mapper(p)
            c_cat = cat
            if sid == 'hh_gruenplan' and p.get('gruen_art') == 'Spielplätze': c_cat = 'spielplatz'
            if sid == 'hh_sportstaetten' and p.get('typ') != 'Schwimmbad': c_cat = 'freizeit'
            recs.append({'ref': str(f.get('id') or i), 'category': c_cat, 'name': name, 'lat': c[0], 'lon': c[1],
                         'url': f'{BASE}{service}', 'raw': p, 'facts': {'name': name, **facts}})
        print(f'{sid}: {replace_records(con, sid, recs)}')


if __name__ == '__main__':
    run(set(sys.argv[1:]) or None)
