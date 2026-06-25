'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker (`/sw.js`) au chargement — condition nécessaire
 * pour que le navigateur propose l'installation de la PWA. Échoue en silence
 * si l'API n'est pas dispo (ex. contexte non sécurisé). Rien à afficher.
 */
export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
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
