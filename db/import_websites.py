"""Scan the websites of places for family features (changing table, high chair, play corner, kids menu, nursing room,
pram and wheelchair access, dogs).

Two steps, so the rules can be tuned without crawling again:
  crawl  fetch the pages and keep only short keyword windows (max 200 characters) in data/raw/websites_crawl.jsonl.
         Resumes after a failure: URLs already in that file are skipped. 'crawl --retry' tries failed URLs again.
  write  judge the windows with classify() and store the facts (method 'website', with an evidence snippet of at most
         200 characters showing that fact). Replaces all records of the source 'website'.
  prune  remove windows that did not become a fact from the local file.
Without an argument the script runs all three, starting over if the crawl file is older than two weeks. 'fresh' always starts over.

Polite: honours robots.txt and AI crawler opt-outs, one request per host at a time with a delay, neutral user agent,
at most MAX_PAGES pages per site, no way around blocks. A site that opts out or refuses us keeps no facts.
Keying: records use the place id as source_ref (merge.py joins them on it). A place that already has a website record
keeps that record's ref, because merge.py derives the id of a website-only place from it.
"""
import json
import random
import re
import sqlite3
import sys
import threading
import time
import urllib.robotparser
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

import common
from common import RAW_DIR, connect, fetch, register_source, replace_records, save_raw

STATE = RAW_DIR / 'websites_crawl.jsonl'
MAX_PAGES = 5  # start page + 4 sub-pages; the legal page read for the terms check is extra and never searched for facts
MAX_BYTES = 3_000_000
MAX_STATE_AGE = 14 * 86400  # a plain run starts over after this long; younger crawl files count as an interrupted run
WINDOW = 200
WORKERS = 40  # different hosts only, see do_host
CHAIN_MIN = 6  # a host used by this many places is a chain: its statements are not about one branch
CHAIN_MAX_URLS = 30
SHARED_URL_MIN = 3  # same URL for this many places: only chain-wide facts count

GASTRO = {'cafe', 'restaurant', 'imbiss', 'eis', 'familienfreundlich'}
SHOP = {'laden', 'windeln', 'apotheke'}
OUTDOOR = {'park', 'spielplatz'}
HEALTH = {'kinderarzt', 'klinik', 'hebamme', 'beratung'}
# 'kita' and 'schule' stay out on purpose: their changing rooms and play corners are not open to visitors.
CATS = sorted(GASTRO | SHOP | OUTDOOR | HEALTH | {'indoor', 'museum', 'buecherei', 'baden', 'ausflug', 'kultur', 'freizeit',
                                                   'treffpunkt', 'wickel', 'spielhaus'})
NO_SCAN_HOSTS = (  # legal pages forbid any use of the content without written permission, or forbid scraping outright
    'hagenbeck.de', 'carroux.de', 'lap.coffee', 'ernst-deutsch-theater.de', 'chefswarehouse.de', 'zum-eichbaum.de', 'theaterschiff.de',
    'wokexpress.de', 'mgf-farmsen.de', 'tabea-fachklinik.de', 'togao.de', 'bahn.de', 'gotchamatcha.de', 'coast-hamburg.de', 'clouds-hamburg.de',
    'east-hamburg.de', 'avihamburg.de', 'einkaufsbahnhof.de')
SKIP_HOSTS = (  # not the place's own site: directories, social media, portals with articles about many things
    'hamburg.de', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com', 'linkedin.com', 'xing.com',
    'pinterest.com', 'wikipedia.org', 'wikimedia.org', 'google.com', 'google.de', 'goo.gl', 'g.page', 'linktr.ee', 'tripadvisor.de',
    'tripadvisor.com', 'yelp.de', 'yelp.com', 'lieferando.de', 'opentable.de', 'opentable.com', 'quandoo.de', 'thefork.de', 'speisekarte.de',
    'restaurantguru.com', 'wolt.com', 'ubereats.com', 'hamburg-aktiv.info', 'bahnhof.de', 'gelbeseiten.de', 'meinestadt.de', 'jameda.de',
    'doctolib.de', 'hamburg-tourism.de', 'hamburg-travel.com', 'geocaching.com', 'komoot.de', 'whatsapp.com', 'wa.me', 't.me', 'spotify.com')
KITA_HOST = re.compile(r'kita|krippe|kindergarten|kindertagesst', re.I)

AI_AGENTS = ('ClaudeBot', 'Claude-Web', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'CCBot',
             'Google-Extended', 'Applebot-Extended', 'PerplexityBot', 'Meta-ExternalAgent', 'cohere-ai', 'Bytespider', 'Amazonbot')
CONTENT_SIGNAL_NO = re.compile(r'(?im)^\s*content-signal\s*:.*\bai-(train|input)\s*=\s*no\b')
NOAI_META = re.compile(r'\bno-?(ai|imageai)\b', re.I)
META_TAG = re.compile(r'(?is)<meta\b[^>]*>')
LINK_TAG = re.compile(r'''(?is)<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>(.*?)</a>''')

PAGE_DENY = re.compile(r'impressum|imprint|datenschutz|privacy|cookie|agb\b|terms|nutzungsbedingung|widerruf|disclaimer|rechtlich|legal|karriere|career|'
                       r'jobs?\b|stellen|bewerb|presse|press\b|news|blog|aktuell|magazin|ratgeber|artikel|archiv|warenkorb|cart|checkout|konto|account|'
                       r'login|produkt|product|shop\b|/20\d\d/|/(en|fr|es|it|tr|ru|pl|ar)(/|$)|[?&](lang|page|p)=|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp[34]|ics)(\?|$)', re.I)
SUB_TIERS = [re.compile(r'famili|kinder|kids|family|faq|häufige|haeufig|fragen|barriere|accessib', re.I),
             re.compile(r'speisekarte|speisen|men(ü|ue|u)\b|karte\b|service|ausstattung|besuch|wissenswert|gut.?zu.?wissen|info', re.I),
             re.compile(r'über.?uns|ueber.?uns|about|das.?haus|location|räum|raeum|anfahrt|hausordnung|regeln', re.I),
             re.compile(r'kontakt|contact|reservier', re.I)]
LEGAL_LINK = [re.compile(r'nutzungsbedingung|nutzungsbestimmung|terms', re.I), re.compile(r'rechtlich|legal|rechtshinweis|disclaimer', re.I),
              re.compile(r'impressum|imprint', re.I)]
