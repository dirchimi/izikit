'use client';

import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';
import { waLink } from '@/lib/wa';
import { toCsv, downloadCsv } from '@/lib/csv';
import Icon from '@/components/ui/Icon';
import { AdminHeader, Badge, MiniBars, Panel, Skeleton, StatBar, StatCard } from './ui';

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
  boutiques: { total: number; activeWeek: number; dormant: number };
  orders: { total: number; paid: number; pending: number; failed: number; revenuePaid: number };
  withdrawals: { pending: number; pendingAmount: number; completed: number; paidOut: number };
  sales: { volume: number; count: number };
  receivables: { openAmount: number; openCount: number };
  products: { total: number };
  subscriptions: {
    active: number;
    offered: number;
    trial: number;
    expired: number;
    mrr: number;
    pendingCount: number;
    pendingAmount: number;
    pending: Array<{
      id: string;
      org: string;
      plan: string | null;
      amount: number;
      discountCode: string | null;
      method: string;
      months: number;
      createdAt: string;
    }>;
    expiringSoon: Array<{
      id: string;
      name: string;
      plan: string | null;
      status: string;
      activeUntil: string | null;
      daysLeft: number;
      phone: string | null;
    }>;
  };
  trials: Array<{
    id: string;
    name: string;
    phone: string | null;
    daysLeft: number;
    salesTotal: number;
  }>;
  dormantList: Array<{ id: string; name: string; phone: string | null }>;
  collectedTotal: number;
  planSplit: { premium: number };
  topBoutiques: {
    byRevenue: Array<{ id: string; name: string; value: number }>;
    byCollected: Array<{ id: string; name: string; value: number }>;
  };
  topCities: Array<{ city: string; revenue: number; boutiques: number }>;
  collectedByMonth: Array<{ month: string; amount: number }>;
  conversion: { paying: number; total: number; rate: number };
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

const ROLE_TONE: Record<string, string> = { SUPERADMIN: 'purple', ADMIN: 'blue', USER: 'neutral' };

const PLAN_LABEL: Record<string, string> = {
  PREMIUM: 'Premium',
  SOLO: 'Solo',
  BOUTIQUE: 'Boutique',
};
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  BANK: 'Virement bancaire',
  MOBILE: 'Mobile money', // historique
};
// Ton du badge selon l'urgence (jours restants avant expiration).
function urgencyTone(daysLeft: number): string {
  if (daysLeft <= 1) return 'red';
  if (daysLeft <= 3) return 'amber';
  return 'blue';
}
function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "aujourd'hui";
  if (daysLeft === 1) return 'demain';
  return `dans ${daysLeft} j`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

