// Phase 4 — GET + POST /api/customers.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/customers', { method: 'GET' });
}
function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/customers', {
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
  mockRequireOrgRole.mockResolvedValue(orgCtx);
});

describe('GET /api/customers', () => {
  it('liste les clients de la boutique', async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([
      { id: 'c1', name: 'Amina', phone: '90 00 00 00' },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customers[0].name).toBe('Amina');
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1' } }),
    );
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/customers', () => {
  it('crée un client → 201', async () => {
    prismaMock.customer.create.mockResolvedValueOnce({
      id: 'c2',
      name: 'Boutique Al-Nour',
      phone: null,
    } as never);
    const res = await POST(makePost({ name: 'Boutique Al-Nour' }));
    expect(res.status).toBe(201);
    expect((await res.json()).customer.id).toBe('c2');
  });

  it('400 si nom manquant', async () => {
    const res = await POST(makePost({ phone: '90 00 00 00' }));
    expect(res.status).toBe(400);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makePost({ name: 'X' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
  });
});
