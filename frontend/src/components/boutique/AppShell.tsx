'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SidebarNav from './SidebarNav';

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

  return (
    <div className="bg-background font-body flex min-h-screen">
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
          <div className="flex items-center gap-2">
            <div className="bg-primary flex h-7 w-7 items-center justify-center rounded-md">
              <Icon i="store" size={15} className="text-primary-foreground" />
            </div>
            <span className="font-headings text-sidebar-foreground text-base font-bold tracking-tight">
              Sahilley
            </span>
          </div>
        </header>

        <main key={pathname} className="animate-fade-in min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
