"""Wrap visible German texts in a JS file into tl('...') calls, and list them for translation.

Usage: python tools/i18n_wrap.py app.js [--write]      (without --write: dry run, prints what it would wrap)
Wraps
  - quoted strings that read like language (a capitalised word, an umlaut, or several words)
  - text parts of template literals: text between HTML tags, and placeholder/aria-label/title/alt values
Leaves alone
  - data values in comparisons (=== 'nötig'), object keys ('nötig': ...), regex literals, URLs, ids, CSS, keyword lists for search
  - lines with "i18n-skip" and the blocks listed in SKIP_BLOCKS (German search words, shop keywords)
Writes the found keys to i18n/keys-<file>.json (key -> first line number).
"""
import json
import re
import sys
from pathlib import Path

SKIP_BLOCKS = ['const SYN = {', 'const PHRASES = {', 'const INTENT = {', 'const STOP = ', 'const OPEN_WORDS', 'const SUNDAY_WORDS', 'const LOW_RANK',
               'const SHOP_CATS = [', 'const BEZIRKE = [', 'const DISTRICT_ALIAS', 'const CUISINE_KEYS', 'const WD = ', 'const WD_LONG', 'const MON_SHORT', 'const OSM_TO', 'function icsFile', 'function calParts', "'serviceWorker'"]
CALL_SKIP = re.compile(r"(svg|\$|querySelector(All)?|getElementById|getItem|setItem|removeItem|addEventListener|matches|closest|toggle|add|remove|has|startsWith|endsWith|includes|split|join|replace|test|match|fetch|go|setTab|setSize|dataset|getAttribute|setAttribute|norm|words|typoDist|toLocaleDateString|toLocaleTimeString|Intl\.\w+|createElement|new RegExp|Set|get|t|tl)\s*\(\s*$")
LANGUAGE = re.compile(r"[A-ZÄÖÜ][a-zäöüß]+|[äöüÄÖÜß]|\w+\s+\w+")
CODEY = re.compile(r"^(#|\.|data-|https?:|mailto:|tel:|webcal:|/|\.\/|[a-z_]+:|--)|^[\w.\-/:#%]+$|[{};=<>]|\\[dws]|^\s*$")


def tokens(src):
    """Yield (kind, start, end, text) for strings/templates; recurses into ${...}."""
    i, n = 0, len(src)
    prev_sig = ''
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"':
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == '\\' else 1
            yield ('str', i, j + 1, src[i + 1:j]); i = j + 1; prev_sig = 's'; continue
        if c == '`':
            j = i + 1
            parts = []
            seg_start = j
            while j < n and src[j] != '`':
                if src[j] == '\\': j += 2; continue
                if src.startswith('${', j):
                    parts.append(('tpl', seg_start, j, src[seg_start:j]))
                    depth, k = 1, j + 2
                    inner_start = k
                    while k < n and depth:
                        ch = src[k]
                        if ch in '\'"`':
                            # skip nested strings/templates quickly, nested templates are scanned by recursion below
                            q = ch; k += 1
                            if q == '`':
                                d2 = 0
                                while k < n and not (src[k] == '`' and d2 == 0):
                                    if src[k] == '\\': k += 2; continue
                                    if src.startswith('${', k): d2 += 1; k += 2; continue
                                    if src[k] == '}' and d2: d2 -= 1
                                    k += 1
                                k += 1; continue
                            while k < n and src[k] != q:
                                k += 2 if src[k] == '\\' else 1
                            k += 1; continue
                        if ch == '{': depth += 1
                        elif ch == '}': depth -= 1
                        k += 1
                    inner = src[inner_start:k - 1]
                    for kind, a, b, txt in tokens(inner):
                        parts.append((kind, inner_start + a, inner_start + b, txt))
                    j = k; seg_start = j; continue
                j += 1
            parts.append(('tpl', seg_start, j, src[seg_start:j]))
            for p in parts: yield p
            i = j + 1; prev_sig = 's'; continue
        if c == '/' and prev_sig in ('', 'op'):
            # regex literal
            j, cls = i + 1, False
            while j < n:
                ch = src[j]
                if ch == '\\': j += 2; continue
                if ch == '[': cls = True
                elif ch == ']': cls = False
                elif ch == '/' and not cls: break
                elif ch == '\n': break
                j += 1
            i = j + 1; prev_sig = 's'; continue
        if c.isalnum() or c in '_$)]':
            m = re.match(r'[\w$]+', src[i:]) if c not in ')]' else None
            word = m.group(0) if m else c
            prev_sig = 'op' if word in ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'yield', 'await') else 'w'
            i += len(word); continue
        if not c.isspace(): prev_sig = 'op'
        i += 1


def is_language(s):
    s2 = re.sub(r'<[^>]+>', ' ', s).strip()
    if len(s2) < 2 or CODEY.search(s2.replace(' ', '') if ' ' not in s2 else '#nope#' if re.search(r'[{};=<>]', s2) else ''):
        pass
    if len(s2) < 2: return False
    if re.search(r'[{};=]|\\[dws]|^https?:|^[a-z]+:[^ ]', s2): return False
    if ' ' not in s2 and re.fullmatch(r'[\w.\-/:#%+]+', s2) and not re.search(r'[A-ZÄÖÜ]|[äöüß]', s2): return False
    if re.fullmatch(r'[a-z0-9_\-]+', s2): return False  # ids, css classes, data values
    if ' ' not in s2 and '/' in s2 and not re.search(r'[äöüß]', s2): return False  # paths, time zones
    if re.fullmatch(r'[a-z]+[A-Z]\w*', s2): return False  # camelCase identifiers (element ids, properties)
    if re.fullmatch(r'[a-zäöüß\s]+', s2) and len(s2.split()) > 6: return False  # keyword lists
    return bool(LANGUAGE.search(s2)) and bool(re.search(r'[A-Za-zÄÖÜäöüß]{2,}', s2))


