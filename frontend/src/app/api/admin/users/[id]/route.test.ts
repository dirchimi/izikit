// ADMIN-01 (Wave 1) — users DETAIL endpoint behaviour.
// Mirrors the pattern from the LIST sibling test.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};
const superCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makeDelete(id: string, opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest(`http://test/api/admin/users/${id}`, { method: 'DELETE', headers });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRequireSuper.mockResolvedValue(superCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('/api/admin/users/[id] — detail', () => {
  it('GET returns 200 { user } for an existing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      name: null,
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-05-01T00:00:00Z'),
    } as never);

    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe('u1');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('GET returns 404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet('http://test/api/admin/users/missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('GET propagates 429 from rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('GET propagates 403 from requireAdmin without DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('/api/admin/users/[id] — DELETE', () => {
  it('supprime un compte USER sans boutique → 200 + audit', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'junk@test.local',
      role: 'USER',
      _count: { ownedOrganizations: 0 },
    } as never);
    prismaMock.user.delete.mockResolvedValue({} as never);

    const res = await DELETE(makeDelete('u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'user.delete', targetId: 'u1' }),
    );
  });

  it('refuse un compte staff → 409 CANNOT_DELETE_STAFF', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'a1',
      email: 'adm@test.local',
      role: 'ADMIN',
      _count: { ownedOrganizations: 0 },
    } as never);
    const res = await DELETE(makeDelete('a1'), ctxWith('a1'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('CANNOT_DELETE_STAFF');
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('refuse un compte qui possède une boutique → 409 USER_OWNS_BOUTIQUE', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'o1',
      email: 'owner@test.local',
      role: 'USER',
      _count: { ownedOrganizations: 1 },
    } as never);
    const res = await DELETE(makeDelete('o1'), ctxWith('o1'));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('USER_OWNS_BOUTIQUE');
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('404 quand le compte est introuvable', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await DELETE(makeDelete('missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('USER_NOT_FOUND');
  });

  it('403 sans jeton CSRF', async () => {
    const res = await DELETE(makeDelete('u1', { csrf: false }), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('403 sans session superadmin', async () => {
    mockRequireSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await DELETE(makeDelete('u1'), ctxWith('u1'));
    expect(res.status).toBe(403);
  });
});
