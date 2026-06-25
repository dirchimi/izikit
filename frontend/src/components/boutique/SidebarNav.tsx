'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useApi } from '@/lib/useApi';

interface NavItem {
  icon: string;
  key: string;
  href: string;
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

const navItems: NavItem[] = [
  { icon: 'layout-dashboard', key: 'nav.dashboard', href: '/dashboard' },
  { icon: 'shopping-cart', key: 'nav.vendre', href: '/vendre' },
  { icon: 'list', key: 'nav.ventes', href: '/ventes' },
  { icon: 'package', key: 'nav.stock', href: '/stock' },
  { icon: 'users', key: 'nav.creances', href: '/creances' },
  { icon: 'wallet', key: 'nav.depenses', href: '/depenses' },
  { icon: 'file-text', key: 'nav.documents', href: '/documents' },
  { icon: 'bar-chart-2', key: 'nav.rapports', href: '/rapports' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SidebarNav({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();
  const confirm = useConfirm();
  // Charge (et provisionne au 1er accès) la boutique courante.
  const { data: boutique } = useApi<BoutiqueCurrent>('/api/org/current');
  // Sonde admin : 403 pour les non-admins → `data` reste null → lien masqué
  // (mis en cache une fois par session par useApi).
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
      <div className="border-sidebar-muted border-b px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-md">
            <Icon i="store" size={18} className="text-primary-foreground" />
          </div>
          <span className="font-headings text-sidebar-foreground text-lg font-bold tracking-tight">
            Sahilley
          </span>
        </div>
      </div>

      {/* Statut connexion — online-only en v1 (le hors-ligne viendra plus tard) */}
      <div className="bg-muted mx-4 mt-4 mb-2 flex items-center gap-2 rounded-md px-3 py-2">
        <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="text-muted-foreground font-body text-xs font-semibold">
          {t('online.connected')}
        </span>
      </div>

      {/* Nav */}
      <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`font-body flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-sidebar-active text-primary-foreground'
                  : 'text-sidebar-foreground opacity-60 hover:opacity-100'
              }`}
            >
              <Icon i={item.icon} size={16} />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      {/* Settings + user */}
      <div className="border-sidebar-muted border-t px-3 pt-3 pb-4">
        <Link
          href="/parametres"
          onClick={onNavigate}
          aria-current={isActive(pathname, '/parametres') ? 'page' : undefined}
          className={`font-body flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(pathname, '/parametres')
              ? 'bg-sidebar-active text-primary-foreground'
              : 'text-sidebar-foreground opacity-60 hover:opacity-100'
          }`}
        >
          <Icon i="settings" size={16} />
          {t('nav.parametres')}
        </Link>
        {adminMe && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className="font-body text-sidebar-foreground flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium opacity-60 transition-colors hover:opacity-100"
          >
            <Icon i="shield" size={16} />
            {t('nav.admin')}
          </Link>
        )}
        <div className="mt-1 flex items-center gap-3 px-3 pt-3">
          <div className="bg-sidebar-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
            <Icon i="user" size={14} className="text-sidebar-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sidebar-foreground font-body truncate text-sm font-semibold">
              {boutiqueName}
            </div>
            <div className="text-sidebar-foreground font-body text-xs opacity-50">{roleLabel}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="font-body text-sidebar-foreground mt-2 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium opacity-60 transition-colors hover:opacity-100 disabled:opacity-40"
        >
          <Icon i="log-out" size={16} />
          {loggingOut ? '…' : t('nav.logout')}
        </button>
      </div>
    </div>
  );
}