TERMS_STRICT = re.compile(r'text.{0,6}data.?mining|data.?mining|scraping|scrapen|web.?crawl|\bcrawler\b|automatisiert\w*\s+(auslesen|abruf|zugriff|erfass|auswert|extrah|erheb)|'
                          r'ki-?training|training von ki|§\s?44b|nutzungsvorbehalt', re.I)
TERMS_GENERAL = re.compile(r'(jegliche|jede)\s[^.]{0,40}(nutzung|verwendung|verwertung)[^.]{0,80}(ohne|nur mit|bedarf|untersagt|nicht gestattet)|'
                           r'(nutzung|verwendung|übernahme|weiterverwendung)[^.]{0,40}(inhalte?n?|daten|texte?n?|informationen)[^.]{0,60}(untersagt|verboten|nicht gestattet)', re.I)
KITA_WORD = re.compile(r'\bkitas?\b|kindertagesst|\bkrippe|\bkindergarten', re.I)
HIDE_ATTR = re.compile(r'cookie|consent|gdpr|dsgvo|usercentrics|borlabs|onetrust', re.I)
BLOCK_TAGS = ['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'td', 'th', 'section', 'article', 'header', 'footer', 'nav',
              'aside', 'main', 'button', 'option', 'dt', 'dd', 'table', 'hr', 'summary', 'details', 'figcaption', 'label']

# Wide patterns: anything that may be a mention. classify() then decides.
CANDIDATES = {
    'changing_table': r'wickel-?(tisch|raum|räume|raeume|möglichkeit|moeglichkeit|platz|plätze|plaetze|station|bereich|ecke|zimmer|kommode|auflage)|'
                      r'still-? und wickel|baby-?changing|changing[- ](table|room|facilit)',
    'highchair': r'hochst(ü|ue)hl|hochstuhl|kinderst(ü|ue)hl|kinderstuhl|babyst(ü|ue)hl|babystuhl|babysitz|high-?chair',
    'kids_area': r'(kinder)?spiel-?e?cke|kinderecke|kids? ?corner|(kinder)?spielzimmer|(kinder)?spielbereich|kinderbereich|kinderparadies|bällebad|baellebad|'
                 r'(kinder)?spielplatz|play ?(area|corner|room)',
    'kids_menu': r'kinderkarten?\b|kinderspeisekarte|kindermen(ü|ue|u)|kinderteller|kindergericht|kinderportion|kids? ?men(u|ü)|für (unsere )?kleinen? gäste',
    'babyccino': r'babyc+ino|kinderc+ino|kindercappuccino',
    'baby_feeding': r'\bstill-?(raum|räume|ecke|zimmer|bereich|möglichkeit|moeglichkeit|freundlich|platz|plätze)|\bstill-? und wickel|\bstillen\b|nursing room|breastfeeding',
    'stroller': r'kinderwagen|buggys?\b|stufenlos|ebenerdig',
    'wheelchair': r'barrierefrei|barrierearm|rollstuhl|wheelchair',
    'dog': r'\bhunde?\b|\bhunden\b|hundefreundlich|hundenapf|wassernapf|vierbeiner|\bhaustiere?n?\b|\bdogs?\b|hundeverbot',
}
CANDIDATE_RX = {k: re.compile(p, re.I) for k, p in CANDIDATES.items()}

# ---- judging ----
REJECT_ANY = re.compile(r'cookie|datenschutz|dsgvo|\bagb\b|impressum|haftung|gewährleistung|stellenangebot|bewerb|ausbildung|wir suchen|verstärkung|'
                        r'erzieher|\bkitas?\b|\bkrippe|kindergarten|kindertagesst|\bhort\b|\bschule|gruppenraum|praktik|ferienwohnung|ferienhaus|appartement|'
                        r'hotelzimmer|babybett|wohnung|neubau|tipps?\b|ratgeber|checkliste|\bstudie|\bblog\b|erfahrungsbericht|rezension|bewertungen|\bkurs(e|en)?\b|'
                        r'workshop|referent|seminar|vortrag', re.I)
PRODUCT = re.compile(r'warenkorb|in den korb|versandkosten|versandfertig|artikelnummer|art\.-?\s?nr|lieferzeit|inkl\.?\s?mwst|\buvp\b|\bkaufen\b|sortiment|'
                     r'\bmarken\b|zubehör|\bmöbel\b|\b\d+,\d\d\s?(€|eur)', re.I)
QUESTION_ANSWER_YES = re.compile(r'^\W*(ja\b|klar\b|natürlich|selbstverständlich|sicher\b|gern|aber sicher|auf jeden fall|in unser|wir haben|es gibt|vorhanden|'
                                 r'im |in der|auf der|neben|direkt|yes\b|of course)', re.I)
QUESTION_ANSWER_NO = re.compile(r'^\W*(nein\b|leider|bisher nicht|noch nicht|no\b|wir haben (leider )?kein|es gibt (leider )?kein)', re.I)
NEG_BEFORE = re.compile(r'\b(kein(e|en|em|er|es)?|weder|no)\b(?!\s+problem)[^,|]{0,35}$', re.I)
NICHT_BEFORE = re.compile(r'\b(nicht|nie|niemals|ohne)\b(?!\s+nur)[^,|]{0,30}$', re.I)
NEG_AFTER = re.compile(r'^[^.!?|]{0,45}\b(nicht (vorhanden|verfügbar|möglich|erlaubt|gestattet|zur verfügung|geeignet|zugänglich|erreichbar|barrierefrei|befahrbar|gestattet|willkommen|mitgenommen|mitgebracht|mitbringen)|'
                       r'leider nicht|leider kein|gibt es nicht|gibt es leider|haben wir nicht|haben wir leider|fehlt|fehlen|verboten|untersagt)\b', re.I)
OTHER_WORDS = re.compile(r'\b(wünsch|wäre|wären|hätte|würde|könnte|sollte|früher|ehemalig)', re.I)
NEARBY = re.compile(r'in der nähe|nahegelegen|gegenüber|um die ecke|nebenan|unweit|nicht weit|minuten|fußläufig|benachbart|\bnähe\b', re.I)
OWN_PLAYGROUND = re.compile(r'\b(eigene[rnms]?|hauseigene[rnms]?|unser\w*|hinter\w* (dem|unserem)|mit (großem |eigenem |kleinem )?(kinder)?spielplatz|und (kinder)?spielplatz|im (bier)?garten|'
                            r'auf (dem|unserem) gelände|auf der terrasse)\b', re.I)
