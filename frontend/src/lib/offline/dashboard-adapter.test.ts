/**
 * dashboard-adapter.test.ts — vérifie la reproduction CLIENTE de
 * GET /api/dashboard : KPI du jour, encours créances (annulées exclues),
 * alertes stock (rupture d'abord) et péremption (plus urgent d'abord), mini-
 * graphe hebdo normalisé, et ventes récentes (plus récentes d'abord).
 */
import { describe, it, expect } from 'vitest';
import { computeDashboardLocal, type DashboardInput } from './dashboard-adapter';
import type {
  SaleRow,
  SaleItemRow,
  ExpenseRow,
  RepaymentRow,
  ReceivableRow,
  ProductRow,
} from './db';

const NOW = new Date(2026, 6, 21, 10, 0, 0);
const iso = (y: number, mo: number, d: number, h = 12): string =>
  new Date(y, mo, d, h, 0, 0).toISOString();

function sale(p: Partial<SaleRow> & { id: string }): SaleRow {
  return {
    organizationId: 'org',
    number: p.id,
    method: 'CASH',
    total: 0,
    discount: 0,
    cashAmount: 0,
    mobileAmount: 0,
    creditAmount: 0,
    status: 'ACTIVE',
    createdAt: iso(2026, 6, 21, 9),
    ...p,
  };
}
function item(p: Partial<SaleItemRow> & { id: string; saleId: string }): SaleItemRow {
  return { name: 'X', qty: 1, unitPrice: 0, buyPrice: 0, ...p };
}
function product(p: Partial<ProductRow> & { id: string; name: string }): ProductRow {
  return {
    organizationId: 'org',
    ref: p.id,
    category: 'div',
    buyPrice: 0,
    sellPrice: 0,
    prixGros: 0,
    unite: 'u',
    qty: 100,
    threshold: 5,
    updatedAt: iso(2026, 6, 1),
    ...p,
  };
}

function input(): DashboardInput {
  const sales: SaleRow[] = [
    sale({
      id: 's1',
      total: 10000,
      cashAmount: 6000,
      creditAmount: 4000,
      method: 'MIXED',
      createdAt: iso(2026, 6, 21, 9),
    }),
    sale({ id: 's2', total: 5000, cashAmount: 5000, createdAt: iso(2026, 6, 21, 8) }),
  ];
  const items: SaleItemRow[] = [
    item({ id: 'i1', saleId: 's1', name: 'Riz', qty: 2, unitPrice: 5000, buyPrice: 3000 }),
    item({ id: 'i2', saleId: 's2', name: 'Sucre', qty: 1, unitPrice: 5000, buyPrice: 4000 }),
  ];
  const expenses: ExpenseRow[] = [
    {
      id: 'e1',
      organizationId: 'org',
      number: 'e1',
      label: 'Loyer',
      category: 'div',
      amount: 2000,
      occurredAt: iso(2026, 6, 21, 11),
      createdAt: iso(2026, 6, 21, 11),
    },
  ];
  const repayments: RepaymentRow[] = [];
  const receivables: ReceivableRow[] = [
    {
      id: 'r1',
      organizationId: 'org',
      customerId: 'c1',
      amount: 10000,
      amountPaid: 3000,
      status: 'OPEN',
      updatedAt: iso(2026, 6, 20),
    },
    {
      id: 'r2',
      organizationId: 'org',
      customerId: 'c2',
      amount: 5000,
      amountPaid: 5000,
      status: 'PAID',
      updatedAt: iso(2026, 6, 20),
    },
    {
      id: 'r3',
      organizationId: 'org',
      customerId: 'c3',
      amount: 9999,
      amountPaid: 0,
      status: 'CANCELLED',
      updatedAt: iso(2026, 6, 20),
    },
  ];
  const products: ProductRow[] = [
    product({ id: 'p1', name: 'Riz', qty: 0, threshold: 5 }), // rupture
    product({ id: 'p2', name: 'Sucre', qty: 3, threshold: 5 }), // sous seuil
    product({ id: 'p3', name: 'Eau', qty: 50, threshold: 5 }), // ok
    product({ id: 'p4', name: 'Lait', qty: 10, threshold: 5, expiryDate: iso(2026, 6, 23) }), // périme bientôt
    product({ id: 'p5', name: 'Yaourt', qty: 10, threshold: 5, expiryDate: iso(2026, 6, 10) }), // périmé
  ];
  return { sales, items, expenses, repayments, receivables, products };
}

describe('computeDashboardLocal', () => {
  const d = computeDashboardLocal(input(), NOW);

  it('KPI du jour (CA, ventes, dépenses, caisse miroir)', () => {
    expect(d.today.revenue).toBe(15000);
    expect(d.today.sales).toBe(2);
    expect(d.today.expenses).toBe(2000);
    expect(d.today.collectedCash).toBe(11000);
    expect(d.today.creditGranted).toBe(4000);
  });

  it('encours créances = Σ(amount − amountPaid), annulées exclues', () => {
    expect(d.receivablesOpen).toBe(7000); // 7000 + 0, la CANCELLED exclue
  });

  it('alertes stock : sous le seuil, rupture d’abord (max 5)', () => {
    expect(d.stockAlerts).toEqual([
      { name: 'Riz', remaining: 0, critical: true },
      { name: 'Sucre', remaining: 3, critical: false },
    ]);
  });

  it('alertes péremption : périmé/bientôt, plus urgent d’abord', () => {
    expect(d.expiryAlerts.map((a) => a.name)).toEqual(['Yaourt', 'Lait']);
    expect(d.expiryAlerts[0]?.expired).toBe(true);
    expect(d.expiryAlerts[1]?.expired).toBe(false);
  });

  it('mini-graphe hebdo : 7 barres, aujourd’hui = 100 (normalisé au max)', () => {
    expect(d.weekly).toHaveLength(7);
    expect(d.weekTodayIndex).toBe(6);
    expect(d.weekMaxRevenue).toBe(15000);
    expect(d.weekly[6]?.value).toBe(100);
  });

  it('ventes récentes : plus récentes d’abord, libellé produit + quantité', () => {
    expect(d.recentSales[0]?.id).toBe('s1');
    expect(d.recentSales[0]?.product).toBe('Riz');
    expect(d.recentSales[0]?.qty).toBe(2);
    expect(d.recentSales[0]?.method).toBe('mixed');
    expect(d.recentSales[1]?.id).toBe('s2');
  });
});
