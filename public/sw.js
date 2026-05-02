// ─── sw.js ───────────────────────────────────────────────────────────────────
// Service worker minimale: cache-first per asset CDN, network-first per HTML/JSON.

const CACHE_NAME = 'my-expense-v1';
const ASSET_HOSTS = [
    'cdn.jsdelivr.net',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isAsset = ASSET_HOSTS.includes(url.host)
        || /\.(?:css|js|woff2?|ttf|svg|png|jpe?g|webp|gif|ico)$/i.test(url.pathname);

    if (isAsset) {
        event.respondWith(cacheFirst(req));
        return;
    }

    if (url.origin === location.origin) {
        event.respondWith(networkFirst(req));
    }
});

async function cacheFirst(req) {
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
    } catch (e) {
        return cached || Response.error();
    }
}

async function networkFirst(req) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const fresh = await fetch(req);
        if (fresh.ok && req.headers.get('Accept')?.includes('text/html')) {
            cache.put(req, fresh.clone());
        }
        return fresh;
    } catch (e) {
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response('<h1>Offline</h1><p>Riconnettiti e ricarica.</p>', {
            status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}
