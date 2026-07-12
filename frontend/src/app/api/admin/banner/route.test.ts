// GET/PUT /api/admin/banner — bannière d'info globale (SUPERADMIN).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET, PUT } from './route';

const mockSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'SUPERADMIN' as const },
};

function makePut(body: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/admin/banner', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}
const getReq = () => new NextRequest('http://test/api/admin/banner');

beforeEach(() => {
  vi.clearAllMocks();
  mockSuper.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  prismaMock.appBanner.findFirst.mockResolvedValue(null as never);
  prismaMock.appBanner.create.mockResolvedValue({
    id: 'b1',
    message: 'Coucou',
    level: 'INFO',
    active: true,
  } as never);
  prismaMock.appBanner.update.mockResolvedValue({
    id: 'b1',
    message: 'Coucou',
    level: 'INFO',
    active: true,
  } as never);
});

describe('GET /api/admin/banner', () => {
  it('renvoie la bannière courante → 200', async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/banner', () => {
  it('crée la bannière (aucune existante) → 200 + audit', async () => {
    const res = await PUT(makePut({ message: 'Coucou', level: 'INFO', active: true }));
    expect(res.status).toBe(200);
    expect(prismaMock.appBanner.create).toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'banner.set' }),
    );
  });

  it('met à jour la bannière existante (singleton)', async () => {
    prismaMock.appBanner.findFirst.mockResolvedValueOnce({ id: 'b1' } as never);
    const res = await PUT(makePut({ message: 'Maj', level: 'WARNING', active: true }));
    expect(res.status).toBe(200);
    expect(prismaMock.appBanner.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1' } }),
    );
    expect(prismaMock.appBanner.create).not.toHaveBeenCalled();
  });

  it('400 si activation avec message vide', async () => {
    const res = await PUT(makePut({ message: '   ', level: 'INFO', active: true }));
    expect(res.status).toBe(400);
    expect(prismaMock.appBanner.create).not.toHaveBeenCalled();
  });

  it('400 sur niveau invalide', async () => {
    const res = await PUT(makePut({ message: 'x', level: 'DANGER', active: true }));
    expect(res.status).toBe(400);
  });

  it('403 sans jeton CSRF', async () => {
    const res = await PUT(makePut({ message: 'x', level: 'INFO', active: false }, { csrf: false }));
    expect(res.status).toBe(403);
  });
});
