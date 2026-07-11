// POST /api/admin/boutiques/[id]/delete — suppression complète (boutique + comptes).
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
  return new NextRequest('http://test/api/admin/boutiques/org1/delete', {
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
    owner: { id: 'owner1', role: 'USER' },
    members: [],
  } as never);
  prismaMock.supplierDebt.deleteMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.organization.delete.mockResolvedValue({} as never);
  // Après suppression : le patron n'a plus rien → orphelin → supprimé.
  prismaMock.organization.count.mockResolvedValue(0 as never);
  prismaMock.organizationMember.count.mockResolvedValue(0 as never);
  prismaMock.user.findUnique.mockResolvedValue({ role: 'USER' } as never);
  prismaMock.user.delete.mockResolvedValue({} as never);
});

describe('POST /api/admin/boutiques/[id]/delete', () => {
  it('supprime la boutique + le patron orphelin → 200, deletedUsers=1, audit', async () => {
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deletedUsers: number };
    expect(body.ok).toBe(true);
    expect(body.deletedUsers).toBe(1);
    expect(prismaMock.organization.delete).toHaveBeenCalledWith({ where: { id: 'org1' } });
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'owner1' } });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.delete', targetId: 'org1' }),
    );
  });

  it('garde un compte encore rattaché à une autre boutique → deletedUsers=0', async () => {
    prismaMock.organization.count.mockResolvedValue(1 as never); // possède une autre boutique
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).deletedUsers).toBe(0);
    expect(prismaMock.organization.delete).toHaveBeenCalled();
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('refuse si le patron est un compte staff → 409 OWNER_IS_STAFF', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org1',
      name: 'Chez Ali',
      owner: { id: 'owner1', role: 'ADMIN' },
      members: [],
    } as never);
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('OWNER_IS_STAFF');
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });

  it('refuse si le nom ne correspond pas → 400 CONFIRM_MISMATCH', async () => {
    const res = await POST(makePost({ confirmName: 'Mauvais' }), params);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('CONFIRM_MISMATCH');
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });

  it('404 quand la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('BOUTIQUE_NOT_FOUND');
  });

  it('403 sans jeton CSRF', async () => {
    const res = await POST(makePost({ confirmName: 'Chez Ali' }, { csrf: false }), params);
    expect(res.status).toBe(403);
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(403);
  });
});
