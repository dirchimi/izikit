// GET /api/repayments — liste globale des remboursements de créances (période).
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
const asMock = (fn: unknown) => fn as unknown as { mockResolvedValue: (v: unknown) => void };

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'ADMIN' as const },
};

function makeGet(qs = 'period=week'): NextRequest {
  return new NextRequest(`http://test/api/repayments?${qs}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'ADMIN' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  asMock(prismaMock.repayment.groupBy).mockResolvedValue([]);
  prismaMock.repayment.findMany.mockResolvedValue([] as never);
});

describe('GET /api/repayments', () => {
  it('agrège total + ventilation espèces/mobile et liste les remboursements', async () => {
    const now = new Date('2026-07-04T10:00:00.000Z');
    asMock(prismaMock.repayment.groupBy).mockResolvedValue([
      { method: 'CASH', _sum: { amount: 145000 }, _count: 2 },
      { method: 'MOBILE', _sum: { amount: 5000 }, _count: 1 },
    ]);
    prismaMock.repayment.findMany.mockResolvedValue([
      {
        id: 'r1',
        amount: 100000,
        method: 'CASH',
        note: '',
        createdAt: now,
        customer: { name: 'Bechir' },
      },
    ] as never);

    const res = await GET(makeGet('period=week'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cash).toBe(145000);
    expect(body.mobile).toBe(5000);
    expect(body.total).toBe(150000);
    expect(body.count).toBe(3);
    expect(body.repayments[0]).toMatchObject({
      customerName: 'Bechir',
      amount: 100000,
      method: 'cash',
    });
  });

  it('rejette une plage de dates invalide', async () => {
    const res = await GET(makeGet('from=bad&to=also-bad'));
    expect(res.status).toBe(400);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('404 sans boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
  });
});
