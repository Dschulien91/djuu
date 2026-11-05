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


def join_address(street, town):
    return ', '.join(filter(None, [street, town])) or None


def school(p):
    return g(p, 'schulname'), {
        'address': join_address(g(p, 'adresse_strasse_hausnr'), g(p, 'adresse_ort')), 'phone': g(p, 'schul_telefonnr'),
        'website': g(p, 'schul_homepage'), 'email': g(p, 'schul_email'), 'type': (g(p, 'schulform') or '').replace('|', ', ') or None,
        'operator': g(p, 'rechtsform'), 'all_day': g(p, 'ganztagsform'), 'students': g(p, 'anzahl_schueler'),
        'languages': (g(p, 'fremdsprache_mit_klasse') or '').replace('|', ', ') or None, 'school_id': g(p, 'schul_id'),
        'site_type': g(p, 'schultyp'), 'stadtteil': g(p, 'stadtteil')}


def is_general_school(p):
    """Parents' schools only: no vocational or evening schools, no placeholder rows."""
    return (g(p, 'schulname') not in (None, 'ohne Angabe') and g(p, 'kapitelbezeichnung') != 'Berufliche Schulen'
            and not re.search('Abend|Studienkolleg', g(p, 'schulform') or ''))


def kita_office(p):
    return g(p, 'einrichtung_name'), {'address': join_address(g(p, 'adresse'), g(p, 'ort')), 'website': g(p, 'homepage'),
                                      'type': g(p, 'layer')}


def stadtteileltern(p):
    phone = g(p, 'telefonnummer')  # the layer drops the leading zero (e.g. 4043183063)
    return g(p, 'einrichtung'), {'address': join_address(g(p, 'adresse'), g(p, 'ort')), 'operator': g(p, 'traeger'), 'type': g(p, 'kategorie'),
                                 'phone': '+49' + phone if phone and phone.isdigit() else phone}


def play_street(p):
    start, end = p.get('von_station'), p.get('bis_station')
    return g(p, 'strassenname'), {'address': g(p, 'strassenname'), 'speed_limit': g(p, 'geschwindigkeit'), 'type': 'Verkehrsberuhigter Bereich',
                                  'section_length_m': end - start if isinstance(start, (int, float)) and isinstance(end, (int, float)) else None}


def play_device(p):
    # The Feinkartierung Grün has no device type (kategorie_3 is empty for all 'Spielgeräte'), so no 'playground_equipment' fact.
    return None, {'gruen_id': g(p, 'idnr'), 'park_name': g(p, 'benennung'), 'address': g(p, 'belegenheit'), 'green_type': g(p, 'gruenart'),
                  'stadtteil': g(p, 'stadtteil'), 'material': g(p, 'auspraegung'), 'as_of': g(p, 'stand')}


def is_ball_pitch(p):
    """No dataset names Bolzplätze: take large open sports surfaces in public green areas as likely pitches."""
    return (g(p, 'gruenart') in ('Spielplätze', 'Parkanlagen', 'Allgemeines Grün', 'Anderweitige Flächen')
            and (p.get('flaeche_quadratmeter') or 0) >= 250)


def ball_pitch(p):
    name = g(p, 'benennung')
    place = g(p, 'belegenheit')
    return (name if name and re.search('bolz', name, re.I) else f'Ballspielfeld {place}' if place else 'Ballspielfeld'), {
        'pitch_type': ('Ballspielfeld (abgeleitet aus Oberfläche, Größe und Lage)', 'derived', 0.7), 'surface': g(p, 'kategorie_2'),
        'area_m2': g(p, 'flaeche_quadratmeter'), 'address': place, 'park_name': name, 'gruen_id': g(p, 'idnr'),
        'green_type': g(p, 'gruenart'), 'stadtteil': g(p, 'stadtteil'), 'as_of': g(p, 'stand')}


