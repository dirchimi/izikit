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

  it('n’impute QUE les créances OPEN/PARTIAL (exclut les créances annulées)', async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'BECHIR',
      phone: null,
    } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([
      { id: 'r-open', amount: 5000, amountPaid: 0 },
    ] as never);
    prismaMock.receivable.update.mockResolvedValue({} as never);
    prismaMock.repayment.create.mockResolvedValue({ id: 'rep-x' } as never);

    await POST(makePost({ amount: 5000, method: 'cash' }), { params });

    // Le paiement ne doit jamais tomber dans une créance CANCELLED : la requête
    // liste explicitement les statuts dus, elle n'utilise plus `not: 'PAID'`.
    expect(prismaMock.receivable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 'c1',
          organizationId: 'org1',
          status: { in: ['OPEN', 'PARTIAL'] },
        }),
      }),
    );
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

describe('POST /api/receivables/[id]/repay — idempotence offline (clientOpId)', () => {
  it('deux POST avec le même clientOpId : une seule allocation/Repayment/Document, 2e réponse mémoïsée à 200', async () => {
    // --- 1er POST : aucune opération offline connue → exécution réelle ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
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
    prismaMock.repayment.create.mockResolvedValueOnce({ id: 'rep-clientop-1' } as never);

    const first = await POST(
      makePost({ amount: 7000, method: 'cash', clientOpId: 'repay-clientop-1' }),
      { params },
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.applied).toBe(7000);
    expect(firstBody.remainingDebt).toBe(3000);
    expect(prismaMock.repayment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.repayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientOpId: 'repay-clientop-1' }),
      }),
    );
    expect(prismaMock.document.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.receivable.update).toHaveBeenCalledTimes(2);

    // Ce que withIdempotency a mémoïsé (JSON) pour ce clientOpId.
    const memoized = {
      kind: 'OK',
      applied: firstBody.applied,
      remainingDebt: firstBody.remainingDebt,
    };

    // --- 2e POST : même clientOpId → rejoué, résultat mémoïsé, aucune ré-exécution ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op1',
      organizationId: 'org1',
      clientOpId: 'repay-clientop-1',
      endpoint: 'repay',
      resultJson: memoized,
      createdAt: new Date(),
    } as never);

    const second = await POST(
      makePost({ amount: 7000, method: 'cash', clientOpId: 'repay-clientop-1' }),
      { params },
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.applied).toBe(7000);
    expect(secondBody.remainingDebt).toBe(3000);

    // Pas de double-allocation : ni Repayment, ni Document, ni update de créance
    // une seconde fois.
    expect(prismaMock.repayment.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.document.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.receivable.update).toHaveBeenCalledTimes(2);
  });

  it('online inchangé : POST sans clientOpId/id → OfflineOperation jamais touchée', async () => {
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'OUMAR',
      phone: null,
    } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([
      { id: 'r1', amount: 2000, amountPaid: 0 },
    ] as never);
    prismaMock.receivable.update.mockResolvedValue({} as never);
    prismaMock.repayment.create.mockResolvedValue({ id: 'rep-online' } as never);

    const res = await POST(makePost({ amount: 2000, method: 'mobile' }), { params });
    expect(res.status).toBe(200);
    expect(prismaMock.offlineOperation.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();
    // Chemin online : aucun clientOpId à porter sur le Repayment.
    expect(prismaMock.repayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ clientOpId: expect.anything() }),
      }),
    );
  });

  it('un rejet (NO_DEBT) sur un appel offline ne mémoïse RIEN : aucune OfflineOperation créée', async () => {
    // Un rejet métier fait avorter la $transaction (rollback) → withIdempotency
    // n'atteint jamais son `create`. Sans ce rollback, NO_DEBT serait mémoïsé
    // et rejouerait pour toujours, même après l'ouverture d'une nouvelle créance.
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'BECHIR',
      phone: null,
    } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([] as never);

    const res = await POST(
      makePost({ amount: 1000, method: 'cash', clientOpId: 'repay-reject-1' }),
      { params },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NO_DEBT');
    expect(prismaMock.repayment.create).not.toHaveBeenCalled();
    expect(prismaMock.document.create).not.toHaveBeenCalled();
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();
  });

  it("utilise l'id client fourni verbatim comme id du Repayment", async () => {
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'FATIME',
      phone: null,
    } as never);
    prismaMock.receivable.findMany.mockResolvedValueOnce([
      { id: 'r1', amount: 1000, amountPaid: 0 },
    ] as never);
    prismaMock.receivable.update.mockResolvedValue({} as never);
    prismaMock.repayment.create.mockResolvedValueOnce({ id: 'rep-client-id-1' } as never);

    const res = await POST(makePost({ amount: 1000, method: 'cash', id: 'rep-client-id-1' }), {
      params,
    });
    expect(res.status).toBe(200);
    expect(prismaMock.repayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'rep-client-id-1', clientOpId: 'rep-client-id-1' }),
      }),
    );
  });
});