STROLLER_YES = re.compile(r'kinderwagen-?(freundlich|gerecht|tauglich|geeignet|zugänglich|stellpl|parkpl|park\b|garage|abstell|freundliche)|'
                          r'(platz|parken|abstell\w*|stellpl\w*|geeignet|zugänglich|befahrbar|passierbar|stufenlos|barrierefrei|erreichbar|rollst(u|ü)hl\w*|bequem|problemlos|auch)[^.!?|]{0,40}(kinderwagen|buggy)|'
                          r'(kinderwagen|buggys?)[^.!?|]{0,45}(kein problem|problemlos|gut\b|bequem|willkommen|erreichbar|zugänglich|befahrbar|passierbar|geeignet|platz|passen|passt|abgestellt|abstellen|'
                          r'parken|mitnehmen|mitgebracht|barrierefrei|stufenlos|rampe|aufzug|fahrstuhl|lift\b)', re.I)
STROLLER_REJECT = re.compile(r'nicht ganz einfach|\beng\b|verleih|mieten|\bleihen|ausleih|reparatur|bollerwagen|marke|kollektion|müssen|bitte|garderobe|\bflohmarkt|basar|spaziergang|wanderung|tour\b|strecke|rundweg|\bfahrt\b|fähre|\bbus\b', re.I)
STEP_FREE = re.compile(r'stufenlos\w*\s+(erreichbar|zugang|zugänglich|eingang|begehbar|befahrbar|zu erreichen|zu ?gänglich)|'
                       r'(zugang|eingang|räume|räumlichkeiten|erreichen|erreichbar|zugänglich|lokal|gebäude|haus|café|restaurant|laden|praxis)[^.!?|]{0,35}(stufenlos|ebenerdig)|'
                       r'ebenerdig\w*\s+(zugang|eingang|erreichbar|zugänglich|zu erreichen)', re.I)
STEP_REJECT = re.compile(r'verstell|regulier|dimm|geschwindigkeit|höhe\b|motor', re.I)
A11Y_WEB = re.compile(r'formular|fehlermeldung|benötigen|gefragt|anbindung|anmelde|authentifizierung|hörb(ü|ue)ch|zugang zu (büchern|medien|informationen|bildung|kultur)|barrierefreie (restaurants|cafés|hotels|orte|museen)|erklärung|webauftritt|anwendung|richtlinie|modul\b|youtube|anlieferung|einen ort\b|website|webseite|web\b|internet|online|digital|\bapp\b|\bpdf\b|bitv|wcag|stärkungsgesetz|bfsg|navigation|lesbar|kommunikation|sprache|gebärd|'
                      r'information|inhalte|dokument|angebote?\b|beratung|barrierefreiheit|meldestelle|feedback|u-bahn|s-bahn|haltestelle|bahnhof|\bbus\b|\bhvv\b|fähre|'
                      r'stadtteil|quartier|weg\b|wege\b|planung|förderung|projekt|veranstaltung|führung|parkplatz|parkpl|stellpl', re.I)
A11Y_PLACE = re.compile(r'zugang|zugänglich|erreichbar|eingang|räume|räumlichkeiten|gebäude|\bhaus\b|ausstellung|lokal|restaurant|café|cafe|laden|geschäft|praxis|museum|theater|saal|kino|bad\b|'
                        r'bibliothek|bücherei|bücherhalle|einrichtung|\bwir sind\b|\bsind\b.{0,12}barrierefrei|\bist\b.{0,20}barrierefrei|accessible', re.I)
TOILET_ONLY = re.compile(r'(wc|waschraum|toilette\w*|sanitär\w*|parkpl\w*|stellpl\w*)', re.I)
DOG_YES = re.compile(r'\bhunde?\b[^.!?|]{0,70}(willkommen|erlaubt|gestattet|dürfen|darf\b|mitbringen|mitgebracht|mitnehmen|gerne|gern\b)|hundefreundlich|hundenapf|wassernapf|'
                     r'(hunde?|vierbeiner|fellnase\w*)[^.!?|]{0,25}(sind|ist)[^.!?|]{0,20}(willkommen|erlaubt|gestattet)|vierbeiner[^.!?|]{0,25}willkommen|'
                     r'(mit|ihren?|eure?n?|deine?n?) hund\b[^.!?|]{0,25}(willkommen|erlaubt|gerne|gern\b|mitbringen)|dogs? (are )?(welcome|allowed)|dog-?friendly', re.I)
DOG_NO = re.compile(r'\b(hunde?|hunden|haustiere?n?|tiere)\b[^.!?|]{0,40}(nicht (erlaubt|gestattet|willkommen|gestattet|mitgebracht|mitgenommen|mitbringen|mit)|verboten|untersagt|draußen|draussen|müssen leider|leider nicht)|'
                    r'\bkeine (hunde|haustiere|tiere)\b|hundeverbot|(mitnahme|mitbringen|mitführen) von (hunden|haustieren|tieren)[^.!?|]{0,30}(nicht|verboten|untersagt)|'
                    r'\bhunde? (dürfen|darf) (leider )?nicht|no dogs|dogs? (are )?not allowed', re.I)
DOG_REJECT = re.compile(r'hundeschule|tierarzt|hundefriseur|hundesalon|hundehotel|hundefutter|hundetraining|gassi|hundekot|hundehaufen|hundewiese|hundeauslauf|assistenzhund|blindenhund|strand|\bkot\b', re.I)
KIDS_TICKET = re.compile(r'ticket|eintritt|erwachsene|ermäßig|\bab \d|gültig|vorverkauf|familienkarte|tageskarte|\bvvk\b|fahrkarte|ausweis|mitglied', re.I)
HOTEL_TALK = re.compile(r'\bhotel|\bresort|(?<![a-zäöü])zimmer|\w+zimmerkategor|aufenthalt|übernacht|\bbuchung|\banreise', re.I)
LIMITED = re.compile(r'(teilweise|eingeschränkt|bedingt|weitgehend|größtenteils|nur)\s+(\w+\s+)?(barrierefrei|rollst(u|ü)hl|zugänglich)|barrierearm', re.I)
KITA_SITE_KEYS = {'changing_table', 'highchair', 'kids_area', 'baby_feeding'}
CHAIN_KEYS = {'kids_menu', 'babyccino', 'dog', 'highchair'}  # usually a rule of the whole chain; only used for gastro places
ALL_BRANCHES = re.compile(r'\b(in )?all(e|en) (unsere[nr]? )?(restaurants|filialen|standorte|häuser|läden|cafés)|in jedem\b|\ballen unseren\b|beide[n]? filialen', re.I)


