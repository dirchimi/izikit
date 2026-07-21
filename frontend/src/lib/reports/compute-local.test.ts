/**
 * compute-local.test.ts — vérifie que la reproduction CLIENTE de
 * `computeForWindow` (serveur) calcule les mêmes agrégats : CA, marge, caisse
 * miroir (encaissé/crédit), remboursements par méthode (insensible à la casse),
 * exclusion des ventes annulées, découpage du graphe, top produits.
 */
import { describe, it, expect } from 'vitest';
import {
  computeReportLocalPeriod,
  computeReportLocalRange,
  type ReportInput,
} from './compute-local';

// Ancre déterministe : mar. 21 juillet 2026, 10:00 (heure locale).
const NOW = new Date(2026, 6, 21, 10, 0, 0);
const iso = (y: number, mo: number, d: number, h = 12): string =>
  new Date(y, mo, d, h, 0, 0).toISOString();

function baseInput(): ReportInput {
  return {
    sales: [
      // 2 ventes ACTIVE aujourd'hui
      {
        id: 's1',
        total: 10000,
        cashAmount: 6000,
        mobileAmount: 0,
        creditAmount: 4000,
        status: 'ACTIVE',
        createdAt: iso(2026, 6, 21, 9),
      },
      {
        id: 's2',
        total: 5000,
        cashAmount: 5000,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'ACTIVE',
        createdAt: iso(2026, 6, 21, 8),
      },
      // Annulée aujourd'hui → exclue du CA et de la marge
      {
        id: 's3',
        total: 99999,
        cashAmount: 99999,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'CANCELLED',
        createdAt: iso(2026, 6, 21, 7),
      },
      // ACTIVE hier → hors fenêtre « today »
      {
        id: 's4',
        total: 3000,
        cashAmount: 3000,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'ACTIVE',
        createdAt: iso(2026, 6, 20, 9),
      },
    ],
    items: [
      { saleId: 's1', name: 'Riz', qty: 2, unitPrice: 5000, buyPrice: 3000, productId: 'p1' },
      { saleId: 's2', name: 'Sucre', qty: 1, unitPrice: 5000, buyPrice: 4000, productId: 'p2' },
      { saleId: 's3', name: 'Fantôme', qty: 9, unitPrice: 11111, buyPrice: 0, productId: 'p9' },
      { saleId: 's4', name: 'Riz', qty: 1, unitPrice: 3000, buyPrice: 2000, productId: 'p1' },
    ],
    expenses: [
      { amount: 2000, occurredAt: iso(2026, 6, 21, 11) },
      { amount: 500, occurredAt: iso(2026, 6, 20, 11) }, // hier → exclue
    ],
    repayments: [
      { amount: 1500, method: 'cash', createdAt: iso(2026, 6, 21, 10) },
      { amount: 700, method: 'mobile', createdAt: iso(2026, 6, 21, 10) },
      { amount: 300, method: 'CASH', createdAt: iso(2026, 6, 21, 10) }, // casse serveur
      { amount: 999, method: 'cash', createdAt: iso(2026, 6, 20, 10) }, // hier → exclu
    ],
  };
}

describe('computeReportLocalPeriod — today', () => {
  const r = computeReportLocalPeriod(baseInput(), 'today', NOW);

  it('CA et nombre de ventes ignorent les annulées et les hors-fenêtre', () => {
    expect(r.summary.revenue).toBe(15000);
    expect(r.summary.sales).toBe(2);
  });

  it('marge brute = CA − COGS (lignes des ventes ACTIVE de la fenêtre)', () => {
    // COGS = 2×3000 + 1×4000 = 10000 ; marge = 15000 − 10000
    expect(r.summary.grossMargin).toBe(5000);
    expect(r.summary.marginPct).toBe(33); // round(5000/15000*100)
  });

  it('encaissé = parts espèces/mobile des ventes + remboursements (casse ignorée)', () => {
    // cash ventes 6000+5000=11000 ; repaid cash 1500+300=1800 → 12800
    expect(r.summary.collectedCash).toBe(12800);
    expect(r.summary.collectedMobile).toBe(700); // 0 ventes + 700 repaid
    expect(r.summary.repaidCash).toBe(1800);
    expect(r.summary.repaidMobile).toBe(700);
    expect(r.summary.creditGranted).toBe(4000);
  });

  it('dépenses et bénéfice net sur la fenêtre', () => {
    expect(r.summary.expenses).toBe(2000);
    expect(r.summary.netProfit).toBe(3000); // 5000 − 2000
  });

  it('série « today » = 1 barre = CA du jour', () => {
    expect(r.series).toHaveLength(1);
    expect(r.series[0]?.value).toBe(15000);
  });

  it('top produits classés par CA, produit fantôme (vente annulée) exclu', () => {
    expect(r.topProducts).toEqual([
      { rank: 1, name: 'Riz', qty: 2, ca: 10000 },
      { rank: 2, name: 'Sucre', qty: 1, ca: 5000 },
    ]);
  });
});

describe('computeReportLocalPeriod — week', () => {
  it('découpe en 7 barres et place chaque vente dans son jour', () => {
    const r = computeReportLocalPeriod(baseInput(), 'week', NOW);
    expect(r.series).toHaveLength(7);
    // Dernière barre = aujourd'hui = 15000 ; avant-dernière = hier = 3000.
    expect(r.series[6]?.value).toBe(15000);
    expect(r.series[5]?.value).toBe(3000);
    // CA de la semaine inclut hier (les 2 ventes du jour + celle d'hier).
    expect(r.summary.revenue).toBe(18000);
    expect(r.summary.sales).toBe(3);
  });
});

describe('computeReportLocalRange', () => {
  it('agrège sur une plage libre [from, to] (to exclusif = lendemain)', () => {
    // Plage = uniquement hier → seule la vente s4 (3000).
    const from = new Date(2026, 6, 20);
    const to = new Date(2026, 6, 21);
    const r = computeReportLocalRange(baseInput(), from, to);
    expect(r.period).toBe('custom');
    expect(r.summary.revenue).toBe(3000);
    expect(r.summary.sales).toBe(1);
  });

  it('CA nul → marginPct = 0 (pas de division par zéro)', () => {
    const empty: ReportInput = { sales: [], items: [], expenses: [], repayments: [] };
    const r = computeReportLocalRange(empty, new Date(2026, 6, 1), new Date(2026, 6, 2));
    expect(r.summary.revenue).toBe(0);
    expect(r.summary.marginPct).toBe(0);
    expect(r.topProducts).toEqual([]);
  });
});
