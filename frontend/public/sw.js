/*
 * Service worker — PWA Niveau 1 + app-shell hors-ligne (couche 1 + 6.1).
 *
 * Stratégies de cache :
 *  - Statiques immuables (/_next/static, /icons, polices, images) → cache-first.
 *  - Navigations (pages), RSC et lectures /api GET → network-first, repli cache.
 *  - Repli d'une navigation hors-ligne :
 *      1. le document HTML déjà en cache runtime pour CETTE route (visitée en
 *         ligne au moins une fois — rechargement complet ou ouverture directe
 *         de l'URL) → sert l'app shell de la page demandée ;
 *      2. sinon, page /hors-ligne (pré-cachée à l'install).
 *    On ne resert JAMAIS une entrée cache dont le content-type n'est pas HTML
 *    pour une navigation : les transitions client (Next.js) fetchent la même
 *    URL en RSC (flight, pas du HTML) et sont mises en cache séparément (Next
 *    varie la réponse par en-têtes RSC/Next-Router-*) — le garde-fou
 *    content-type évite de resservir un payload RSC comme document complet
 *    si jamais cette séparation échouait.
 *
 * Jamais mis en cache : les écritures (POST/PATCH/DELETE — passe-plat réseau)
 * et les routes /api/auth/* (session sensible). À la déconnexion, l'app envoie
 * un message CLEAR_CACHE → on purge le cache « runtime » (données privées) en
 * gardant l'app shell + la page hors-ligne (rien de privé là-dedans).
 */
/* global self, caches */
const VERSION = 'sahilley-v5';
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
    // On ne met JAMAIS en cache une réponse de redirection : les pages sont
    // gardées côté serveur (le layout (app) redirige vers /connexion sans
    // session), et resservir une redirection hors-ligne fait rebondir le
    // navigateur en boucle (/dashboard ↔ /connexion). On ne garde que les
    // documents terminaux (ok + basic + non redirigés).
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    if (fallbackOffline) {
      // Navigation hors-ligne : on tente d'abord l'app shell de LA ROUTE
      // demandée dans le cache runtime (ex. /vendre rechargé hors-ligne après
      // avoir été visité en ligne). On ne le sert que si c'est bien un
      // document HTML — jamais un payload RSC mis en cache sous la même URL
      // lors d'une transition client (voir en-tête de fichier).
      const runtime = await caches.open(RUNTIME_CACHE);
      const cachedShell = await runtime.match(request);
      const contentType = cachedShell ? cachedShell.headers.get('content-type') || '' : '';
      if (cachedShell && contentType.includes('text/html')) {
        return cachedShell;
      }
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
      throw err;
    }
    // Lectures /api GET, RSC : repli sur n'importe quelle entrée déjà en cache.
    const cached = await caches.match(request);
    if (cached) return cached;
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