def clause_of(win, start, end):
    """Bounds of the sentence around a match inside a window. '|' marks a block boundary of the page."""
    left = max((m.end() for m in re.finditer(r'[.!?;|]\s', win[:start])), default=0)
    m = re.search(r'[.!?;|](\s|$)', win[end:])
    return left, (end + m.start() + (1 if m.group(0)[0] in '.!?' else 0)) if m else len(win)


def classify(key, win, start, end, cat):
    """Value of one mention: 'yes', 'no', 'limited' or None (not usable). Returns (value, evidence)."""
    left, right = clause_of(win, start, end)
    clause, before, after = win[left:right], win[left:start], win[end:right]
    match = win[start:end].lower()
    if REJECT_ANY.search(clause) or OTHER_WORDS.search(clause): return None, None
    if key != 'kids_menu' and PRODUCT.search(clause): return None, None
    if key in ('dog', 'stroller', 'highchair', 'wheelchair', 'kids_area') and HOTEL_TALK.search(clause): return None, None
    evidence = clause.strip(' |')
    if len(evidence) > 200:
        evidence = win[max(left, start - 90): min(right, end + 90)].strip(' |')[:200]

    is_question = clause.rstrip().endswith('?')
    if is_question:  # FAQ: the answer follows
        rest = re.sub(r'^[\W_]+', '', win[right:])
        answer = re.split(r'[.!?|]', rest, maxsplit=1)[0]
        if REJECT_ANY.search(answer) or (key in ('dog', 'stroller', 'highchair', 'wheelchair') and HOTEL_TALK.search(answer)): return None, None
        if key == 'kids_area' and not re.search(r'\b(gibt|habt|haben|existiert)\b', clause, re.I): return None, None
        if key == 'wheelchair' and A11Y_WEB.search(clause + ' ' + answer): return None, None
        if key == 'dog' and re.search(r'frei laufen|ohne leine|freilauf', clause, re.I): return None, None
        if QUESTION_ANSWER_NO.search(rest) or re.search(r'\bkein(e|en)?\b|\bleider\b|\bnicht (gestattet|erlaubt|möglich|barrierefrei|zugänglich)|verboten|untersagt', answer, re.I): value = 'no'
        elif QUESTION_ANSWER_YES.search(rest): value = 'yes'
        elif re.match(r'\s*wo\b', clause, re.I) and len(answer) > 8: value = 'yes'
        else: return None, None
        return value, (clause.strip(' |') + ' ' + answer.strip())[:200]

    negated = bool(NEG_BEFORE.search(before) or NEG_AFTER.search(after))
    unsure = bool(NICHT_BEFORE.search(before))

    if key == 'changing_table':
        if cat in SHOP and re.search(r'tisch|kommode|auflage', match): return None, None
        if re.search(r'kommode|auflage', match) and not re.search(r'vorhanden|steht|gibt es|haben wir|finden sie', clause, re.I): return None, None
    elif key == 'highchair':
        if cat in SHOP or cat in OUTDOOR or cat in HEALTH: return None, None
        if re.search(r'\beigene|mitbring|bringen sie|aus (kunststoff|holz|metall)|farbe|\b(rosa|mintgrün|grau|blau|weiß|schwarz)\b|stokke|tripp trapp|mochtoys', clause, re.I): return None, None
        if match.startswith('babysitz') and not re.search(r'restaurant|tisch|gäste|vorhanden', clause, re.I): return None, None
    elif key == 'kids_area':
        if cat in OUTDOOR or cat in ('spielhaus', 'klinik'): return None, None
        if start > 0 and win[start - 1].isalpha(): return None, None  # 'Glücksspielbereich'
        if re.search(r'newsletter|\btermine\b', clause, re.I): return None, None
        if match.startswith('play') and not re.search(r'kid|child', clause, re.I): return None, None
        if 'spielplatz' in match and (NEARBY.search(clause) or not OWN_PLAYGROUND.search(clause)): return None, None
        if 'spielplatz' in match and cat in ('treffpunkt', 'beratung', 'freizeit', 'ausflug'): return None, None
        if 'kinderbereich' in match and (cat in HEALTH | SHOP or cat == 'treffpunkt'): return None, None
        if NEARBY.search(clause) and 'spiel' in match: return None, None
    elif key == 'kids_menu':
        if cat not in GASTRO and cat not in ('ausflug', 'museum', 'baden', 'freizeit', 'indoor', 'treffpunkt', 'kultur'): return None, None
        if match.startswith('kinderkarte') and (cat not in GASTRO or KIDS_TICKET.search(clause)): return None, None
        if 'gäste' in match and (cat not in GASTRO or not re.search(r'karte|gericht|teller|men(ü|u)|speise|portion', clause, re.I)): return None, None
    elif key == 'babyccino':
        pass
    elif key == 'baby_feeding':
        if match.startswith('stillen'):
            if win[start] != 'S': return None, None  # the noun, not the adjective in 'zum stillen Zeugen'
            if not re.search(r'stillen[^.!?|]{0,40}(erwünscht|willkommen|möglich|erlaubt|gern)|(ungestört|in ruhe|zum|ruhig\w*) (\w+ )?stillen|(wickeln|möglichkeit\w*)[^.!?|]{0,20}stillen|stillen[^.!?|]{0,12}wickeln', clause, re.I):
                return None, None
        if re.search(r'stillberatung|stillgruppe|stillkurs|stillvorbereitung|abstill|stillzeit', clause, re.I): return None, None
    elif key == 'stroller':
        if 'kinderwagen' in match or 'buggy' in match:
            if negated and re.search(r'nicht (geeignet|befahrbar|zugänglich|erreichbar)|kein(e|en)? (platz|zugang)', clause, re.I):
                return 'no', evidence
            if STROLLER_REJECT.search(clause) or cat in ('laden', 'windeln') and not re.search(r'zugang|barrierefrei|stufenlos|platz', clause, re.I): return None, None
            if unsure or negated or not STROLLER_YES.search(clause): return None, None
            return 'yes', evidence
        if STEP_REJECT.search(clause) or unsure or negated or not STEP_FREE.search(clause): return None, None
        if re.search(r'entfernt|\bmeter\b|\d\s?m\b', clause, re.I): return None, None
        if re.search(r'toilette|\bwc\b', clause, re.I) and not re.search(r'eingang|zugang|räume|haus\b', clause, re.I): return None, None
        return 'yes', evidence
    elif key == 'wheelchair':
        if A11Y_WEB.search(clause): return None, None
        if re.search(r'bereiche\b', clause, re.I): return None, None
        if re.search(r'nicht (\w+ )?(barrierefrei|rollstuhl)|leider (\w+ )?nicht[^|]{0,30}(barrierefrei|rollstuhl)|kein(e|en)? (barrierefrei|rollstuhl)', clause, re.I): return 'no', evidence
        if re.search(r'stufen?\b|treppe|küche', clause, re.I) and not re.search(r'ohne (stufen|treppen)', clause, re.I): return None, None
        if LIMITED.search(clause):
            if TOILET_ONLY.search(clause) and not re.search(r'zugang|eingang|räume|gebäude|haus\b', clause.replace('des Hauses', ''), re.I): return None, None
            return 'limited', evidence
        if negated or unsure: return None, None
        if 'barrierefrei' in match or 'rollstuhl' in match:
            if TOILET_ONLY.search(clause) and not re.search(r'zugang|eingang|räume|gebäude|haus', clause, re.I): return None, None
            if 'rollstuhl' in match and not re.search(r'rollst(u|ü)hl-?(gerecht|freundlich|geeignet|zugänglich|tauglich)|(für|mit)( dem)? rollst(u|ü)hl[^.!?|]{0,30}(zugänglich|erreichbar|geeignet|befahrbar|möglich|problemlos)|rollst(u|ü)hl\w*[^.!?|]{0,30}(zugänglich|erreichbar|geeignet|befahrbar|problemlos|willkommen)', clause, re.I):
                return None, None
            if 'barrierefrei' in match and not A11Y_PLACE.search(clause): return None, None
            if 'praxis' in clause.lower() and cat not in HEALTH: return None, None
            return 'yes', evidence
        if 'wheelchair' in match and re.search(r'accessible|friendly', clause, re.I): return 'yes', evidence
        return None, None
    elif key == 'dog':
        if re.search(r'außer|ausgenommen|mit ausnahme', clause, re.I) and DOG_NO.search(clause): return 'no', evidence
        if DOG_REJECT.search(clause) or re.search(r'kategorien|unangemeldet', clause, re.I): return None, None
        if cat not in GASTRO and re.search(r'gastronom|lounge|café|cafe|restaurant|bistro', clause, re.I): return None, None
        if DOG_NO.search(clause): return 'no', evidence
        if DOG_YES.search(clause) and not unsure and not re.search(r'\bnur\b', clause, re.I): return 'yes', evidence
        return None, None

    if negated: return 'no', evidence
    if unsure: return None, None
    return 'yes', evidence


