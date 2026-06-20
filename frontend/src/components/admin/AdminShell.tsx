'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import Icon from '@/components/ui/Icon';
import { AdminProvider, type AdminInfo } from './AdminContext';

interface AdminMeResponse {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
  can: string[];
}

const NAV = [
  { href: '/admin/users', label: 'Utilisateurs', icon: 'users' },
  { href: '/admin/orders', label: 'Commandes', icon: 'shopping-bag' },
  { href: '/admin/withdrawals', label: 'Retraits', icon: 'banknote' },
  { href: '/admin/audit-log', label: "Journal d'audit", icon: 'scroll-text' },
];

/**
 * Chrome + garde du back-office admin. Le rôle admin n'est pas dans le JWT :
 * on appelle GET /api/admin/me. 401 (pas de session) → /connexion ;
 * 403 (connecté mais pas admin) → /dashboard. Les routes API restent le
 * véritable garde-fou (chaque appel refait requireAdmin côté serveur).
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AdminMeResponse>('/api/admin/me');
        if (!cancelled) setAdmin({ ...res.admin, can: res.can });
      } catch (err) {
        if (!cancelled) {
          const status = err instanceof ApiError ? err.status : 0;
          router.replace(status === 401 ? '/connexion' : '/dashboard');
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked || !admin) {
    return (
      <main className="bg-background text-muted-foreground font-body flex min-h-screen items-center justify-center text-sm">
        Vérification de l’accès…
      </main>
    );
  }

  return (
    <AdminProvider value={admin}>
      <div className="bg-background flex min-h-screen">
        <aside className="bg-sidebar border-sidebar-muted w-56 shrink-0 border-e p-4">
          <div className="mb-6 flex items-center gap-2">
            <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-md">
              <Icon i="shield" size={16} className="text-primary-foreground" />
            </div>
            <span className="font-headings text-sidebar-foreground text-lg font-bold">Admin</span>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`font-body flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-sidebar-active text-primary-foreground'
                      : 'text-sidebar-foreground opacity-70 hover:opacity-100'
                  }`}
                >
                  <Icon i={item.icon} size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 flex flex-col gap-1">
            <Link
              href="/dashboard"
              className="font-body text-sidebar-foreground flex items-center gap-2 rounded-md px-3 py-2 text-xs opacity-60 hover:opacity-100"
            >
              <Icon i="arrow-left" size={13} /> Retour à la boutique
            </Link>
            <p className="text-sidebar-foreground font-body mt-2 px-3 text-xs leading-relaxed opacity-50">
              {admin.email}
              <br />
              {admin.role}
            </p>
          </div>
        </aside>
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </AdminProvider>
  );
}
