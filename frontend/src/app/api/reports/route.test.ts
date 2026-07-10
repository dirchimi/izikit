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
    prismaMock.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 4000 } } as never);
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
    expect(body.summary.netProfit).toBe(-400); // 3600 − 4000
    // Caisse miroir : espèces = 8000 (vente) + 1000 (remboursement) = 9000 ;
    // mobile = 2500 ; crédit accordé = 3000 (non encaissé).
    expect(body.summary.collectedCash).toBe(9000);
    expect(body.summary.collectedMobile).toBe(2500);
    expect(body.summary.creditGranted).toBe(3000);
    expect(body.topProducts[0].name).toBe('Riz'); // CA 12000 > Eau 1500
    expect(body.topProducts[0].ca).toBe(12000);
    expect(Array.isArray(body.series)).toBe(true);
  });

  it('période invalide retombe sur week', async () => {
    prismaMock.sale.findMany.mockResolvedValueOnce([] as never);
    prismaMock.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: null } } as never);
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
