// Phase 1 — GET + PATCH /api/org/current.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
  requireOrgRole: vi.fn(),
}));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({
  ensureBoutique: vi.fn(),
  getPrimaryMembership: vi.fn(),
}));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { ensureBoutique, getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET, PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockEnsure = vi.mocked(ensureBoutique);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const boutiqueCtx = {
  organization: { id: 'org1', slug: 'me', name: 'Me' },
  settings: {
    currency: 'XAF',
    phone: null,
    city: null,
    address: null,
    invoiceNote: null,
    logoUrl: null,
    overdueDays: 30,
    bigExpenseThreshold: 50000,
  },
  role: 'OWNER' as const,
};
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/org/current', { method: 'GET' });
}
function makePatch(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/org/current', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/org/current', () => {
  it('crée+retourne la boutique du user', async () => {
    mockEnsure.mockResolvedValueOnce(boutiqueCtx);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organization.id).toBe('org1');
    expect(body.role).toBe('OWNER');
    expect(body.settings.currency).toBe('XAF');
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/org/current', () => {
  it('403 si MEMBER', async () => {
    mockPrimary.mockResolvedValueOnce({ organizationId: 'org1', role: 'MEMBER' });
    mockRequireOrgRole.mockResolvedValueOnce(
      NextResponse.json({ error: 'ORG_ROLE_INSUFFICIENT' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ phone: '+235 66 11' }));
    expect(res.status).toBe(403);
  });

  it('404 si aucune boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await PATCH(makePatch({ phone: '+235 66 11' }));
    expect(res.status).toBe(404);
  });

  it('403 sans CSRF', async () => {
    const res = await PATCH(makePatch({ phone: 'x' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
  });

  it('met à jour le nom + les settings (ADMIN/OWNER)', async () => {
    mockPrimary.mockResolvedValueOnce({ organizationId: 'org1', role: 'OWNER' });
    mockRequireOrgRole.mockResolvedValueOnce(orgCtx);
    prismaMock.organization.update.mockResolvedValueOnce({
      id: 'org1',
      slug: 'me',
      name: 'Boutique Amir',
    } as never);
    prismaMock.boutiqueSettings.upsert.mockResolvedValueOnce({
      currency: 'XAF',
      phone: '+235 66 11',
      city: null,
      address: null,
      invoiceNote: null,
    } as never);

    const res = await PATCH(makePatch({ name: 'Boutique Amir', phone: '+235 66 11' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organization.name).toBe('Boutique Amir');
    expect(body.settings.phone).toBe('+235 66 11');
    expect(prismaMock.organization.update).toHaveBeenCalled();
    expect(prismaMock.boutiqueSettings.upsert).toHaveBeenCalled();
  });

  it('persiste les seuils de notifications (overdueDays + bigExpenseThreshold)', async () => {
    mockPrimary.mockResolvedValueOnce({ organizationId: 'org1', role: 'OWNER' });
    mockRequireOrgRole.mockResolvedValueOnce(orgCtx);
    prismaMock.organization.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'org1',
      slug: 'me',
      name: 'Me',
    } as never);
    prismaMock.boutiqueSettings.upsert.mockResolvedValueOnce({
      currency: 'XAF',
      phone: null,
      city: null,
      address: null,
      invoiceNote: null,
      logoUrl: null,
      overdueDays: 15,
      bigExpenseThreshold: 100000,
    } as never);

    const res = await PATCH(makePatch({ overdueDays: 15, bigExpenseThreshold: 100000 }));
    expect(res.status).toBe(200);
    const upsertArg = prismaMock.boutiqueSettings.upsert.mock.calls[0]![0] as {
      update: { overdueDays?: number; bigExpenseThreshold?: number };
    };
    expect(upsertArg.update.overdueDays).toBe(15);
    expect(upsertArg.update.bigExpenseThreshold).toBe(100000);
  });

  it('rejette un overdueDays hors bornes (400)', async () => {
    mockPrimary.mockResolvedValueOnce({ organizationId: 'org1', role: 'OWNER' });
    mockRequireOrgRole.mockResolvedValueOnce(orgCtx);
    const res = await PATCH(makePatch({ overdueDays: 0 }));
    expect(res.status).toBe(400);
  });
});

describe('source invariants', () => {
  it("contient runtime='nodejs', verifyCsrf, withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('verifyCsrf');
    expect(src).toContain('withRequestContext');
  });
});
