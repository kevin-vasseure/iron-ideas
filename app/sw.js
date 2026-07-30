/* Iron Ideas — service worker.
 *
 * Stratégie : stale-while-revalidate. La page est servie depuis le cache
 * (donc instantanée, et disponible hors-ligne), puis rafraîchie en arrière-plan.
 * Quand cards.js a réellement changé, la page en est prévenue et propose de
 * recharger — sinon on verrait les anciennes fiches jusqu'à l'ouverture suivante.
 *
 * Bump VERSION pour purger tous les caches précédents.
 */
const VERSION = 'v2';
const CACHE = `iron-ideas-${VERSION}`;

/* Chemins relatifs : ils se résolvent depuis la portée du worker, donc ça
   fonctionne aussi bien à la racine qu'un sous-chemin (/iron-ideas/). */
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './cards.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  const fresh = fetch(request);
  // Cloner dès la résolution, avant que quiconque ne lise le corps.
  const copy = fresh.then((res) => res.clone());

  // waitUntil et respondWith doivent être appelés de façon synchrone : la
  // revalidation vit ainsi indépendamment de la réponse rendue à la page.
  event.waitUntil(store(request, copy));
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fresh),
  );
});

async function store(request, copy) {
  let res;
  try {
    res = await copy;
  } catch {
    return; // hors-ligne : le cache a déjà répondu
  }
  if (!res.ok) return;

  const cache = await caches.open(CACHE);

  if (/cards\.js$/.test(new URL(request.url).pathname)) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      const [before, after] = await Promise.all([cached.text(), res.clone().text()]);
      if (before !== after) await announce();
    }
  }

  await cache.put(request, res);
}

async function announce() {
  for (const client of await self.clients.matchAll({ type: 'window' })) {
    client.postMessage({ type: 'cards-updated' });
  }
}
