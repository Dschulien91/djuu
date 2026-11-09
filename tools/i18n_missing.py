"""List the tl('...') keys of the app that a language file does not translate yet.
Usage: python tools/i18n_missing.py en      -> prints a JSON list of missing German keys
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
lang = sys.argv[1] if len(sys.argv) > 1 else 'en'
sys.stdout.reconfigure(encoding='utf-8')
QUOTED = r"'((?:[^'\\]|\\.)*)'"
have = {k.replace("\\'", "'") for k in re.findall(QUOTED + r"\s*:\s*'", (ROOT / 'i18n' / f'{lang}.js').read_text(encoding='utf-8'))}
missing = []
for f in ['app.js', 'family.js', 'sync.js', 'wir.js', 'legal.html', 'index.html']:
    p = ROOT / f
    if not p.exists(): continue
    for m in re.finditer(r"\btl\(" + QUOTED, p.read_text(encoding='utf-8')):
        k = m.group(1).replace("\\'", "'")
        if k not in have and k not in missing: missing.append(k)
print(len(missing))
print(json.dumps(missing, ensure_ascii=False, indent=0))
