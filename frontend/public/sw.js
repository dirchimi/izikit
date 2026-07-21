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
 *    pré-cachée, query string ignorée en 2e passe) sinon /hors-ligne.
 *
 * Coquilles HTML : l'install n'en fait qu'une tentative best-effort (jeton
 * 15 min souvent périmé → 307 /connexion → coquilles sautées). Le chemin
 * FIABLE est le message `PRECACHE_SHELLS` envoyé par AppShell juste après un
 * pullAll() réussi (cookies frais) — voir src/lib/offline/precache-shells.ts.
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
const VERSION = 'sahilley-v8';
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
// basic + non redirigés + HTML) : une redirection /connexion resservie
// hors-ligne ferait boucler le navigateur.
//
// ⚠️ Le jeton d'accès ne vit que 15 min : à l'installation du SW il est souvent
// périmé → les pages (app) répondent 307 /connexion et TOUTES les coquilles
// sont sautées (bug terrain : navigation à froid hors-ligne → « Pas de
// connexion » sur chaque écran). L'install ne fait donc qu'une tentative
// best-effort ; le chemin FIABLE est le message PRECACHE_SHELLS envoyé par le
// client (AppShell) juste après un pullAll() réussi — à cet instant api()
// vient de rafraîchir les cookies, le fetch ne peut pas être redirigé. Ça
// rafraîchit aussi les coquilles à chaque chargement en ligne, donc elles
// référencent toujours les chunks du build courant.
async function precacheRoute(cache, route) {
  try {
    const res = await fetch(route, { credentials: 'same-origin' });
    const contentType = res ? res.headers.get('content-type') || '' : '';
    if (
      res &&
      res.ok &&
      res.type === 'basic' &&
      !res.redirected &&
      contentType.includes('text/html')
    ) {
      await cache.put(route, res.clone());
    }
  } catch {
    /* best-effort */
  }
}

async function precacheAllShells() {
  const runtime = await caches.open(RUNTIME_CACHE);
  await Promise.allSettled(PRECACHE_ROUTES.map((r) => precacheRoute(runtime, r)));
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
      await precacheAllShells();
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
  if (!event.data) return;
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  } else if (event.data.type === 'PRECACHE_SHELLS') {
    // Envoyé par le client (AppShell) juste après un pullAll() réussi —
    // cookies fraîchement rafraîchis → les fetchs de coquilles passent le
    // garde d'authentification au lieu d'être redirigés vers /connexion.
    event.waitUntil(precacheAllShells());
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
      const isHtml = (r) => (r.headers.get('content-type') || '').includes('text/html');
      const cachedShell = await caches.match(request, { ignoreVary: true });
      if (cachedShell && isHtml(cachedShell)) {
        return cachedShell;
      }
      // 2e passe : même chemin en ignorant la query string (ex. /creances?tab=x
      // doit servir la coquille /creances). `matchAll` + filtre HTML pour ne
      // jamais confondre avec un payload RSC caché sous /route?_rsc=….
      const runtime = await caches.open(RUNTIME_CACHE);
      const loose = await runtime.matchAll(request, { ignoreVary: true, ignoreSearch: true });
      const htmlShell = loose.find(isHtml);
      if (htmlShell) return htmlShell;
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
