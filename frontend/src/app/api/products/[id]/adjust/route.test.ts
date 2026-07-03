// Phase 2 — POST /api/products/[id]/adjust.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/products/p1/adjust', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'tok', cookie: 'app-csrf=tok' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('POST /api/products/[id]/adjust', () => {
  it('entrée de stock (delta > 0) → 200 + mouvement IN', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      qty: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);
    prismaMock.product.update.mockResolvedValueOnce({
      id: 'p1',
      ref: 'P-1',
      name: 'Riz',
      category: 'Alim',
      buyPrice: 4200,
      sellPrice: 6000,
      qty: 10,
      threshold: 5,
    } as never);
    const res = await POST(makePost({ delta: 6 }), params('p1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product.qty).toBe(10);
    expect(body.product.status).toBe('ok');
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'IN', delta: 6 }) }),
    );
  });

  it('409 INSUFFICIENT_STOCK si la sortie passe sous 0', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      qty: 2,
    } as never);
    const res = await POST(makePost({ delta: -5 }), params('p1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INSUFFICIENT_STOCK');
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('404 si produit hors boutique', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({
      organizationId: 'autre',
      qty: 9,
    } as never);
    const res = await POST(makePost({ delta: 1 }), params('p1'));
    expect(res.status).toBe(404);
  });

  it('400 si delta = 0', async () => {
    const res = await POST(makePost({ delta: 0 }), params('p1'));
    expect(res.status).toBe(400);
  });

  it('exige le rôle ADMIN (Manager) — le Vendeur ne réapprovisionne pas', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      qty: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);
    prismaMock.product.update.mockResolvedValueOnce({
      id: 'p1',
      ref: 'P-1',
      name: 'Riz',
      category: 'Alim',
      buyPrice: 4200,
      sellPrice: 6000,
      qty: 10,
      threshold: 5,
    } as never);
    await POST(makePost({ delta: 6 }), params('p1'));
    expect(mockRequireOrgRole).toHaveBeenCalledWith('org1', 'ADMIN');
  });
});
