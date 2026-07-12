// POST /api/admin/boutiques/[id]/remind — relance manuelle d'abonnement.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({ getEmailQueue: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createNotification } from '@/lib/server/notifications';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { POST } from './route';

const mockSuper = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockAudit = vi.mocked(logAdminAction);
const mockCreateNotif = vi.mocked(createNotification);
const mockGetQueue = vi.mocked(getEmailQueue);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'SUPERADMIN' as const },
};
const params = { params: Promise.resolve({ id: 'org1' }) };

function makePost(opts: { csrf?: boolean } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.csrf !== false) {
    headers['x-csrf-token'] = 'tok';
    headers.cookie = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/admin/boutiques/org1/remind', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuper.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined as never);
  mockCreateNotif.mockResolvedValue({ id: 'notif_1' } as never);
  mockGetQueue.mockReturnValue(null);
  prismaMock.organization.findUnique.mockResolvedValue({
    id: 'org1',
    name: 'Chez Ali',
    plan: 'PREMIUM',
    trialEndsAt: null,
    currentPeriodEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    owner: { id: 'user_1', email: 'ali@test.local', name: 'Ali' },
  } as never);
});

describe('POST /api/admin/boutiques/[id]/remind', () => {
  it('envoie la notif + audite → 200, emailed=false sans file email', async () => {
    const res = await POST(makePost(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; emailed: boolean };
    expect(body.ok).toBe(true);
    expect(body.emailed).toBe(false);
    expect(mockCreateNotif).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user_1', type: 'SUBSCRIPTION_EXPIRY' }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'boutique.remind', targetId: 'org1' }),
    );
  });

  it('envoie aussi un email quand la file est configurée → emailed=true', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    mockGetQueue.mockReturnValue({ enqueue } as never);
    const res = await POST(makePost(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { emailed: boolean };
    expect(body.emailed).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ to: 'ali@test.local' }));
  });

  it('404 quand la boutique est introuvable', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost(), params);
    expect(res.status).toBe(404);
    expect(mockCreateNotif).not.toHaveBeenCalled();
  });

  it('403 sans jeton CSRF', async () => {
    const res = await POST(makePost({ csrf: false }), params);
    expect(res.status).toBe(403);
    expect(mockCreateNotif).not.toHaveBeenCalled();
  });

  it('403 sans session superadmin', async () => {
    mockSuper.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 403 }));
    const res = await POST(makePost(), params);
    expect(res.status).toBe(403);
  });
});
