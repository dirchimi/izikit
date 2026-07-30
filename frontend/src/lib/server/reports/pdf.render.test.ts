// Rendu PDF réel du rapport détaillé (non mocké) : garde-fou contre une
// régression du moteur @react-pdf/renderer (layout/fontkit) après l'ajout des
// sections encaissement + dépenses par catégorie.
import { describe, it, expect } from 'vitest';
import { renderReportPdf } from './pdf';
import type { ReportSummary } from './compute';

const summary: ReportSummary = {
  revenue: 828754,
  sales: 23,
  grossMargin: 166504,
  marginPct: 20,
  expenses: 12000,
  // 8000 de rachat de stock, compris dans expenses mais exclus du bénéfice
  // (exerce les hints conditionnels « dont achats de stock » des KPI).
  stockPurchases: 8000,
  netProfit: 162504, // 166504 − (12000 − 8000)
  collectedCash: 601454,
  collectedMobile: 0,
  creditGranted: 377300,
  repaidCash: 150000,
  repaidMobile: 0,
};

describe('renderReportPdf (rendu réel)', () => {
  it('produit un buffer PDF valide avec toutes les sections', async () => {
    const buf = await renderReportPdf({
      periodLabel: 'Cette semaine',
      rangeLabel: 'du 30 juin au 06 juil. 2026',
      generatedAt: '2026-07-06T18:00:00.000Z',
      summary,
      series: [
        { label: 'Sam', value: 795000 },
        { label: 'Dim', value: 0 },
      ],
      topProducts: [{ rank: 1, name: 'Riz 50kg', qty: 32, ca: 800000 }],
      expensesByCategory: [
        { category: 'Transport', amount: 8000 },
        { category: 'Électricité', amount: 4000 },
      ],
      org: { name: 'Boutique Amir', city: 'N’Djamena, Tchad', currency: 'FCFA' },
    });
    expect(buf.length).toBeGreaterThan(800);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('Inter'); // anti-tofu gros montants
  }, 20000);

  it('rend correctement sans dépenses par catégorie (section masquée)', async () => {
    const buf = await renderReportPdf({
      periodLabel: "Aujourd'hui",
      rangeLabel: 'du 06 juil. au 06 juil. 2026',
      generatedAt: '2026-07-06T18:00:00.000Z',
      summary: { ...summary, expenses: 0, stockPurchases: 0 },
      series: [],
      topProducts: [],
      expensesByCategory: [],
      org: { name: 'Boutique Amir', city: null, currency: 'FCFA' },
    });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 20000);
});
