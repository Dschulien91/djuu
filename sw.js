// Djuu service worker v0.22: app shell and data work offline, map tiles need network.
const CACHE = 'djuu-0.22';
const SHELL = ['./', 'index.html', 'legal.html', 'styles.css', 'config.js', 'app.js', 'family.js', 'vendor/fonts/fonts.css', 'vendor/fonts/fredoka-latin.woff2', 'vendor/fonts/nunito-latin.woff2', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/leaflet-maplibre-gl.js', 'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css',
  'data/places.json', 'data/offers.json'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // map tiles straight from the network
  // Network first so updates arrive, cache as fallback when offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
