'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useApi } from '@/lib/useApi';
import PremiumCard from './PremiumCard';

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
  settings: { logoUrl: string | null };
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

const ROLE_LABEL_KEY: Record<string, string> = {
  OWNER: 'role.patron',
  ADMIN: 'role.gerant',
  MEMBER: 'role.vendeur',
};

// Navigation groupée en sections pour un rendu pro.
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
  item,
  active,
  onNavigate,
  t,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
  t: (k: string) => string;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group font-body relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
        active
          ? 'bg-sidebar-active text-primary-foreground shadow-sm'
          : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-muted/60'
      }`}
    >
      <Icon i={item.icon} size={17} />
      {t(item.key)}
    </Link>
  );
}

export default function SidebarNav({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();
  const confirm = useConfirm();
  const { data: boutique } = useApi<BoutiqueCurrent>('/api/org/current');
  const { data: adminMe } = useApi<{ admin: { role: string } }>('/api/admin/me');
  const boutiqueName = boutique?.organization.name ?? 'Sahilley';
  const roleLabel = boutique ? t(ROLE_LABEL_KEY[boutique.role] ?? 'role.vendeur') : '';
  const logoUrl = boutique?.settings.logoUrl ?? null;

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
      <div className="px-5 py-5">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5">
          <div className="bg-primary flex h-9 w-9 items-center justify-center rounded-xl shadow-sm">
            <Icon i="store" size={19} className="text-primary-foreground" />
          </div>
          <span className="font-headings text-sidebar-foreground text-lg font-bold tracking-tight">
            Sahilley
          </span>
        </Link>
      </div>

      {/* Statut connexion */}
      <div className="bg-sidebar-muted/50 mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-sidebar-foreground/70 font-body text-xs font-semibold">
          {t('online.connected')}
        </span>
      </div>

      {/* Nav (sections) */}
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-2">
        {navSections.map((section, si) => (
          <div key={section.label ?? `s-${si}`} className="flex flex-col gap-0.5">
            {section.label && (
              <span className="text-sidebar-foreground/40 font-body px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider uppercase">
                {t(section.label)}
              </span>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                onNavigate={onNavigate}
                t={t}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Premium teaser */}
      <div className="px-3 pb-2">
        <PremiumCard />
      </div>

      {/* Réglages + admin + user */}
      <div className="border-sidebar-muted/60 flex flex-col gap-0.5 border-t px-3 pt-3 pb-3">
        <NavLink
          item={{ icon: 'settings', key: 'nav.parametres', href: '/parametres' }}
          active={isActive(pathname, '/parametres')}
          onNavigate={onNavigate}
          t={t}
        />
        {adminMe && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className="group font-body text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-muted/60 flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all"
          >
            <Icon i="shield-check" size={17} />
            {t('nav.admin')}
          </Link>
        )}

        <div className="mt-2 flex items-center gap-3 rounded-lg px-1 py-1">
          <div className="bg-sidebar-muted ring-sidebar-active/30 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1">
            {logoUrl ? (
              // next/image non utilisable : URLs Cloudinary distantes, petit avatar.
              <img src={logoUrl} alt={boutiqueName} className="h-full w-full object-cover" />
            ) : (
              <Icon i="user" size={15} className="text-sidebar-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sidebar-foreground font-body truncate text-sm font-semibold">
              {boutiqueName}
            </div>
            <div className="text-sidebar-foreground/50 font-body text-xs">{roleLabel}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label={t('nav.logout')}
            title={t('nav.logout')}
            className="text-sidebar-foreground/60 hover:bg-sidebar-muted hover:text-sidebar-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
          >
            <Icon i="log-out" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
