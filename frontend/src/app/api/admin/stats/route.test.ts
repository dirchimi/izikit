import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

const statsObj = { users: { total: 7 }, redacted: false };
const redactedObj = { users: { total: 7 }, redacted: true };
vi.mock('@/lib/server/admin/stats', () => ({
  computeAdminStats: vi.fn(() => Promise.resolve(statsObj)),
  redactAdminStats: vi.fn(() => redactedObj),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { computeAdminStats } from '@/lib/server/admin/stats';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockCompute = vi.mocked(computeAdminStats);

const adminCtx = {
  user: { sub: 'admin1', email: 'a@x.io' },
  admin: { id: 'admin1', email: 'a@x.io', role: 'ADMIN' as const },
};
const superCtx = {
  user: { sub: 'root1', email: 's@x.io' },
  admin: { id: 'root1', email: 's@x.io', role: 'SUPERADMIN' as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null as never);
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/admin/stats', { method: 'GET' });
}

describe('GET /api/admin/stats', () => {
  it('returns 401/403 when requireAdmin rejects', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) as never,
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('SUPERADMIN reçoit les stats complètes (non expurgées)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(superCtx as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(statsObj);
    expect(mockCompute).toHaveBeenCalledWith(prismaMock, expect.any(Date));
  });

  it('ADMIN (équipe) reçoit la version EXPURGÉE — chiffres clients masqués côté serveur', async () => {
    const res = await GET(makeReq()); // adminCtx (role ADMIN) par défaut
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(redactedObj);
  });

  it('honours the admin rate limiter', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }) as never,
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    expect(mockCompute).not.toHaveBeenCalled();
  });
});
