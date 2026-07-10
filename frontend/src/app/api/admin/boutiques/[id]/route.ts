// GET /api/admin/boutiques/[id] — fiche détail d'une boutique.
//
// Regroupe tout le contexte d'une Organization pour le back-office : patron,
// réglages (téléphone / ville / adresse), statut d'abonnement DÉRIVÉ, agrégats
// (encaissé, CA, créances, effectif, produits), équipe (membres + rôles),
// historique des paiements d'abonnement et dernières ventes.
//
// Lecture ADMIN+. 404 stable BOUTIQUE_NOT_FOUND sur miss.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeSubscription } from '@/lib/subscription/status';

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  createdAt: true,
  owner: { select: { id: true, name: true, email: true } },
  settings: {
    select: {
      phone: true,
      city: true,
      address: true,
      country: true,
      currency: true,
      businessType: true,
    },
  },
  _count: { select: { members: { where: { role: { not: 'OWNER' } } }, products: true } },
} as const satisfies Prisma.OrganizationSelect;

// Rang d'affichage des rôles (OWNER en tête).
const ROLE_RANK: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const { id } = await ctx.params;

    const [org, collectedAgg, salesAgg, receivablesAgg, members, payments, recentSales] =
      await Promise.all([
        prisma.organization.findUnique({ where: { id }, select: ORG_SELECT }),
        prisma.subscriptionPayment.aggregate({
          where: { organizationId: id, status: 'CONFIRMED' },
          _sum: { amount: true },
        }),
        prisma.sale.aggregate({
          where: { organizationId: id, status: 'ACTIVE' },
          _sum: { total: true },
          _count: true,
        }),
        prisma.receivable.aggregate({
          where: { organizationId: id, status: { in: ['OPEN', 'PARTIAL'] } },
          _sum: { amount: true, amountPaid: true },
        }),
        prisma.organizationMember.findMany({
          where: { organizationId: id },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.subscriptionPayment.findMany({
          where: { organizationId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            plan: true,
            amount: true,
            method: true,
            months: true,
            status: true,
            periodEnd: true,
            note: true,
            createdAt: true,
            confirmedAt: true,
          },
        }),
        prisma.sale.findMany({
          where: { organizationId: id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            number: true,
            total: true,
            method: true,
            status: true,
            createdAt: true,
          },
        }),
      ]);

    if (!org) {
      return NextResponse.json(
        { error: 'BOUTIQUE_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const sub = computeSubscription(
      { plan: org.plan, trialEndsAt: org.trialEndsAt, currentPeriodEnd: org.currentPeriodEnd },
      now,
    );
    const receivablesOpen =
      (receivablesAgg._sum.amount ?? 0) - (receivablesAgg._sum.amountPaid ?? 0);

    const boutique = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
      owner: org.owner,
      settings: org.settings,
      subscription: {
        plan: sub.plan,
        status: sub.status,
        daysLeft: sub.daysLeft,
        activeUntil: sub.activeUntil,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
      },
      stats: {
        collected: collectedAgg._sum.amount ?? 0,
        salesTotal: salesAgg._sum.total ?? 0,
        salesCount: salesAgg._count,
        receivablesOpen,
        sellers: org._count.members,
        products: org._count.products,
      },
      members: members
        .sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))
        .map((m) => ({
          id: m.id,
          role: m.role,
          userId: m.user.id,
          userName: m.user.name,
          userEmail: m.user.email,
          joinedAt: m.createdAt,
        })),
      payments,
      recentSales,
    };

    return NextResponse.json({ boutique }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
