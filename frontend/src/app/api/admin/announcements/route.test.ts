// POST /api/admin/announcements — diffusion d'une annonce aux patrons.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/notifications', () => ({ createNotification: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createNotification } from '@/lib/server/notifications';
import { POST } from './route';

const mockSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);
const mockCreateNotif = vi.mocked(createNotification);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'SUPERADMIN' as const },
};

function makePost(body: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/admin/announcements', {
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
  mockCreateNotif.mockResolvedValue({ id: 'n' } as never);
  prismaMock.organization.findMany.mockResolvedValue([
    { ownerId: 'o1' },
    { ownerId: 'o2' },
    { ownerId: 'o1' }, // doublon : un patron avec 2 boutiques
  ] as never);
});

describe('POST /api/admin/announcements', () => {
  it('diffuse à chaque patron distinct → 200 + audit', async () => {
    const res = await POST(makePost({ title: 'Info', body: 'Bonjour à tous' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; recipients: number; sent: number };
    expect(body).toMatchObject({ ok: true, recipients: 2, sent: 2 });
    expect(mockCreateNotif).toHaveBeenCalledTimes(2); // o1 et o2, dédupliqués
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'announcement.send' }),
    );
  });

  it('400 quand le titre ou le message est vide', async () => {
    const res = await POST(makePost({ title: '', body: 'x' }));
    expect(res.status).toBe(400);
    expect(mockCreateNotif).not.toHaveBeenCalled();
  });

  it('403 sans jeton CSRF', async () => {
    const res = await POST(makePost({ title: 'Info', body: 'x' }, { csrf: false }));
    expect(res.status).toBe(403);
    expect(mockCreateNotif).not.toHaveBeenCalled();
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost({ title: 'Info', body: 'x' }));
    expect(res.status).toBe(403);
  });
});
