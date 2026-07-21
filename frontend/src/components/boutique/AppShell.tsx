'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SidebarNav from './SidebarNav';
import BottomNav from './BottomNav';
import SubscriptionBanner from './SubscriptionBanner';
import GlobalBanner from './GlobalBanner';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import OfflineBanner from '@/components/pwa/OfflineBanner';
import { useApi } from '@/lib/useApi';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LocaleContext';
import { authGateState } from '@/lib/offline/auth-gate';
import { installSyncTriggers } from '@/lib/offline/sync-triggers';
import { pullAll } from '@/lib/offline/pull';
import { purgeLocalHistory } from '@/lib/offline/purge';

interface BoutiqueHeaderData {
  organization: { name: string };
  settings: { logoUrl: string | null } | null;
}

/**
 * Responsive dashboard shell.
 * - lg+ : sidebar fixe (220px), collée en pleine hauteur.
 * - < lg : sidebar masquée → header mobile avec hamburger ouvrant un drawer.
 *
 * Gating d'auth — deux couches :
 * - Serveur (autorité en ligne) : (app)/layout.tsx vérifie le cookie via
 *   verifyToken() et redirige vers /connexion AVANT de rendre ce shell.
 * - Client (Task 1.5, couvre le cas hors-ligne) : quand le service worker
 *   sert le HTML de la coquille (app) depuis le cache pendant que l'appareil
 *   est hors-ligne, ce composant serveur ne s'exécute PAS — il n'y a alors
 *   plus aucune autorité pour décider si l'app doit s'afficher. Le garde
 *   ci-dessous (useUser, voir AuthContext.tsx) couvre ce trou : tant que
 *   l'auth n'est pas résolue on affiche un loader neutre, et si elle se
 *   résout sans utilisateur (en ligne, déconnecté ; ou hors-ligne, aucune
 *   session persistée valide) on redirige vers /connexion sans jamais
 *   rendre la coquille.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);
  const pathname = usePathname();
  const t = useT();
  const { loading } = useAuth();
  const user = useUser('/connexion');
  // Partage le cache de /api/org/current avec la sidebar (même clé useApi).
  const { data: boutique } = useApi<BoutiqueHeaderData>('/api/org/current');
  const shopName = boutique?.organization.name ?? 'Sahilley';
  const shopLogo = boutique?.settings?.logoUrl ?? null;

  // Global outbox-drain triggers (Task 2.3) — mounted for the app's
  // lifetime regardless of the auth-gate state below (unconditional hook,
  // same rule as the other hooks above).
  useEffect(() => installSyncTriggers(), []);

  // Seed/refresh the local Dexie mirror (Task 3.3) so offline reads (e.g. the
  // POS catalogue) aren't empty. Best-effort: fire on mount and whenever the
  // browser regains connectivity, never blocking render and never surfacing
  // errors (a failed pull just leaves the last-known mirror in place).
  // Unconditional hook, declared before the auth-gate early return below.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seed = () => {
      if (navigator.onLine) void pullAll().catch(() => undefined);
    };
    seed();
    window.addEventListener('online', seed);
    return () => window.removeEventListener('online', seed);
  }, []);

  // Local retention sweep (Task 6.3) — prevents unbounded IndexedDB growth on
  // a long-lived install by dropping old, already-synced history rows (see
  // `purge.ts`'s docblock for the exact safety rules: never touches unsynced
  // rows or rows a live outbox entry still references). Best-effort and
  // silent: a failed sweep just means the mirror keeps growing until the
  // next successful mount, never a correctness issue. Unconditional hook,
  // declared before the auth-gate early return below.
  useEffect(() => {
    void purgeLocalHistory().catch(() => undefined);
  }, []);

  const gate = authGateState(loading, user);
  if (gate !== 'ready') {
    // 'loading' : auth pas encore résolue → loader neutre, jamais la coquille.
    // 'redirect' : résolue sans utilisateur → useUser() déclenche déjà le
    // router.replace('/connexion') en effet de bord ; on ne rend rien ici.
    return (
      <div
        role="status"
        aria-busy="true"
        className="bg-background flex min-h-screen items-center justify-center"
      >
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

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

        {/* Bandeau d'information global (super-admin) puis bandeau d'abonnement */}
        <GlobalBanner />

        {/* Bandeau d'abonnement (essai finissant / expiré) — application douce */}
        <SubscriptionBanner />

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
