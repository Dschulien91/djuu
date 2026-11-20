"""Import the children's and family film series of the Metropolis Kino (Kinemathek Hamburg) from metropoliskino.de.

Source: the cinema's own JSON endpoints that its pages load (/?eID=lsAjax&type=listThemes for the film series,
&type=listFilmDays&data=<ms timestamp> for the day-by-day programme, about ten days per call, the next ten weeks).
Kept: screenings in a series whose name or text is about children, families, holidays or fairy tales (Kinderkino,
Ferienkino, 'Märchen und Mythen' ...), and only screenings before 19:00 that are not shown in the original version
(OV, OmU) - evening and OV screenings of such series are aimed at adults. The cinema publishes no age rating.
Facts only: film title, date, time, link to the film page (kalender?film=<id>). The kinoheld ticket links are not used.
When no such series runs, finish() keeps the old data and reports 'no current offers'.

robots.txt: none (the path answers with the HTML home page), so nothing is disallowed.
"""
import re
import sys
import time
from datetime import date, timedelta

from offers_util import clean, finish, get, osm_coords, termin

SOURCE_ID = 'metropolis_kinderkino'
BASE = 'https://www.metropoliskino.de'
API = BASE + '/?eID=lsAjax&type='
PROVIDER = 'Metropolis Kino'
ADDRESS = 'Kleine Theaterstraße 10, 20354 Hamburg'
FAMILY_SERIES = re.compile(r'kinderkino|ferienkino|kinder|famili|märchen|maerchen|schulferien', re.I)
FAMILY_TEXT = re.compile(r'kinderkino|ferienkino|für (kinder|die ganze familie|groß und klein)|familienfilm|märchenfilm', re.I)
NOT_FOR_KIDS = re.compile(r'\b(OV|OmU|OmeU|OmdU|Engl\.?\s*OV|OF)\b')
WEEKS = 10


def main():
    themes = get(API + 'listThemes&data=').json().get('theme', [])
    family = {str(t['id']): clean(t['title']) for t in themes  # series name, or an explicit phrase in its text
              if FAMILY_SERIES.search(clean(t.get('title')) + ' ' + clean(t.get('subtitle') or ''))
              or FAMILY_TEXT.search(clean(t.get('text') or ''))}
    print(f'  {len(themes)} series, family series: {list(family.values()) or "none"}')
    lat, lon = osm_coords('Metropolis Kino', 'Metropolis')
    today, offers = date.today(), []
    stamp = int(time.mktime(today.timetuple())) * 1000 + 1
    limit = today + timedelta(weeks=WEEKS)
    for n in range(WEEKS + 4):
        d = get(API + f'listFilmDays&data={stamp}' + ('&first=1' if n == 0 else '')).json()
        for day in d.get('day', []):
            y, m, dd = (int(x) for x in day['data'].split('|'))
            when = date(y, m, dd)
            for f in day.get('film', []):
                if str(f.get('themeId')) not in family or not f.get('time'):
                    continue
                if f['time'] >= '19:00' or NOT_FOR_KIDS.search(f.get('lang') or ''):
                    continue
                title = clean(f.get('title'))
                offers.append(termin(f'{f["link"]}:{when}T{f["time"]}', title, when, f'{BASE}/kalender?film={f["link"]}', PROVIDER,
                                     venue=PROVIDER, address=ADDRESS, lat=lat or 53.5562701, lon=lon or 9.9888997, time_from=f['time'],
                                     registration='Tickets', topic='theater',
                                     description=f'{family[str(f["themeId"])]}; {clean(f.get("text"))}'[:200]))
        nxt = d.get('nextDate')
        if not nxt or date.fromtimestamp(int(nxt)) > limit:
            break
        stamp = int(nxt) * 1000
    return finish(SOURCE_ID, 'Metropolis Kino: Kinder- und Familienfilmreihen', BASE + '/themen', PROVIDER, offers)


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