def wfs_equals(prop, value):
    return ('<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:PropertyIsEqualTo>'
            f'<fes:ValueReference>{prop}</fes:ValueReference><fes:Literal>{value}</fes:Literal>'
            '</fes:PropertyIsEqualTo></fes:Filter>')


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
        **addr(p), 'website': g(p, 'homepage', 'link'), 'services': g(p, 'angebote'), 'profile': g(p, 'profil'),
        'wheelchair': 'yes' if re.search('barrierefrei', g(p, 'angebote') or '', re.I) else None})), None),
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
        g(p, 'Einrichtung'), {'description': g(p, 'Beschreibung'), 'drinking_water': 'refill',
                              'wheelchair': 'yes' if g(p, 'Hinweis') == 'barrierefrei' else None})), None),
    'hh_museen': ('wfs_museen', 'de.hh.up:museen', ('museum', lambda p: (g(p, 'einrichtung'), addr(p))), None),
    'hh_theater': ('wfs_theater', 'de.hh.up:theater', ('kultur', lambda p: (g(p, 'einrichtung'), {**addr(p), 'seats': g(p, 'gesamtplaetze')})), None),
    'hh_krankenhaeuser': ('HH_WFS_Krankenhaeuser', 'de.hh.up:gesundheit_krankenhaeuser', ('klinik', lambda p: (g(p, 'name'), {
        **addr(p), 'maternity': jn(p.get('geburtshilfe')), 'emergency': jn(p.get('not_und_unfallversorgung'))})), None),
    'hh_gruenplan': ('HH_WFS_Gruenplan', 'de.hh.up:verzeichnis_oeffentlicher_gruenanlagen', ('park', lambda p: (g(p, 'benennung'), {
        'address': g(p, 'belegenheit'), 'type': g(p, 'gruen_art'), 'area_ha': g(p, 'flaeche_ha'), 'gruen_id': g(p, 'idnr'),
        'as_of': g(p, 'aktualitaet')})), ('gruen_art', ['Spielplätze', 'Parkanlagen'])),
    'hh_spielstrassen': ('HH_WFS_Zulaessige_Hoechstgeschwindigkeiten', 'de.hh.up:verkehrsberuhigte_bereiche', ('spielstrasse', play_street), None),
    'hh_spielgeraete': ('wfs_feinkartierung_gruen', 'de.hh.up:punktobjekte', ('geraet', play_device), None),
    'hh_bolzplatz': ('wfs_feinkartierung_gruen', 'de.hh.up:flaechenobjekte', ('bolzplatz', ball_pitch), None),
    'hh_wochenmarkt': ('HH_WFS_Einzelhandel', 'de.hh.up:wochenmarkt', ('wochenmarkt', lambda p: (
        f"Wochenmarkt {g(p, 'wochenmarkt')}", {'type': 'Wochenmarkt', 'borough': g(p, 'bezirk')})), None),
    'hh_schulen_staatlich': ('HH_WFS_Schulen', 'de.hh.up:staatliche_schulen', ('schule', school), None),
    'hh_schulen_frei': ('HH_WFS_Schulen', 'de.hh.up:nicht_staatliche_schulen', ('schule', school), None),
    'hh_stadtteileltern': ('HH_WFS_Familien_Angebote', 'de.hh.up:stadtteileltern', ('beratung', stadtteileltern), None),
    'hh_kita_beratung': ('HH_WFS_Beratung_Kitabetreuung_Kitapflege', 'de.hh.up:abteilung_kitabetreuung', ('beratung', kita_office), None),
}

ZERO = 'dl-zero-de/2.0'
BVM = 'Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende (dl-de/by-2-0)'
SCHOOL_PERSONS = ('name_schulleiter', 'name_stellv_schulleiter', 'name_oberstufenkoordinator', 'name_verwaltungsleitung',
                  'ansprechp_klasse_1', 'ansprechp_klasse_5', 'ansprechp_buero', 'schulaufsicht')
