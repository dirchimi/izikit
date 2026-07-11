// POST /api/admin/boutiques/[id]/wipe-data — vidage des données d'une boutique.
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
const params = { params: Promise.resolve({ id: 'org1' }) };

function makePost(body: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/admin/boutiques/org1/wipe-data', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

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
  prismaMock.organization.findUnique.mockResolvedValue({ id: 'org1', name: 'Chez Ali' } as never);
  for (const model of [
    'document',
    'repayment',
    'receivable',
    'sale',
    'stockMovement',
    'supplierDebt',
    'expense',
    'customer',
    'product',
  ] as const) {
    (prismaMock[model].deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
    } as never);
  }
});

describe('POST /api/admin/boutiques/[id]/wipe-data', () => {
  it('vide les données quand le nom correspond → 200 + audit', async () => {
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deleted: Record<string, number> };
    expect(body.ok).toBe(true);
    expect(body.deleted.products).toBe(2);
    expect(prismaMock.product.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1' },
    });
    expect(prismaMock.sale.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } });
    expect(prismaMock.supplierDebt.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1' },
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.wipe_data', targetId: 'org1' }),
    );
  });

  it('accepte le nom avec espaces autour (trim) → 200', async () => {
    const res = await POST(makePost({ confirmName: '  Chez Ali  ' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.product.deleteMany).toHaveBeenCalled();
  });

  it('refuse si le nom ne correspond pas → 400 CONFIRM_MISMATCH, rien supprimé', async () => {
    const res = await POST(makePost({ confirmName: 'Mauvais Nom' }), params);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('CONFIRM_MISMATCH');
    expect(prismaMock.product.deleteMany).not.toHaveBeenCalled();
  });

  it('404 quand la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('BOUTIQUE_NOT_FOUND');
    expect(prismaMock.product.deleteMany).not.toHaveBeenCalled();
  });

  it('400 corps invalide (confirmName manquant)', async () => {
    const res = await POST(makePost({}), params);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
  });

  it('403 sans jeton CSRF', async () => {
    const res = await POST(makePost({ confirmName: 'Chez Ali' }, { csrf: false }), params);
    expect(res.status).toBe(403);
    expect(prismaMock.product.deleteMany).not.toHaveBeenCalled();
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost({ confirmName: 'Chez Ali' }), params);
    expect(res.status).toBe(403);
  });
});
