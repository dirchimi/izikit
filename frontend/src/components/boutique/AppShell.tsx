'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SidebarNav from './SidebarNav';
import BottomNav from './BottomNav';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import OfflineBanner from '@/components/pwa/OfflineBanner';
import { useApi } from '@/lib/useApi';

interface BoutiqueHeaderData {
  organization: { name: string };
  settings: { logoUrl: string | null } | null;
}

/**
 * Responsive dashboard shell.
 * - lg+ : sidebar fixe (220px), collée en pleine hauteur.
 * - < lg : sidebar masquée → header mobile avec hamburger ouvrant un drawer.
 *
 * Le gating d'auth est fait en amont, côté serveur, dans (app)/layout.tsx :
 * une session invalide redirige vers /connexion avant que ce shell ne rende.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);
  const pathname = usePathname();
  // Partage le cache de /api/org/current avec la sidebar (même clé useApi).
  const { data: boutique } = useApi<BoutiqueHeaderData>('/api/org/current');
  const shopName = boutique?.organization.name ?? 'Sahilley';
  const shopLogo = boutique?.settings?.logoUrl ?? null;

  return (
    <div className="bg-background font-body flex min-h-screen">
      {/* Bandeau hors-ligne (barre fine en haut quand le réseau tombe) */}
      <OfflineBanner />

      {/* Sidebar desktop */}
      <aside className="hidden shrink-0 lg:block lg:w-[220px]">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={close}
            className="absolute inset-0 bg-black/40"
          />
          <div className="animate-slide-in-right absolute inset-y-0 start-0 w-[260px] max-w-[80%] shadow-xl">
            <SidebarNav onNavigate={close} />
          </div>
        </div>
      )}

      {/* Colonne principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header mobile */}
        <header className="bg-sidebar border-sidebar-muted flex items-center gap-3 border-b px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Ouvrir le menu"
            onClick={() => setDrawerOpen(true)}
            className="text-sidebar-foreground flex h-10 w-10 items-center justify-center rounded-md"
          >
            <Icon i="menu" size={22} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="bg-primary flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
              {shopLogo ? (
                <img src={shopLogo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon i="store" size={15} className="text-primary-foreground" />
              )}
            </div>
            <span className="font-headings text-sidebar-foreground truncate text-base font-bold tracking-tight">
              {shopName}
            </span>
          </div>
        </header>

        {/* pb sous lg : laisse la place à la barre de navigation basse */}
        <main
          key={pathname}
          className="animate-fade-in min-w-0 flex-1 overflow-x-clip pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"
        >
          {children}
        </main>
      </div>

      {/* Navigation basse (mobile) — masquée quand le tiroir est ouvert */}
      {!drawerOpen && <BottomNav onMore={() => setDrawerOpen(true)} />}

      {/* Bannière d'installation PWA (in-app, comme les apps de référence) */}
      <InstallPrompt />
    </div>
  );
}
