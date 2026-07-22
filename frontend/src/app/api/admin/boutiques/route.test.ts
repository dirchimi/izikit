// GET /api/admin/boutiques — vue « par boutique ».
//
// Même patron que les autres listes admin : prismaMock + requireAdmin +
// enforceAdminRateLimit mockés. computeSubscription reste RÉEL (fonction pure)
// pour vérifier la dérivation du statut de bout en bout.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// groupBy est fortement surchargé : son type masque `.mock`. On caste pour lire
// les appels (même contournement que stats.test.ts).
const asMock = (fn: unknown) => fn as unknown as Mock;

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { encodeCursor } from '@/lib/server/notifications/cursor';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

const FUTURE = new Date('2999-01-01T00:00:00Z');
const PAST = new Date('2000-01-01T00:00:00Z');

interface OrgRowOverrides {
  id?: string;
  name?: string;
  plan?: string | null;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  ownerName?: string | null;
  ownerEmail?: string;
  phone?: string | null;
  city?: string | null;
  members?: number;
  createdAt?: Date;
}

function orgRow(o: OrgRowOverrides = {}) {
  const id = o.id ?? 'org1';
  return {
    id,
    name: o.name ?? 'Chez Ali',
    slug: `${id}-slug`,
    internal: false,
    plan: o.plan ?? 'PREMIUM',
    // `in` checks so an explicit `null` isn't coalesced back to a default date.
    trialEndsAt: 'trialEndsAt' in o ? o.trialEndsAt! : null,
    currentPeriodEnd: 'currentPeriodEnd' in o ? o.currentPeriodEnd! : FUTURE,
    createdAt: o.createdAt ?? new Date('2026-05-01T00:00:00Z'),
    owner: { name: o.ownerName ?? 'Ali Sow', email: o.ownerEmail ?? 'ali@test.local' },
    settings: { phone: o.phone ?? '90000000', city: o.city ?? "N'Djamena", country: 'TD' },
    _count: { members: o.members ?? 3 },
  };
}

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// Renseigne les requêtes du bloc `summary` (1re page) avec des valeurs neutres.
function stubSummary() {
  prismaMock.organization.count.mockResolvedValue(0 as never);
  prismaMock.subscriptionPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } } as never);
  prismaMock.organizationMember.count.mockResolvedValue(0 as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  asMock(prismaMock.subscriptionPayment.groupBy).mockResolvedValue([]);
  asMock(prismaMock.sale.groupBy).mockResolvedValue([]);
  stubSummary();
});

