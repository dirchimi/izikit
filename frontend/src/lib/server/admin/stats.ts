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

const DAY_MS = 86_400_000;
const SIGNUP_DAYS = 14;

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

export async function computeAdminStats(prisma: PrismaClient, now: Date): Promise<AdminStats> {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since14 = new Date(now.getTime() - SIGNUP_DAYS * DAY_MS);
  const todayStart = startOfUtcDay(now);

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
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.groupBy({ by: ['role'], _count: true }) as unknown as Promise<RoleGroup>,
    prisma.organization.count(),
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
    prisma.sale.aggregate({ _sum: { total: true }, _count: true }),
    prisma.receivable.aggregate({
      where: { status: { in: ['OPEN', 'PARTIAL'] } },
      _sum: { amount: true, amountPaid: true },
      _count: true,
    }),
    prisma.product.count(),
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
    boutiques: { total: boutiquesTotal },
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
