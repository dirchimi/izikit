/*
 * Service worker minimal — rend l'application installable (PWA Niveau 1).
 *
 * Volontairement SANS cache de données : l'app reste « online-only » en v1
 * (voir SidebarNav). Le handler `fetch` est un passe-plat réseau (il ne fait
 * pas de respondWith → comportement navigateur par défaut). Le vrai mode
 * hors-ligne (cache de l'app shell + synchro des données) sera un lot ultérieur.
 */
/* global self */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Passe-plat : aucune interception, le réseau gère normalement.
});
