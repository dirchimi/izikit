// GET + PATCH /api/admin/boutiques/[id] — fiche détail + marquage interne.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, PATCH } from './route';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};
const superCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

const FUTURE = new Date('2999-01-01T00:00:00Z');

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/boutiques/org1', { method: 'GET' });
}
function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// Valeurs neutres pour les 6 requêtes autres que organization.findUnique.
function stubAggregates() {
  prismaMock.subscriptionPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } } as never);
  prismaMock.sale.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: 0 } as never);
  prismaMock.receivable.aggregate.mockResolvedValue({
    _sum: { amount: 0, amountPaid: 0 },
  } as never);
  prismaMock.organizationMember.findMany.mockResolvedValue([] as never);
  prismaMock.subscriptionPayment.findMany.mockResolvedValue([] as never);
  prismaMock.sale.findMany.mockResolvedValue([] as never);
}

function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/boutiques/${id}`, {
    method: 'PATCH',
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
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRequireSuper.mockResolvedValue(superCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  stubAggregates();
});

describe('/api/admin/boutiques/[id] — detail', () => {
  it('404 BOUTIQUE_NOT_FOUND when the org does not exist', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGet(), paramsOf('missing'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('BOUTIQUE_NOT_FOUND');
  });

  it('returns owner, settings, derived subscription, stats, team, payments and sales (SUPERADMIN = chiffres complets)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(superCtx as never);
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org1',
      name: 'Chez Ali',
      slug: 'chez-ali',
      plan: 'PREMIUM',
      trialEndsAt: null,
      currentPeriodEnd: FUTURE,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      owner: { id: 'u_owner', name: 'Ali Sow', email: 'ali@test.local' },
      settings: {
        phone: '90000000',
        city: "N'Djamena",
        address: 'Av. Charles',
        country: 'TD',
        currency: 'XAF',
        businessType: 'alimentation',
      },
      _count: { members: 2, products: 37 },
    } as never);
    prismaMock.subscriptionPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 45000 },
    } as never);
    prismaMock.sale.aggregate.mockResolvedValueOnce({
      _sum: { total: 120000 },
      _count: 8,
    } as never);
    prismaMock.receivable.aggregate.mockResolvedValueOnce({
      _sum: { amount: 30000, amountPaid: 10000 },
    } as never);
    // Membres volontairement dans le désordre pour vérifier le tri OWNER→MEMBER.
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([
      {
        id: 'm2',
        role: 'MEMBER',
        createdAt: new Date(),
        user: { id: 'u2', name: 'Vendeur', email: 'v@t.l' },
      },
      {
        id: 'm1',
        role: 'OWNER',
        createdAt: new Date(),
        user: { id: 'u_owner', name: 'Ali Sow', email: 'ali@test.local' },
      },
    ] as never);
    prismaMock.subscriptionPayment.findMany.mockResolvedValueOnce([
      {
        id: 'sp1',
        plan: 'PREMIUM',
        amount: 30000,
        method: 'CASH',
        months: 1,
        status: 'CONFIRMED',
        periodEnd: FUTURE,
        note: null,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    ] as never);
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        number: '0001',
        total: 5000,
        method: 'CASH',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ] as never);

    const res = await GET(makeGet(), paramsOf('org1'));
    expect(res.status).toBe(200);
    const { boutique } = (await res.json()) as { boutique: Record<string, unknown> };
    expect(boutique).toMatchObject({
      id: 'org1',
      name: 'Chez Ali',
      owner: { name: 'Ali Sow', email: 'ali@test.local' },
      subscription: { plan: 'PREMIUM', status: 'ACTIVE' },
      stats: {
        collected: 45000,
        salesTotal: 120000,
        salesCount: 8,
        receivablesOpen: 20000, // 30000 - 10000
        sellers: 2,
        products: 37,
      },
    });
    // Team sorted OWNER first.
    const members = (boutique as { members: Array<{ role: string }> }).members;
    expect(members.map((m) => m.role)).toEqual(['OWNER', 'MEMBER']);
    expect((boutique as { payments: unknown[] }).payments).toHaveLength(1);
    expect((boutique as { recentSales: unknown[] }).recentSales).toHaveLength(1);
    expect((boutique as { redacted: boolean }).redacted).toBe(false);
  });

  it('ADMIN (équipe) : chiffres CLIENTS expurgés côté serveur — CA/créances/montants de ventes à 0, encaissé Sahilley intact', async () => {
    // adminCtx (role ADMIN) est le défaut du beforeEach.
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org1',
      name: 'Chez Ali',
      slug: 'chez-ali',
      plan: 'PREMIUM',
      trialEndsAt: null,
      currentPeriodEnd: FUTURE,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      owner: { id: 'u_owner', name: 'Ali Sow', email: 'ali@test.local' },
      settings: null,
      _count: { members: 2, products: 37 },
    } as never);
    prismaMock.subscriptionPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 45000 },
    } as never);
    prismaMock.sale.aggregate.mockResolvedValueOnce({
      _sum: { total: 120000 },
      _count: 8,
    } as never);
    prismaMock.receivable.aggregate.mockResolvedValueOnce({
      _sum: { amount: 30000, amountPaid: 10000 },
    } as never);
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        number: '0001',
        total: 5000,
        method: 'CASH',
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ] as never);

    const res = await GET(makeGet(), paramsOf('org1'));
    expect(res.status).toBe(200);
    const { boutique } = (await res.json()) as {
      boutique: {
        redacted: boolean;
        stats: Record<string, number>;
        recentSales: Array<{ number: string; total: number }>;
      };
    };

    expect(boutique.redacted).toBe(true);
    // Chiffres clients à zéro ; signaux d'activité et argent Sahilley gardés.
    expect(boutique.stats).toMatchObject({
      collected: 45000, // abonnements = argent Sahilley
      salesTotal: 0,
      salesCount: 8, // signal d'activité sans montant
      receivablesOpen: 0,
      sellers: 2,
      products: 37,
    });
    expect(boutique.recentSales[0]).toMatchObject({ number: '0001', total: 0 });
  });

  it('propagates 403 from requireAdmin without querying', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet(), paramsOf('org1'));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });
});

describe('/api/admin/boutiques/[id] — PATCH marquage interne', () => {
  beforeEach(() => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org1', name: 'Chez Ali' } as never);
    prismaMock.subscriptionPayment.deleteMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.organization.update.mockResolvedValue({} as never);
  });

  it('marque interne : efface les paiements, neutralise le plan, audite → 200', async () => {
    const res = await PATCH(makePatch('org1', { internal: true }), paramsOf('org1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { internal: boolean; deletedPayments: number };
    expect(body).toEqual({ internal: true, deletedPayments: 2 });

    expect(prismaMock.subscriptionPayment.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1' },
    });
    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org1' },
        data: { internal: true, plan: null, currentPeriodEnd: null },
      }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.mark_internal' }),
    );
  });

  it('retire le marquage : ne supprime aucun paiement → 200', async () => {
    const res = await PATCH(makePatch('org1', { internal: false }), paramsOf('org1'));
    expect(res.status).toBe(200);
    expect(prismaMock.subscriptionPayment.deleteMany).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.unmark_internal' }),
    );
  });

  it('404 si la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await PATCH(makePatch('ghost', { internal: true }), paramsOf('ghost'));
    expect(res.status).toBe(404);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it('400 si le corps est invalide', async () => {
    const res = await PATCH(makePatch('org1', { internal: 'yes' }), paramsOf('org1'));
    expect(res.status).toBe(400);
  });

  it('403 sans session superadmin', async () => {
    mockRequireSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await PATCH(makePatch('org1', { internal: true }), paramsOf('org1'));
    expect(res.status).toBe(403);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });
});
