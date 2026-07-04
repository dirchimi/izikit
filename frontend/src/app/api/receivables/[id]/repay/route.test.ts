// Phase 4 — POST /api/receivables/[id]/repay (remboursement réparti).
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
  return new NextRequest('http://test/api/receivables/c1/repay', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: 'c1' });

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
  // Reçu de remboursement (Document RECU) créé dans la même transaction.
  prismaMock.document.count.mockResolvedValue(0 as never);
  prismaMock.document.create.mockResolvedValue({} as never);
});

describe('POST /api/receivables/[id]/repay', () => {
  it('répartit le paiement sur les créances ouvertes, met à jour statut + Repayment → 200', async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'HISSEIN',
      phone: '+235 66 00 00 00',
    } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([
      { id: 'r1', amount: 6000, amountPaid: 0 },
      { id: 'r2', amount: 4000, amountPaid: 0 },
    ] as never);
    prismaMock.receivable.update.mockResolvedValue({} as never);
    prismaMock.repayment.create.mockResolvedValue({ id: 'rep-1' } as never);

    const res = await POST(makePost({ amount: 7000, method: 'cash' }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(7000);
    expect(body.remainingDebt).toBe(3000);
    // r1 soldée, r2 partiellement
    expect(prismaMock.receivable.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { amountPaid: 6000, status: 'PAID' } }),
    );
    expect(prismaMock.receivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r2' },
        data: { amountPaid: 1000, status: 'PARTIAL' },
      }),
    );
    expect(prismaMock.repayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 7000, method: 'CASH', customerId: 'c1' }),
      }),
    );
    // Un reçu de remboursement (RECU) est généré, avec le solde restant figé.
    expect(prismaMock.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'RECU',
          number: 'R-0001',
          total: 7000,
          balanceAfter: 3000,
          repaymentId: 'rep-1',
          clientName: 'HISSEIN',
        }),
      }),
    );
  });

  it('plafonne au dû total (pas de trop-perçu)', async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'OUMAR',
      phone: null,
    } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([
      { id: 'r1', amount: 2000, amountPaid: 0 },
    ] as never);
    prismaMock.receivable.update.mockResolvedValue({} as never);
    prismaMock.repayment.create.mockResolvedValue({ id: 'rep-2' } as never);

    const res = await POST(makePost({ amount: 9999, method: 'mobile' }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(2000);
    expect(body.remainingDebt).toBe(0);
  });

  it('409 NO_DEBT si aucune créance ouverte', async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce({ organizationId: 'org1' } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([] as never);

    const res = await POST(makePost({ amount: 1000, method: 'cash' }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NO_DEBT');
    expect(prismaMock.repayment.create).not.toHaveBeenCalled();
  });

  it('404 si le client n’est pas de la boutique', async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce({ organizationId: 'other' } as never);
    const res = await POST(makePost({ amount: 1000, method: 'cash' }), { params });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CUSTOMER_NOT_FOUND');
  });

  it('400 si montant invalide', async () => {
    const res = await POST(makePost({ amount: -5, method: 'cash' }), { params });
    expect(res.status).toBe(400);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makePost({ amount: 1000, method: 'cash' }, { csrf: 'missing' }), {
      params,
    });
    expect(res.status).toBe(403);
  });
});
