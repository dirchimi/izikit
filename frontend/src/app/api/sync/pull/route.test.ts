// Task 1.2 — GET /api/sync/pull tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
  requireOrgRole: vi.fn(),
}));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({
  getPrimaryMembership: vi.fn(),
}));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'MEMBER' as const },
};

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/sync/pull${qs}`, { method: 'GET' });
}

function emptyFindManyMocks(): void {
  prismaMock.product.findMany.mockResolvedValue([]);
  prismaMock.customer.findMany.mockResolvedValue([]);
  prismaMock.sale.findMany.mockResolvedValue([]);
  prismaMock.receivable.findMany.mockResolvedValue([]);
  prismaMock.expense.findMany.mockResolvedValue([]);
  prismaMock.document.findMany.mockResolvedValue([]);
  prismaMock.stockMovement.findMany.mockResolvedValue([]);
  prismaMock.repayment.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'MEMBER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  emptyFindManyMocks();
});

describe('GET /api/sync/pull', () => {
  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('404 sans boutique (pas de membership → pas de fuite cross-org)', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
  });

  it('403/404 selon requireOrgRole si hors org', async () => {
    mockRequireOrgRole.mockResolvedValueOnce(
      NextResponse.json({ error: 'Organization not found' }, { status: 404 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('sans since → renvoie tout, where scopé org sans filtre updatedAt', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        products: [],
        customers: [],
        sales: [],
        receivables: [],
        expenses: [],
        documents: [],
        stockMovements: [],
        repayments: [],
      }),
    );
    expect(typeof body.serverTime).toBe('string');
    expect(Number.isNaN(new Date(body.serverTime).getTime())).toBe(false);

    for (const model of [
      prismaMock.product,
      prismaMock.customer,
      prismaMock.receivable,
      prismaMock.expense,
      prismaMock.document,
      prismaMock.stockMovement,
      prismaMock.repayment,
    ]) {
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org1' } }),
      );
    }
    expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1' } }),
    );
  });

  it('avec since → filtre updatedAt > since + scope org sur les 7 modèles', async () => {
    const since = '2026-07-01T00:00:00.000Z';
    const res = await GET(makeGet(`?since=${encodeURIComponent(since)}`));
    expect(res.status).toBe(200);

    const expectedWhere = {
      organizationId: 'org1',
      updatedAt: { gt: new Date(since) },
    };
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, include: { items: true } }),
    );
    expect(prismaMock.receivable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prismaMock.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(prismaMock.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
  });

  it('avec since → repayments filtré sur createdAt (pas updatedAt) + scope org (Task 5.2)', async () => {
    const since = '2026-07-01T00:00:00.000Z';
    const res = await GET(makeGet(`?since=${encodeURIComponent(since)}`));
    expect(res.status).toBe(200);

    expect(prismaMock.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1', createdAt: { gt: new Date(since) } },
      }),
    );
  });

  it('renvoie les repayments de la boutique de l’appelant (Task 5.2 — pas de fuite cross-org)', async () => {
    prismaMock.repayment.findMany.mockResolvedValueOnce([
      {
        id: 'rp1',
        organizationId: 'org1',
        customerId: 'c1',
        amount: 1000,
        method: 'CASH',
        note: null,
        createdById: 'user-1',
        clientOpId: null,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.repayments).toHaveLength(1);
    expect(body.repayments[0].id).toBe('rp1');
    expect(prismaMock.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1' } }),
    );
  });

  it('renvoie orgId (Task 5.1 — boutique de l’appelant, pour meta.orgId côté client)', async () => {
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.orgId).toBe('org1');
  });

  it('ne renvoie que les lignes du membre — where scopé sur son organizationId (pas une autre org)', async () => {
    mockPrimary.mockResolvedValueOnce({ organizationId: 'org-other', role: 'MEMBER' });
    await GET(makeGet());
    expect(mockRequireOrgRole).toHaveBeenCalledWith('org-other', 'MEMBER');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-other' } }),
    );
    expect(prismaMock.repayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-other' } }),
    );
  });

  it('400 INVALID_SINCE si since n’est pas une date ISO valide', async () => {
    const res = await GET(makeGet('?since=not-a-date'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_SINCE');
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('inclut les saleItems imbriqués dans chaque vente', async () => {
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        organizationId: 'org1',
        number: 'V-0001',
        items: [{ id: 'i1', saleId: 's1', name: 'Riz', qty: 2, unitPrice: 500, buyPrice: 400 }],
      },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.sales[0].items).toHaveLength(1);
    expect(body.sales[0].items[0].name).toBe('Riz');
  });
});
