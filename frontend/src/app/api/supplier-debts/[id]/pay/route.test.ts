// Dettes fournisseurs — POST /api/supplier-debts/[id]/pay.
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

function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/supplier-debts/d1/pay', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'd1' }) };

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

describe('POST /api/supplier-debts/[id]/pay', () => {
  it('paiement partiel → statut PARTIAL, reste mis à jour', async () => {
    prismaMock.supplierDebt.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      amount: 10000,
      amountPaid: 0,
      status: 'OPEN',
    } as never);
    prismaMock.supplierDebt.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ amount: 4000 }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(4000);
    expect(body.remaining).toBe(6000);
    expect(body.status).toBe('PARTIAL');
    expect(prismaMock.supplierDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountPaid: 4000, status: 'PARTIAL' } }),
    );
  });

  it('paiement soldeur → borné au reste dû, statut PAID', async () => {
    prismaMock.supplierDebt.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      amount: 10000,
      amountPaid: 6000,
      status: 'PARTIAL',
    } as never);
    prismaMock.supplierDebt.update.mockResolvedValueOnce({} as never);

    // On tente 999999 mais il ne reste que 4000 → appliqué 4000, soldé.
    const res = await POST(makePost({ amount: 999999 }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(4000);
    expect(body.remaining).toBe(0);
    expect(body.status).toBe('PAID');
    expect(prismaMock.supplierDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amountPaid: 10000, status: 'PAID' } }),
    );
  });

  it('404 si la dette n’est pas de la boutique', async () => {
    prismaMock.supplierDebt.findUnique.mockResolvedValueOnce({
      organizationId: 'autre',
      amount: 5000,
      amountPaid: 0,
      status: 'OPEN',
    } as never);
    const res = await POST(makePost({ amount: 1000 }), params);
    expect(res.status).toBe(404);
    expect(prismaMock.supplierDebt.update).not.toHaveBeenCalled();
  });

  it('409 si la dette est déjà soldée', async () => {
    prismaMock.supplierDebt.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      amount: 5000,
      amountPaid: 5000,
      status: 'PAID',
    } as never);
    const res = await POST(makePost({ amount: 1000 }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_PAID');
  });

  it('400 si montant non positif', async () => {
    const res = await POST(makePost({ amount: 0 }), params);
    expect(res.status).toBe(400);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makePost({ amount: 1000 }, { csrf: 'missing' }), params);
    expect(res.status).toBe(403);
  });
});
