const CACHE = 'finance-v53';
const ASSETS = ['/', '/index.html', '/css/styles.css', '/js/db.js', '/js/charts.js', '/js/ai.js', '/js/app.js', '/js/csv-import.js', '/js/supabase-client.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Skip caching on localhost — always fetch fresh during development
  if (e.request.url.includes('localhost') || e.request.url.includes('127.0.0.1')) return;
  // Don't cache API calls
  if (e.request.url.includes('anthropic.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