def judge(cands, cat):
    """All mentions of one site -> {key: (value, evidence, page)}. Contradicting statements cancel each other."""
    votes = defaultdict(dict)
    for c in cands:
        value, ev = classify(c['k'], c['w'], c['s'], c['e'], cat)
        if value: votes[c['k']].setdefault(value, (ev, c['p']))
    out, conflicts = {}, Counter()
    for key, vals in votes.items():
        if 'yes' in vals and 'no' in vals:
            conflicts[key] += 1
            continue
        value = 'yes' if 'yes' in vals else ('limited' if 'limited' in vals else 'no')
        out[key] = (value, *vals[value])
    return out, conflicts


# ---- polite fetching ----
class Refused(Exception):
    """The site said no (robots, AI opt-out, terms). Never retried, never worked around."""


_hosts = {}  # scheme://netloc -> {'optout': reason or None, 'delay': seconds}
_lock = threading.Lock()


def load_robots(base):
    """Read robots.txt once for a host. 401/403 means keep out, an unreachable file means do not crawl now (RFC 9309)."""
    info = {'optout': None, 'delay': 0}
    rp = urllib.robotparser.RobotFileParser()
    text = ''
    try:
        r = fetch(base + '/robots.txt', timeout=20, retries=1)
        text = r.text[:500_000]
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 0
        if status in (401, 403): info['optout'] = 'robots_forbidden'
    except Exception:
        info['optout'] = 'robots_unreachable'
    rp.parse(text.splitlines())
    if info['optout']: rp.disallow_all = True
    common._robots[base] = rp  # fetch(check_robots=True) uses this result and does not load the file again
    info['rp'] = rp
    if CONTENT_SIGNAL_NO.search(text): info['optout'] = info['optout'] or 'ai_content_signal'
    if not info['optout']:
        try:
            info['delay'] = min(float(rp.crawl_delay(common.USER_AGENT) or 0), 30)
        except (TypeError, ValueError):
            pass
        try:  # TDM reservation protocol (W3C community report)
            r = fetch(base + '/.well-known/tdmrep.json', timeout=15, retries=1)
            if 'json' in r.headers.get('content-type', '') and re.search(r'"tdm-reservation"\s*:\s*1', r.text):
                info['optout'] = 'tdm_reservation'
        except Exception:
            pass
    return info


def gate(url):
    p = urlparse(url)
    if host_in(host_of(url), NO_SCAN_HOSTS): raise Refused('terms')
    base = f'{p.scheme}://{p.netloc}'
    with _lock:
        info = _hosts.get(base)
    if info is None:
        info = load_robots(base)
        with _lock:
            _hosts[base] = info
    if info['optout']: raise Refused(info['optout'])
    for agent in AI_AGENTS:
        if not info['rp'].can_fetch(agent, url): raise Refused('ai_robots')
    if info['delay'] > common.MIN_DELAY: time.sleep(info['delay'] - common.MIN_DELAY)


