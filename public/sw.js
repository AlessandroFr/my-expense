// ─── sw.js ───────────────────────────────────────────────────────────────────
// Strategie:
//   - CDN (jsdelivr, fonts.gstatic): cache-first (URL versionati e immutabili).
//   - Same-origin static (JS/CSS/font/img): stale-while-revalidate.
//     Combinato con `?v=filemtime` lato server, ogni redeploy genera URL nuovi
//     (cache miss → network), e per visite ripetute serve dalla cache mentre
//     la aggiorna in background.
//   - Same-origin HTML (Accept: text/html, navigation): network-only con
//     fallback offline statico. Niente pagine zombie con stato vecchio.
//   - JSON / endpoints / manifest / sw.js stesso: bypass totale.

const CACHE_NAME    = 'my-expense-v2';
const CDN_HOSTS     = ['cdn.jsdelivr.net', 'fonts.gstatic.com', 'fonts.googleapis.com'];
const STATIC_RE     = /\.(?:css|js|mjs|woff2?|ttf|otf|svg|png|jpe?g|webp|gif|ico)$/i;
const NEVER_CACHE   = /\/(?:sw\.js|manifest\.webmanifest)$/i;
const ENDPOINT_RE   = /\/endpoints\//i;

self.addEventListener('install', () => {
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

    // 1) CDN: cache-first.
    if (CDN_HOSTS.includes(url.host)) {
        event.respondWith(cacheFirst(req));
        return;
    }

    // Da qui in poi consideriamo solo same-origin.
    if (url.origin !== location.origin) return;

    // 2) Bypass esplicito: SW stesso, manifest, tutti gli endpoint AJAX.
    if (NEVER_CACHE.test(url.pathname) || ENDPOINT_RE.test(url.pathname)) {
        return;
    }

    // 3) Navigazioni / HTML: network-only con fallback offline.
    const accept = req.headers.get('Accept') || '';
    if (req.mode === 'navigate' || accept.includes('text/html')) {
        event.respondWith(networkOnlyHtml(req));
        return;
    }

    // 4) Asset statici same-origin (JS/CSS/font/img): stale-while-revalidate.
    if (STATIC_RE.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(req));
        return;
    }

    // 5) Tutto il resto (JSON, blob, ecc.): bypass.
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

async function staleWhileRevalidate(req) {
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const network = fetch(req).then(async (fresh) => {
        if (fresh && fresh.ok) {
            await cache.put(req, fresh.clone());
            await purgeOldVersions(cache, req);
        }
        return fresh;
    }).catch(() => null);

    return cached || (await network) || Response.error();
}

// Rimuove dalla cache le entry con stesso pathname ma query string diversa
// (tipico: pastel.css?v=1, ?v=2, ?v=3 dopo redeploy successivi).
async function purgeOldVersions(cache, req) {
    try {
        const reqUrl = new URL(req.url);
        const reqKey = reqUrl.origin + reqUrl.pathname;
        const reqFull = req.url;
        const requests = await cache.keys();
        await Promise.all(requests.map(async (r) => {
            try {
                const u = new URL(r.url);
                if (u.origin + u.pathname === reqKey && r.url !== reqFull) {
                    await cache.delete(r);
                }
            } catch (_) {}
        }));
    } catch (_) {}
}

async function networkOnlyHtml(req) {
    try {
        return await fetch(req);
    } catch (e) {
        return new Response(
            '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
            '<style>body{font-family:system-ui,sans-serif;padding:2rem;text-align:center;color:#333}' +
            'h1{margin-bottom:.5rem}p{color:#666}</style>' +
            '<h1>Offline</h1><p>Riconnettiti e ricarica la pagina.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}
