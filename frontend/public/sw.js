/*
 * Service worker — PWA + app-shell hors-ligne + PRÉCACHE COMPLET du code.
 *
 * Objectif : n'importe quel écran (app) doit s'ouvrir hors-ligne, même jamais
 * visité en ligne. Le point dur était le `ChunkLoadError: Failed to load chunk`
 * — un fichier JS de la page absent du cache hors-ligne. On règle ça en
 * pré-cachant, à l'installation, TOUS les fichiers JS/CSS du build (liste
 * générée par `scripts/gen-sw-precache.mjs` → `/sw-precache.json`, ~4-5 Mo).
 *
 * Stratégies :
 *  - Statiques (/_next/static, /icons, polices, images) → cache-first ; le
 *    précache remplit le cache d'avance, sinon on met en cache à la demande.
 *  - Navigations (pages), RSC et lectures /api GET → network-first, repli cache
 *    avec `ignoreVary` (Next varie ses réponses par en-têtes RSC/Next-Router-* ;
 *    sans ignoreVary une navigation client hors-ligne ne retrouvait pas la page
 *    en cache et plantait).
 *  - Repli navigation hors-ligne : coquille HTML de la route (visitée OU
 *    pré-cachée) sinon /hors-ligne.
 *
 * Révision : `/sw-precache.json` porte le `buildId` du déploiement ; le précache
 * vit dans un cache `PRECACHE_PREFIX + buildId`. `PwaRegistrar` enregistre
 * `/sw.js?v=<buildId>`, donc un nouveau déploiement installe un SW neuf qui
 * re-précache le nouveau jeu de chunks ; `activate` purge les anciens caches.
 *
 * Jamais mis en cache : écritures (POST/PATCH/DELETE) et /api/auth/* (session).
 * À la déconnexion, CLEAR_CACHE purge le cache runtime (données privées).
 */
/* global self, caches */
const VERSION = 'sahilley-v7';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const PRECACHE_PREFIX = 'sahilley-precache-';
const OFFLINE_URL = '/hors-ligne';

// Coquilles HTML (app) pré-cachées pour la navigation hors-ligne vers un écran
// jamais ouvert. (Le CODE de ces écrans vient, lui, du précache complet.)
const PRECACHE_ROUTES = [
  '/dashboard',
  '/vendre',
  '/ventes',
  '/stock',
  '/creances',
  '/depenses',
  '/documents',
  '/synchronisation',
  '/parametres',
  '/rapports',
];

// Build id du SW courant — posé pendant `install`, relu dans `activate` pour ne
// purger que les précaches des ANCIENS builds.
let currentBuildId = null;

async function loadManifest() {
  try {
    const res = await fetch('/sw-precache.json', { cache: 'no-store' });
    if (res && res.ok) return await res.json();
  } catch {
    /* pas de manifeste (build sans le script) → on saute le précache complet */
  }
  return null;
}

// Précache par lots bornés : 1798 requêtes d'un coup saturerait le réseau.
async function precacheAssets(cache, assets) {
  const BATCH = 40;
  for (let i = 0; i < assets.length; i += BATCH) {
    const batch = assets.slice(i, i + BATCH).map((u) => cache.add(u).catch(() => undefined));
    await Promise.allSettled(batch);
  }
}

// Coquille HTML d'une route — on ne garde QUE des documents terminaux (ok +
// basic + non redirigés) : une redirection /connexion resservie hors-ligne
// ferait boucler le navigateur.
async function precacheRoute(cache, route) {
  try {
    const res = await fetch(route, { credentials: 'same-origin' });
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      await cache.put(route, res.clone());
    }
  } catch {
    /* best-effort */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await loadManifest();
      // Poser currentBuildId AVANT skipWaiting : `activate` (déclenché par
      // skipWaiting) le relit pour ne pas purger le précache qu'on remplit.
      currentBuildId = manifest && manifest.buildId ? manifest.buildId : null;
      const precache = currentBuildId
        ? await caches.open(`${PRECACHE_PREFIX}${currentBuildId}`)
        : null;

      await self.skipWaiting();

      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.add(OFFLINE_URL).catch(() => undefined);

      if (precache && manifest && Array.isArray(manifest.assets)) {
        await precacheAssets(precache, manifest.assets);
      }
      const runtime = await caches.open(RUNTIME_CACHE);
      await Promise.allSettled(PRECACHE_ROUTES.map((r) => precacheRoute(runtime, r)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k.startsWith(PRECACHE_PREFIX)) {
            // Garder le précache du build courant, purger les autres.
            return currentBuildId && k === `${PRECACHE_PREFIX}${currentBuildId}`
              ? undefined
              : caches.delete(k);
          }
          // Garder les caches static/runtime de CETTE version, purger le reste.
          return k.startsWith(VERSION) ? undefined : caches.delete(k);
        }),
      );
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
  // `caches.match` couvre TOUS les caches (précache inclus) → un chunk
  // pré-caché est trouvé ici sans toucher le réseau.
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
    // Jamais de redirection en cache (rebond /dashboard ↔ /connexion hors-ligne).
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    if (fallbackOffline) {
      // Navigation hors-ligne : coquille HTML de LA ROUTE (visitée OU pré-cachée).
      // `ignoreVary` indispensable (voir en-tête). On ne sert que du HTML —
      // jamais un payload RSC mis en cache sous la même URL.
      const cachedShell = await caches.match(request, { ignoreVary: true });
      const contentType = cachedShell ? cachedShell.headers.get('content-type') || '' : '';
      if (cachedShell && contentType.includes('text/html')) {
        return cachedShell;
      }
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
      throw err;
    }
    // Lectures /api GET, RSC : repli en IGNORANT Vary — sans ça une navigation
    // client (payload RSC) hors-ligne ne retrouve pas le RSC pré-chargé et plante.
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
