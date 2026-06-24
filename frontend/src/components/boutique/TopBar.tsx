'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import GlobalSearch from './GlobalSearch';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

/**
 * Barre de titre d'écran (titre + sous-titre). Par défaut : sélecteur de langue
 * (fonctionnel) + toggle thème (visuel) + CTA « Nouvelle vente ». Passer `actions`
 * pour remplacer le bloc de droite par des contrôles propres à l'écran.
 */
export default function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-8">
      <div className="min-w-0 shrink-0">
        <h1 className="font-headings text-foreground truncate text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-muted-foreground font-body mt-0.5 text-xs">{subtitle}</p>}
      </div>

      {/* Recherche globale — visible à partir de md, prend l'espace central libéré. */}
      <div className="order-last hidden min-w-0 flex-1 justify-center px-2 md:order-none md:flex lg:px-6">
        <GlobalSearch />
      </div>

      {/* La cloche est TOUJOURS présente (avant les actions propres à l'écran),
          quel que soit le `actions` passé par la page. */}
      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell />
        {actions ?? (
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>

            {/* Toggle thème (fonctionnel) */}
            <div className="hidden md:block">
              <ThemeToggle />
            </div>

            {/* CTA nouvelle vente */}
            <Link
              href="/vendre"
              className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
            >
              <Icon i="plus" size={15} />
              {t('topbar.newSale')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
