"""Translate offer titles into the app's other languages with Claude (Anthropic API), nightly after export.py.

Needs ANTHROPIC_API_KEY in the environment. On the server, refresh.sh reads it from the admin-only collection djuu_settings
(key "anthropic_api_key", entered in the dashboard at api.djuu.de/_/), never from the repository. Without a key the step is
skipped and the titles stay German. Each title is translated once and kept in the table "translations", so a title is paid
for only once; only providers' public titles are sent, no user data.
Writes the columns title_<lang> into data/offers.json.
"""
import json
import os

from common import ROOT, connect

LANGS = [l for l in os.environ.get('DJUU_LANGS', 'en').split(',') if l and l != 'de']
LANG_NAMES = {'en': 'British English'}
MODEL = os.environ.get('DJUU_TRANSLATE_MODEL', 'claude-haiku-5-5')
BATCH = 40
PROMPT = """Translate these German titles of family events, classes and groups in Hamburg into {lang}, for parents reading an app.
Rules: keep proper names (venues, people, brands, titles of books or shows) as they are; keep German programme names such as PEKiP unchanged; keep it short like a title; add nothing.
Answer with a JSON array of strings only, in the same order and with exactly {n} items.

{items}"""


def translate(client, items, lang):
    msg = client.messages.create(model=MODEL, max_tokens=8000, messages=[{'role': 'user', 'content': PROMPT.format(
        lang=LANG_NAMES.get(lang, lang), n=len(items), items=json.dumps(items, ensure_ascii=False, indent=0))}])
    if msg.stop_reason != 'end_turn':
        print(f'  stopped ({msg.stop_reason}), batch skipped')
        return None
    text = ''.join(b.text for b in msg.content if b.type == 'text').strip()
    try:
        out = json.loads(text[text.index('['):text.rindex(']') + 1])
    except ValueError:
        print('  answer was not a JSON list, batch skipped')
        return None
    if not isinstance(out, list) or len(out) != len(items) or not all(isinstance(x, str) and x.strip() for x in out):
        print('  answer has the wrong length, batch skipped')
        return None
    return [x.strip() for x in out]


def run():
    path = ROOT / 'data' / 'offers.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    cols, rows = data['cols'], data['offers']
    ti = cols.index('title')
    con = connect()
    con.execute("CREATE TABLE IF NOT EXISTS translations (src TEXT NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL, model TEXT, created_at TEXT, PRIMARY KEY (src, lang))")
    titles = sorted({r[ti] for r in rows if r[ti]})
    key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    client = None
    if key:
        import anthropic
        client = anthropic.Anthropic(api_key=key, max_retries=3, timeout=120.0)
    for lang in LANGS:
        have = dict(con.execute('SELECT src, text FROM translations WHERE lang = ?', (lang,)))
        todo = [t for t in titles if t not in have]
        print(f'{lang}: {len(titles)} titles, {len(todo)} not translated yet')
        if todo and not client:
            print('  no ANTHROPIC_API_KEY: these titles stay German')
        for i in range(0, len(todo) if client else 0, BATCH):
            part = todo[i:i + BATCH]
            try:
                out = translate(client, part, lang)
            except Exception as e:  # network or API trouble: keep what we have, try again tomorrow
                print(f'  API error, stopping for today: {type(e).__name__}')
                break
            if out:
                con.executemany("INSERT OR REPLACE INTO translations VALUES (?, ?, ?, ?, datetime('now'))", [(s, lang, x, MODEL) for s, x in zip(part, out)])
                con.commit()
                have.update(zip(part, out))
        col = 'title_' + lang
        if col not in cols: cols.append(col)
        ci = cols.index(col)
        for r in rows:
            r.extend([None] * (len(cols) - len(r)))
            r[ci] = have.get(r[ti])
        print(f'  {sum(1 for r in rows if r[ci])} of {len(rows)} offers have a {lang} title')
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    run()
