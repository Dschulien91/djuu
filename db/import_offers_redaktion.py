"""Import the editorial event list (Redaktion): events found by hand or by targeted search, each checked at a
source we can link to (the organiser's own page or PDF).

The list lives in the app repo at data/redaktion/termine.json, so new entries go live with a normal push to
GitHub Pages. The server pipeline reads the published copy from djuu.de; locally the file in the repo is used.

Rules for every entry (see data/redaktion/README.md):
  * `url` points to the organiser's own page or document, never to Facebook, Instagram or an aggregator.
  * Only facts (what, when, where, age, price, link). `found_via` and `checked` stay internal (raw column).
"""
import json
import os
import sys
from datetime import date
from pathlib import Path

import requests

from offers_util import finish, group, termin

SOURCE_ID = 'redaktion'
NAME = 'Djuu-Redaktion: geprüfte Einzeltermine mit Link zum Veranstalter'
REMOTE = os.environ.get('DJUU_REDAKTION_URL', 'https://djuu.de/data/redaktion/termine.json')
LOCAL = Path(__file__).resolve().parent.parent / 'data' / 'redaktion' / 'termine.json'
BLOCKED_LINK_HOSTS = ('facebook.com', 'fb.me', 'instagram.com', 'kinderflohmarkt.com', 'meine-flohmarkt-termine.de',
                      'rausgegangen.de', 'kindaling', 'weekend-willi.de', 'hh-mit-kindern.de', 'flohsonntag.de',
                      'kinder-in-hamburg.de', 'hamburg-tourism.de', 'eventbrite.', 'meinestadt.de')


def load():
    if LOCAL.exists() and not os.environ.get('DJUU_REDAKTION_REMOTE'):
        return json.loads(LOCAL.read_text(encoding='utf8')), str(LOCAL)
    r = requests.get(REMOTE, params={'v': date.today().isoformat()}, timeout=30)
    r.raise_for_status()
    return r.json(), REMOTE


def to_offer(e):
    url = e['url']
    if any(h in url.lower() for h in BLOCKED_LINK_HOSTS):
        raise ValueError(f'link must point to the organiser, not {url}')
    age = tuple(e['age']) if e.get('age') else (None, None)
    common = dict(venue=e.get('venue'), address=e.get('address'), lat=e.get('lat'), lon=e.get('lon'), time_from=e.get('time_from'),
                  time_to=e.get('time_to'), price=e.get('price'), free=None if e.get('free') is None else int(bool(e['free'])),
                  age=age, registration=e.get('registration'), topic=e.get('topic'))
    ref = e.get('ref') or f"{e['provider']}:{e['title']}:{e.get('date') or e.get('weekday')}"
    if e.get('kind', 'termin') == 'termin':
        day = date.fromisoformat(e['date'])
        end = date.fromisoformat(e['end_date']) if e.get('end_date') else None
        o = termin(ref, e['title'], day, url, e['provider'], end=end, **common)
    else:
        o = group(ref, e['title'], url, e['provider'], kind=e['kind'], weekday=e.get('weekday'), schedule=e.get('schedule'),
                  start=date.fromisoformat(e['date']) if e.get('date') else None,
                  end=date.fromisoformat(e['end_date']) if e.get('end_date') else None, **common)
    o['raw'] = {'found_via': e.get('found_via'), 'checked': e.get('checked')}
    return o


def main():
    entries, origin = load()
    offers, bad = [], 0
    for e in entries:
        try:
            offers.append(to_offer(e))
        except (KeyError, ValueError) as err:
            bad += 1
            print(f'  skipped: {err} | {e.get("title")}', file=sys.stderr)
    print(f'{len(entries)} entries from {origin}, {bad} skipped')
    finish(SOURCE_ID, NAME, 'https://djuu.de', 'Djuu-Redaktion', offers, priority=50)


if __name__ == '__main__':
    main()
