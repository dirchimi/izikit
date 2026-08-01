// Dettes fournisseurs — DELETE /api/supplier-debts/[id] (suppression d'une
// dette saisie par erreur ou restée après la suppression du produit lié).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeDelete(opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = {};
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/supplier-debts/d1', { method: 'DELETE', headers });
}
const params = { params: Promise.resolve({ id: 'd1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
});

describe('DELETE /api/supplier-debts/[id]', () => {
  it('supprime la dette de la boutique courante (scopé org)', async () => {
    prismaMock.supplierDebt.deleteMany.mockResolvedValueOnce({ count: 1 } as never);

    const res = await DELETE(makeDelete(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(prismaMock.supplierDebt.deleteMany).toHaveBeenCalledWith({
      where: { id: 'd1', organizationId: 'org1' },
    });
  });

  it("404 si la dette n'existe pas OU appartient à une autre boutique (pas de fuite)", async () => {
    prismaMock.supplierDebt.deleteMany.mockResolvedValueOnce({ count: 0 } as never);

    const res = await DELETE(makeDelete(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('DEBT_NOT_FOUND');
  });

  it('403 sans jeton CSRF', async () => {
    const res = await DELETE(makeDelete({ csrf: 'missing' }), params);
    expect(res.status).toBe(403);
    expect(prismaMock.supplierDebt.deleteMany).not.toHaveBeenCalled();
  });

  it('respecte le gate de rôle (ADMIN min) — un Vendeur est refusé', async () => {
    mockRequireOrgRole.mockResolvedValueOnce(
      NextResponse.json({ error: 'ORG_ROLE_INSUFFICIENT' }, { status: 403 }),
    );
    const res = await DELETE(makeDelete(), params);
    expect(res.status).toBe(403);
    expect(prismaMock.supplierDebt.deleteMany).not.toHaveBeenCalled();
  });
});
