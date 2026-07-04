'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';

/**
 * LOT 3 — barre de navigation basse, affichée uniquement sous `lg` (mobile /
 * tablette). Regroupe les destinations principales ; « Plus » ouvre le tiroir
 * complet (créances, dépenses, documents, rapports, paramètres…). Cachée quand
 * le tiroir est ouvert (le tiroir a son propre overlay).
 */
const items = [
  { icon: 'layout-dashboard', key: 'nav.dashboard', href: '/dashboard', managerOnly: true },
  { icon: 'shopping-cart', key: 'nav.vendre', href: '/vendre' },
  { icon: 'receipt-text', key: 'nav.ventes', href: '/ventes' },
  { icon: 'package', key: 'nav.stock', href: '/stock' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const t = useT();
  // Le Tableau de bord est réservé Manager/Patron → masqué pour le Vendeur.
  const { data: boutique } = useApi<{ role: string }>('/api/org/current');
  const canManage = boutique?.role === 'OWNER' || boutique?.role === 'ADMIN';
  const visibleItems = items.filter((it) => !it.managerOnly || canManage);

  return (
    <nav
      className="bg-sidebar border-sidebar-muted fixed inset-x-0 bottom-0 z-[90] flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={t('nav.primary')}
    >
      {visibleItems.map((it) => {
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition-opacity ${
              active
                ? 'text-primary opacity-100'
                : 'text-sidebar-foreground opacity-60 hover:opacity-100'
            }`}
          >
            <Icon i={it.icon} size={20} />
            <span className="font-body text-[10px] font-medium">{t(it.key)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="text-sidebar-foreground flex flex-1 flex-col items-center gap-0.5 py-2 opacity-60 transition-opacity hover:opacity-100"
      >
        <Icon i="menu" size={20} />
        <span className="font-body text-[10px] font-medium">{t('nav.more')}</span>
      </button>
    </nav>
  );
}
