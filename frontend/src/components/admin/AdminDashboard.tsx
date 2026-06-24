'use client';

import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';
import { AdminHeader, Badge, MiniBars, Panel, StatBar, StatCard } from './ui';

interface AdminStats {
  users: {
    total: number;
    verified: number;
    suspended: number;
    admins: number;
    newLast7: number;
    newToday: number;
    byRole: { USER: number; ADMIN: number; SUPERADMIN: number };
  };
  boutiques: { total: number };
  orders: { total: number; paid: number; pending: number; failed: number; revenuePaid: number };
  withdrawals: { pending: number; pendingAmount: number; completed: number; paidOut: number };
  sales: { volume: number; count: number };
  receivables: { openAmount: number; openCount: number };
  products: { total: number };
  ops: { outboxPending: number; emailPending: number };
  signups: Array<{ date: string; count: number }>;
  recentUsers: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  }>;
  recentActions: Array<{
    id: string;
    actorId: string;
    action: string;
    targetType: string | null;
    createdAt: string;
  }>;
}

const fcfa = (n: number) => `${formatFCFA(n)} FCFA`;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const ROLE_TONE: Record<string, string> = { SUPERADMIN: 'purple', ADMIN: 'blue', USER: 'neutral' };

const ACTION_LABEL: Record<string, string> = {
  'user.role_change': 'Changement de rôle',
  'user.status_change': 'Changement de statut',
  'withdrawal.cancel': 'Annulation retrait',
  BOOTSTRAP_SUPERADMIN: 'Promotion super-admin',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboard() {
  const { data, loading, error, refresh } = useApi<AdminStats>('/api/admin/stats');

  if (error) {
    return (
      <>
        <AdminHeader title="Tableau de bord" subtitle="Vue d'ensemble de la plateforme" />
        <p role="alert" className="text-danger font-body text-sm">
          Impossible de charger les statistiques. {error}
        </p>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AdminHeader title="Tableau de bord" subtitle="Vue d'ensemble de la plateforme" />
        <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
          {loading ? 'Chargement…' : 'Aucune donnée.'}
        </div>
      </>
    );
  }

  const s = data;
  const totalUsers = s.users.total;

  return (
    <div className="flex flex-col gap-5">
      <AdminHeader title="Tableau de bord" subtitle="Vue d'ensemble de la plateforme">
        <button
          type="button"
          onClick={() => void refresh()}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm font-semibold"
        >
          Actualiser
        </button>
      </AdminHeader>

      {/* Ligne 1 — KPIs principaux */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Utilisateurs"
          value={String(s.users.total)}
          sub={`+${s.users.newLast7} cette semaine · +${s.users.newToday} aujourd'hui`}
          icon="users"
        />
        <StatCard
          label="Boutiques"
          value={String(s.boutiques.total)}
          sub="comptes boutique"
          icon="store"
        />
        <StatCard
          label="Volume de ventes"
          value={fcfa(s.sales.volume)}
          sub={`${s.sales.count} vente(s) — toutes boutiques`}
          icon="trending-up"
          accent
        />
        <StatCard
          label="Retraits en attente"
          value={String(s.withdrawals.pending)}
          sub={`${fcfa(s.withdrawals.pendingAmount)} à traiter`}
          icon="banknote"
        />
      </div>

      {/* Ligne 2 — stats secondaires */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenus paiements"
          value={fcfa(s.orders.revenuePaid)}
          sub={`${s.orders.paid} commande(s) payée(s)`}
          icon="credit-card"
        />
        <StatCard
          label="Créances ouvertes"
          value={fcfa(s.receivables.openAmount)}
          sub={`${s.receivables.openCount} créance(s)`}
          icon="notebook-pen"
        />
        <StatCard
          label="Emails vérifiés"
          value={`${pct(s.users.verified, totalUsers)}%`}
          sub={`${s.users.verified}/${totalUsers} comptes`}
          icon="mail-check"
        />
        <StatCard
          label="Produits"
          value={String(s.products.total)}
          sub="au catalogue (toutes boutiques)"
          icon="package"
        />
      </div>

      {/* Ligne 3 — graphe inscriptions + répartitions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Inscriptions — 14 derniers jours">
            <div className="px-4 py-5">
              <MiniBars
                data={s.signups.map((d) => ({
                  label: d.date.slice(8, 10),
                  value: d.count,
                  hint: `${fmtDate(d.date)} : ${d.count} inscription(s)`,
                }))}
              />
            </div>
          </Panel>
        </div>

        <Panel title="Répartition">
          <div className="flex flex-col gap-4 px-4 py-5">
            <div className="flex flex-col gap-3">
              <span className="text-muted-foreground font-body text-xs font-semibold uppercase">
                Par rôle
              </span>
              <StatBar
                label="Utilisateurs"
                value={s.users.byRole.USER}
                total={totalUsers}
                tone="neutral"
              />
              <StatBar label="Admins" value={s.users.byRole.ADMIN} total={totalUsers} tone="blue" />
              <StatBar
                label="Super-admins"
                value={s.users.byRole.SUPERADMIN}
                total={totalUsers}
                tone="purple"
              />
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-muted-foreground font-body text-xs font-semibold uppercase">
                Par statut
              </span>
              <StatBar
                label="Actifs"
                value={totalUsers - s.users.suspended}
                total={totalUsers}
                tone="green"
              />
              <StatBar label="Suspendus" value={s.users.suspended} total={totalUsers} tone="red" />
            </div>
          </div>
        </Panel>
      </div>

      {/* Ligne 4 — listes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Derniers inscrits">
          {s.recentUsers.length === 0 ? (
            <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
              Aucun inscrit.
            </p>
          ) : (
            s.recentUsers.map((u) => (
              <div
                key={u.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground truncate text-sm font-medium">
                    {u.email}
                  </p>
                  <p className="text-muted-foreground font-body text-xs">{u.name ?? '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={ROLE_TONE[u.role] ?? 'neutral'}>{u.role}</Badge>
                  <span className="text-muted-foreground font-body text-xs">
                    {fmtDate(u.createdAt)}
                  </span>
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Dernières actions admin">
          {s.recentActions.length === 0 ? (
            <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
              Aucune action.
            </p>
          ) : (
            s.recentActions.map((a) => (
              <div
                key={a.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground truncate text-sm font-medium">
                    {ACTION_LABEL[a.action] ?? a.action}
                  </p>
                  <p className="text-muted-foreground font-body text-xs">
                    {a.targetType ?? '—'} · {a.actorId.slice(0, 8)}…
                  </p>
                </div>
                <span className="text-muted-foreground font-body shrink-0 text-xs">
                  {fmtDateTime(a.createdAt)}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* Ligne 5 — santé technique */}
      <Panel title="Santé technique">
        <div className="divide-border grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <OpsStat label="Outbox en attente" value={s.ops.outboxPending} />
          <OpsStat label="Emails en attente" value={s.ops.emailPending} />
          <OpsStat label="Commandes en attente" value={s.orders.pending} />
        </div>
      </Panel>
    </div>
  );
}

function OpsStat({ label, value }: { label: string; value: number }) {
  const warn = value > 0;
  return (
    <div className="flex items-center justify-between px-4 py-4">
      <span className="text-muted-foreground font-body text-sm">{label}</span>
      <Badge tone={warn ? 'amber' : 'green'}>{value}</Badge>
    </div>
  );
}