def get_page(url, retries=1):
    """GET with robots and opt-out checks on every redirect hop."""
    for _ in range(6):
        gate(url)
        try:
            return fetch(url, check_robots=True, timeout=25, retries=retries, backoff=5, allow_redirects=False, stream=False)
        except PermissionError:
            raise Refused('robots')
        except requests.HTTPError as e:
            resp = e.response
            if resp is not None and 300 <= resp.status_code < 400 and resp.headers.get('location'):
                url = urljoin(url, resp.headers['location'])
                continue
            raise
    raise RuntimeError('too many redirects')


def page_opt_out(r, html):
    tag = r.headers.get('x-robots-tag', '')
    if NOAI_META.search(tag) or r.headers.get('tdm-reservation', '').strip() == '1': return True
    for m in META_TAG.findall(html[:200_000]):
        name = (re.search(r'name=["\']([^"\']+)', m, re.I) or [None, ''])[1].lower()
        content = (re.search(r'content=["\']([^"\']*)', m, re.I) or [None, ''])[1]
        if name == 'tdm-reservation' and content.strip() == '1': return True
        if name in ('robots', 'claudebot', 'gptbot') and NOAI_META.search(content): return True
    return False


def decode(r):
    if not r.encoding or r.encoding.lower() == 'iso-8859-1' and 'charset' not in r.headers.get('content-type', '').lower():
        r.encoding = 'utf-8'
    return r.text


def parse(html):
    soup = BeautifulSoup(html, 'html.parser')
    return soup


def text_of(soup):
    """Visible text with ' | ' at block boundaries. Consent banners, scripts and the like are gone."""
    for t in soup(['script', 'style', 'noscript', 'svg', 'template', 'head', 'iframe', 'select', 'textarea']):
        t.decompose()
    for t in soup.find_all(True):
        if t.decomposed: continue
        attr = ' '.join(t.get('class') or []) + ' ' + (t.get('id') or '')
        if HIDE_ATTR.search(attr) and t.name not in ('body', 'html'):
            t.decompose()
    for t in soup.find_all(BLOCK_TAGS):
        t.insert_before('\n'); t.insert_after('\n')
    for t in soup.find_all(['a', 'span']):
        t.insert_before(' '); t.insert_after(' ')
    text = soup.get_text()
    text = re.sub(r'[ \t\r\f\v\xa0]+', ' ', text)
    return re.sub(r'\s*\n\s*', ' | ', text).strip(' |')


def links_of(html, base, gastro):
    """Best sub-pages first; legal pages and articles are left out."""
    host = host_of(base)
    scored, legal = {}, {}
    for href, label in LINK_TAG.findall(html):
        try:
            u = urljoin(base, href.strip()).split('#')[0]
            if not u.startswith('http') or host_of(u) != host or u.rstrip('/') == base.rstrip('/'): continue
        except ValueError:
            continue
        label = re.sub(r'(?s)<[^>]+>', ' ', label)[:120]
        probe = urlparse(u).path + ' ' + label
        for i, rx in enumerate(LEGAL_LINK):
            if rx.search(probe): legal.setdefault(u, i)
        if PAGE_DENY.search(u) or PAGE_DENY.search(label): continue
        for i, rx in enumerate(SUB_TIERS):
            if rx.search(probe):
                if i == 1 and gastro and re.search(r'speise|men(ü|ue|u)\b|karte', probe, re.I): i = 0
                scored[u] = min(scored.get(u, 9), i)
                break
    ranked = sorted(scored, key=lambda u: (scored[u], len(u)))
    return ranked[:MAX_PAGES - 1], sorted(legal, key=legal.get)[:1]


def search_page(html, page, rec):
    """Parsing is the slow part (and threads share one CPU core), so only pages with a keyword in the raw HTML get parsed."""
    rec['pages'].append(page)
    rec['chars'] += len(html)
    rec['kita'] += len(KITA_WORD.findall(html))
    if any(rx.search(html) for rx in CANDIDATE_RX.values()):
        rec['cands'] += windows(text_of(parse(html)), page)


