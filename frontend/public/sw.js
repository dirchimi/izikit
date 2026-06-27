/*
 * Service worker — PWA Niveau 1 + consultation hors-ligne (couche 1).
 *
 * Stratégies de cache :
 *  - Statiques immuables (/_next/static, /icons, polices, images) → cache-first.
 *  - Navigations (pages), RSC et lectures /api GET → network-first, repli cache.
 *  - Repli ultime d'une navigation hors-ligne → page /hors-ligne (pré-cachée).
 *
 * Jamais mis en cache : les écritures (POST/PATCH/DELETE — passe-plat réseau)
 * et les routes /api/auth/* (session sensible). À la déconnexion, l'app envoie
 * un message CLEAR_CACHE → on purge le cache « runtime » (données privées) en
 * gardant l'app shell + la page hors-ligne (rien de privé là-dedans).
 */
/* global self, caches */
const VERSION = 'sahilley-v2';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = '/hors-ligne';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Pré-cache best-effort : si la page hors-ligne échoue, l'install réussit
      // quand même (pas de blocage de l'activation).
      await Promise.allSettled([cache.add(OFFLINE_URL)]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Supprime les caches des versions précédentes.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|svg|webp|gif|ico)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && res.type === 'basic') {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request, fallbackOffline) {
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackOffline) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // écritures : passe-plat réseau

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // cross-origin : passe-plat
  if (url.pathname.startsWith('/api/auth/')) return; // session : jamais de cache

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true));
    return;
  }
  // Lectures /api GET, RSC et autres GET same-origin → network-first.
  event.respondWith(networkFirst(request, false));
});
