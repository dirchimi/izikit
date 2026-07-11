// POST /api/subscription/request — demande de paiement d'abonnement (patron).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/subscription/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'tok',
      cookie: 'app-csrf=tok',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
  prismaMock.subscriptionPayment.findFirst.mockResolvedValue(null as never);
  // $transaction interactif : exécute le callback avec prismaMock comme tx.
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('POST /api/subscription/request', () => {
  it('crée une demande PENDING avec le montant serveur → 201', async () => {
    prismaMock.subscriptionPayment.create.mockResolvedValueOnce({
      id: 'p1',
      plan: 'PREMIUM',
      amount: 50000,
      baseAmount: 50000,
      discountCode: null,
      method: 'CASH',
      months: 1,
      status: 'PENDING',
      createdAt: new Date(),
    } as never);
    const res = await POST(makePost({ plan: 'PREMIUM', method: 'CASH', months: 1 }));
    expect(res.status).toBe(201);
    expect(prismaMock.subscriptionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 50000,
          baseAmount: 50000,
          discountCode: null,
          status: 'PENDING',
        }),
      }),
    );
  });

  it('applique un code de réduction valide (montant remisé + usedCount++) → 201', async () => {
    prismaMock.discountCode.findUnique.mockResolvedValueOnce({
      code: 'PROMO',
      type: 'AMOUNT',
      value: 10000,
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
      active: true,
    } as never);
    prismaMock.$executeRaw.mockResolvedValueOnce(1 as never);
    prismaMock.subscriptionPayment.create.mockResolvedValueOnce({
      id: 'p2',
      plan: 'PREMIUM',
      amount: 40000,
      baseAmount: 50000,
      discountCode: 'PROMO',
      method: 'CASH',
      months: 1,
      status: 'PENDING',
      createdAt: new Date(),
    } as never);
    const res = await POST(makePost({ plan: 'PREMIUM', method: 'CASH', code: 'promo' }));
    expect(res.status).toBe(201);
    // 50000 − 10000 = 40000, et le code normalisé est stocké.
    expect(prismaMock.subscriptionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 40000,
          baseAmount: 50000,
          discountCode: 'PROMO',
        }),
      }),
    );
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
  });

  it('400 quand le code de réduction est introuvable', async () => {
    prismaMock.discountCode.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost({ plan: 'PREMIUM', method: 'CASH', code: 'NOPE' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('DISCOUNT_NOT_FOUND');
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('409 SUB_REQUEST_PENDING via le pré-check applicatif', async () => {
    prismaMock.subscriptionPayment.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    const res = await POST(makePost({ plan: 'PREMIUM', method: 'CASH' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('SUB_REQUEST_PENDING');
    expect(prismaMock.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it('409 SUB_REQUEST_PENDING quand la course déclenche P2002 (index unique)', async () => {
    // Pré-check passé (null), mais le 2e POST simultané viole l'index partiel.
    prismaMock.subscriptionPayment.create.mockRejectedValueOnce({ code: 'P2002' } as never);
    const res = await POST(makePost({ plan: 'PREMIUM', method: 'MOBILE' }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('SUB_REQUEST_PENDING');
  });

  it('403 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await POST(makePost({ plan: 'PREMIUM', method: 'CASH' }));
    expect(res.status).toBe(401);
  });
});
