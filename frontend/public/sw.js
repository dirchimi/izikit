/*
 * Service worker — PWA Niveau 1 + app-shell hors-ligne (couche 1 + 6.1).
 *
 * Stratégies de cache :
 *  - Statiques immuables (/_next/static, /icons, polices, images) → cache-first.
 *  - Navigations (pages), RSC et lectures /api GET → network-first, repli cache.
 *  - Repli d'une navigation hors-ligne :
 *      1. le document HTML en cache pour CETTE route — visitée en ligne au moins
 *         une fois OU pré-cachée à l'install (voir PRECACHE_ROUTES) → sert l'app
 *         shell de la page demandée ;
 *      2. sinon, page /hors-ligne (pré-cachée à l'install).
 *    On ne resert JAMAIS une entrée cache dont le content-type n'est pas HTML
 *    pour une navigation : les transitions client (Next.js) fetchent la même
 *    URL en RSC (flight, pas du HTML) — le garde-fou content-type évite de
 *    resservir un payload RSC comme document complet.
 *
 *  - `ignoreVary` sur TOUS les replis cache hors-ligne : Next varie ses réponses
 *    par en-têtes (RSC / Next-Router-State-Tree / Next-Router-Prefetch), donc
 *    une correspondance stricte raterait la page/le RSC pourtant en cache — la
 *    navigation client hors-ligne plantait alors (« Une erreur est survenue »).
 *    En l'ignorant, on retrouve la coquille HTML (navigation) ou le payload RSC
 *    pré-chargé (transition client) quel que soit l'en-tête sous lequel il a été
 *    mis en cache.
 *
 * Jamais mis en cache : les écritures (POST/PATCH/DELETE — passe-plat réseau)
 * et les routes /api/auth/* (session sensible). À la déconnexion, l'app envoie
 * un message CLEAR_CACHE → on purge le cache « runtime » (données privées, dont
 * les coquilles pré-cachées) en gardant l'app shell statique + /hors-ligne.
 */
/* global self, caches */
const VERSION = 'sahilley-v6';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = '/hors-ligne';

// Routes (app) dont on pré-cache la coquille HTML à l'installation, pour que la
// navigation hors-ligne serve une page même VERS UN ÉCRAN JAMAIS OUVERT en
// ligne (sinon seule une route déjà visitée fonctionnait — d'où les crashs sur
// Ventes/Créances non réchauffées). Best-effort : un échec ne bloque pas l'install.
const PRECACHE_ROUTES = [
  '/dashboard',
  '/vendre',
  '/ventes',
  '/stock',
  '/creances',
  '/depenses',
  '/documents',
  '/synchronisation',
];

// Récupère et met en cache la coquille HTML d'une route. On ne garde QUE des
// documents terminaux (ok + basic + non redirigés) : une redirection vers
// /connexion resservie hors-ligne ferait rebondir le navigateur en boucle.
async function precacheRoute(cache, route) {
  try {
    const res = await fetch(route, { credentials: 'same-origin' });
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      await cache.put(route, res.clone());
    }
  } catch {
    /* best-effort — l'installation ne doit jamais échouer pour un précache */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      const runtime = await caches.open(RUNTIME_CACHE);
      // /hors-ligne dans le cache statique (rien de privé) ; les coquilles (app)
      // dans le runtime (données privées — purgées à la déconnexion).
      await Promise.allSettled([
        staticCache.add(OFFLINE_URL),
        ...PRECACHE_ROUTES.map((r) => precacheRoute(runtime, r)),
      ]);
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
      // Navigation hors-ligne : coquille HTML de LA ROUTE demandée (visitée en
      // ligne OU pré-cachée à l'install). `ignoreVary` est indispensable (voir
      // en-tête de fichier). On ne sert que du HTML — jamais un payload RSC mis
      // en cache sous la même URL lors d'une transition client.
      const cachedShell = await caches.match(request, { ignoreVary: true });
      const contentType = cachedShell ? cachedShell.headers.get('content-type') || '' : '';
      if (cachedShell && contentType.includes('text/html')) {
        return cachedShell;
      }
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
      throw err;
    }
    // Lectures /api GET, RSC : repli sur l'entrée en cache en IGNORANT Vary —
    // sans ça une navigation client (payload RSC) hors-ligne ne retrouve pas le
    // RSC pré-chargé et plante (« Une erreur est survenue »).
    const cached = await caches.match(request, { ignoreVary: true });
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
