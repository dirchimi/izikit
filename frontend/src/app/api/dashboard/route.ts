// GET /api/dashboard — agrégat du tableau de bord (vraies données, lecture seule).
//   today/yesterday : CA, nb ventes, dépenses (via computeReport) pour la tendance
//   receivablesOpen : Σ (amount - amountPaid) des créances
//   weekly          : CA des 7 derniers jours, normalisé 0–100 pour le mini-graphe
//   stockAlerts     : produits sous le seuil (rupture d'abord)
//   recentSales     : 6 dernières ventes
// Org-scopé, rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { prisma } from '@/lib/server/prisma';
import { computeReport } from '@/lib/server/reports/compute';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // Tableau de bord = données de pilotage (CA, marge…) → Manager/Patron.
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;
    const orgId = primary.organizationId;

    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);

    const [todayR, yestR, weekR, receivAgg, products, recent] = await Promise.all([
      computeReport(orgId, 'today', now),
      computeReport(orgId, 'today', yesterday),
      computeReport(orgId, 'week', now),
      prisma.receivable.aggregate({
        // Une créance annulée (vente annulée) ne compte plus dans l'encours.
        where: { organizationId: orgId, status: { not: 'CANCELLED' } },
        _sum: { amount: true, amountPaid: true },
      }),
      prisma.product.findMany({
        where: { organizationId: orgId },
        select: { name: true, qty: true, threshold: true },
      }),
      prisma.sale.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          total: true,
          method: true,
          status: true,
          createdAt: true,
          items: { select: { name: true, qty: true } },
        },
      }),
    ]);

    const receivablesOpen = (receivAgg._sum.amount ?? 0) - (receivAgg._sum.amountPaid ?? 0);

    const stockAlerts = products
      .filter((p) => p.qty <= p.threshold)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 5)
      .map((p) => ({ name: p.name, remaining: p.qty, critical: p.qty === 0 }));

    const weekMax = Math.max(0, ...weekR.series.map((s) => s.value));
    const weekly = weekR.series.map((s) => ({
      label: s.label,
      value: weekMax > 0 ? Math.round((s.value / weekMax) * 100) : 0,
    }));

    const recentSales = recent.map((s) => {
      const first = s.items[0]?.name ?? '—';
      const product = s.items.length > 1 ? `${first} +${s.items.length - 1}` : first;
      const createdAt = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
      return {
        id: s.id,
        at: createdAt.toISOString(),
        product,
        qty: s.items.reduce((sum, it) => sum + it.qty, 0),
        total: s.total,
        method: s.method.toLowerCase(),
        status: s.status,
      };
    });

    return NextResponse.json(
      {
        today: {
          revenue: todayR.summary.revenue,
          sales: todayR.summary.sales,
          expenses: todayR.summary.expenses,
        },
        yesterday: {
          revenue: yestR.summary.revenue,
          sales: yestR.summary.sales,
          expenses: yestR.summary.expenses,
        },
        receivablesOpen,
        weekly,
        weekMaxRevenue: weekMax,
        weekTodayIndex: weekR.series.length - 1,
        stockAlerts,
        recentSales,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
