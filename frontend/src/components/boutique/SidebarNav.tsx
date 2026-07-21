'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { useT } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useApi } from '@/lib/useApi';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { useSyncStatus } from '@/lib/offline/useSyncStatus';
import { SyncCountBadge } from './sync/SyncIndicator';

interface NavItem {
  icon: string;
  key: string;
  href: string;
  /** Si défini, l'item n'est visible que pour Manager/Patron (ADMIN+). */
  managerOnly?: boolean;
}
interface NavSection {
  label?: string;
  items: NavItem[];
}

interface BoutiqueCurrent {
  organization: { id: string; slug: string; name: string };
  settings: { logoUrl: string | null } | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

// Rôles métier → libellés i18n (Patron / Gérant / Vendeur).
const ROLE_LABEL_KEY: Record<string, string> = {
  OWNER: 'role.patron',
  ADMIN: 'role.gerant',
  MEMBER: 'role.vendeur',
};

// Navigation groupée en sections. Compacte pour tenir sans défilement.
const navSections: NavSection[] = [
  {
    items: [
      { icon: 'layout-dashboard', key: 'nav.dashboard', href: '/dashboard', managerOnly: true },
    ],
  },
  {
    label: 'nav.section.vente',
    items: [
      { icon: 'shopping-cart', key: 'nav.vendre', href: '/vendre' },
      { icon: 'receipt-text', key: 'nav.ventes', href: '/ventes' },
    ],
  },
  {
    label: 'nav.section.boutique',
    items: [
      { icon: 'package', key: 'nav.stock', href: '/stock' },
      { icon: 'hand-coins', key: 'nav.creances', href: '/creances' },
      { icon: 'wallet', key: 'nav.depenses', href: '/depenses' },
      { icon: 'refresh-cw', key: 'nav.sync', href: '/synchronisation' },
    ],
  },
  {
    label: 'nav.section.analyse',
    items: [
      { icon: 'file-text', key: 'nav.documents', href: '/documents' },
      {
        icon: 'chart-no-axes-combined',
        key: 'nav.rapports',
        href: '/rapports',
        managerOnly: true,
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  icon,
  label,
  href,
  active,
  onNavigate,
  badge,
}: {
  icon: string;
  label: string;
  href: string;
  active: boolean;
  onNavigate: () => void;
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`font-body flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-sidebar-active text-primary-foreground'
          : 'text-sidebar-foreground opacity-60 hover:opacity-100'
      }`}
    >
      <Icon i={icon} size={16} />
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

export default function SidebarNav({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();
  const confirm = useConfirm();
  const online = useOnlineStatus();
  // Compteurs live pour le badge de sync attaché à l'item de nav ci-dessous.
  const { pendingCount, conflicts } = useSyncStatus();
  // Charge (et provisionne au 1er accès) la boutique courante.
  const { data: boutique } = useApi<BoutiqueCurrent>('/api/org/current');
  // Sonde admin : 403 pour les non-admins → `data` reste null → lien masqué.
  const { data: adminMe } = useApi<{ admin: { role: string } }>('/api/admin/me');
  const boutiqueName = boutique?.organization.name ?? 'Sahilley';
  const logoUrl = boutique?.settings?.logoUrl ?? null;
  const roleLabel = boutique ? t(ROLE_LABEL_KEY[boutique.role] ?? 'role.vendeur') : '';
  // Manager (ADMIN) / Patron (OWNER) voient les écrans de pilotage ; le Vendeur non.
  const canManage = boutique?.role === 'OWNER' || boutique?.role === 'ADMIN';
  const visibleSections = navSections
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.managerOnly || canManage) }))
    .filter((s) => s.items.length > 0);

  async function handleLogout() {
    const ok = await confirm({
      title: t('logout.confirmTitle'),
      message: t('logout.confirmMsg'),
      confirmLabel: t('nav.logout'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
      icon: 'log-out',
    });
    if (!ok) return;
    onNavigate();
    await logout();
    router.replace('/connexion');
  }

  return (
    <div className="bg-sidebar flex h-full w-full flex-col">
      {/* Logo boutique (uploadé dans Paramètres) — repli icône générique sinon */}
      <div className="border-sidebar-muted border-b px-6 py-4">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2">
          <div className="bg-primary flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon i="store" size={18} className="text-primary-foreground" />
            )}
          </div>
          <span className="font-headings text-sidebar-foreground truncate text-lg font-bold tracking-tight">
            {boutiqueName}
          </span>
        </Link>
      </div>

      {/* Statut connexion — reflète l'état réseau réel (consultation hors-ligne) */}
      <div className="bg-muted mx-4 mt-3 mb-1 flex items-center gap-2 rounded-md px-3 py-1.5">
        <div className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-warning'}`} />
        <span className="text-muted-foreground font-body text-xs font-semibold">
          {online ? t('online.connected') : t('offline.short')}
        </span>
      </div>

      {/* Nav (sections) — compacte, sans défilement en usage normal */}
      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pt-2 pb-2">
        {visibleSections.map((section, si) => (
          <div key={section.label ?? `s-${si}`} className="flex flex-col gap-0.5">
            {section.label && (
              <span className="text-sidebar-foreground/40 font-body px-3 pt-1 pb-0.5 text-[10px] font-bold tracking-wider uppercase">
                {t(section.label)}
              </span>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                icon={item.icon}
                label={t(item.key)}
                href={item.href}
                active={isActive(pathname, item.href)}
                onNavigate={onNavigate}
                badge={
                  item.href === '/synchronisation' ? (
                    <SyncCountBadge pendingCount={pendingCount} conflicts={conflicts} />
                  ) : undefined
                }
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Apparence & langue — mobile uniquement (le desktop les a dans la TopBar).
          Posés sur une carte bg-surface pour un contraste correct sur la sidebar. */}
      <div className="px-3 pb-1 lg:hidden">
        <div className="bg-surface flex flex-col gap-2 rounded-lg p-3">
          <span className="text-muted-foreground font-body text-[10px] font-bold tracking-wider uppercase">
            {t('nav.appearance')}
          </span>
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher compact />
            <ThemeToggle compact />
          </div>
        </div>
      </div>

      {/* Réglages + admin + user */}
      <div className="border-sidebar-muted border-t px-3 pt-2 pb-3">
        <NavLink
          icon="settings"
          label={t('nav.parametres')}
          href="/parametres"
          active={isActive(pathname, '/parametres')}
          onNavigate={onNavigate}
        />
        {adminMe && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className="font-body text-sidebar-foreground flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium opacity-60 transition-colors hover:opacity-100"
          >
            <Icon i="shield-check" size={16} />
            {t('nav.admin')}
          </Link>
        )}
        <div className="mt-1 flex items-center gap-2.5 px-2 pt-2">
          <div className="bg-sidebar-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
            <Icon i="user" size={14} className="text-sidebar-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sidebar-foreground font-body truncate text-sm font-semibold">
              {boutiqueName}
            </div>
            <div className="text-sidebar-foreground font-body text-xs opacity-50">{roleLabel}</div>
          </div>
          {/* Déconnexion : petit bouton-icône (confirmation avant de quitter) */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label={t('nav.logout')}
            title={t('nav.logout')}
            className="text-sidebar-foreground hover:bg-sidebar-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-60 transition-colors hover:opacity-100 disabled:opacity-40"
          >
            <Icon
              i={loggingOut ? 'loader-2' : 'log-out'}
              size={16}
              className={loggingOut ? 'animate-spin' : ''}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