def windows(text, page):
    out = []
    for key, rx in CANDIDATE_RX.items():
        n = 0
        for m in rx.finditer(text):
            w0 = max(0, m.start() - (WINDOW - (m.end() - m.start())) // 2)
            w1 = min(len(text), w0 + WINDOW)
            out.append({'k': key, 'w': text[w0:w1], 's': m.start() - w0, 'e': m.end() - w0, 'p': page})
            n += 1
            if n >= 6: break
    return out


def alternatives(url):
    """Other spellings of a site that did not answer: with or without www, then plain http. Only for dead addresses, never after a refusal."""
    p = urlparse(url)
    host = p.netloc[4:] if p.netloc.startswith('www.') else 'www.' + p.netloc
    out = [p._replace(netloc=host).geturl()]
    if p.scheme == 'https': out += [p._replace(scheme='http').geturl(), p._replace(scheme='http', netloc=host).geturl()]
    return out


def scan_url(url, follow_subpages, gastro):
    rec = scan_one(url, follow_subpages, gastro)
    if rec['status'] in ('robots_unreachable', 'connection_error', 'ssl_error'):
        for alt in alternatives(url):
            again = scan_one(alt, follow_subpages, gastro)
            if again['status'] not in ('robots_unreachable', 'connection_error', 'ssl_error', 'timeout'):
                again['url'] = url
                return again
    return rec


def scan_one(url, follow_subpages, gastro):
    rec = {'url': url, 'status': 'ok', 'pages': [], 'chars': 0, 'cands': [], 'kita': 0, 'terms': []}
    try:
        r = get_page(url, retries=2)
        final = r.url
        if 'html' not in r.headers.get('content-type', 'html').lower():
            rec['status'] = 'not_html'; return rec
        if len(r.content) > MAX_BYTES:
            rec['status'] = 'too_big'; return rec
        html = decode(r)
        if page_opt_out(r, html):
            rec['status'] = 'ai_meta'; return rec
        subs, legal = links_of(html, final, gastro) if follow_subpages else ([], [])
        search_page(html, final, rec)
        for sub in subs:
            try:
                rs = get_page(sub, retries=3)  # a server may have dropped the idle connection while the last page was parsed
                if 'html' not in rs.headers.get('content-type', 'html').lower() or len(rs.content) > MAX_BYTES: continue
                html = decode(rs)
                if page_opt_out(rs, html):
                    rec.update(status='ai_meta', cands=[]); return rec
                search_page(html, rs.url, rec)
            except Refused:
                pass  # this path is off limits, the rest of the site is not
            except Exception:
                rec['sub_failed'] = rec.get('sub_failed', 0) + 1
        for lg in legal:  # terms check only: nothing from this page becomes a fact
            try:
                t = re.sub(r'\s+', ' ', unescape(re.sub(r'(?s)<[^>]+>', ' ', re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', decode(get_page(lg))))))
                for rx, kind in ((TERMS_STRICT, 'strict'), (TERMS_GENERAL, 'general')):
                    m = rx.search(t)
                    if m: rec['terms'].append({'kind': kind, 'url': lg, 'text': t[max(0, m.start() - 80): m.end() + 80][:WINDOW]})
            except Exception:
                pass
    except Refused as e:
        rec['status'] = str(e)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 0
        rec['status'] = f'http_{code}'
    except requests.exceptions.SSLError:
        rec['status'] = 'ssl_error'
    except requests.exceptions.Timeout:
        rec['status'] = 'timeout'
    except requests.exceptions.ConnectionError:
        rec['status'] = 'connection_error'
    except Exception as e:
        rec['status'] = type(e).__name__
    return rec


# ---- targets ----
def host_in(host, names):
    return any(host == n or host.endswith('.' + n) for n in names)


def host_of(url):
    n = urlparse(url).netloc.lower().split('@')[-1].split(':')[0]
    return n[4:] if n.startswith('www.') else n


def clean_url(v):
    v = (v or '').split(';')[0].strip()
    if not v or ' ' in v: return None
    if not v.startswith('http'): v = 'https://' + v
    return v if '.' in urlparse(v).netloc else None


def load_targets(con):
    """Places with a website in the scanned categories: {url: [place row]} with the host statistics."""
    q = f"""SELECT p.id, p.name, f.value, p.lat, p.lon, p.category FROM places p JOIN place_facts f ON f.place_id = p.id AND f.key = 'website'
            WHERE p.category IN ({','.join('?' * len(CATS))})"""
    by_url, skipped = defaultdict(list), Counter()
    for row in con.execute(q, CATS):
        url = clean_url(row[2])
        if not url: skipped['no_url'] += 1; continue
        by_url[url].append(row)
    per_host = Counter()
    for url, rows in by_url.items(): per_host[host_of(url)] += len(rows)
    return by_url, per_host, skipped


def skip_reason(url, rows, per_host):
    h = host_of(url)
    if host_in(h, NO_SCAN_HOSTS): return 'terms'
    if host_in(h, SKIP_HOSTS): return 'directory_host'
    if KITA_HOST.search(h): return 'kita_host'
    if per_host[h] >= CHAIN_MIN and all(r[5] in SHOP for r in rows): return 'retail_chain'
    return None


def load_state():
    state = {}
    if STATE.exists():
        with open(STATE, encoding='utf-8') as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    state[rec['url']] = rec
                except ValueError:
                    pass  # a line cut off by a crash: that URL is crawled again
    return state


TRANSIENT = ('timeout', 'connection_error', 'ssl_error', 'http_429', 'http_500', 'http_502', 'http_503', 'http_504', 'robots_unreachable', 'RuntimeError', 'ChunkedEncodingError', 'ContentDecodingError')


def crawl(limit=None, retry=False):
    con = connect()
    by_url, per_host, skipped = load_targets(con)
    con.close()  # nothing is written while crawling
    state = load_state()
    groups, reasons = defaultdict(list), Counter(skipped)
    for url, rows in by_url.items():
        why = skip_reason(url, rows, per_host)
        if why: reasons[why] += len(rows); continue
        if url in state and not (retry and (state[url]['status'] in TRANSIENT or state[url].get('sub_failed'))): continue
        groups[host_of(url)].append(url)
    chain_hosts = {host_of(u): u for u, rows in by_url.items() if per_host[host_of(u)] >= CHAIN_MIN and not skip_reason(u, rows, per_host) and any(r[5] in GASTRO for r in rows)}
    for h, u in chain_hosts.items():
        if 'chain:' + h not in state: groups[h].insert(0, 'chain:' + h)  # first: the URL cap per chain must not cut it off
    if limit:
        keys = list(groups)
        random.Random(1).shuffle(keys)
        groups = {k: groups[k] for k in keys[:limit]}
    todo = sum(map(len, groups.values()))
    print(f'{len(by_url)} URLs, {len(state)} done, {todo} to crawl on {len(groups)} hosts; skipped places: {dict(reasons)}', flush=True)
    write_lock = threading.Lock()
    STATE.parent.mkdir(parents=True, exist_ok=True)
    out = open(STATE, 'a', encoding='utf-8')

    def do_host(host, urls):  # one worker per host, so one request per host at a time
        chain = per_host[host] >= CHAIN_MIN
        done = []
        for url in urls[:CHAIN_MAX_URLS] if chain else urls:
            if url.startswith('chain:'):  # the start page and sub-pages of the chain itself
                base = urlparse(chain_hosts[host])
                rec = scan_url(f'{base.scheme}://{base.netloc}/', True, True)
                rec['url'] = url
            else:
                follow = not chain and len(urls) <= 3  # several places on one small site: first page of each is enough only beyond 3
                rec = scan_url(url, follow, any(r[5] in GASTRO for r in by_url[url]))
            with write_lock:
                out.write(json.dumps(rec, ensure_ascii=False) + '\n'); out.flush()
            done.append(rec['status'])
            if rec['status'] not in ('ok', 'not_html', 'too_big') and not rec['status'].startswith('http_40'): break  # the host refused or is down
        return done

    status, n = Counter(), 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(do_host, h, u): h for h, u in groups.items()}
        for f in as_completed(futs):
            try:
                status.update(f.result())
            except Exception as e:
                status[type(e).__name__] += 1
            n += 1
            if n % 100 == 0:
                print(f'  {time.strftime("%H:%M:%S")} hosts {n}/{len(groups)} {dict(status.most_common(8))}', flush=True)
    out.close()
    print('crawl finished', dict(status), flush=True)


# ---- writing ----
def with_retry(fn, tries=8):
    for i in range(tries):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            if 'locked' not in str(e) and 'busy' not in str(e): raise
            print(f'  database busy, retry {i + 1}', flush=True)
            time.sleep(5 * (i + 1))
    return fn()


def old_facts(con):
    """Current website facts per ref, so a site that was down this time keeps what still passes the rules."""
    out = defaultdict(dict)
    for ref, key, value in con.execute("SELECT source_ref, key, value FROM facts WHERE source_id = 'website'"):
        out[ref][key] = value
    return out


def write():
    con = connect()
    register_source(con, 'website', 'Webseiten der Orte (Stichwortsuche)', None, 'Fakten aus öffentlichen Webseiten',
                    'Angaben laut Webseite des Ortes', priority=45)
    by_url, per_host, _ = load_targets(con)
    state = load_state()
    refs = dict(con.execute("SELECT place_id, source_ref FROM source_records WHERE source_id = 'website' AND place_id IS NOT NULL"))
    old = old_facts(con)
    recs, status, conflicts, kept = [], Counter(), Counter(), 0
    for url, rows in by_url.items():
        if skip_reason(url, rows, per_host): continue
        st = state.get(url)
        for pid, name, _, la, lo, cat in rows:
            ref = refs.get(pid, pid)
            if st is None:
                status['not_crawled'] += 1
                continue
            status[st['status']] += 1
            facts, raw = {}, {'status': st['status'], 'pages': st['pages'], 'chars': st['chars']}
            if st['status'] in TRANSIENT and ref in old:  # no fresh answer: keep old facts, they are checked again further down
                for k, v in old[ref].items():
                    if k.startswith('evidence_'):
                        kk = k[len('evidence_'):]
                        m = CANDIDATE_RX.get(kk) and CANDIDATE_RX[kk].search(v)
                        if m and classify(kk, v, m.start(), m.end(), cat)[0] == old[ref].get(kk):
                            facts[kk] = (old[ref][kk], 'website', 0.6)
                            facts[k] = (v[:200], 'website', 0.6)
                            kept += 1
            elif st['status'] == 'ok':
                found, conf = judge(st['cands'], cat)
                conflicts.update(conf)
                shared = len(rows) >= SHARED_URL_MIN or per_host[host_of(url)] >= CHAIN_MIN and urlparse(url).path.strip('/') == ''
                kita_site = st.get('kita', 0) >= 6 and cat not in GASTRO and cat not in ('museum', 'ausflug', 'baden')
                pages = {}
                chain_rec = state.get('chain:' + host_of(url)) if cat in GASTRO and per_host[host_of(url)] >= CHAIN_MIN else None
                if chain_rec and chain_rec['status'] == 'ok':
                    for key, val in judge(chain_rec['cands'], cat)[0].items():
                        if key in CHAIN_KEYS or ALL_BRANCHES.search(val[1]): found.setdefault(key, val)
                for key, (value, ev, page) in found.items():
                    if shared and not (cat in GASTRO and key in CHAIN_KEYS) and not ALL_BRANCHES.search(ev): continue
                    if kita_site and key in KITA_SITE_KEYS: continue
                    facts[key] = (value, 'website', 0.6)
                    facts['evidence_' + key] = (ev[:200], 'website', 0.6)
                    pages[key] = page
                if pages: raw['evidence_pages'] = pages
            elif not (st['status'] in ('not_html', 'too_big') or st['status'].startswith('http_40')):
                continue  # refused or down without earlier facts: no record
            elif st['status'] != 'not_html' and st['status'] != 'too_big' and st['status'] not in ('http_404', 'http_400', 'http_410'):
                continue
            recs.append({'ref': ref, 'category': cat, 'name': name, 'lat': la, 'lon': lo, 'url': url, 'raw': raw, 'facts': facts, '_pid': pid})
    recs = list({r['ref']: r for r in recs}.values())
    save_raw('websites_scan.json', json.dumps([{k: v for k, v in r.items() if k != '_pid'} for r in recs], ensure_ascii=False))

    def store():
        n = replace_records(con, 'website', recs)
        # replace_records only keeps links of refs that existed; new refs point at their place right away (merge.py does the same later)
        con.executemany("UPDATE source_records SET place_id = ? WHERE source_id = 'website' AND source_ref = ?", [(r['_pid'], r['ref']) for r in recs])
        con.commit()
        return n

    def safe_store():
        try:
            return store()
        except sqlite3.OperationalError:
            con.rollback()
            raise

    print('website records:', with_retry(safe_store), 'kept from before:', kept, flush=True)
    print('status per place:', dict(status.most_common()))
    print('conflicting yes/no dropped:', dict(conflicts))
    hits = Counter()
    for r in recs:
        for k, v in r['facts'].items():
            if not k.startswith('evidence_'): hits[f'{k}={v[0]}'] += 1
    print(json.dumps(dict(sorted(hits.items())), ensure_ascii=False, indent=1))
    con.close()


def prune():
    """Keep in the local crawl file only the windows that became a fact (the classifier sees them again on a re-run)."""
    con = connect()
    by_url, _, _ = load_targets(con)
    con.close()
    state = load_state()
    with open(str(STATE) + '.tmp', 'w', encoding='utf-8') as out:
        for url, rec in state.items():
            cats = {r[5] for r in by_url.get(url, [])} or {'restaurant'}  # chain pages count for gastro places
            keep = []
            for c in rec.get('cands', []):
                if any(classify(c['k'], c['w'], c['s'], c['e'], cat)[0] for cat in cats): keep.append(c)
            rec['cands'] = keep
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
    (RAW_DIR / (STATE.name + '.tmp')).replace(STATE)
    print('pruned', len(state))


if __name__ == '__main__':
    args = sys.argv[1:]
    cmd = args[0] if args else 'all'
    if cmd == 'fresh' or (cmd == 'all' and STATE.exists() and time.time() - STATE.stat().st_mtime > MAX_STATE_AGE):
        STATE.unlink(missing_ok=True)
        cmd = 'all'
    if cmd in ('crawl', 'all'):
        n = next((int(a) for a in args[1:] if a.isdigit()), None)
        crawl(n, retry='--retry' in args)
    if cmd in ('write', 'all'):
        write()
    if cmd in ('prune', 'all'):
        prune()
