// Phase 7 — GET /api/reports?period=today|week|month|year.
//
// Agrège ventes + dépenses sur la fenêtre de la période (lecture seule) :
//   revenue     = Σ Sale.total
//   sales       = nb de ventes
//   grossMargin = revenue − COGS, COGS = Σ ligne (buyPrice × qty)  (instantané)
//   marginPct   = marge / CA
//   expenses    = Σ Expense.amount
//   netProfit   = grossMargin − expenses
//   series[]    = CA par compartiment (jour/mois) pour le graphe
//   topProducts = top 5 produits par CA
// Org-scopé, rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import {
  parsePeriod,
  periodRange,
  buildBuckets,
  bucketIndexFor,
  marginPct,
  rankTopProducts,
  type AggItem,
} from '@/lib/server/reports/helpers';
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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const orgId = primary.organizationId;
    const period = parsePeriod(new URL(req.url).searchParams.get('period'));
    const now = new Date();
    const { from, to } = periodRange(period, now);
    const buckets = buildBuckets(period, now);

    const [sales, expenseAgg] = await Promise.all([
      prisma.sale.findMany({
        where: { organizationId: orgId, createdAt: { gte: from, lt: to } },
        select: {
          total: true,
          createdAt: true,
          items: {
            select: { name: true, qty: true, unitPrice: true, buyPrice: true, productId: true },
          },
        },
      }),
      prisma.expense.aggregate({
        where: { organizationId: orgId, occurredAt: { gte: from, lt: to } },
        _sum: { amount: true },
      }),
    ]);

    let revenue = 0;
    let cogs = 0;
    const series = buckets.map((b) => ({ label: b.label, value: 0 }));
    const allItems: AggItem[] = [];

    for (const sale of sales) {
      revenue += sale.total;
      const createdAt = sale.createdAt instanceof Date ? sale.createdAt : new Date(sale.createdAt);
      const idx = bucketIndexFor(buckets, createdAt);
      const slot = idx >= 0 ? series[idx] : undefined;
      if (slot) slot.value += sale.total;
      for (const it of sale.items) {
        cogs += it.buyPrice * it.qty;
        allItems.push({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          productId: it.productId,
        });
      }
    }

    const grossMargin = revenue - cogs;
    const expenses = expenseAgg._sum.amount ?? 0;

    return NextResponse.json(
      {
        period,
        range: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          revenue,
          sales: sales.length,
          grossMargin,
          marginPct: marginPct(grossMargin, revenue),
          expenses,
          netProfit: grossMargin - expenses,
        },
        series,
        topProducts: rankTopProducts(allItems),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
