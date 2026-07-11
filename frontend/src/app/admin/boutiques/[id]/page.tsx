'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/components/admin/AdminContext';
import { formatFCFA } from '@/lib/boutique/format';
import { AdminHeader, Badge, Panel, StatCard } from '@/components/admin/ui';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';

interface BoutiqueDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  internal: boolean;
  owner: { id: string; name: string | null; email: string };
  settings: {
    phone: string | null;
    city: string | null;
    address: string | null;
    country: string;
    currency: string;
    businessType: string | null;
  } | null;
  subscription: {
    plan: string | null;
    status: 'ACTIVE' | 'TRIAL' | 'EXPIRED';
    daysLeft: number;
    activeUntil: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  stats: {
    collected: number;
    salesTotal: number;
    salesCount: number;
    receivablesOpen: number;
    sellers: number;
    products: number;
  };
  members: Array<{
    id: string;
    role: string;
    userId: string;
    userName: string | null;
    userEmail: string;
    joinedAt: string;
  }>;
  payments: Array<{
    id: string;
    plan: string;
    amount: number;
    method: string;
    months: number;
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
    periodEnd: string | null;
    note: string | null;
    createdAt: string;
    confirmedAt: string | null;
  }>;
  recentSales: Array<{
    id: string;
    number: string;
    total: number;
    method: string;
    status: 'ACTIVE' | 'CANCELLED';
    createdAt: string;
  }>;
}

const fcfa = (n: number) => `${formatFCFA(n)} FCFA`;

const SUB_TONE: Record<string, string> = { ACTIVE: 'green', TRIAL: 'amber', EXPIRED: 'red' };
const SUB_LABEL: Record<string, string> = { ACTIVE: 'Abonné', TRIAL: 'Essai', EXPIRED: 'Expiré' };
const PLAN_LABEL: Record<string, string> = {
  PREMIUM: 'Premium',
  SOLO: 'Solo',
  BOUTIQUE: 'Boutique',
};
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE: 'Mobile money',
  CREDIT: 'Crédit',
  MIXED: 'Mixte',
};
const ROLE_LABEL: Record<string, string> = { OWNER: 'Patron', ADMIN: 'Gérant', MEMBER: 'Vendeur' };
const ROLE_TONE: Record<string, string> = { OWNER: 'purple', ADMIN: 'blue', MEMBER: 'neutral' };
const PAY_TONE: Record<string, string> = { CONFIRMED: 'green', PENDING: 'amber', REJECTED: 'red' };
const PAY_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmé',
  PENDING: 'En attente',
  REJECTED: 'Refusé',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

// Ligne clé/valeur de la fiche d'identité.
function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon i={icon} size={16} className="text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-muted-foreground font-body text-xs">{label}</p>
        <div className="font-body text-foreground text-sm">{children}</div>
      </div>
    </div>
  );
}

