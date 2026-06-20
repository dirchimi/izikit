// Phase 4 — GET /api/receivables (vue débiteurs agrégée).
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

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/receivables', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
});

describe('GET /api/receivables', () => {
  it('agrège les créances par client (debt, repaid, totalCredit, history)', async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'Moussa',
        phone: '90 00 00 00',
        createdAt: new Date('2026-06-01T08:00:00Z'),
        receivables: [
          {
            id: 'r1',
            amount: 10000,
            amountPaid: 4000,
            status: 'PARTIAL',
            createdAt: new Date('2026-06-10T10:00:00Z'),
            sale: { items: [{ name: 'Riz' }, { name: 'Eau' }] },
          },
          {
            id: 'r2',
            amount: 5000,
            amountPaid: 0,
            status: 'OPEN',
            createdAt: new Date('2026-06-12T10:00:00Z'),
            sale: { items: [{ name: 'Sucre' }] },
          },
        ],
      },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.debtors).toHaveLength(1);
    const d = body.debtors[0];
    expect(d.debt).toBe(11000); // (10000-4000) + (5000-0)
    expect(d.repaid).toBe(4000);
    expect(d.totalCredit).toBe(15000);
    // historique le plus récent en premier, libellé multi-articles condensé
    expect(d.history[0].id).toBe('r2');
    expect(d.history[1].label).toBe('Riz +1');
    expect(d.history[1].status).toBe('partial');
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});
