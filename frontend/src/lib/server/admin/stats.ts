/**
 * computeAdminStats — agrégats plateforme pour le tableau de bord admin.
 *
 * Lecture seule. Tout est calculé en parallèle (Promise.all) : ~15 requêtes
 * légères (count / groupBy / aggregate). Pas de schéma, pas d'écriture.
 * Le découpage en fonction pure (prisma + now injectés) la rend testable
 * avec le mock Prisma.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { isPlanId, MONTHLY_PRICE } from '@/lib/subscription/plans';
import { computeSubscription } from '@/lib/subscription/status';

const DAY_MS = 86_400_000;
const SIGNUP_DAYS = 14;
const EXPIRING_WINDOW_DAYS = 7;

export interface AdminStats {
  users: {
    total: number;
    verified: number;
    suspended: number;
    admins: number;
    newLast7: number;
    newToday: number;
    byRole: { USER: number; ADMIN: number; SUPERADMIN: number };
  };
  // total = comptes boutique ; activeWeek = ≥1 vente ces 7 derniers jours
  // (usage réel) ; dormant = aucune vente depuis 30 jours (à relancer).
  boutiques: { total: number; activeWeek: number; dormant: number };
  orders: { total: number; paid: number; pending: number; failed: number; revenuePaid: number };
  withdrawals: { pending: number; pendingAmount: number; completed: number; paidOut: number };
  sales: { volume: number; count: number };
  receivables: { openAmount: number; openCount: number };
  products: { total: number };
  // Abonnements (cœur du business SaaS) : statuts dérivés + revenu récurrent +
  // file des paiements à valider + boutiques qui expirent bientôt (relances).
  // `active` = abonnées PAYANTES (accès actif + ≥ 1 paiement CONFIRMÉ) ;
  // `offered` = accès actif offert via grant-access sans aucun paiement —
  // compté à part pour ne pas gonfler le MRR ni les « actifs ».
  subscriptions: {
    active: number;
    offered: number;
    trial: number;
    expired: number;
    mrr: number; // revenu mensuel récurrent (Σ prix mensuel des abonnements PAYANTS)
    pendingCount: number;
    pendingAmount: number;
    pending: Array<{
      id: string;
      org: string;
      plan: string | null;
      amount: number;
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
  // File d'appels n°1 : boutiques EN ESSAI, les plus urgentes d'abord, avec
  // téléphone (relance WhatsApp) et signal d'activation (`salesTotal` — une
  // boutique qui vend pendant l'essai est prête à payer ; une qui ne vend pas
  // a besoin d'accompagnement).
  trials: Array<{
    id: string;
    name: string;
    phone: string | null;
    daysLeft: number;
    salesTotal: number;
  }>;
  // File d'appels n°2 : boutiques qui ONT accès (abo/essai en cours) mais
  // n'ont RIEN vendu depuis 30 jours — churn probable si pas relancées.
  // (Inscrites depuis ≥ 14 j pour laisser passer l'onboarding.)
  dormantList: Array<{ id: string; name: string; phone: string | null }>;
  // Total encaissé cumulé (abonnements CONFIRMED, hors comptes internes).
  collectedTotal: number;
  // Répartition des abonnements ACTIFS par plan (qui paie quoi).
  planSplit: { premium: number };
  // Classements par boutique : chiffre d'affaires (ventes) et encaissé
  // (abonnements confirmés). value = FCFA. Top 5 chacun.
  topBoutiques: {
    byRevenue: Array<{ id: string; name: string; value: number }>;
    byCollected: Array<{ id: string; name: string; value: number }>;
  };
  // Villes les plus rentables (Σ CA des boutiques de la ville). Top 5.
  topCities: Array<{ city: string; revenue: number; boutiques: number }>;
  // Encaissé (abonnements CONFIRMED) par mois — 6 derniers mois, du plus ancien
  // au plus récent. `month` = YYYY-MM, `amount` = FCFA.
  collectedByMonth: Array<{ month: string; amount: number }>;
  // Conversion essai → payant : `paying` = boutiques ayant déjà payé, `total` =
  // toutes les boutiques (hors internes), `rate` = pourcentage arrondi.
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

/** Clé de jour UTC (YYYY-MM-DD). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Range les dates d'inscription en N seaux journaliers, du plus ancien au plus récent. */
function bucketSignups(
  dates: Date[],
  now: Date,
  days = SIGNUP_DAYS,
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    counts.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }
  for (const d of dates) {
    const key = dayKey(d);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count })).reverse();
}

