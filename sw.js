// Djuu service worker v0.31: app shell and data work offline, map tiles need network.
// Updates arrive at once: every file is checked with the server (no-cache = a quick 304 when unchanged), the cache is only the offline fallback
// (the places data: kept copy first, see STALE_OK).
const CACHE = 'djuu-0.72';
const SHELL = ['./', 'index.html', 'legal.html', 'styles.css', 'i18n/i18n.js', 'i18n/en.js', 'config.js', 'app.js', 'ask.js', 'family.js', 'sync.js', 'wir.js', 'looks.js', 'cal.js', 'lists.js', 'push.js', 'community.js', 'vendor/fonts/fonts.css', 'vendor/fonts/fredoka-latin.woff2', 'vendor/fonts/nunito-latin.woff2', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/leaflet-maplibre-gl.js', 'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css',
  'data/places.json', 'data/geo.json']; // data/offers.json is only the fallback copy: cached when it is really used

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// The places (7 MB) and the small map data change only with an app update: the kept copy answers at once and is brought up
// to date in the background (the next start shows the new copy). The nightly events (api.djuu.de/data/) and everything else:
// network first; the events fall back to the kept copy after 4 s on a slow connection (the network copy still lands in the cache).
const STALE_OK = /\/data\/(places|geo|sources|stadtteile_poly)\.json$/;
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const dailyData = url.origin === 'https://api.djuu.de' && url.pathname.startsWith('/data/'); // nightly events: kept for offline use
  if (e.request.method !== 'GET' || (url.origin !== location.origin && !dailyData)) return; // map tiles and the family server straight from the network
  // live.json carries a ?t= time bucket against stale copies: keep one cache entry for it, not a new one every 10 minutes
  const key = url.pathname.endsWith('/data/live.json') ? url.origin + url.pathname : e.request;
  const fromNet = () => fetch(e.request.url, { cache: 'no-cache', mode: url.origin === location.origin ? 'same-origin' : 'cors', credentials: 'same-origin' })
    .then(r => { if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy))); } return r; });
  if (url.origin === location.origin && STALE_OK.test(url.pathname)) {
    e.respondWith(caches.match(key, { ignoreSearch: true }).then(hit => {
      const net = fromNet();
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }
  if (dailyData && !url.pathname.endsWith('/data/live.json')) {
    e.respondWith(new Promise(resolve => {
      const net = fromNet();
      let done = false;
      const t = setTimeout(() => caches.match(key).then(hit => { if (hit && !done) { done = true; resolve(hit); } }), 4000);
      net.then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } })
        .catch(() => caches.match(key).then(hit => { if (!done) { done = true; clearTimeout(t); resolve(hit || Response.error()); } }));
      e.waitUntil(net.catch(() => {}));
    }));
    return;
  }
  // Network first, past the browser's own cache, so updates arrive; our cache is the fallback when offline.
  e.respondWith(fromNet().catch(() => caches.match(key, { ignoreSearch: key !== e.request })));
});

// Push messages (push.js, server/push/): show the message; a tap opens Djuu (only addresses inside the app).
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  const title = String(d.title || 'Djuu').slice(0, 120);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 300), icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: typeof d.tag === 'string' ? d.tag.slice(0, 80) : undefined, data: { url: typeof d.url === 'string' ? d.url : './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url;
  try { url = new URL(e.notification.data?.url || './', self.registration.scope); } catch (x) { url = null; }
  if (!url || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) url = new URL('./', self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.focus().then(c => (c && c.url !== url.href && 'navigate' in c ? c.navigate(url.href) : c)).catch(() => self.clients.openWindow(url.href));
    return self.clients.openWindow(url.href);
  }));
});
