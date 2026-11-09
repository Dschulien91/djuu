// Djuu service worker v0.31: app shell and data work offline, map tiles need network.
// Updates arrive at once: every file is checked with the server (no-cache = a quick 304 when unchanged), the cache is only the offline fallback.
const CACHE = 'djuu-0.43';
const SHELL = ['./', 'index.html', 'legal.html', 'styles.css', 'i18n/i18n.js', 'i18n/en.js', 'config.js', 'app.js', 'family.js', 'sync.js', 'wir.js', 'looks.js', 'vendor/fonts/fonts.css', 'vendor/fonts/fredoka-latin.woff2', 'vendor/fonts/nunito-latin.woff2', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/leaflet-maplibre-gl.js', 'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css',
  'data/places.json', 'data/offers.json', 'data/geo.json'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const dailyData = url.origin === 'https://api.djuu.de' && url.pathname.startsWith('/data/'); // nightly events: kept for offline use
  if (e.request.method !== 'GET' || (url.origin !== location.origin && !dailyData)) return; // map tiles and the family server straight from the network
  // Network first, past the browser's own cache, so updates arrive; our cache is the fallback when offline.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', mode: url.origin === location.origin ? 'same-origin' : 'cors', credentials: 'same-origin' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
