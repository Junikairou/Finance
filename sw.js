/* Service worker — mise en cache minimale pour usage hors-ligne (PWA/TWA). */

const CACHE = 'boule-de-neige-v1';
const CORE = [
  './',
  './index.html',
  './simulateur.html',
  './comprendre.html',
  './assets/styles.css',
  './assets/site.js',
  './assets/calc.js',
  './assets/app.js',
  './manifest.webmanifest',
  './assets/icons/favicon-32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
            return res;
          })
          .catch(() => cached)
    )
  );
});
