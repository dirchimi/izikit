'use client';

import type { ReactNode } from 'react';
import { useT } from '@/contexts/LocaleContext';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';

/**
 * Bloc d'actions à droite de la TopBar pour les écrans métier :
 * badge de statut réseau **réel** (vert en ligne / ambre hors-ligne) +
 * sélecteur de langue (fonctionnel). `extra` insère un contrôle propre à
 * l'écran entre le badge et le switcher (ex. bouton « Exporter en PDF »).
 */
export default function ScreenTopActions({ extra }: { extra?: ReactNode }) {
  const t = useT();
  const online = useOnlineStatus();
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted flex items-center gap-2 rounded-md px-3 py-2">
        <div className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-warning'}`} />
        <span className="text-muted-foreground font-body text-xs font-semibold">
          {online ? t('online.connected') : t('offline.short')}
        </span>
      </div>
      {extra}
      <div className="hidden items-center gap-1.5 sm:flex">
        <LanguageSwitcher compact />
        <ThemeToggle compact />
      </div>
    </div>
  );
}