const MONTH_SHORT = [
  'jan',
  'fév',
  'mar',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sep',
  'oct',
  'nov',
  'déc',
];
const MONTH_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
// "2026-07" → { short: "juil", long: "juillet 2026" }
function fmtMonth(key: string): { short: string; long: string } {
  const [y, m] = key.split('-');
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return { short: MONTH_SHORT[idx] ?? m ?? '', long: `${MONTH_LONG[idx] ?? ''} ${y ?? ''}`.trim() };
}
// Bouton WhatsApp compact des files d'appel — rien si pas de numéro exploitable.
function WaButton({ phone, label }: { phone: string | null; label: string }) {
  const href = phone ? waLink(phone) : null;
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Écrire à ${label} sur WhatsApp`}
      className="text-primary inline-flex shrink-0 items-center"
    >
      <Icon i="message-circle" size={15} />
    </a>
  );
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
    if (!loading) {
      return (
        <>
          <AdminHeader title="Tableau de bord" subtitle="Vue d'ensemble de la plateforme" />
          <div className="bg-surface border-border text-muted-foreground font-body rounded-xl border px-6 py-12 text-center text-sm shadow-sm">
            Aucune donnée.
          </div>
        </>
      );
    }
    // Squelette de chargement (mêmes gabarits que le contenu réel).
    return (
      <div className="flex flex-col gap-5">
        <AdminHeader title="Tableau de bord" subtitle="Vue d'ensemble de la plateforme" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border-border flex flex-col gap-3 rounded-xl border p-5 shadow-sm"
            >
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-surface border-border rounded-xl border p-5 shadow-sm">
              <Skeleton className="mb-4 h-4 w-1/3" />
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="mb-3 h-9 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const s = data;
  const totalUsers = s.users.total;

  return (
    <div className="stagger flex flex-col gap-5">
      <AdminHeader title="Tableau de bord" subtitle="Vue d'ensemble de la plateforme">
        <button
          type="button"
          onClick={() => void refresh()}
          className="border-border bg-surface text-foreground font-body rounded-md border px-3 py-2 text-sm font-semibold"
        >
          Actualiser
        </button>
      </AdminHeader>

      {/* Ligne 1 — L'ARGENT d'abord : tout ce qui compte, visible sans scroller.
          « Revenu mensuel (réel) » = Σ (montant payé ÷ mois) des paiements
          réellement encaissés — pas le prix catalogue. */}
      <div>
        <h2 className="font-headings text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
          Revenus
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Encaissé ce mois-ci"
            value={fcfa(s.collectedByMonth[s.collectedByMonth.length - 1]?.amount ?? 0)}
            sub="abonnements confirmés"
            icon="wallet"
            accent
          />
          <StatCard
            label="Total encaissé"
            value={fcfa(s.collectedTotal)}
            sub="depuis le lancement"
            icon="piggy-bank"
          />
          <StatCard
            label="Revenu mensuel (réel)"
            value={fcfa(s.subscriptions.mrr)}
            sub="sur les montants réellement payés"
            icon="trending-up"
          />
          <StatCard
            label="Paiements à valider"
            value={String(s.subscriptions.pendingCount)}
            sub={
              s.subscriptions.pendingCount > 0
                ? `${fcfa(s.subscriptions.pendingAmount)} en attente`
                : 'Rien à traiter'
            }
            icon="hourglass"
            warn={s.subscriptions.pendingCount > 0}
            href="/admin/subscriptions"
          />
        </div>
      </div>

      {/* Ligne 1b — Les boutiques (état du parc). */}
      <div>
        <h2 className="font-headings text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
          Boutiques & activité
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Abonnements payants"
            value={String(s.subscriptions.active)}
            sub={`${s.subscriptions.offered > 0 ? `${s.subscriptions.offered} offert(s) · ` : ''}${s.subscriptions.trial} en essai · ${s.subscriptions.expired} expiré(s)`}
            icon="badge-check"
            href="/admin/subscriptions"
          />
          <StatCard
            label="Boutiques"
            value={String(s.boutiques.total)}
            sub={`${s.subscriptions.active + s.subscriptions.offered + s.subscriptions.trial} actives · ${s.subscriptions.expired} inactives`}
            icon="store"
          />
          <StatCard
            label="Volume de ventes"
            value={fcfa(s.sales.volume)}
            sub={`${s.sales.count} vente(s) — toutes boutiques`}
            icon="receipt"
          />
          <StatCard
            label="Utilisateurs"
            value={String(s.users.total)}
            sub={`+${s.users.newLast7} cette semaine · +${s.users.newToday} aujourd'hui`}
            icon="users"
            href="/admin/users"
          />
        </div>
      </div>

      {/* Ligne 2 — Files d'action : QUI appeler / valider aujourd'hui. Une file
          vide disparaît (au lieu d'occuper l'écran avec « rien à faire »). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {s.subscriptions.pending.length > 0 && (
          <Panel
            title="Paiements à valider"
            action={
              <a
                href="/admin/subscriptions"
                className="text-primary font-body text-xs font-semibold hover:underline"
              >
                Tout voir →
              </a>
            }
          >
            {s.subscriptions.pending.map((p) => (
              <div
                key={p.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground truncate text-sm font-medium">{p.org}</p>
                  <p className="text-muted-foreground font-body text-xs">
                    {(p.plan && PLAN_LABEL[p.plan]) ?? p.plan ?? '—'} · {p.months} mois ·{' '}
                    {METHOD_LABEL[p.method] ?? p.method} · {fmtDate(p.createdAt)}
                    {p.discountCode ? (
                      <span className="text-primary font-medium"> · Code {p.discountCode}</span>
                    ) : null}
                  </p>
                </div>
                <span className="font-headings text-foreground shrink-0 text-sm font-bold">
                  {fcfa(p.amount)}
                </span>
              </div>
            ))}
          </Panel>
        )}

        {s.subscriptions.expiringSoon.length > 0 && (
          <Panel title="Abonnements qui expirent bientôt">
            {s.subscriptions.expiringSoon.map((o) => (
              <div
                key={o.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground truncate text-sm font-medium">{o.name}</p>
                  <p className="text-muted-foreground font-body text-xs">
                    {(o.plan && PLAN_LABEL[o.plan]) ?? o.plan ?? '—'} ·{' '}
                    {o.status === 'TRIAL' ? 'Essai' : 'Abonnement'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={urgencyTone(o.daysLeft)}>{daysLeftLabel(o.daysLeft)}</Badge>
                  <WaButton phone={o.phone} label={o.name} />
                </div>
              </div>
            ))}
          </Panel>
        )}

        {s.trials.length > 0 && (
          <Panel title={`Essais en cours — à convertir (${s.trials.length})`}>
            {s.trials.map((t) => (
              <div
                key={t.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground truncate text-sm font-medium">{t.name}</p>
                  <p className="font-body text-xs">
                    {/* Signal d'activation : une boutique qui VEND pendant son
                        essai est prête à payer ; une qui ne vend pas a besoin
                        d'accompagnement — deux conversations différentes. */}
                    {t.salesTotal > 0 ? (
                      <span className="text-success font-semibold">
                        A vendu · {fcfa(t.salesTotal)}
                      </span>
                    ) : (
                      <span className="text-warning font-semibold">Jamais vendu</span>
                    )}
                    {t.phone ? <span className="text-muted-foreground"> · {t.phone}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={urgencyTone(t.daysLeft)}>{daysLeftLabel(t.daysLeft)}</Badge>
                  <WaButton phone={t.phone} label={t.name} />
                </div>
              </div>
            ))}
          </Panel>
        )}

        {s.dormantList.length > 0 && (
          <Panel title={`À relancer — 30 j sans vente (${s.dormantList.length})`}>
            {s.dormantList.map((d) => (
              <div
                key={d.id}
                className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-body text-foreground truncate text-sm font-medium">{d.name}</p>
                  <p className="text-muted-foreground font-body text-xs">
                    {d.phone ?? 'Pas de téléphone renseigné'}
                  </p>
                </div>
                <WaButton phone={d.phone} label={d.name} />
              </div>
            ))}
          </Panel>
        )}
      </div>

      {/* Ligne 3 — Encaissé par mois (revenu réel des abonnements), juste
          après les files d'action : l'argent se lit avant les classements. */}
      <Panel
        title="Encaissé par mois — 6 derniers mois"
        action={
          <button
            type="button"
            onClick={() => {
              const rows = s.collectedByMonth.map((m) => [fmtMonth(m.month).long, m.amount]);
              downloadCsv(
                'encaisse-par-mois-sahilley.csv',
                toCsv(['Mois', 'Encaissé (FCFA)'], rows),
              );
            }}
            className="border-border text-foreground font-body hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95"
          >
            <Icon i="download" size={13} /> CSV
          </button>
        }
      >
        <div className="px-4 py-5">
          <MiniBars
            data={s.collectedByMonth.map((m) => {
              const f = fmtMonth(m.month);
              return {
                label: f.short,
                value: m.amount,
                hint: `${f.long} : ${fcfa(m.amount)}`,
              };
            })}
          />
        </div>
      </Panel>

      {/* Ligne 3b — Classements par boutique / ville */}
      <div>
        <h2 className="font-headings text-muted-foreground mb-2 text-xs font-bold tracking-wide uppercase">
          Classements
        </h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Panel title="Top boutiques — chiffre d'affaires">
            <RankedList items={s.topBoutiques.byRevenue} empty="Aucune vente." />
          </Panel>
          <Panel title="Top boutiques — encaissé">
            <RankedList items={s.topBoutiques.byCollected} empty="Aucun encaissement." />
          </Panel>
          <Panel title="Villes les plus actives">
            {s.topCities.length === 0 ? (
              <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">
                Aucune ville renseignée.
              </p>
            ) : (
              s.topCities.map((c, i) => (
                <div
                  key={c.city}
                  className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-muted-foreground font-headings w-5 shrink-0 text-sm font-bold">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-body text-foreground truncate text-sm font-medium">
                        {c.city}
                      </p>
                      <p className="text-muted-foreground font-body text-xs">
                        {c.boutiques} boutique(s)
                      </p>
                    </div>
                  </div>
                  <span className="font-headings text-foreground shrink-0 text-sm font-bold">
                    {fcfa(c.revenue)}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>

      {/* Ligne 4 — graphe inscriptions + répartitions */}
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
            <div className="flex flex-col gap-3">
              <span className="text-muted-foreground font-body text-xs font-semibold uppercase">
                Usage boutiques
              </span>
              <StatBar
                label="Actives (vente ≤ 7 j)"
                value={s.boutiques.activeWeek}
                total={s.boutiques.total}
                tone="green"
              />
              <StatBar
                label="Dormantes (aucune vente ≥ 30 j)"
                value={s.boutiques.dormant}
                total={s.boutiques.total}
                tone="amber"
              />
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-muted-foreground font-body text-xs font-semibold uppercase">
                Conversion essai → payant
              </span>
              <StatBar
                label="Boutiques ayant déjà payé"
                value={s.conversion.paying}
                total={s.conversion.total}
                tone="green"
              />
            </div>
          </div>
        </Panel>
      </div>

      {/* Ligne 5 — listes */}
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

        {/* Santé technique (le journal des actions admin a sa propre page —
            l'unique superadmin y voyait ses propres clics, zéro information). */}
        <Panel title="Santé technique">
          <div className="divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <OpsStat label="Outbox en attente" value={s.ops.outboxPending} />
            <OpsStat label="Emails en attente" value={s.ops.emailPending} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Liste classée (top boutiques) : rang + nom + montant FCFA.
function RankedList({
  items,
  empty,
}: {
  items: Array<{ id: string; name: string; value: number }>;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground font-body px-4 py-6 text-center text-sm">{empty}</p>;
  }
  return (
    <>
      {items.map((it, i) => (
        <div
          key={it.id}
          className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-muted-foreground font-headings w-5 shrink-0 text-sm font-bold">
              {i + 1}
            </span>
            <p className="font-body text-foreground truncate text-sm font-medium">{it.name}</p>
          </div>
          <span className="font-headings text-foreground shrink-0 text-sm font-bold">
            {fcfa(it.value)}
          </span>
        </div>
      ))}
    </>
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
