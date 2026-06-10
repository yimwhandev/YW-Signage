const CACHE = 'signage-v2';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/display'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API: network-first, fallback to empty response
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Cache successful heartbeat/emergency for offline fallback
          if ((url.pathname === '/api/emergency') && res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          // Try cache first on failure
          const cached = await caches.match(e.request);
          if (cached) return cached;
          // Notify clients we're offline
          const clients = await self.clients.matchAll();
          clients.forEach(c => c.postMessage({ type: 'OFFLINE' }));
          return new Response(JSON.stringify(null), { headers: { 'Content-Type': 'application/json' } });
        })
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
