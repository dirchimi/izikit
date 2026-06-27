'use client';

import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { useT } from '@/contexts/LocaleContext';
import Icon from '@/components/ui/Icon';

/**
 * Barre fine affichée en haut quand le réseau est absent. Signale à
 * l'utilisateur que les données montrées sont les dernières chargées
 * (consultation hors-ligne — couche 1). Rien quand on est en ligne.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const t = useT();
  if (online) return null;

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
