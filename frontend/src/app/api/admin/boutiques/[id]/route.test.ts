// GET /api/admin/boutiques/[id] — fiche détail.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

const FUTURE = new Date('2999-01-01T00:00:00Z');

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/boutiques/org1', { method: 'GET' });
}
function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// Valeurs neutres pour les 6 requêtes autres que organization.findUnique.
function stubAggregates() {
  prismaMock.subscriptionPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } } as never);
  prismaMock.sale.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: 0 } as never);
  prismaMock.receivable.aggregate.mockResolvedValue({
    _sum: { amount: 0, amountPaid: 0 },
  } as never);
  prismaMock.organizationMember.findMany.mockResolvedValue([] as never);
  prismaMock.subscriptionPayment.findMany.mockResolvedValue([] as never);
  prismaMock.sale.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  stubAggregates();
});

describe('/api/admin/boutiques/[id] — detail', () => {
  it('404 BOUTIQUE_NOT_FOUND when the org does not exist', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGet(), paramsOf('missing'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('BOUTIQUE_NOT_FOUND');
  });

  it('returns owner, settings, derived subscription, stats, team, payments and sales', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org1',
      name: 'Chez Ali',
      slug: 'chez-ali',
      plan: 'BOUTIQUE',
      trialEndsAt: null,
      currentPeriodEnd: FUTURE,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      owner: { id: 'u_owner', name: 'Ali Sow', email: 'ali@test.local' },
      settings: {
        phone: '90000000',
        city: "N'Djamena",
        address: 'Av. Charles',
        country: 'TD',
        currency: 'XAF',
        businessType: 'alimentation',
      },
      _count: { members: 2, products: 37 },
    } as never);
    prismaMock.subscriptionPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 45000 },
    } as never);
    prismaMock.sale.aggregate.mockResolvedValueOnce({
      _sum: { total: 120000 },
      _count: 8,
    } as never);
    prismaMock.receivable.aggregate.mockResolvedValueOnce({
      _sum: { amount: 30000, amountPaid: 10000 },
    } as never);
    // Membres volontairement dans le désordre pour vérifier le tri OWNER→MEMBER.
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([
      {
        id: 'm2',
        role: 'MEMBER',
        createdAt: new Date(),
        user: { id: 'u2', name: 'Vendeur', email: 'v@t.l' },
      },
      {
        id: 'm1',
        role: 'OWNER',
        createdAt: new Date(),
        user: { id: 'u_owner', name: 'Ali Sow', email: 'ali@test.local' },
      },
    ] as never);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
      {
        id: 'sp1',
        plan: 'BOUTIQUE',
        amount: 15000,
        method: 'CASH',
        months: 1,
        status: 'CONFIRMED',
        periodEnd: FUTURE,
        note: null,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    ] as never);
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        number: '0001',
        total: 5000,
        method: 'CASH',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ] as never);

    const res = await GET(makeGet(), paramsOf('org1'));
    expect(res.status).toBe(200);
    const { boutique } = (await res.json()) as { boutique: Record<string, unknown> };
    expect(boutique).toMatchObject({
      id: 'org1',
      name: 'Chez Ali',
      owner: { name: 'Ali Sow', email: 'ali@test.local' },
      subscription: { plan: 'BOUTIQUE', status: 'ACTIVE' },
      stats: {
        collected: 45000,
        salesTotal: 120000,
        salesCount: 8,
        receivablesOpen: 20000, // 30000 - 10000
        sellers: 2,
        products: 37,
      },
    });
    // Team sorted OWNER first.
    const members = (boutique as { members: Array<{ role: string }> }).members;
    expect(members.map((m) => m.role)).toEqual(['OWNER', 'MEMBER']);
    expect((boutique as { payments: unknown[] }).payments).toHaveLength(1);
    expect((boutique as { recentSales: unknown[] }).recentSales).toHaveLength(1);
  });

  it('propagates 403 from requireAdmin without querying', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet(), paramsOf('org1'));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });
});
