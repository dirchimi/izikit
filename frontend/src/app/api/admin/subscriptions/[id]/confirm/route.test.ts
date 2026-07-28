// POST /api/admin/subscriptions/[id]/confirm — validation d'un paiement.
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
  return new NextRequest('http://test/api/admin/subscriptions/pay1/confirm', {
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
    status: 'PENDING',
    months: 1,
    plan: 'PREMIUM',
    amount: 35000,
    organizationId: 'org1',
    organization: { currentPeriodEnd: null },
  } as never);
  prismaMock.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.organization.update.mockResolvedValue({} as never);
});

describe('POST /api/admin/subscriptions/[id]/confirm', () => {
  it('recalcule le montant quand le superadmin force une durée différente', async () => {
    // Demande d'origine : PREMIUM 1 mois (35000). Confirmée en forçant 3 mois.
    const res = await POST(makePost({ months: 3 }), params);
    expect(res.status).toBe(200);

    // Le montant suit la grille par durée : 3 mois = 95000 (remise incluse).
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'CONFIRMED', months: 3, amount: 95000 }),
      }),
    );
    // Le journal d'audit reflète le montant recalculé.
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ amount: 95000, months: 3 }) }),
    );
  });

  it('sans override : montant = prix de la durée demandée (inchangé)', async () => {
    const res = await POST(makePost({}), params);
    expect(res.status).toBe(200);
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ months: 1, amount: 35000 }),
      }),
    );
  });

  it('conserve la remise code promo : le montant RÉDUIT de la demande est gardé tel quel', async () => {
    // Demande annuelle avec code promo : 200000 au lieu du plein tarif 350000.
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      id: 'pay1',
      status: 'PENDING',
      months: 12,
      plan: 'PREMIUM',
      amount: 200000,
      organizationId: 'org1',
      organization: { currentPeriodEnd: null },
    } as never);
    const res = await POST(makePost({}), params);
    expect(res.status).toBe(200);
    // AVANT ce correctif, la confirmation recalculait planPrice(12) = 350000 et
    // écrasait la remise — l'encaissé affiché était gonflé au plein tarif.
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ months: 12, amount: 200000 }),
      }),
    );
  });

  it('durée forcée différente : la remise effective est conservée (mise à l’échelle)', async () => {
    // Annuel remisé 175000 (plein tarif 350000 → 50 %). Confirmé en 3 mois :
    // 175000 × 95000/350000 = 47500 (la remise de 50 % suit la grille).
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      id: 'pay1',
      status: 'PENDING',
      months: 12,
      plan: 'PREMIUM',
      amount: 175000,
      organizationId: 'org1',
      organization: { currentPeriodEnd: null },
    } as never);
    const res = await POST(makePost({ months: 3 }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ months: 3, amount: 47500 }),
      }),
    );
  });

  it('montant explicite du superadmin : il fait foi (montant réellement reçu)', async () => {
    const res = await POST(makePost({ amount: 45000 }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ months: 1, amount: 45000 }),
      }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ amount: 45000 }) }),
    );
  });

  it('409 si la demande n’est plus PENDING (déjà traitée)', async () => {
    prismaMock.subscriptionPayment.findUnique.mockResolvedValueOnce({
      id: 'pay1',
      status: 'CONFIRMED',
      months: 1,
      plan: 'PREMIUM',
      amount: 35000,
      organizationId: 'org1',
      organization: { currentPeriodEnd: null },
    } as never);
    const res = await POST(makePost({}), params);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('SUB_PAYMENT_NOT_PENDING');
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost({}), params);
    expect(res.status).toBe(403);
  });
});
