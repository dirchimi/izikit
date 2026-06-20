'use client';

import type { ReactNode } from 'react';
import { useT } from '@/contexts/LocaleContext';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';

/**
 * Bloc d'actions à droite de la TopBar pour les écrans métier :
 * badge « Hors ligne » + sélecteur de langue (fonctionnel).
 * `extra` insère un contrôle propre à l'écran entre le badge et le switcher
 * (ex. bouton « Exporter en PDF » sur Rapports).
 */
export default function ScreenTopActions({ extra }: { extra?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <div className="bg-offline flex items-center gap-2 rounded-md px-3 py-2">
        <div className="bg-offline-foreground h-2 w-2 shrink-0 rounded-full opacity-70" />
        <span className="text-offline-foreground font-body text-xs font-semibold">
          {t('offline.syncPending')}
        </span>
      </div>
      {extra}
      <div className="hidden sm:block">
        <LanguageSwitcher />
      </div>
      <div className="hidden sm:block">
        <ThemeToggle />
      </div>
    </div>
  );
}
