// compute-local.ts — reproduction CLIENTE, pure, de `computeForWindow`
// (frontend/src/lib/server/reports/compute.ts) au-dessus du miroir Dexie.
//
// Pourquoi dupliquer plutôt qu'appeler /api/reports ? Hors ligne, le réseau
// n'est pas là : les écrans Rapports/Dashboard doivent pouvoir agréger les
// ventes/dépenses/remboursements DÉJÀ présents dans IndexedDB. On réutilise
// EXACTEMENT les mêmes helpers purs (periodRange/buildBuckets/bucketIndexFor/
// marginPct/rankTopProducts) que le serveur — même découpage, même arithmétique
// → parité en ligne/hors-ligne (aux mêmes entrées).
//
// Limite assumée : `purge.ts` élague l'historique local au-delà de ~60 jours,
// donc un rapport « année » calculé HORS LIGNE peut sous-compter par rapport au
// serveur (qui a tout l'historique). Les appelants (Rapports/Dashboard) ne
// basculent sur ce calcul local QUE hors ligne — en ligne, le réseau (source de
// vérité, historique complet) reste prioritaire.
//
// Fichier volontairement découplé de Dexie : il n'accepte que des tableaux
// simples (formes structurelles ci-dessous), donc testable en Node sans
// IndexedDB. Les lignes `SaleRow`/`SaleItemRow`/… du miroir sont
// structurellement compatibles et se passent telles quelles.
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

// Formes minimales attendues (sous-ensembles des lignes Dexie correspondantes).
export interface SaleLike {
  id: string;
  total: number;
  cashAmount: number;
  mobileAmount: number;
  creditAmount: number;
  status: string; // 'ACTIVE' | 'CANCELLED'
  createdAt: string; // ISO
}
export interface SaleItemLike {
  saleId: string;
  name: string;
  qty: number;
  unitPrice: number;
  buyPrice: number;
  productId?: string | null;
}
export interface ExpenseLike {
  amount: number;
  occurredAt: string; // ISO
}
export interface RepaymentLike {
  amount: number;
  method?: string; // 'cash'|'mobile' (local) ou 'CASH'|'MOBILE' (serveur) — comparé insensible à la casse
  createdAt: string; // ISO (ou 'YYYY-MM-DD' rétro-daté)
}

export interface ReportInput {
  sales: readonly SaleLike[];
  items: readonly SaleItemLike[];
  expenses: readonly ExpenseLike[];
  repayments: readonly RepaymentLike[];
}

// Mêmes champs que `ReportSummary`/`ReportResult` côté serveur
// (frontend/src/lib/server/reports/compute.ts) — dupliqués ici pour ne pas
// importer un module `server-only` dans le bundle client.
export interface ReportSummary {
  revenue: number;
  sales: number;
  grossMargin: number;
  marginPct: number;
  expenses: number;
  netProfit: number;
  collectedCash: number;
  collectedMobile: number;
  creditGranted: number;
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

function inWindow(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

function computeForWindow(
  input: ReportInput,
  period: Period | 'custom',
  window: { from: Date; to: Date },
  buckets: Bucket[],
): ReportResult {
  const { from, to } = window;

  // Regroupe les lignes par vente (jointure que le serveur fait via `sale.items`).
  const itemsBySale = new Map<string, SaleItemLike[]>();
  for (const it of input.items) {
    const arr = itemsBySale.get(it.saleId);
    if (arr) arr.push(it);
    else itemsBySale.set(it.saleId, [it]);
  }

  let revenue = 0;
  let cogs = 0;
  let collectedCash = 0;
  let collectedMobile = 0;
  let creditGranted = 0;
  let salesCount = 0;
  const series = buckets.map((b) => ({ label: b.label, value: 0 }));
  const allItems: AggItem[] = [];

  for (const sale of input.sales) {
    // Les ventes annulées ne comptent ni dans le CA ni dans la marge (comme le serveur).
    if (sale.status !== 'ACTIVE') continue;
    const createdAt = new Date(sale.createdAt);
    if (!inWindow(sale.createdAt, from, to)) continue;
    salesCount++;
    revenue += sale.total;
    collectedCash += sale.cashAmount ?? 0;
    collectedMobile += sale.mobileAmount ?? 0;
    creditGranted += sale.creditAmount ?? 0;
    const idx = bucketIndexFor(buckets, createdAt);
    const slot = idx >= 0 ? series[idx] : undefined;
    if (slot) slot.value += sale.total;
    for (const it of itemsBySale.get(sale.id) ?? []) {
      cogs += it.buyPrice * it.qty;
      allItems.push({
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        productId: it.productId ?? null,
      });
    }
  }

  // Remboursements de créances reçus sur la période → argent qui entre AUSSI en
  // caisse. Isolés (repaid*) tout en s'ajoutant à l'encaissé (collected*).
  let repaidCash = 0;
  let repaidMobile = 0;
  for (const r of input.repayments) {
    if (!inWindow(r.createdAt, from, to)) continue;
    const m = (r.method ?? '').toUpperCase();
    if (m === 'CASH') repaidCash += r.amount;
    else if (m === 'MOBILE') repaidMobile += r.amount;
  }
  collectedCash += repaidCash;
  collectedMobile += repaidMobile;

  let expenses = 0;
  for (const e of input.expenses) {
    if (inWindow(e.occurredAt, from, to)) expenses += e.amount;
  }

  const grossMargin = revenue - cogs;

  return {
    period,
    range: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      revenue,
      sales: salesCount,
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

/** Rapport sur une période nommée (today/week/month/year), ancré sur `now`. */
export function computeReportLocalPeriod(
  input: ReportInput,
  period: Period,
  now: Date,
): ReportResult {
  return computeForWindow(input, period, periodRange(period, now), buildBuckets(period, now));
}

/** Rapport sur une plage de dates libre (du… au…, `to` exclusif). */
export function computeReportLocalRange(input: ReportInput, from: Date, to: Date): ReportResult {
  return computeForWindow(input, 'custom', { from, to }, buildBucketsRange(from, to));
}