type RoleGroup = Array<{ role: string; _count: number }>;
type StatusSumGroup = Array<{ status: string; _count: number; _sum: { amount: number | null } }>;

/** Clé de mois (YYYY-MM) en UTC. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Range des paiements confirmés en N seaux mensuels, du plus ancien au récent. */
function bucketByMonth(
  rows: Array<{ amount: number; confirmedAt: Date | null }>,
  now: Date,
  months: number,
): Array<{ month: string; amount: number }> {
  const totals = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    totals.set(monthKey(d), 0);
  }
  for (const r of rows) {
    if (!r.confirmedAt) continue;
    const key = monthKey(r.confirmedAt);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + r.amount);
  }
  return [...totals.entries()].map(([month, amount]) => ({ month, amount }));
}

export async function computeAdminStats(prisma: PrismaClient, now: Date): Promise<AdminStats> {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since14 = new Date(now.getTime() - SIGNUP_DAYS * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const todayStart = startOfUtcDay(now);
  const soonEnd = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS);
  // Un abonnement est ACTIF si sa fin d'abonnement est dans le futur ; en ESSAI
  // si (pas d'abo actif) et l'essai court encore. Réutilisé par plusieurs where.
  const notActive = { OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lt: now } }] };

  // Comptes INTERNES (test / associés / offerts) : exclus de toutes les métriques
  // — ce ne sont pas de vrais clients. On récupère leurs ids une fois puis on les
  // écarte de chaque requête (`notIn: []` = aucun filtre côté Prisma).
  const internalIds = (
    await prisma.organization.findMany({ where: { internal: true }, select: { id: true } })
  ).map((o) => o.id);
  const orgFilter = internalIds.length ? { id: { notIn: internalIds } } : {};
  const scopeFilter = internalIds.length ? { organizationId: { notIn: internalIds } } : {};

  const [
    usersTotal,
    usersVerified,
    usersSuspended,
    usersNew7,
    usersNewToday,
    roleGroups,
    boutiquesTotal,
    ordersTotal,
    orderGroups,
    withdrawalGroups,
    salesAgg,
    receivablesAgg,
    productsTotal,
    outboxPending,
    emailPending,
    signupRows,
    recentUsersRows,
    recentActionRows,
    subsActive,
    subsPaying,
    subsTrial,
    activePlanGroups,
    subPendingAgg,
    subPendingRows,
    expiringRows,
    trialRows,
    collectedTotalAgg,
    activeWeekGroups,
    active30Groups,
    revenueByOrgGroups,
    collectedByOrgGroups,
    citySettingsRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.groupBy({ by: ['role'], _count: true }) as unknown as Promise<RoleGroup>,
    prisma.organization.count({ where: { ...orgFilter } }),
    prisma.order.count(),
    prisma.order.groupBy({
      by: ['status'],
      _count: true,
      _sum: { amount: true },
    }) as unknown as Promise<StatusSumGroup>,
    prisma.withdrawal.groupBy({
      by: ['status'],
      _count: true,
      _sum: { amount: true },
    }) as unknown as Promise<StatusSumGroup>,
    // Volume = ventes réelles : on exclut les ventes annulées (CANCELLED).
    prisma.sale.aggregate({
      where: { status: 'ACTIVE', ...scopeFilter },
      _sum: { total: true },
      _count: true,
    }),
    prisma.receivable.aggregate({
      where: { status: { in: ['OPEN', 'PARTIAL'] }, ...scopeFilter },
      _sum: { amount: true, amountPaid: true },
      _count: true,
    }),
    prisma.product.count({ where: { ...scopeFilter } }),
    prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
    prisma.emailJob.count({ where: { status: 'PENDING' } }),
    prisma.user.findMany({ where: { createdAt: { gte: since14 } }, select: { createdAt: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    }),
    prisma.adminAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, actorId: true, action: true, targetType: true, createdAt: true },
    }),
    // Abonnements actifs / en essai (statuts dérivés → comptés via dates).
    // Accès actif (payant OU offert) — sert au calcul des « expirées ».
    prisma.organization.count({ where: { currentPeriodEnd: { gte: now }, ...orgFilter } }),
    // Abonnées PAYANTES : accès actif + au moins un paiement CONFIRMÉ. Une
    // boutique à qui on a offert des jours (grant-access, aucun encaissement)
    // ne compte ni ici ni dans le MRR.
    prisma.organization.count({
      where: {
        currentPeriodEnd: { gte: now },
        subPayments: { some: { status: 'CONFIRMED' } },
        ...orgFilter,
      },
    }),
    prisma.organization.count({
      where: { AND: [{ trialEndsAt: { gte: now } }, notActive], ...orgFilter },
    }),
    prisma.organization.groupBy({
      by: ['plan'],
      where: {
        currentPeriodEnd: { gte: now },
        subPayments: { some: { status: 'CONFIRMED' } },
        ...orgFilter,
      },
      _count: true,
    }) as unknown as Promise<Array<{ plan: string | null; _count: number }>>,
    prisma.subscriptionPayment.aggregate({
      where: { status: 'PENDING', ...scopeFilter },
      _count: true,
      _sum: { amount: true },
    }),
    // File des paiements à valider — les plus anciens d'abord (FIFO).
    prisma.subscriptionPayment.findMany({
      where: { status: 'PENDING', ...scopeFilter },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: {
        id: true,
        plan: true,
        amount: true,
        method: true,
        months: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
    }),
    // Boutiques dont l'accès expire dans les 7 jours (abo OU essai) → relances.
    prisma.organization.findMany({
      where: {
        OR: [
          { currentPeriodEnd: { gte: now, lte: soonEnd } },
          { AND: [{ trialEndsAt: { gte: now, lte: soonEnd } }, notActive] },
        ],
        ...orgFilter,
      },
      // Trié par fin d'abonnement croissante : la fenêtre `take` contient bien
      // les plus urgentes (proxy sûr de `daysLeft`, qui n'est pas une colonne).
      // Les essais purs (currentPeriodEnd = null) remontent en tête via `nulls
      // first`, puis on affine le tri par daysLeft en mémoire.
      orderBy: { currentPeriodEnd: { sort: 'asc', nulls: 'first' } },
      take: 30,
      select: {
        id: true,
        name: true,
        plan: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        settings: { select: { phone: true } },
      },
    }),
    // Boutiques EN ESSAI (pas d'abo actif), les plus urgentes d'abord — la
    // liste d'appels de conversion, avec le téléphone pour relancer.
    prisma.organization.findMany({
      where: { AND: [{ trialEndsAt: { gte: now } }, notActive], ...orgFilter },
      orderBy: { trialEndsAt: 'asc' },
      take: 30,
      select: {
        id: true,
        name: true,
        trialEndsAt: true,
        settings: { select: { phone: true } },
      },
    }),
    // Encaissé cumulé (tous les paiements confirmés, hors internes).
    prisma.subscriptionPayment.aggregate({
      where: { status: 'CONFIRMED', ...scopeFilter },
      _sum: { amount: true },
    }),
    // Usage réel : boutiques distinctes ayant une vente ACTIVE sur 7 j / 30 j
    // (une vente annulée ne compte pas comme activité).
    prisma.sale.groupBy({
      by: ['organizationId'],
      where: { status: 'ACTIVE', createdAt: { gte: since7 }, ...scopeFilter },
    }) as unknown as Promise<Array<{ organizationId: string }>>,
    prisma.sale.groupBy({
      by: ['organizationId'],
      where: { status: 'ACTIVE', createdAt: { gte: since30 }, ...scopeFilter },
    }) as unknown as Promise<Array<{ organizationId: string }>>,
    // CA total par boutique (ventes ACTIVE, tout l'historique), trié décroissant.
    // Sert à la fois au top-5 CA et à l'agrégation du CA par ville.
    prisma.sale.groupBy({
      by: ['organizationId'],
      where: { status: 'ACTIVE', ...scopeFilter },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    }) as unknown as Promise<Array<{ organizationId: string; _sum: { total: number | null } }>>,
    // Encaissé par boutique (abonnements CONFIRMED) — top 5.
    prisma.subscriptionPayment.groupBy({
      by: ['organizationId'],
      where: { status: 'CONFIRMED', ...scopeFilter },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }) as unknown as Promise<Array<{ organizationId: string; _sum: { amount: number | null } }>>,
    // Ville de chaque boutique (pour agréger le CA par ville en mémoire).
    prisma.boutiqueSettings.findMany({
      where: { city: { not: null }, ...scopeFilter },
      select: { organizationId: true, city: true },
    }),
  ]);

  const byRole = { USER: 0, ADMIN: 0, SUPERADMIN: 0 };
  for (const g of roleGroups) {
    if (g.role in byRole) byRole[g.role as keyof typeof byRole] = g._count;
  }

  const orderByStatus = new Map(orderGroups.map((g) => [g.status, g]));
  const paid = orderByStatus.get('PAID');
  const wByStatus = new Map(withdrawalGroups.map((g) => [g.status, g]));
  const wPending = wByStatus.get('PENDING');
  const wCompleted = wByStatus.get('COMPLETED');

  const openAmount = (receivablesAgg._sum.amount ?? 0) - (receivablesAgg._sum.amountPaid ?? 0);

  // MRR = somme du prix mensuel de référence des abonnements PAYANTS
  // (activePlanGroups exclut déjà les accès offerts sans paiement).
  const mrr = activePlanGroups.reduce((sum, g) => {
    const price = isPlanId(g.plan) ? MONTHLY_PRICE : 0;
    return sum + price * g._count;
  }, 0);
  // Expirées = ni accès actif (payant ou offert) ni essai en cours.
  const expired = Math.max(0, boutiquesTotal - subsActive - subsTrial);
  const offered = Math.max(0, subsActive - subsPaying);

  // Usage : boutiques actives (vente ≤7 j) vs dormantes (aucune vente ≤30 j).
  const activeWeek = activeWeekGroups.length;
  const dormant = Math.max(0, boutiquesTotal - active30Groups.length);

  // Boutiques qui expirent bientôt : statut dérivé + jours restants, du plus
  // urgent au moins urgent (pour la liste de relance).
  const expiringSoon = expiringRows
    .map((o) => {
      const view = computeSubscription(
        { plan: o.plan, trialEndsAt: o.trialEndsAt, currentPeriodEnd: o.currentPeriodEnd },
        now,
      );
      return {
        id: o.id,
        name: o.name,
        plan: view.plan,
        status: view.status,
        activeUntil: view.activeUntil,
        daysLeft: view.daysLeft,
        phone: o.settings?.phone ?? null,
      };
    })
    .filter((o) => o.status !== 'EXPIRED')
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8);

  // CA total (toutes périodes) par boutique — sert de signal d'activation pour
  // la liste des essais (déjà chargé pour les classements, aucune requête en +).
  const salesTotalByOrg = new Map(
    revenueByOrgGroups.map((g) => [g.organizationId, g._sum.total ?? 0]),
  );

  const trials = trialRows.map((o) => ({
    id: o.id,
    name: o.name,
    phone: o.settings?.phone ?? null,
    daysLeft: o.trialEndsAt
      ? Math.max(0, Math.ceil((o.trialEndsAt.getTime() - now.getTime()) / DAY_MS))
      : 0,
    salesTotal: salesTotalByOrg.get(o.id) ?? 0,
  }));

  // Dormantes À RELANCER : accès encore valable (abo OU essai) mais aucune
  // vente ACTIVE depuis 30 j, inscrites depuis ≥ 14 j (onboarding passé). Les
  // expirées ne sont pas ici — les relancer, c'est le travail de la file
  // « expirent bientôt » / du statut expiré.
  const active30Ids = active30Groups.map((g) => g.organizationId);
  const dormantRows = await prisma.organization.findMany({
    where: {
      id: { notIn: [...active30Ids, ...internalIds] },
      createdAt: { lt: since14 },
      OR: [{ currentPeriodEnd: { gte: now } }, { trialEndsAt: { gte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 12,
    select: { id: true, name: true, settings: { select: { phone: true } } },
  });
  const dormantList = dormantRows.map((o) => ({
    id: o.id,
    name: o.name,
    phone: o.settings?.phone ?? null,
  }));

  // Nombre d'abonnements Premium actifs (une seule offre payante).
  let premium = 0;
  for (const g of activePlanGroups) {
    if (isPlanId(g.plan)) premium += g._count;
  }

  // CA par ville : on croise le CA par boutique avec la ville de chaque boutique.
  const cityByOrg = new Map(citySettingsRows.map((r) => [r.organizationId, r.city]));
  const cityAgg = new Map<string, { revenue: number; boutiques: number }>();
  for (const g of revenueByOrgGroups) {
    const city = cityByOrg.get(g.organizationId);
    if (!city) continue;
    const cur = cityAgg.get(city) ?? { revenue: 0, boutiques: 0 };
    cur.revenue += g._sum.total ?? 0;
    cur.boutiques += 1;
    cityAgg.set(city, cur);
  }
  const topCities = [...cityAgg.entries()]
    .map(([city, v]) => ({ city, revenue: v.revenue, boutiques: v.boutiques }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Top boutiques : on résout les noms des ids concernés en une seule requête.
  const topRevenue = revenueByOrgGroups.slice(0, 5);
  const nameIds = [
    ...new Set([
      ...topRevenue.map((g) => g.organizationId),
      ...collectedByOrgGroups.map((g) => g.organizationId),
    ]),
  ];
  const nameRows = nameIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: nameIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(nameRows.map((o) => [o.id, o.name]));

  // Encaissé par mois (6 derniers mois) : paiements CONFIRMED des vraies
  // boutiques. Bucketé en mémoire (pas de date_trunc portable via Prisma).
  const MONTHS_BACK = 6;
  const firstMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_BACK - 1), 1),
  );
  const confirmedPayments =
    (await prisma.subscriptionPayment.findMany({
      where: { status: 'CONFIRMED', confirmedAt: { gte: firstMonth }, ...scopeFilter },
      select: { amount: true, confirmedAt: true },
    })) ?? [];
  const collectedByMonth = bucketByMonth(confirmedPayments, now, MONTHS_BACK);

  // Conversion essai → payant : boutiques (non-internes) ayant DÉJÀ au moins un
  // paiement confirmé, rapportées au total. Proxy simple du taux de conversion.
  const payingOrgGroups =
    ((await prisma.subscriptionPayment.groupBy({
      by: ['organizationId'],
      where: { status: 'CONFIRMED', ...scopeFilter },
    })) as unknown as Array<{ organizationId: string }>) ?? [];
  const payingCount = payingOrgGroups.length;
  const conversionRate = boutiquesTotal > 0 ? Math.round((payingCount / boutiquesTotal) * 100) : 0;

  const topBoutiques = {
    byRevenue: topRevenue.map((g) => ({
      id: g.organizationId,
      name: nameById.get(g.organizationId) ?? '—',
      value: g._sum.total ?? 0,
    })),
    byCollected: collectedByOrgGroups.map((g) => ({
      id: g.organizationId,
      name: nameById.get(g.organizationId) ?? '—',
      value: g._sum.amount ?? 0,
    })),
  };

  return {
    users: {
      total: usersTotal,
      verified: usersVerified,
      suspended: usersSuspended,
      admins: byRole.ADMIN + byRole.SUPERADMIN,
      newLast7: usersNew7,
      newToday: usersNewToday,
      byRole,
    },
    boutiques: { total: boutiquesTotal, activeWeek, dormant },
    orders: {
      total: ordersTotal,
      paid: paid?._count ?? 0,
      pending: orderByStatus.get('PENDING')?._count ?? 0,
      failed: orderByStatus.get('FAILED')?._count ?? 0,
      revenuePaid: paid?._sum.amount ?? 0,
    },
    withdrawals: {
      pending: wPending?._count ?? 0,
      pendingAmount: wPending?._sum.amount ?? 0,
      completed: wCompleted?._count ?? 0,
      paidOut: wCompleted?._sum.amount ?? 0,
    },
    sales: { volume: salesAgg._sum.total ?? 0, count: salesAgg._count },
    receivables: { openAmount, openCount: receivablesAgg._count },
    products: { total: productsTotal },
    subscriptions: {
      active: subsPaying,
      offered,
      trial: subsTrial,
      expired,
      mrr,
      pendingCount: subPendingAgg._count,
      pendingAmount: subPendingAgg._sum.amount ?? 0,
      pending: subPendingRows.map((p) => ({
        id: p.id,
        org: p.organization?.name ?? '—',
        plan: p.plan,
        amount: p.amount,
        method: p.method,
        months: p.months,
        createdAt: p.createdAt.toISOString(),
      })),
      expiringSoon,
    },
    trials,
    dormantList,
    collectedTotal: collectedTotalAgg._sum.amount ?? 0,
    planSplit: { premium },
    topBoutiques,
    topCities,
    collectedByMonth,
    conversion: { paying: payingCount, total: boutiquesTotal, rate: conversionRate },
    ops: { outboxPending, emailPending },
    signups: bucketSignups(
      signupRows.map((r) => r.createdAt),
      now,
    ),
    recentUsers: recentUsersRows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })),
    recentActions: recentActionRows.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      action: a.action,
      targetType: a.targetType,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