OPTIONS = {
    # Per-layer settings beyond the default licence and record id:
    # ref: stable record id, wfs_filter: server-side filter, keep: client-side filter, drop: personal fields we never store.
    'hh_spielstrassen': {'attribution': BVM, 'ref': lambda p: '-'.join(str(p.get(k)) for k in ('von_netzknoten', 'nach_netzknoten', 'von_station', 'bis_station', 'ast'))},
    'hh_stadtteileltern': {'attribution': 'Freie und Hansestadt Hamburg, Behörde für Arbeit, Gesundheit, Soziales, Familie und Integration (Sozialbehörde) (dl-de/by-2-0)'},
    'hh_kita_beratung': {'attribution': 'Freie und Hansestadt Hamburg, Behörde für Arbeit, Gesundheit, Soziales, Familie und Integration (dl-de/by-2-0)'},
    'hh_spielgeraete': {'license': ZERO, 'attribution': 'Freie und Hansestadt Hamburg (dl-zero-de/2.0)', 'ref': lambda p: p.get('globalid'),
                        'wfs_filter': wfs_equals('kategorie_2', 'Spielgeräte')},
    'hh_bolzplatz': {'license': ZERO, 'attribution': 'Freie und Hansestadt Hamburg (dl-zero-de/2.0)', 'ref': lambda p: p.get('globalid'),
                     'wfs_filter': wfs_equals('kategorie_1', 'Sportplatzflächen'), 'keep': is_ball_pitch},
    'hh_wochenmarkt': {'attribution': 'Bezirksamt Bergedorf, Freie und Hansestadt Hamburg (dl-de/by-2-0)'},
    'hh_schulen_staatlich': {'attribution': 'Freie und Hansestadt Hamburg, Behörde für Schule und Berufsausbildung (dl-de/by-2-0)',
                             'keep': is_general_school, 'drop': SCHOOL_PERSONS, 'ref': lambda p: f"{p.get('schul_id')}-{p.get('standort_id')}"},
    'hh_schulen_frei': {'attribution': 'Freie und Hansestadt Hamburg, Behörde für Schule und Berufsausbildung (dl-de/by-2-0)',
                        'keep': is_general_school, 'drop': SCHOOL_PERSONS, 'ref': lambda p: f"{p.get('schul_id')}-{p.get('standort_id')}"},
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


def features(service, layer, wfs_filter=None):
    out, start = [], 0
    while True:
        params = {'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature', 'typeNames': layer,
                  'outputFormat': 'application/geo+json', 'srsName': 'EPSG:4326', 'count': 2000, 'startIndex': start}
        if wfs_filter: params['FILTER'] = wfs_filter
        r = fetch(BASE + service, params=params, timeout=300)
        batch = r.json().get('features', [])
        out += batch
        if len(batch) < 2000: return out
        start += 2000


def run(only=None):
    con = connect()
    for sid, (service, layer, (cat, mapper), filt) in LAYERS.items():
        if only and sid not in only: continue
        opt = OPTIONS.get(sid, {})
        try:
            feats = features(service, layer, opt.get('wfs_filter'))
        except Exception as e:
            print(f'{sid}: FAILED {e}'); continue
        for f in feats:
            for k in opt.get('drop', ()):
                (f.get('properties') or {}).pop(k, None)
        save_raw(f'{sid}.geojson', json.dumps(feats, ensure_ascii=False))
        register_source(con, sid, f'Hamburg Open Data: {layer.split(":")[1]}', f'{BASE}{service}', opt.get('license', 'dl-de/by-2-0'),
                        opt.get('attribution', ATTR), priority=70)
        recs = []
        for i, f in enumerate(feats):
            p = f.get('properties') or {}
            if filt and p.get(filt[0]) not in filt[1]: continue
            if opt.get('keep') and not opt['keep'](p): continue
            c = centroid(f.get('geometry'))
            if not c: continue
            name, facts = mapper(p)
            c_cat = cat
            if sid == 'hh_gruenplan' and p.get('gruen_art') == 'Spielplätze': c_cat = 'spielplatz'
            if sid == 'hh_sportstaetten' and p.get('typ') != 'Schwimmbad': c_cat = 'freizeit'
            ref = opt['ref'](p) if opt.get('ref') else f.get('id') or i
            recs.append({'ref': str(ref), 'category': c_cat, 'name': name, 'lat': c[0], 'lon': c[1],
                         'url': f'{BASE}{service}', 'raw': p, 'facts': {'name': name, **facts}})
        recs = list({r['ref']: r for r in recs}.values())  # one record per ref, so record_count matches the table
        print(f'{sid}: {replace_records(con, sid, recs)}')


if __name__ == '__main__':
    run(set(sys.argv[1:]) or None)
