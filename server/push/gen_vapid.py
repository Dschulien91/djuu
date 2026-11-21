"""Creates the push keys once, on the server (never in the repo). Run it BEFORE docker-compose.yml with the push service
is used (compose needs push/push.env to exist, and would create an empty directory for a missing key file):
  docker build -t djuu-push /opt/djuu/push
  docker run --rm --user root -v /opt/djuu/push:/out --entrypoint python djuu-push gen_vapid.py /out
writes
  /out/vapid_private.pem   VAPID private key (only the push container reads it)
  /out/push.env            DJUU_PUSH_SECRET=<random> and DJUU_VAPID_PUBLIC=<public key> (read by the api and push containers)
A working key is never replaced (new keys would end every subscription). What counts as "keys exist": a readable private
key AND a push.env with both values. An empty or incomplete push.env (e.g. made with `touch` so compose starts) is written
again from the existing key (a new secret only if it had none). A key path that is a directory (made by compose when the
file was missing) is refused with a hint. Prints nothing secret. Exit code 0 = keys are in place, 1 = nothing done."""
import base64
import os
import secrets
import sys

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

out = sys.argv[1] if len(sys.argv) > 1 else '/out'
pem, env = os.path.join(out, 'vapid_private.pem'), os.path.join(out, 'push.env')


def read_env():
    vals = {}
    try:
        with open(env, encoding='utf-8') as f:
            for line in f:
                k, sep, v = line.strip().partition('=')
                if sep and k in ('DJUU_PUSH_SECRET', 'DJUU_VAPID_PUBLIC'):
                    vals[k] = v.strip()
    except FileNotFoundError:
        pass
    return vals


def load_key():
    """the existing private key, or None when there is no usable one"""
    if not os.path.isfile(pem) or os.path.getsize(pem) == 0:
        return None
    try:
        return Vapid.from_file(pem)
    except Exception:
        return None


def public_of(v):
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def write_atomic(path, text):
    tmp = path + '.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, path)


for p in (pem, env):
    if os.path.isdir(p):
        print(f'{os.path.basename(p)} is a directory (docker compose creates one for a missing file): remove it with rmdir and run again')
        sys.exit(1)

vals = read_env()
key = load_key()
secret_ok = len(vals.get('DJUU_PUSH_SECRET', '')) >= 32
public_ok = 80 <= len(vals.get('DJUU_VAPID_PUBLIC', '')) <= 100

old = os.umask(0o077)
try:
    if key is not None:
        public = public_of(key)
        if secret_ok and vals.get('DJUU_VAPID_PUBLIC') == public:
            print('keys exist already, nothing changed')
            sys.exit(0)
        # the key is fine, push.env is empty, incomplete or names another public key: written again from the key
        secret = vals['DJUU_PUSH_SECRET'] if secret_ok else secrets.token_urlsafe(36)
        write_atomic(env, f'DJUU_PUSH_SECRET={secret}\nDJUU_VAPID_PUBLIC={public}\n')
        print('push.env written from the existing key (public key length %d)' % len(public))
        sys.exit(0)
    if os.path.exists(pem) and os.path.getsize(pem) > 0:
        print('vapid_private.pem exists but cannot be read as a key: nothing changed (move it away to create new keys)')
        sys.exit(1)
    if public_ok:
        print('note: push.env names a public key but its private key is missing: new keys, existing subscriptions end')
    v = Vapid()
    v.generate_keys()
    public = public_of(v)
    v.save_key(pem + '.tmp')
    os.replace(pem + '.tmp', pem)
    os.chmod(pem, 0o600)
    write_atomic(env, f'DJUU_PUSH_SECRET={secrets.token_urlsafe(36)}\nDJUU_VAPID_PUBLIC={public}\n')
    print('written: vapid_private.pem, push.env (public key length %d)' % len(public))
finally:
    os.umask(old)
