// Phase 7 — GET /api/reports (agrégation ventes + dépenses).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeGet(period = 'month'): NextRequest {
  return new NextRequest(`http://test/api/reports?period=${period}`, { method: 'GET' });
}

const asMock = (fn: unknown) => fn as unknown as { mockResolvedValue: (v: unknown) => void };

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  // Remboursements de créances (caisse miroir) — vide par défaut.
  asMock(prismaMock.repayment.groupBy).mockResolvedValue([]);
});

describe('GET /api/reports', () => {
  it('agrège CA, marge (instantané buyPrice), dépenses, bénéfice net + top produits', async () => {
    const now = new Date();
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        total: 13500,
        // Vente mixte : 8000 espèces + 2500 mobile + 3000 crédit = 13500.
        cashAmount: 8000,
        mobileAmount: 2500,
        creditAmount: 3000,
        createdAt: now,
        items: [
          { name: 'Riz', qty: 2, unitPrice: 6000, buyPrice: 4500, productId: 'p1' },
          { name: 'Eau', qty: 3, unitPrice: 500, buyPrice: 300, productId: 'p2' },
        ],
      },
    ] as never);
    // Dépenses par catégorie : 4000 de charges (aucun achat de stock).
    asMock(prismaMock.expense.groupBy).mockResolvedValue([
      { category: 'Loyer', _sum: { amount: 4000 } },
    ]);
    // Un remboursement de créance : 1000 en espèces → entre aussi dans l'encaissé.
    asMock(prismaMock.repayment.groupBy).mockResolvedValue([
      { method: 'CASH', _sum: { amount: 1000 } },
    ]);

    const res = await GET(makeGet('month'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // CA = 13500 ; COGS = 2×4500 + 3×300 = 9900 ; marge = 3600
    expect(body.summary.revenue).toBe(13500);
    expect(body.summary.sales).toBe(1);
    expect(body.summary.grossMargin).toBe(3600);
    expect(body.summary.marginPct).toBe(27); // round(3600/13500*100)
    expect(body.summary.expenses).toBe(4000);
    expect(body.summary.stockPurchases).toBe(0);
    expect(body.summary.netProfit).toBe(-400); // 3600 − 4000
    // Caisse miroir : espèces = 8000 (vente) + 1000 (remboursement) = 9000 ;
    // mobile = 2500 ; crédit accordé = 3000 (non encaissé).
    expect(body.summary.collectedCash).toBe(9000);
    expect(body.summary.collectedMobile).toBe(2500);
    expect(body.summary.creditGranted).toBe(3000);
    // Remboursements isolés (compris dans collectedCash).
    expect(body.summary.repaidCash).toBe(1000);
    expect(body.summary.repaidMobile).toBe(0);
    // Classement par quantité vendue : Eau (3 unités, CA 1500) devant
    // Riz (2 unités, CA 12000) — la rotation prime sur la valeur.
    expect(body.topProducts[0].name).toBe('Eau');
    expect(body.topProducts[0].qty).toBe(3);
    expect(body.topProducts[1].name).toBe('Riz');
    expect(body.topProducts[1].ca).toBe(12000);
    expect(Array.isArray(body.series)).toBe(true);
  });

  it('les achats de stock restent dans les dépenses mais pas dans le bénéfice', async () => {
    const now = new Date();
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        total: 12000,
        cashAmount: 12000,
        mobileAmount: 0,
        creditAmount: 0,
        createdAt: now,
        // COGS = 10000 : le coût du stock vendu est DÉJÀ compté ici.
        items: [{ name: 'Riz', qty: 1, unitPrice: 12000, buyPrice: 10000, productId: 'p1' }],
      },
    ] as never);
    // Le commerçant a aussi noté son rachat de stock en dépense (10000) + un loyer (1500).
    asMock(prismaMock.expense.groupBy).mockResolvedValue([
      { category: 'Stock', _sum: { amount: 10000 } },
      { category: 'Loyer', _sum: { amount: 1500 } },
    ]);

    const res = await GET(makeGet('month'));
    const body = await res.json();
    // Dépenses totales (argent sorti) : 11500, dont 10000 de stock.
    expect(body.summary.expenses).toBe(11500);
    expect(body.summary.stockPurchases).toBe(10000);
    // Bénéfice : marge 2000 − loyer 1500 = 500 — le stock n'est PAS re-soustrait
    // (sinon −9500 : le riz serait payé deux fois).
    expect(body.summary.grossMargin).toBe(2000);
    expect(body.summary.netProfit).toBe(500);
  });

  it('période invalide retombe sur week', async () => {
    prismaMock.sale.findMany.mockResolvedValueOnce([] as never);
    asMock(prismaMock.expense.groupBy).mockResolvedValue([]);
    const res = await GET(makeGet('bogus'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe('week');
    expect(body.summary.revenue).toBe(0);
    expect(body.summary.expenses).toBe(0);
    expect(body.series).toHaveLength(7);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});
