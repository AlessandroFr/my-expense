// Questo service worker esiste solo per togliersi di mezzo.
//
// Serviva quando l'app si apriva nel browser e la si poteva «installare» come
// PWA: teneva in cache le librerie prese dai CDN. Ora l'app si installa davvero,
// il server sta sullo stesso computer e le librerie sono in public/vendor/:
// una cache in mezzo non fa guadagnare niente e puo' solo servire una versione
// vecchia di una pagina.
//
// Cancellarlo e basta non sarebbe bastato: un service worker gia' registrato
// resta attivo nel browser finche' non si disinstalla da solo. Questo lo fa, e
// svuota quello che aveva messo in cache.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const nome of await caches.keys()) await caches.delete(nome);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll()) client.navigate(client.url);
  })());
});
