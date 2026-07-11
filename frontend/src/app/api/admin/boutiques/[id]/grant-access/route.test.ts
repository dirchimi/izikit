// POST /api/admin/boutiques/[id]/grant-access — prolongation gratuite d'accès.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
const params = { params: Promise.resolve({ id: 'org1' }) };

function makePost(body: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/admin/boutiques/org1/grant-access', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuper.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.organization.findUnique.mockResolvedValue({
    id: 'org1',
    name: 'Chez Ali',
    currentPeriodEnd: null,
  } as never);
  prismaMock.organization.update.mockResolvedValue({} as never);
});

describe('POST /api/admin/boutiques/[id]/grant-access', () => {
  it('prolonge et pose le plan PREMIUM → 200 + audit', async () => {
    const res = await POST(makePost({ days: 30 }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; currentPeriodEnd: string };
    expect(body.ok).toBe(true);
    expect(typeof body.currentPeriodEnd).toBe('string');
    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org1' },
        data: expect.objectContaining({ plan: 'PREMIUM' }),
      }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.grant_access', targetId: 'org1' }),
    );
  });

  it('empile sur une période future (fin > maintenant)', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org1',
      name: 'Chez Ali',
      currentPeriodEnd: future,
    } as never);
    const res = await POST(makePost({ days: 30 }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currentPeriodEnd: string };
    // base = fin future (+10 j) + 30 j → nettement au-delà de 30 j depuis maintenant.
    const got = new Date(body.currentPeriodEnd).getTime();
    expect(got).toBeGreaterThan(Date.now() + 35 * 24 * 60 * 60 * 1000);
  });

  it('400 quand days est absent/invalide', async () => {
    const res = await POST(makePost({ days: 0 }), params);
    expect(res.status).toBe(400);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it('404 quand la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost({ days: 30 }), params);
    expect(res.status).toBe(404);
  });

  it('403 sans jeton CSRF', async () => {
    const res = await POST(makePost({ days: 30 }, { csrf: false }), params);
    expect(res.status).toBe(403);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost({ days: 30 }), params);
    expect(res.status).toBe(403);
  });
});
