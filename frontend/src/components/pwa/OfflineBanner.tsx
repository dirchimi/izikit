'use client';

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';

/**
 * Avis TRANSITOIRE de perte de connexion : la barre apparaît quelques secondes
 * quand le réseau tombe (le moment où il faut être vu), puis s'efface.
 *
 * Retour terrain : la version permanente était dérangeante quand la boutique
 * travaille hors-ligne toute la journée — et l'état durable est déjà porté par
 * DEUX petits indicateurs permanents (pastille « Hors ligne » de la barre du
 * haut + badge de la sidebar). Rien quand on est en ligne.
 */
const SHOW_MS = 5000;

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (online) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [online]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed inset-x-0 top-0 z-[120] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-amber-950 shadow-md"
    >
      <Icon i="cloud-off" size={14} className="shrink-0" />
      <span className="font-body text-xs font-semibold">{t('offline.banner')}</span>
    </div>
  );
}
