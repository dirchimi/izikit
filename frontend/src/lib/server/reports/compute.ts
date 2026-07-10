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
  // « Caisse miroir » : argent RÉELLEMENT encaissé sur la période (≠ CA, qui
  // compte aussi le crédit). = parts espèces/mobile des ventes + remboursements
  // de créances reçus dans la même méthode. `creditGranted` = vendu à crédit
  // (donc pas encore encaissé) sur la période.
  collectedCash: number;
  collectedMobile: number;
  creditGranted: number;
  // Sous-ensemble de l'encaissé : remboursements de créances reçus sur la
  // période (anciennes dettes réglées), par méthode. `repaidCash`/`repaidMobile`
  // sont DÉJÀ compris dans `collectedCash`/`collectedMobile`.
  repaidCash: number;
  repaidMobile: number;
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

  const [sales, expenseAgg, repayGroups] = await Promise.all([
    prisma.sale.findMany({
      // Les ventes annulées ne comptent ni dans le CA ni dans la marge.
      where: { organizationId: orgId, status: 'ACTIVE', createdAt: { gte: from, lt: to } },
      select: {
        total: true,
        // Parts par mode de paiement → argent réellement encaissé vs crédit.
        cashAmount: true,
        mobileAmount: true,
        creditAmount: true,
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
    // Remboursements de créances reçus sur la période, par méthode (CASH/MOBILE).
    prisma.repayment.groupBy({
      by: ['method'],
      where: { organizationId: orgId, createdAt: { gte: from, lt: to } },
      _sum: { amount: true },
    }) as unknown as Promise<Array<{ method: string; _sum: { amount: number | null } }>>,
  ]);

  let revenue = 0;
  let cogs = 0;
  let collectedCash = 0;
  let collectedMobile = 0;
  let creditGranted = 0;
  const series = buckets.map((b) => ({ label: b.label, value: 0 }));
  const allItems: AggItem[] = [];

  for (const sale of sales) {
    revenue += sale.total;
    collectedCash += sale.cashAmount ?? 0;
    collectedMobile += sale.mobileAmount ?? 0;
    creditGranted += sale.creditAmount ?? 0;
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

  // Les remboursements de créances sont de l'argent qui entre AUSSI en caisse.
  // On les garde isolés (repaid*) tout en les ajoutant à l'encaissé (collected*).
  let repaidCash = 0;
  let repaidMobile = 0;
  for (const g of repayGroups) {
    if (g.method === 'CASH') repaidCash += g._sum.amount ?? 0;
    else if (g.method === 'MOBILE') repaidMobile += g._sum.amount ?? 0;
  }
  collectedCash += repaidCash;
  collectedMobile += repaidMobile;

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
      collectedCash,
      collectedMobile,
      creditGranted,
      repaidCash,
      repaidMobile,
    },
    series,
    topProducts: rankTopProducts(allItems),
  };
}
