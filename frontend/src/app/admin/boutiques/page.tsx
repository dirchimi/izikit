'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AdminHeader, Badge, LoadMore, SearchBar, StatCard } from '@/components/admin/ui';
import { formatFCFA } from '@/lib/boutique/format';
import { waLink } from '@/lib/wa';
import { toCsv, downloadCsv } from '@/lib/csv';
import Icon from '@/components/ui/Icon';

interface AdminBoutique {
  id: string;
  name: string;
  slug: string;
  internal: boolean;
  ownerName: string | null;
  ownerEmail: string;
  phone: string | null;
  city: string | null;
  sellers: number;
  plan: string | null;
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
  offered: number;
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
const PLAN_LABEL: Record<string, string> = {
  PREMIUM: 'Premium',
  SOLO: 'Solo',
  BOUTIQUE: 'Boutique',
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Toutes' },
  { value: 'ACTIVE', label: 'Abonnées' },
  { value: 'TRIAL', label: 'En essai' },
  { value: 'EXPIRED', label: 'Expirées' },
];

// Badge d'abonnement AFFICHÉ : un compte interne (test/associé) est marqué
// « Interne » ; une boutique active SANS aucun paiement confirmé (jours offerts
// via grant-access) est marquée « Offert » — pas « Abonné », qui laisserait
// croire qu'elle paie.
function displayBadge(b: AdminBoutique): { label: string; tone: string } {
  if (b.internal) return { label: 'Interne', tone: 'purple' };
  if (b.status === 'ACTIVE' && b.collected === 0) return { label: 'Offert', tone: 'blue' };
  return { label: STATUS_LABEL[b.status], tone: STATUS_TONE[b.status] };
}

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

  // Export CSV des boutiques chargées (ouvrable dans Excel). N'exporte que les
  // lignes déjà affichées — cliquer « Charger plus » avant d'exporter en entier.
  const exportCsv = useCallback(() => {
    const headers = [
      'Boutique',
      'Patron',
      'Email',
      'Téléphone',
      'Ville',
      'Vendeurs',
      'Statut',
      'Formule',
      'Actif jusqu’au',
      'Encaissé (FCFA)',
      'Chiffre d’affaires (FCFA)',
      'Inscrite le',
    ];
    const rows = items.map((b) => [
      b.name,
      b.ownerName ?? '',
      b.ownerEmail,
      b.phone ?? '',
      b.city ?? '',
      b.sellers,
      displayBadge(b).label,
      b.plan ? (PLAN_LABEL[b.plan] ?? b.plan) : '',
      b.activeUntil ? new Date(b.activeUntil).toLocaleDateString('fr-FR') : '',
      b.collected,
      b.salesTotal,
      new Date(b.createdAt).toLocaleDateString('fr-FR'),
    ]);
    downloadCsv(
      `boutiques-sahilley-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(headers, rows),
    );
  }, [items]);

  return (
    <div className="stagger flex flex-col gap-5">
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
        <button
          type="button"
          onClick={exportCsv}
          disabled={items.length === 0}
          title="Exporter les boutiques affichées en CSV"
          className="border-border bg-surface text-foreground font-body hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
        >
          <Icon i="download" size={15} /> Exporter
        </button>
      </AdminHeader>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Boutiques"
            value={String(summary.boutiques)}
            sub={`${summary.active} abonnées${summary.offered > 0 ? ` · ${summary.offered} offertes` : ''} · ${summary.trial} essai · ${summary.expired} expirées`}
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
            label="Abonnées payantes"
            value={String(summary.active)}
            sub={`sur ${summary.boutiques} boutiques${summary.offered > 0 ? ` · ${summary.offered} offerte(s)` : ''}`}
            icon="badge-check"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger font-body text-sm">
          {error}
        </p>
      )}

      {/* Cartes (mobile) */}
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((b) => (
          <div
            key={b.id}
            className="bg-surface border-border hover-lift rounded-xl border p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/admin/boutiques/${b.id}`}
                  className="text-foreground hover:text-primary font-body font-semibold hover:underline"
                >
                  {b.name}
                </Link>
                <p className="text-muted-foreground font-body truncate text-xs">
                  {b.ownerName ?? b.ownerEmail}
                </p>
              </div>
              <Badge tone={displayBadge(b).tone}>{displayBadge(b).label}</Badge>
            </div>
            <div className="text-muted-foreground font-body mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>{b.city ?? '—'}</span>
              <span>{b.sellers} vendeur(s)</span>
              <span>{statusSub(b)}</span>
            </div>
            <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
              <span className="font-body text-xs">
                <span className="text-muted-foreground">Encaissé </span>
                <span className="text-foreground font-semibold">{formatFCFA(b.collected)} F</span>
              </span>
              {b.phone && waLink(b.phone) ? (
                <a
                  href={waLink(b.phone)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-xs font-semibold"
                >
                  <Icon i="message-circle" size={14} /> WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div className="bg-surface border-border text-muted-foreground font-body rounded-xl border px-4 py-8 text-center text-sm shadow-sm">
            Aucune boutique.
          </div>
        )}
      </div>

      {/* Tableau (desktop) */}
      <div className="bg-surface border-border hidden overflow-x-auto rounded-xl border shadow-sm md:block">
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
                    <div className="flex items-center gap-2">
                      <a href={`tel:${b.phone}`} className="hover:text-foreground">
                        {b.phone}
                      </a>
                      {waLink(b.phone) && (
                        <a
                          href={waLink(b.phone)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Écrire sur WhatsApp"
                          className="text-primary inline-flex shrink-0 items-center"
                        >
                          <Icon i="message-circle" size={15} />
                        </a>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-muted-foreground font-body px-4 py-3">{b.city ?? '—'}</td>
                <td className="text-foreground font-body px-4 py-3 text-center">{b.sellers}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={displayBadge(b).tone}>{displayBadge(b).label}</Badge>
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