def run(path, write):
    src = Path(path).read_text(encoding='utf-8')
    lines = src.split('\n')
    line_of = lambda pos: src.count('\n', 0, pos) + 1
    # character ranges to skip
    skip = []
    for b in SKIP_BLOCKS:
        for m in re.finditer(re.escape(b), src):
            depth, k = 0, m.end() - 1
            # skip until the statement ends (matching brackets, then ';' or newline at depth 0)
            k = m.start(); depth = 0
            while k < len(src):
                ch = src[k]
                if ch in '{[(': depth += 1
                elif ch in '}])': depth -= 1
                elif ch in ';\n' and depth <= 0 and k > m.end(): break
                k += 1
            skip.append((m.start(), k))
    for no, l in enumerate(lines):
        if 'i18n-skip' in l:
            a = sum(len(x) + 1 for x in lines[:no]); skip.append((a, a + len(l)))
    in_skip = lambda pos: any(a <= pos < b for a, b in skip)
    edits, keys = [], {}
    for kind, a, b, txt in tokens(src):
        if in_skip(a): continue
        if kind == 'str':
            before = src[max(0, a - 40):a]
            after = src[b:b + 6]
            if re.search(r'(===|!==|==|!=|case)\s*$', before) or re.match(r'\s*(===|!==|==|!=)', after): continue
            # a colon after the string means an object key only when the string starts a property (after { or ,), not in a ternary
            if re.match(r'\s*:(?!:)', after) and re.search(r'[{,]\s*$', before): continue
            if re.search(r'[\w\])]\s*\[\s*$', before) or re.search(r'\.\s*$', before): continue  # obj['x'], a.b
            if CALL_SKIP.search(before): continue
            if '<' in txt:
                # a quoted HTML snippet: becomes a template literal with its visible texts wrapped
                if '`' in txt or '${' in txt: continue
                inner, changed = txt, False
                def wrap_text(m):
                    nonlocal_changed[0] = True
                    core = m.group(2).strip(); lead = m.group(2)[:len(m.group(2)) - len(m.group(2).lstrip())]; trail = m.group(2)[len(m.group(2).rstrip()):]
                    keys.setdefault(core.replace("\'", "'"), line_of(a))
                    return m.group(1) + lead + "${tl('" + core.replace("\'", "'").replace("'", "\'") + "')}" + trail
                nonlocal_changed = [False]
                inner = re.sub(r'(^|>)([^<>]+)(?=<|$)', lambda m: wrap_text(m) if is_language(m.group(2).strip()) and '="' not in m.group(2) else m.group(0), txt)
                if nonlocal_changed[0]:
                    edits.append((a, b, '`' + inner.replace("\'", "'") + '`'))
                continue
            if not is_language(txt): continue
            if re.search(r'\\', txt) and not re.search(r"\\'", txt): continue
            key = txt.replace("\\'", "'")
            edits.append((a, b, "tl(" + src[a:b] + ")")); keys.setdefault(key, line_of(a))
            continue
        # template text: split into HTML-free runs and attribute values
        seg = txt
        for m in re.finditer(r'(placeholder|aria-label|title|alt)="([^"$]+)"', seg):
            v = m.group(2)
            if is_language(v):
                s0 = a + m.start(2); edits.append((s0, s0 + len(v), "${tl('" + v.replace("'", "\\'") + "')}")); keys.setdefault(v, line_of(s0))
        # text between tags (or at the ends of the segment)
        for m in re.finditer(r'(?:^|>)([^<>]+)(?=<|$)', seg):
            raw = m.group(1)
            core = raw.strip()
            if not core or not is_language(core): continue
            if re.match(r'^[\s\w-]+="', raw) or '="' in raw: continue  # inside a tag
            # inside an open tag at segment end, e.g. '<button class="x" data-a="' is not text
            pre = seg[:m.start(1)]
            if pre.rfind('<') > pre.rfind('>'): continue
            off = raw.index(core)
            s0 = a + m.start(1) + off
            edits.append((s0, s0 + len(core), "${tl('" + core.replace("'", "\\'") + "')}")); keys.setdefault(core, line_of(s0))
    edits.sort()
    # drop overlaps
    out, last = [], -1
    for e in edits:
        if e[0] >= last: out.append(e); last = e[1]
    res = src
    for a, b, rep in reversed(out):
        res = res[:a] + rep + res[b:]
    name = Path(path).stem
    Path(path).parent.joinpath('i18n').mkdir(exist_ok=True)
    Path(path).parent.joinpath('i18n', f'keys-{name}.json').write_text(json.dumps(keys, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f'{path}: {len(out)} texts wrapped, {len(keys)} distinct keys')
    if write: Path(path).write_text(res, encoding='utf-8')
    else:
        for a, b, rep in out:
            print(line_of(a), repr(src[a:b])[:90])


if __name__ == '__main__':
    run(sys.argv[1], '--write' in sys.argv)
