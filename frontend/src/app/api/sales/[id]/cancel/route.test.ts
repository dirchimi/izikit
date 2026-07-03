// POST /api/sales/[id]/cancel — annulation de vente (LOT 1).
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
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const adminGate = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'ADMIN' as const },
};

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function makeReq(csrf: 'match' | 'missing' = 'match'): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/sales/s1/cancel', { method: 'POST', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'ADMIN' });
  mockRequireOrgRole.mockResolvedValue(adminGate);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('POST /api/sales/[id]/cancel', () => {
  it('exige le rôle ADMIN (Manager) — pas un simple Vendeur', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0001',
      status: 'ACTIVE',
      items: [],
      receivable: null,
    } as never);
    await POST(makeReq(), params('s1'));
    expect(mockRequireOrgRole).toHaveBeenCalledWith('org1', 'ADMIN');
  });

  it('annule une vente à crédit : re-crédite le stock, annule la créance, marque CANCELLED → 200', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0007',
      status: 'ACTIVE',
      items: [
        { productId: 'p1', qty: 2 },
        { productId: 'p2', qty: 3 },
      ],
      receivable: { id: 'r1' },
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.receivable.update.mockResolvedValueOnce({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sale.status).toBe('CANCELLED');

    // stock ré-incrémenté par ligne
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { qty: { increment: 2 } } }),
    );
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p2' }, data: { qty: { increment: 3 } } }),
    );
    // mouvement IN de traçabilité
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'IN', delta: 2, productId: 'p1' }),
      }),
    );
    // créance annulée
    expect(prismaMock.receivable.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { status: 'CANCELLED' } }),
    );
    // vente marquée annulée, non supprimée
    expect(prismaMock.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'CANCELLED', cancelledById: 'user-1' }),
      }),
    );
    expect(prismaMock.sale.delete).not.toHaveBeenCalled();
  });

  it('vente au comptant (sans créance) : ne touche aucune créance', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0008',
      status: 'ACTIVE',
      items: [{ productId: 'p1', qty: 1 }],
      receivable: null,
    } as never);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1' }] as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    expect(prismaMock.receivable.update).not.toHaveBeenCalled();
  });

  it('ligne dont le produit a été supprimé (productId null) : ignorée, pas de re-crédit', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0009',
      status: 'ACTIVE',
      items: [{ productId: null, qty: 4 }],
      receivable: null,
    } as never);
    prismaMock.sale.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(200);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(prismaMock.stockMovement.create).not.toHaveBeenCalled();
  });

  it('409 si la vente est déjà annulée (pas de double re-crédit)', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      number: 'V-0001',
      status: 'CANCELLED',
      items: [{ productId: 'p1', qty: 2 }],
      receivable: null,
    } as never);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('SALE_ALREADY_CANCELLED');
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('404 si la vente est hors boutique', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce({
      organizationId: 'autre-org',
      number: 'V-0001',
      status: 'ACTIVE',
      items: [],
      receivable: null,
    } as never);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(404);
  });

  it('404 si la vente est introuvable', async () => {
    prismaMock.sale.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(404);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makeReq('missing'), params('s1'));
    expect(res.status).toBe(403);
  });

  it('404 sans boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(404);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await POST(makeReq(), params('s1'));
    expect(res.status).toBe(401);
  });
});
