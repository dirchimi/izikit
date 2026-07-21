'use client';

/**
 * precache-shells.ts — demande au service worker de (re)pré-cacher les
 * coquilles HTML des écrans (app) (message `PRECACHE_SHELLS`, voir
 * `public/sw.js`).
 *
 * Pourquoi le client et pas seulement l'installation du SW : le jeton d'accès
 * ne vit que 15 min — à l'install il est souvent périmé, les pages (app)
 * répondent 307 /connexion et le précache d'install saute TOUTES les coquilles
 * (bug terrain : hors-ligne, navigation à froid → « Pas de connexion »).
 * L'appelant (AppShell) invoque ceci juste après un `pullAll()` réussi : à cet
 * instant `api()` vient de rafraîchir les cookies, donc les fetchs de
 * coquilles du SW passent le garde d'authentification. Bonus : les coquilles
 * sont re-capturées à chaque chargement en ligne → elles référencent toujours
 * les chunks du build courant (jamais un ChunkLoadError sur build périmé).
 *
 * Throttlé (10 min) pour ne pas re-rendre 10 pages serveur à chaque
 * bagottement du réseau. Prod uniquement (pas de SW en dev). Best-effort.
 */

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 10 * 60_000;

export function requestShellPrecache(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // En dev le SW n'est jamais enregistré (voir PwaRegistrar) — `ready` ne se
  // résoudrait jamais, autant sortir tout de suite.
  if (process.env.NODE_ENV !== 'production') return;
  const now = Date.now();
  if (now - lastRequestAt < MIN_INTERVAL_MS) return;
  lastRequestAt = now;
  void navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: 'PRECACHE_SHELLS' }))
    .catch(() => undefined);
}
