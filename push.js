/* Djuu push messages (app side). Loaded after cal.js; uses `auth` and the API address of sync.js.
   window.djuuPush = { supported(), reason(), async state(), async enable(topics), async disable(), async setTopics(topics) }
   - Topics: 'cal' (reminders of calendar entries that involve me), 'pickup' (Bringen/Abholen for me changes),
     'lists' (new entries on lists I follow), 'wish' (a reminder before a child's birthday and Christmas). Everything is off until the person switches it on; enable() is only called
     after the person taps a switch (it asks the browser for permission then, never on its own).
   - iPhone/iPad: push works only in the app added to the home screen, so supported() is false in Safari itself
     (reason() = 'ios-install', the Wir page shows a calm note).
   - The subscription is stored on the server (collection push_subs, own records only) with the topics and the language;
     the encryption keys go to the server once and are never sent back. Signing out should call disable() first.
   - Errors carry a `code`: 'unsupported', 'not_signed_in', 'denied' (the browser blocks notifications), 'subscribe_failed'
     (no push service reachable), 'push_off' (the server has no keys yet), 'offline', or a server code. */
'use strict'; // i18n-skip

(() => {
  const BASE = (window.DJUU_API || '').replace(/\/$/, '');
  const TOPICS = ['cal', 'pickup', 'lists', 'wish'];
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  let leaving = ''; // the token of the account signing out, kept for the clean-up in disable()
  const token = () => leaving || (typeof auth !== 'undefined' && auth && auth.token && !auth.ended ? auth.token : '');
  const userId = () => (typeof auth !== 'undefined' && auth ? auth.userId : '');
  const lang = () => (typeof LANG !== 'undefined' && LANG === 'en' ? 'en' : 'de');
  const clean = topics => TOPICS.filter(t => (topics || []).includes(t));
  const fail = (code, message) => { const e = new Error(message || code); e.code = code; return e; };

  async function call(method, path, body) {
    let r;
    try {
      r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: token() } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw fail('offline'); }
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
    if (!r.ok) throw fail(data?.code || String(r.status), data?.message);
    return data;
  }
  function keyBytes(b64) {
    const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  }
  const sameKey = (a, b) => { if (!a || a.byteLength !== b.byteLength) return false; const x = new Uint8Array(a); return x.every((v, i) => v === b[i]); };

  async function localSub() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  // the server record of this phone's subscription (own records only)
  async function serverRec(endpoint) {
    if (!endpoint || !token()) return null;
    const f = encodeURIComponent(`endpoint="${endpoint.replace(/["\\]/g, '')}"`);
    const r = await call('GET', `/api/collections/push_subs/records?perPage=1&filter=${f}`);
    return r?.items?.[0] || null;
  }

  function reason() {
    if (!BASE) return 'no-server';
    if (ios && !standalone()) return 'ios-install';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    return '';
  }
  function supported() { return reason() === ''; }

  async function state() {
    if (!supported() || !token()) return { on: false, topics: [] };
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const rec = sub ? await serverRec(sub.endpoint) : null;
      const topics = clean(rec?.topics);
      const allowed = (await reg.pushManager.permissionState({ userVisibleOnly: true })) === 'granted'; // blocked later in the browser settings = off
      return { on: !!(sub && rec && topics.length && allowed), topics };
    } catch (e) { return { on: false, topics: [] }; }
  }

  async function enable(topics) {
    topics = clean(topics);
    if (!supported()) throw fail('unsupported');
    if (!token()) throw fail('not_signed_in');
    if (!topics.length) return disable();
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') throw fail('denied');
    const { key } = await call('GET', '/api/djuu/push/key');
    const appKey = keyBytes(key);
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, appKey)) { await sub.unsubscribe(); sub = null; } // the server has new keys
    if (!sub) {
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }); }
      catch (e) { throw fail('subscribe_failed', e && e.message); } // e.g. no push service reachable
    }
    for (let attempt = 0; ; attempt++) {
      const j = sub.toJSON();
      const rec = await serverRec(j.endpoint);
      const body = { topics, lang: lang(), keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } };
      try {
        if (rec) await call('PATCH', `/api/collections/push_subs/records/${rec.id}`, body);
        else await call('POST', '/api/collections/push_subs/records', { ...body, user: userId(), endpoint: j.endpoint });
        return { on: true, topics };
      } catch (e) {
        // the server knows this address with other keys (another account): a fresh subscription gets a new address
        if (e.code !== 'push_endpoint_taken' || attempt) throw e;
        try { await sub.unsubscribe(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }); }
        catch (x) { throw fail('subscribe_failed', x && x.message); }
      }
    }
  }

  // signOutToken: sync.js logout() passes the token before it clears `auth`, so the server record can still be removed
  async function disable(signOutToken) {
    if (!supported()) return { on: false, topics: [] };
    if (typeof signOutToken === 'string' && signOutToken) leaving = signOutToken;
    try {
      const sub = await localSub().catch(() => null);
      if (sub) {
        try { const rec = await serverRec(sub.endpoint); if (rec) await call('DELETE', `/api/collections/push_subs/records/${rec.id}`); } catch (e) { /* offline: the server drops it when the browser does */ }
        try { await sub.unsubscribe(); } catch (e) { /* already gone */ }
      }
    } finally { leaving = ''; }
    return { on: false, topics: [] };
  }

  async function setTopics(topics) {
    topics = clean(topics);
    if (!topics.length) return disable();
    return enable(topics);
  }

  window.djuuPush = { supported, reason, state, enable, disable, setTopics };
})();
