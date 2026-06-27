'use client';

import { useEffect, useState } from 'react';

/**
 * Indique si le navigateur a une connexion réseau (`navigator.onLine`),
 * mis à jour en direct via les événements `online` / `offline`.
 *
 * Démarre à `true` pour éviter un faux « hors ligne » au premier rendu (SSR
 * + hydratation). `navigator.onLine` est un indicateur de couche réseau : il
 * peut rester `true` sur un Wi-Fi sans Internet réel — suffisant pour la
 * couche 1 (consultation hors-ligne). Une sonde active viendra plus tard si
 * besoin.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
