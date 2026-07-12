// PUT /api/admin/boutiques/[id]/note — note interne (mini-CRM).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PUT } from './route';

const mockSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'SUPERADMIN' as const },
};
const params = { params: Promise.resolve({ id: 'org1' }) };

function makePut(body: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/admin/boutiques/org1/note', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuper.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  prismaMock.organization.findUnique.mockResolvedValue({ id: 'org1', name: 'Chez Ali' } as never);
  prismaMock.organization.update.mockResolvedValue({} as never);
});

describe('PUT /api/admin/boutiques/[id]/note', () => {
  it('enregistre la note → 200 + audit', async () => {
    const res = await PUT(makePut({ note: 'Rappeler le 15' }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; adminNote: string | null };
    expect(body.adminNote).toBe('Rappeler le 15');
    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org1' }, data: { adminNote: 'Rappeler le 15' } }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.note', targetId: 'org1' }),
    );
  });

  it('chaîne vide → note effacée (null)', async () => {
    const res = await PUT(makePut({ note: '   ' }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adminNote: string | null };
    expect(body.adminNote).toBeNull();
    expect(prismaMock.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { adminNote: null } }),
    );
  });

  it('404 quand la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await PUT(makePut({ note: 'x' }), params);
    expect(res.status).toBe(404);
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it('403 sans jeton CSRF', async () => {
    const res = await PUT(makePut({ note: 'x' }, { csrf: false }), params);
    expect(res.status).toBe(403);
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await PUT(makePut({ note: 'x' }), params);
    expect(res.status).toBe(403);
  });
});
