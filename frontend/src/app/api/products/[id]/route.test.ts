// Phase 2 — PATCH + DELETE /api/products/[id].
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { PATCH, DELETE } from './route';

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
function makeReq(method: 'PATCH' | 'DELETE', body?: unknown, csrf: 'match' | 'missing' = 'match') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return body === undefined
    ? new NextRequest('http://test/api/products/p1', { method, headers })
    : new NextRequest('http://test/api/products/p1', {
        method,
        headers,
        body: JSON.stringify(body),
      });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
});

describe('PATCH /api/products/[id]', () => {
  it('met à jour les métadonnées → 200', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({ organizationId: 'org1' } as never);
    prismaMock.product.update.mockResolvedValueOnce({
      id: 'p1',
      ref: 'P-1',
      name: 'Riz parfumé',
      category: 'Alim',
      buyPrice: 4200,
      sellPrice: 6500,
      qty: 4,
      threshold: 6,
    } as never);
    const res = await PATCH(
      makeReq('PATCH', { sellPrice: 6500, name: 'Riz parfumé' }),
      params('p1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product.sellPrice).toBe(6500);
    expect(body.product.status).toBe('low');
  });

  it('404 si produit hors boutique', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({ organizationId: 'autre' } as never);
    const res = await PATCH(makeReq('PATCH', { name: 'X' }), params('p1'));
    expect(res.status).toBe(404);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('403 sans CSRF', async () => {
    const res = await PATCH(makeReq('PATCH', { name: 'X' }, 'missing'), params('p1'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/products/[id]', () => {
  it('supprime → 200', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({ organizationId: 'org1' } as never);
    prismaMock.product.delete.mockResolvedValueOnce({ id: 'p1' } as never);
    const res = await DELETE(makeReq('DELETE'), params('p1'));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('404 si produit hors boutique', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({ organizationId: 'autre' } as never);
    const res = await DELETE(makeReq('DELETE'), params('p1'));
    expect(res.status).toBe(404);
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
  });

  it('exige le rôle ADMIN (Manager) pour supprimer', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({ organizationId: 'org1' } as never);
    prismaMock.product.delete.mockResolvedValueOnce({ id: 'p1' } as never);
    await DELETE(makeReq('DELETE'), params('p1'));
    expect(mockRequireOrgRole).toHaveBeenCalledWith('org1', 'ADMIN');
  });
});