describe('/api/admin/boutiques — list', () => {
  it('enriches each boutique with owner, phone, city, sellers, status and money', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([orgRow({ id: 'org1' })] as never);
    asMock(prismaMock.subscriptionPayment.groupBy).mockResolvedValueOnce([
      { organizationId: 'org1', _sum: { amount: 45000 } },
    ]);
    asMock(prismaMock.sale.groupBy).mockResolvedValueOnce([
      { organizationId: 'org1', _sum: { total: 120000 } },
    ]);

    const res = await GET(makeGet('http://test/api/admin/boutiques'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    const b = body.items[0]!;
    expect(b).toMatchObject({
      id: 'org1',
      name: 'Chez Ali',
      ownerName: 'Ali Sow',
      ownerEmail: 'ali@test.local',
      phone: '90000000',
      city: "N'Djamena",
      sellers: 3,
      plan: 'PREMIUM',
      status: 'ACTIVE', // currentPeriodEnd = FUTURE
      collected: 45000,
      salesTotal: 120000,
    });
  });

  it('derives TRIAL / EXPIRED and defaults money to 0 when no aggregate row', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([
      orgRow({ id: 'trial', currentPeriodEnd: null, trialEndsAt: FUTURE }),
      orgRow({ id: 'exp', currentPeriodEnd: PAST, trialEndsAt: PAST }),
    ] as never);

    const res = await GET(makeGet('http://test/api/admin/boutiques'));
    const body = (await res.json()) as {
      items: Array<{ id: string; status: string; collected: number; salesTotal: number }>;
    };
    const byId = Object.fromEntries(body.items.map((i) => [i.id, i]));
    expect(byId['trial']?.status).toBe('TRIAL');
    expect(byId['exp']?.status).toBe('EXPIRED');
    expect(byId['trial']?.collected).toBe(0);
    expect(byId['trial']?.salesTotal).toBe(0);
  });

  it('groupBy aggregates are scoped to the page ids and CONFIRMED / ACTIVE only', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([
      orgRow({ id: 'a' }),
      orgRow({ id: 'b' }),
    ] as never);

    await GET(makeGet('http://test/api/admin/boutiques'));

    const subArgs = asMock(prismaMock.subscriptionPayment.groupBy).mock.calls[0]?.[0] as
      | { where: { organizationId: { in: string[] }; status: string } }
      | undefined;
    expect(subArgs?.where.organizationId.in).toEqual(['a', 'b']);
    expect(subArgs?.where.status).toBe('CONFIRMED');
    const saleArgs = asMock(prismaMock.sale.groupBy).mock.calls[0]?.[0] as
      | { where: { organizationId: { in: string[] }; status: string } }
      | undefined;
    expect(saleArgs?.where.status).toBe('ACTIVE');
  });

  it('computes summary on first page and skips the aggregate queries entirely on empty page', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([] as never);
    prismaMock.organization.count.mockResolvedValueOnce(10 as never); // total (hors internes)
    prismaMock.organization.count.mockResolvedValueOnce(6 as never); // accès actif (payant OU offert)
    prismaMock.organization.count.mockResolvedValueOnce(5 as never); // payantes (≥1 paiement CONFIRMED)
    prismaMock.organization.count.mockResolvedValueOnce(3 as never); // trial
    prismaMock.subscriptionPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 630000 },
    } as never);
    prismaMock.organizationMember.count.mockResolvedValueOnce(118 as never);

    const res = await GET(makeGet('http://test/api/admin/boutiques'));
    const body = (await res.json()) as {
      items: unknown[];
      summary: {
        boutiques: number;
        active: number;
        offered: number;
        trial: number;
        expired: number;
        collected: number;
        sellers: number;
      };
    };
    expect(body.items).toEqual([]);
    expect(body.summary).toEqual({
      boutiques: 10,
      // `active` = payantes uniquement ; l'accès offert (grant-access, aucun
      // paiement) est compté à part et n'est PAS une expirée.
      active: 5,
      offered: 1,
      trial: 3,
      expired: 1, // 10 − 6 (accès actif) − 3 (essai)
      collected: 630000,
      sellers: 118,
    });
    // Empty page → no per-boutique groupBy calls.
    expect(prismaMock.subscriptionPayment.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.sale.groupBy).not.toHaveBeenCalled();
  });

  it('omits summary (null) on subsequent pages (cursor present)', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([orgRow()] as never);
    const cursor = encodeCursor({ createdAt: new Date('2026-05-01T00:00:00Z'), id: 'org0' });
    const res = await GET(
      makeGet(`http://test/api/admin/boutiques?cursor=${encodeURIComponent(cursor)}`),
    );
    const body = (await res.json()) as { summary: unknown };
    expect(body.summary).toBeNull();
    // The summary count query must not run when a cursor is supplied.
    expect(prismaMock.organization.count).not.toHaveBeenCalled();
  });

  it('q search composes name / owner / city / phone into an AND[] OR-branch', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([] as never);
    await GET(makeGet('http://test/api/admin/boutiques?q=ali'));
    const args = prismaMock.organization.findMany.mock.calls[0]?.[0] as
      | { where: { AND?: Array<{ OR?: unknown[] }> } }
      | undefined;
    const or = args?.where.AND?.[0]?.OR;
    expect(or).toEqual([
      { name: { contains: 'ali', mode: 'insensitive' } },
      { owner: { name: { contains: 'ali', mode: 'insensitive' } } },
      { owner: { email: { contains: 'ali', mode: 'insensitive' } } },
      { settings: { city: { contains: 'ali', mode: 'insensitive' } } },
      { settings: { phone: { contains: 'ali', mode: 'insensitive' } } },
    ]);
  });

  it('status=TRIAL filter translates to a not-active AND trial-valid where fragment', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([] as never);
    await GET(makeGet('http://test/api/admin/boutiques?status=TRIAL'));
    const args = prismaMock.organization.findMany.mock.calls[0]?.[0] as
      | { where: { AND?: Array<{ AND?: unknown[]; trialEndsAt?: unknown }> } }
      | undefined;
    // The status fragment is one AND[] entry shaped { AND: [noActive, { trialEndsAt: { gte } }] }.
    const frag = args?.where.AND?.find((f) => Array.isArray(f.AND));
    expect(frag).toBeDefined();
  });

  it('propagates 429 from the rate limiter without touching the DB', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/boutiques'));
    expect(res.status).toBe(429);
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireAdmin (non-admin)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/boutiques'));
    expect(res.status).toBe(403);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });
});
