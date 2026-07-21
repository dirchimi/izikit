// dashboard-adapter.ts — reproduction CLIENTE, pure, de GET /api/dashboard
// (frontend/src/app/api/dashboard/route.ts) au-dessus du miroir Dexie, pour que
// le tableau de bord s'affiche HORS LIGNE au lieu de rester vide.
//
// Réutilise `computeReportLocalPeriod` (mêmes helpers que le serveur) pour
// today/yesterday/week, et recopie fidèlement le reste (encours créances,
// alertes stock/péremption, ventes récentes). Les appelants ne l'utilisent
// QUE hors ligne — en ligne, /api/dashboard (source de vérité) reste prioritaire.
//
// Écart assumé vs serveur : le seuil d'alerte de péremption
// (`BoutiqueSettings.expiryAlertDays`) n'est pas dans le miroir → on retombe sur
// 30 jours (le même défaut que le serveur quand le réglage est absent). Si la
// boutique a personnalisé ce seuil, les alertes de péremption hors ligne
// utilisent 30 j. Purement cosmétique.
import { computeReportLocalPeriod, type ReportInput } from '@/lib/reports/compute-local';
import { computeExpiryStatus } from '@/lib/boutique/expiry';
import type {
  SaleRow,
  SaleItemRow,
  ExpenseRow,
  RepaymentRow,
  ReceivableRow,
  ProductRow,
} from './db';

export interface DashboardData {
  today: {
    revenue: number;
    sales: number;
    expenses: number;
    collectedCash: number;
    collectedMobile: number;
    creditGranted: number;
  };
  yesterday: { revenue: number; sales: number; expenses: number };
  receivablesOpen: number;
  weekly: { label: string; value: number }[];
  weekMaxRevenue: number;
  weekTodayIndex: number;
  stockAlerts: { name: string; remaining: number; critical: boolean }[];
  expiryAlerts: { name: string; daysLeft: number; expired: boolean }[];
  recentSales: {
    id: string;
    at: string;
    product: string;
    qty: number;
    total: number;
    method: string;
  }[];
}

export interface DashboardInput {
  sales: readonly SaleRow[];
  items: readonly SaleItemRow[];
  expenses: readonly ExpenseRow[];
  repayments: readonly RepaymentRow[];
  receivables: readonly ReceivableRow[];
  products: readonly ProductRow[];
}

const DEFAULT_EXPIRY_ALERT_DAYS = 30;

export function computeDashboardLocal(input: DashboardInput, now: Date): DashboardData {
  const reportInput: ReportInput = {
    sales: input.sales,
    items: input.items,
    expenses: input.expenses,
    repayments: input.repayments,
  };

  // Même ancre « hier » que le serveur : midi de la veille (évite les bascules
  // de fuseau autour de minuit pour la tendance jour/jour).
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);

  const todayR = computeReportLocalPeriod(reportInput, 'today', now);
  const yestR = computeReportLocalPeriod(reportInput, 'today', yesterday);
  const weekR = computeReportLocalPeriod(reportInput, 'week', now);

  // Encours créances : Σ (amount − amountPaid), une créance annulée ne compte plus.
  const receivablesOpen = input.receivables
    .filter((r) => r.status !== 'CANCELLED')
    .reduce((sum, r) => sum + (r.amount - r.amountPaid), 0);

  const stockAlerts = input.products
    .filter((p) => p.qty <= p.threshold)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 5)
    .map((p) => ({ name: p.name, remaining: p.qty, critical: p.qty === 0 }));

  const expiryAlerts = input.products
    .map((p) => ({
      name: p.name,
      view: computeExpiryStatus(p.expiryDate ?? null, DEFAULT_EXPIRY_ALERT_DAYS, now),
    }))
    .filter(
      (x): x is { name: string; view: { status: 'expired' | 'expiring'; daysLeft: number } } =>
        x.view !== null && x.view.status !== 'ok',
    )
    .sort((a, b) => a.view.daysLeft - b.view.daysLeft)
    .slice(0, 5)
    .map((x) => ({
      name: x.name,
      daysLeft: x.view.daysLeft,
      expired: x.view.status === 'expired',
    }));

  const weekMax = Math.max(0, ...weekR.series.map((s) => s.value));
  const weekly = weekR.series.map((s) => ({
    label: s.label,
    value: weekMax > 0 ? Math.round((s.value / weekMax) * 100) : 0,
  }));

  // Ventes récentes : 6 dernières (tous statuts, comme le serveur), plus récentes
  // d'abord. On joint les lignes localement (le serveur les a en relation).
  const itemsBySale = new Map<string, SaleItemRow[]>();
  for (const it of input.items) {
    const arr = itemsBySale.get(it.saleId);
    if (arr) arr.push(it);
    else itemsBySale.set(it.saleId, [it]);
  }
  const recentSales = [...input.sales]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((s) => {
      const its = itemsBySale.get(s.id) ?? [];
      const first = its[0]?.name ?? '—';
      const product = its.length > 1 ? `${first} +${its.length - 1}` : first;
      return {
        id: s.id,
        at: new Date(s.createdAt).toISOString(),
        product,
        qty: its.reduce((sum, it) => sum + it.qty, 0),
        total: s.total,
        method: s.method.toLowerCase(),
      };
    });

  return {
    today: {
      revenue: todayR.summary.revenue,
      sales: todayR.summary.sales,
      expenses: todayR.summary.expenses,
      collectedCash: todayR.summary.collectedCash,
      collectedMobile: todayR.summary.collectedMobile,
      creditGranted: todayR.summary.creditGranted,
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
    expiryAlerts,
    recentSales,
  };
}
