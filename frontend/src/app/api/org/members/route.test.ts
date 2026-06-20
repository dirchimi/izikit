// Phase 1 — GET + POST /api/org/members.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
  requireOrgRole: vi.fn(),
}));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({
  getPrimaryMembership: vi.fn(),
}));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const ownerGate = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/org/members', { method: 'GET' });
}
function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/org/members', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'OWNER' });
  mockRequireOrgRole.mockResolvedValue(ownerGate);
});

describe('GET /api/org/members', () => {
  it("liste les membres de l'org", async () => {
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([
      {
        id: 'm1',
        userId: 'user-1',
        role: 'OWNER',
        user: { email: 'me@example.com', name: 'Moi' },
      },
      {
        id: 'm2',
        userId: 'user-2',
        role: 'MEMBER',
        user: { email: 'vendeur@example.com', name: null },
      },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(2);
    expect(body.members[0]).toEqual({
      id: 'm1',
      userId: 'user-1',
      email: 'me@example.com',
      name: 'Moi',
      role: 'OWNER',
    });
  });

  it('404 si le user n’a pas de boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/org/members', () => {
  it('422 si email non inscrit', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makePost({ email: 'inconnu@example.com' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('USER_NOT_REGISTERED');
  });

  it('ajoute un utilisateur existant en MEMBER → 201', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-2',
      email: 'vendeur@example.com',
      name: 'Aicha',
    } as never);
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(null);
    prismaMock.organizationMember.create.mockResolvedValueOnce({
      id: 'm2',
      userId: 'user-2',
      role: 'MEMBER',
    } as never);
    const res = await POST(makePost({ email: 'vendeur@example.com' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.member).toEqual({
      id: 'm2',
      userId: 'user-2',
      email: 'vendeur@example.com',
      name: 'Aicha',
      role: 'MEMBER',
    });
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org1', userId: 'user-2', role: 'MEMBER' }),
      }),
    );
  });

  it('409 si déjà membre', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-2',
      email: 'vendeur@example.com',
      name: 'Aicha',
    } as never);
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({ id: 'm2' } as never);
    const res = await POST(makePost({ email: 'vendeur@example.com' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_MEMBER');
  });

  it('403 si appelant MEMBER (requireOrgRole)', async () => {
    mockRequireOrgRole.mockResolvedValueOnce(
      NextResponse.json({ error: 'ORG_ROLE_INSUFFICIENT' }, { status: 403 }),
    );
    const res = await POST(makePost({ email: 'vendeur@example.com' }));
    expect(res.status).toBe(403);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makePost({ email: 'vendeur@example.com' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
  });
});
