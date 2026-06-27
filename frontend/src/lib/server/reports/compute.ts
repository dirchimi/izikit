// Phase 7 — calcul du rapport (agrégation ventes + dépenses), partagé entre
// GET /api/reports (JSON) et GET /api/reports/pdf (PDF), pour ne pas dupliquer
// la logique. Org-scopé. Montants entiers (FCFA).
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import {
  periodRange,
  buildBuckets,
  buildBucketsRange,
  bucketIndexFor,
  marginPct,
  rankTopProducts,
  type AggItem,
  type Bucket,
  type Period,
  type TopProduct,
} from './helpers';

export interface ReportSummary {
  revenue: number;
  sales: number;
  grossMargin: number;
  marginPct: number;
  expenses: number;
  netProfit: number;
}

export interface ReportResult {
  period: Period | 'custom';
  range: { from: string; to: string };
  summary: ReportSummary;
  series: { label: string; value: number }[];
  topProducts: TopProduct[];
}

/** Rapport sur une période nommée (today/week/month/year), ancrée sur `now`. */
export async function computeReport(
  orgId: string,
  period: Period,
  now: Date,
): Promise<ReportResult> {
  return computeForWindow(orgId, period, periodRange(period, now), buildBuckets(period, now));
}

/** Rapport sur une plage de dates libre (du… au…). */
export async function computeReportRange(
  orgId: string,
  from: Date,
  to: Date,
): Promise<ReportResult> {
  return computeForWindow(orgId, 'custom', { from, to }, buildBucketsRange(from, to));
}

async function computeForWindow(
  orgId: string,
  period: Period | 'custom',
  window: { from: Date; to: Date },
  buckets: Bucket[],
): Promise<ReportResult> {
  const { from, to } = window;

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

  return {
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
  };
}
