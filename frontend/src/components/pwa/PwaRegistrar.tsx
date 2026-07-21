'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker (`/sw.js`) au chargement — condition nécessaire
 * pour que le navigateur propose l'installation de la PWA + le cache d'app-shell
 * hors-ligne. Échoue en silence si l'API n'est pas dispo (ex. contexte non
 * sécurisé). Rien à afficher.
 *
 * ⚠️ PRODUCTION UNIQUEMENT. En développement (`pnpm dev`) les fragments JS de
 * Next changent à chaque recompilation : un SW qui met en cache servirait alors
 * des réponses périmées — symptôme typique, la page « hors-ligne » servie pour
 * une route alors qu'on est bien en ligne. En dev on ne l'enregistre donc
 * jamais, et on DÉSENREGISTRE tout SW déjà installé en purgeant ses caches
 * (auto-réparation d'un poste de dev déjà pollué par un ancien enregistrement).
 */
export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // Auto-réparation en dev : retire tout SW existant + vide ses caches.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
      });
      if (typeof caches !== 'undefined') {
        void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
      }
      return;
    }

    const register = async () => {
      // On enregistre `/sw.js?v=<buildId>` : le buildId change à chaque
      // déploiement (voir scripts/gen-sw-precache.mjs), donc l'URL du SW change
      // → le navigateur installe un SW neuf qui re-précache le nouveau jeu de
      // fichiers JS. Sans ce paramètre, `/sw.js` (identique d'un build à l'autre)
      // ne se réinstallerait pas et l'app resterait sur les anciens chunks
      // hors-ligne. Repli sur `/sw.js` si le manifeste n'est pas là.
      let url = '/sw.js';
      try {
        const res = await fetch('/sw-precache.json', { cache: 'no-store' });
        if (res.ok) {
          const manifest = (await res.json()) as { buildId?: string };
          if (manifest.buildId) url = `/sw.js?v=${encodeURIComponent(manifest.buildId)}`;
        }
      } catch {
        /* pas de manifeste → enregistrement sur /sw.js nu */
      }
      void navigator.serviceWorker.register(url).catch(() => {
        /* enregistrement best-effort : pas bloquant pour l'app */
      });
    };
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
  }, []);

  return null;
}
