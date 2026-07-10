'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AdminHeader, Badge, LoadMore, SearchBar, StatCard } from '@/components/admin/ui';
import { formatFCFA } from '@/lib/boutique/format';

interface AdminBoutique {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
  ownerEmail: string;
  phone: string | null;
  city: string | null;
  sellers: number;
  plan: 'SOLO' | 'BOUTIQUE' | null;
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED';
  daysLeft: number;
  activeUntil: string | null;
  collected: number;
  salesTotal: number;
  createdAt: string;
}

interface Summary {
  boutiques: number;
  active: number;
  trial: number;
  expired: number;
  collected: number;
  sellers: number;
}

interface BoutiquesResponse {
  items: AdminBoutique[];
  nextCursor: string | null;
  summary: Summary | null;
}

const STATUS_TONE: Record<AdminBoutique['status'], string> = {
  ACTIVE: 'green',
  TRIAL: 'amber',
  EXPIRED: 'red',
};
const STATUS_LABEL: Record<AdminBoutique['status'], string> = {
  ACTIVE: 'Abonné',
  TRIAL: 'Essai',
  EXPIRED: 'Expiré',
};
const PLAN_LABEL: Record<string, string> = { SOLO: 'Solo', BOUTIQUE: 'Boutique' };

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Toutes' },
  { value: 'ACTIVE', label: 'Abonnées' },
  { value: 'TRIAL', label: 'En essai' },
  { value: 'EXPIRED', label: 'Expirées' },
];

// Sous-libellé de statut : « 12 j restants » (essai/abo) ou date d'expiration.
function statusSub(b: AdminBoutique): string {
  if (b.status === 'EXPIRED') {
    return b.activeUntil
      ? `depuis le ${new Date(b.activeUntil).toLocaleDateString('fr-FR')}`
      : 'jamais activée';
  }
  return b.daysLeft <= 0 ? "aujourd'hui" : `${b.daysLeft} j`;
}

export default function AdminBoutiquesPage() {
  const [items, setItems] = useState<AdminBoutique[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const cursorRef = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean, params: { q?: string; status?: string }) => {
    setLoading(true);
    setError(null);
    if (reset) cursorRef.current = null;
    try {
      const sp = new URLSearchParams();
      if (params.q) sp.set('q', params.q);
      if (params.status) sp.set('status', params.status);
      sp.set('limit', '30');
      if (cursorRef.current) sp.set('cursor', cursorRef.current);
      const res = await api<BoutiquesResponse>(`/api/admin/boutiques?${sp.toString()}`);
      cursorRef.current = res.nextCursor;
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setHasMore(!!res.nextCursor);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true, {});
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader
        title="Boutiques"
        subtitle="Toutes les boutiques, leur patron et leur abonnement"
      >
        <SearchBar
          value={q}
          onChange={setQ}
          onSubmit={() => void load(true, { q, status })}
          placeholder="Boutique, patron, ville, téléphone…"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            void load(true, { q, status: e.target.value });
          }}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm"
        >
          {STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </AdminHeader>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Boutiques"
            value={String(summary.boutiques)}
            sub={`${summary.active} abonnées · ${summary.trial} essai · ${summary.expired} expirées`}
            icon="store"
          />
          <StatCard
            label="Total encaissé"
            value={`${formatFCFA(summary.collected)} F`}
            sub="abonnements confirmés"
            icon="wallet"
            accent
          />
          <StatCard
            label="Vendeurs"
            value={String(summary.sellers)}
            sub="tous comptes hors patrons"
            icon="users"
          />
          <StatCard
            label="Abonnées actives"
            value={String(summary.active)}
            sub={`sur ${summary.boutiques} boutiques`}
            icon="badge-check"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      <div className="bg-surface border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-border text-muted-foreground font-body border-b text-left text-xs font-semibold uppercase">
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Patron</th>
              <th className="px-4 py-3">Téléphone</th>
              <th className="px-4 py-3">Ville</th>
              <th className="px-4 py-3 text-center">Vendeurs</th>
              <th className="px-4 py-3">Abonnement</th>
              <th className="px-4 py-3 text-end">Encaissé</th>
              <th className="px-4 py-3 text-end">Chiffre d’affaires</th>
              <th className="px-4 py-3">Inscrite le</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-border hover:bg-muted/40 border-b last:border-b-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/boutiques/${b.id}`}
                    className="text-foreground hover:text-primary font-body font-semibold hover:underline"
                  >
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="text-foreground font-body">{b.ownerName ?? '—'}</div>
                  <div className="text-muted-foreground font-body text-xs">{b.ownerEmail}</div>
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {b.phone ? (
                    <a href={`tel:${b.phone}`} className="hover:text-foreground">
                      {b.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">{b.city ?? '—'}</td>
                <td className="text-foreground font-body px-4 py-3 text-center">{b.sellers}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                    {b.plan ? (
                      <span className="text-muted-foreground font-body text-xs">
                        {PLAN_LABEL[b.plan] ?? b.plan}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground font-body mt-0.5 text-xs">
                    {statusSub(b)}
                  </div>
                </td>
                <td className="text-foreground font-body px-4 py-3 text-end font-semibold">
                  {formatFCFA(b.collected)} F
                </td>
                <td className="text-muted-foreground font-body px-4 py-3 text-end">
                  {formatFCFA(b.salesTotal)} F
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">
                  {new Date(b.createdAt).toLocaleDateString('fr-FR')}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="text-muted-foreground font-body px-4 py-8 text-center">
                  Aucune boutique.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LoadMore show={hasMore} loading={loading} onClick={() => void load(false, { q, status })} />
    </div>
  );
}
