// POST /api/admin/subscriptions/[id]/amount — correction du montant encaissé.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';

const mockSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'SUPERADMIN' as const },
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/subscriptions/pay1/amount', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'tok',
      cookie: 'app-csrf=tok',
    },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'pay1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockSuper.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.subscriptionPayment.findUnique.mockResolvedValue({
    id: 'pay1',
    status: 'CONFIRMED',
    amount: 500000,
    organizationId: 'org1',
    plan: 'PREMIUM',
  } as never);
  prismaMock.subscriptionPayment.update.mockResolvedValue({} as never);
});

describe('POST /api/admin/subscriptions/[id]/amount', () => {
  it('corrige le montant et journalise ancien + nouveau', async () => {
    const res = await POST(makePost({ amount: 200000 }), params);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { amount: number }).amount).toBe(200000);
    expect(prismaMock.subscriptionPayment.update).toHaveBeenCalledWith({
      where: { id: 'pay1' },
      data: { amount: 200000 },
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'subscription.amount_correct',
        metadata: expect.objectContaining({ previousAmount: 500000, amount: 200000 }),
      }),
    );
  });

  it('409 si le paiement n’est pas CONFIRMÉ', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      id: 'pay1',
      status: 'PENDING',
      amount: 50000,
      organizationId: 'org1',
      plan: 'PREMIUM',
    } as never);
    const res = await POST(makePost({ amount: 40000 }), params);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('SUB_PAYMENT_NOT_CONFIRMED');
    expect(prismaMock.subscriptionPayment.update).not.toHaveBeenCalled();
  });

  it('404 si le paiement est introuvable', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost({ amount: 40000 }), params);
    expect(res.status).toBe(404);
  });

  it('400 sur montant invalide (négatif)', async () => {
    const res = await POST(makePost({ amount: -1 }), params);
    expect(res.status).toBe(400);
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost({ amount: 40000 }), params);
    expect(res.status).toBe(403);
  });
});
