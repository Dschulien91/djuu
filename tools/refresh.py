"""Weekly refresh of courses, groups and events, then publish. Runs unattended (see tools/refresh-task.ps1).

Every provider importer keeps its old data when its page changes or fails, and one failing importer never stops the others.
Nothing goes live if the result looks broken: fewer than 70 % of the previous offers or 95 % of the places keeps the old files.
Usage: python tools/refresh.py [--no-push]    Log: data/refresh.log (local only)
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'db'
DATA = ROOT / 'data'
LOG = DATA / 'refresh.log'
SKIP = {'import_offers_elbphilharmonie.py'}  # its site excludes our kind of bot
TIMEOUT = 3600
OUTPUTS = ['places.json', 'offers.json', 'sources.json']


def log(msg):
    line = f'{datetime.now():%Y-%m-%d %H:%M} {msg}'
    print(line, flush=True)
    with LOG.open('a', encoding='utf-8') as f:
        f.write(line + '\n')


def counts():
    return (len(json.loads((DATA / 'places.json').read_text(encoding='utf-8'))['places']),
            len(json.loads((DATA / 'offers.json').read_text(encoding='utf-8'))['offers']))


def run(cmd, cwd, timeout=TIMEOUT):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)


def main():
    places0, offers0 = counts()
    log(f'start: {places0} places, {offers0} offers')
    failed = []
    for script in sorted(DB.glob('import_offers_*.py')):
        if script.name in SKIP: continue
        try:
            r = run([sys.executable, script.name], DB)
            if r.returncode:
                failed.append(script.name)
                log(f'FAILED {script.name}: {r.stderr.strip()[-300:]}')
        except subprocess.TimeoutExpired:
            failed.append(script.name)
            log(f'TIMEOUT {script.name}')
    keep = DATA / 'backups' / 'before-refresh'
    keep.mkdir(parents=True, exist_ok=True)
    for name in OUTPUTS:
        shutil.copy2(DATA / name, keep / name)
    r = run([sys.executable, 'export.py'], DB)
    if r.returncode:
        log(f'STOP export failed: {r.stderr.strip()[-500:]}')
        return 1
    places1, offers1 = counts()
    log(f'after: {places1} places, {offers1} offers, {len(failed)} importers failed')
    if places1 < places0 * .95 or offers1 < offers0 * .7:
        for name in OUTPUTS:
            shutil.copy2(keep / name, DATA / name)
        log('STOP result looks broken, kept the previous files, nothing published')
        return 1
    if '--no-push' in sys.argv:
        log('done without publishing')
        return 0
    run(['git', 'add', 'data/places.json', 'data/offers.json', 'data/sources.json'], ROOT)
    if not run(['git', 'diff', '--cached', '--quiet'], ROOT).returncode:
        log('nothing changed')
        return 0
    msg = f'Data refresh {datetime.now():%Y-%m-%d}: {offers1} offers\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
    r = run(['git', 'commit', '-m', msg], ROOT)
    if r.returncode:
        log(f'STOP commit failed: {r.stderr.strip()[-300:]}')
        return 1
    r = run(['git', 'push'], ROOT, 300)
    log('published' if not r.returncode else f'STOP push failed: {r.stderr.strip()[-300:]}')
    return r.returncode


if __name__ == '__main__':
    sys.exit(main())