export default function AdminBoutiqueDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();
  const admin = useAdmin();
  const { data, loading, error, refresh } = useApi<{ boutique: BoutiqueDetail }>(
    `/api/admin/boutiques/${id}`,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleInternal(next: boolean) {
    setBusy(true);
    try {
      await api(`/api/admin/boutiques/${id}`, { method: 'PATCH', body: { internal: next } });
      toast(next ? 'Boutique marquée comme interne.' : 'Marquage interne retiré.', 'success');
      setConfirming(false);
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Échec.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <AdminHeader title="Boutique" subtitle="Fiche détail" />
        <p role="alert" className="text-danger font-body text-sm">
          {error === 'Boutique introuvable' ? 'Cette boutique est introuvable.' : error}
        </p>
        <Link href="/admin/boutiques" className="text-primary font-body mt-3 inline-block text-sm">
          ← Retour aux boutiques
        </Link>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AdminHeader title="Boutique" subtitle="Fiche détail" />
        <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
          {loading ? 'Chargement…' : 'Aucune donnée.'}
        </div>
      </>
    );
  }

  const b = data.boutique;
  const sub = b.subscription;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/boutiques"
          className="text-muted-foreground font-body mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <Icon i="arrow-left" size={14} /> Boutiques
        </Link>
        <AdminHeader title={b.name} subtitle={`Inscrite le ${fmtDate(b.createdAt)}`}>
          {b.internal ? <Badge tone="purple">Interne</Badge> : null}
          <Badge tone={SUB_TONE[sub.status] ?? 'neutral'}>
            {SUB_LABEL[sub.status] ?? sub.status}
          </Badge>
          {sub.plan ? <Badge tone="neutral">{PLAN_LABEL[sub.plan] ?? sub.plan}</Badge> : null}
        </AdminHeader>
      </div>

      {/* Identité + statut d'abonnement */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Identité">
          <div className="divide-border divide-y">
            <InfoRow icon="user" label="Patron">
              {b.owner.name ?? '—'}
              <span className="text-muted-foreground"> · {b.owner.email}</span>
            </InfoRow>
            <InfoRow icon="phone" label="Téléphone">
              {b.settings?.phone ? (
                <a href={`tel:${b.settings.phone}`} className="hover:underline">
                  {b.settings.phone}
                </a>
              ) : (
                '—'
              )}
            </InfoRow>
            <InfoRow icon="map-pin" label="Ville / adresse">
              {b.settings?.city ?? '—'}
              {b.settings?.address ? (
                <span className="text-muted-foreground"> · {b.settings.address}</span>
              ) : null}
            </InfoRow>
            <InfoRow icon="tag" label="Type de commerce">
              {b.settings?.businessType ?? '—'}
            </InfoRow>
          </div>
        </Panel>

        <Panel title="Abonnement">
          <div className="divide-border divide-y">
            <InfoRow icon="badge-check" label="Statut">
              <Badge tone={SUB_TONE[sub.status] ?? 'neutral'}>
                {SUB_LABEL[sub.status] ?? sub.status}
              </Badge>
              {sub.status !== 'EXPIRED' ? (
                <span className="text-muted-foreground"> · {sub.daysLeft} j restants</span>
              ) : null}
            </InfoRow>
            <InfoRow icon="calendar" label="Accès valable jusqu'au">
              {sub.activeUntil ? fmtDate(sub.activeUntil) : '—'}
            </InfoRow>
            <InfoRow icon="gift" label="Fin d'essai">
              {sub.trialEndsAt ? fmtDate(sub.trialEndsAt) : '—'}
            </InfoRow>
            <InfoRow icon="credit-card" label="Fin d'abonnement payé">
              {sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : '—'}
            </InfoRow>
          </div>
        </Panel>
      </div>

      {/* Compte interne / offert — SUPERADMIN uniquement */}
      {admin.role === 'SUPERADMIN' && (
        <div className="bg-surface border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-body text-foreground text-sm font-semibold">
              Compte interne / offert
            </p>
            <p className="text-muted-foreground font-body text-xs">
              {b.internal
                ? 'Accès gratuit permanent · exclue de toutes les statistiques.'
                : 'Test, associé ou compte offert : accès gratuit, exclue des stats. Ses paiements d’abonnement seront supprimés.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (b.internal ? void toggleInternal(false) : setConfirming(true))}
            disabled={busy}
            className={`font-body shrink-0 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              b.internal
                ? 'border-border bg-surface text-foreground border'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {b.internal ? 'Retirer le marquage' : 'Marquer comme interne'}
          </button>
        </div>
      )}

      {/* Agrégats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Encaissé" value={fcfa(b.stats.collected)} icon="wallet" accent />
        <StatCard label="Chiffre d'affaires" value={fcfa(b.stats.salesTotal)} icon="receipt" />
        <StatCard label="Ventes" value={String(b.stats.salesCount)} icon="shopping-bag" />
        <StatCard
          label="Créances ouvertes"
          value={fcfa(b.stats.receivablesOpen)}
          icon="notebook-pen"
        />
        <StatCard label="Vendeurs" value={String(b.stats.sellers)} icon="users" />
        <StatCard label="Produits" value={String(b.stats.products)} icon="package" />
      </div>

      {/* Équipe */}
      <Panel title={`Équipe (${b.members.length})`}>
        {b.members.length === 0 ? (
          <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
            Aucun membre.
          </p>
        ) : (
          b.members.map((m) => (
            <div
              key={m.id}
              className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="font-body text-foreground truncate text-sm font-medium">
                  {m.userName ?? '—'}
                </p>
                <p className="text-muted-foreground font-body text-xs">{m.userEmail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={ROLE_TONE[m.role] ?? 'neutral'}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                <span className="text-muted-foreground font-body text-xs">
                  {fmtDate(m.joinedAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </Panel>

      {/* Historique paiements + dernières ventes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Historique des abonnements">
          {b.payments.length === 0 ? (
            <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
              Aucun paiement.
            </p>
          ) : (
            b.payments.map((p) => (
              <div
                key={p.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground text-sm font-medium">
                    {PLAN_LABEL[p.plan] ?? p.plan} · {p.months} mois
                  </p>
                  <p className="text-muted-foreground font-body text-xs">
                    {METHOD_LABEL[p.method] ?? p.method} · {fmtDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-headings text-foreground text-sm font-bold">
                    {fcfa(p.amount)}
                  </span>
                  <Badge tone={PAY_TONE[p.status] ?? 'neutral'}>
                    {PAY_LABEL[p.status] ?? p.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Dernières ventes">
          {b.recentSales.length === 0 ? (
            <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
              Aucune vente.
            </p>
          ) : (
            b.recentSales.map((v) => (
              <div
                key={v.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground text-sm font-medium">
                    N° {v.number}
                    {v.status === 'CANCELLED' ? (
                      <span className="text-danger"> · annulée</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground font-body text-xs">
                    {METHOD_LABEL[v.method] ?? v.method} · {fmtDate(v.createdAt)}
                  </p>
                </div>
                <span
                  className={`font-headings shrink-0 text-sm font-bold ${
                    v.status === 'CANCELLED'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {fcfa(v.total)}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* Confirmation du marquage interne (destructif : supprime les paiements) */}
      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title="Marquer comme interne"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground font-body text-sm">
            <span className="text-foreground font-semibold">{b.name}</span> deviendra un compte
            interne : accès gratuit permanent, exclue de toutes les statistiques, et ses paiements
            d’abonnement seront <span className="text-danger font-semibold">supprimés</span>. À
            réserver aux comptes test, associés ou offerts.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="border-border bg-surface text-foreground font-body rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void toggleInternal(true)}
              disabled={busy}
              className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Traitement…' : 'Marquer comme interne'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
