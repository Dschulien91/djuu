# Release check: top-level names declared in more than one classic script (they share one global scope). Run: python tools/dupnames.py app.js ask.js family.js sync.js wir.js looks.js cal.js lists.js push.js community.js config.js i18n/i18n.js
import re, sys, collections
files = sys.argv[1:]
seen = collections.defaultdict(list)
pat = re.compile(r'^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)', re.M)
for f in files:
    for m in pat.finditer(open(f, encoding='utf-8').read()):
        seen[m.group(1) or m.group(2)].append(f)
bad = {k: v for k, v in seen.items() if len(v) > 1}
for k, v in sorted(bad.items()): print('DUPLICATE', k, v)
print(len(bad), 'duplicate top-level names')
