'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { useT } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useApi } from '@/lib/useApi';

interface NavItem {
  icon: string;
  key: string;
  href: string;
}
interface NavSection {
  label?: string;
  items: NavItem[];
}

interface BoutiqueCurrent {
  organization: { id: string; slug: string; name: string };
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
  { items: [{ icon: 'layout-dashboard', key: 'nav.dashboard', href: '/dashboard' }] },
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
    ],
  },
  {
    label: 'nav.section.analyse',
    items: [
      { icon: 'file-text', key: 'nav.documents', href: '/documents' },
      { icon: 'chart-no-axes-combined', key: 'nav.rapports', href: '/rapports' },
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
}: {
  icon: string;
  label: string;
  href: string;
  active: boolean;
  onNavigate: () => void;
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
      {label}
    </Link>
  );
}

export default function SidebarNav({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();
  const confirm = useConfirm();
  // Charge (et provisionne au 1er accès) la boutique courante.
  const { data: boutique } = useApi<BoutiqueCurrent>('/api/org/current');
  // Sonde admin : 403 pour les non-admins → `data` reste null → lien masqué.
  const { data: adminMe } = useApi<{ admin: { role: string } }>('/api/admin/me');
  const boutiqueName = boutique?.organization.name ?? 'Sahilley';
  const roleLabel = boutique ? t(ROLE_LABEL_KEY[boutique.role] ?? 'role.vendeur') : '';

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
      {/* Logo */}
      <div className="border-sidebar-muted border-b px-6 py-4">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2">
          <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-md">
            <Icon i="store" size={18} className="text-primary-foreground" />
          </div>
          <span className="font-headings text-sidebar-foreground text-lg font-bold tracking-tight">
            Sahilley
          </span>
        </Link>
      </div>

      {/* Statut connexion — online-only en v1 (le hors-ligne viendra plus tard) */}
      <div className="bg-muted mx-4 mt-3 mb-1 flex items-center gap-2 rounded-md px-3 py-1.5">
        <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="text-muted-foreground font-body text-xs font-semibold">
          {t('online.connected')}
        </span>
      </div>

      {/* Nav (sections) — compacte, sans défilement en usage normal */}
      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pt-2 pb-2">
        {navSections.map((section, si) => (
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
