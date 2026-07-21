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

    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* enregistrement best-effort : pas bloquant pour l'app */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
