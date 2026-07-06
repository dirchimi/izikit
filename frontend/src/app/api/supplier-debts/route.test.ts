// Dettes fournisseurs — GET /api/supplier-debts.
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
  return new NextRequest('http://test/api/supplier-debts', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
});

describe('GET /api/supplier-debts', () => {
  it('agrège le reste dû + total, statut UI en minuscules', async () => {
    prismaMock.supplierDebt.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        label: 'Riz 50Kg',
        supplierName: 'Grossiste Ali',
        amount: 10000,
        amountPaid: 4000,
        status: 'PARTIAL',
        createdAt: new Date('2026-07-01T10:00:00Z'),
      },
      {
        id: 'd2',
        label: 'Huile 5L',
        supplierName: null,
        amount: 5000,
        amountPaid: 0,
        status: 'OPEN',
        createdAt: new Date('2026-07-02T10:00:00Z'),
      },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalOwed).toBe(11000); // (10000-4000) + 5000
    expect(body.debts[0].remaining).toBe(6000);
    expect(body.debts[0].status).toBe('partial');
    expect(body.debts[1].supplierName).toBe('');
    expect(body.debts[1].status).toBe('open');
  });

  it('exige le rôle ADMIN (info financière) — le Vendeur ne voit pas les dettes', async () => {
    mockRequireOrgRole.mockResolvedValueOnce(
      NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.supplierDebt.findMany).not.toHaveBeenCalled();
  });

  it('404 sans boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
  });
});
