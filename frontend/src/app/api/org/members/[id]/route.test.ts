// Phase 1 — PATCH (rôle) + DELETE (retrait) /api/org/members/[id].
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
import { PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const ownerGate = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function makeReq(method: 'PATCH' | 'DELETE', body?: unknown, csrf: 'match' | 'missing' = 'match') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return body === undefined
    ? new NextRequest('http://test/api/org/members/m2', { method, headers })
    : new NextRequest('http://test/api/org/members/m2', {
        method,
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
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('PATCH /api/org/members/[id]', () => {
  it('OWNER passe un MEMBER en ADMIN → 200', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: 'm2',
      organizationId: 'org1',
      userId: 'user-2',
      role: 'MEMBER',
    } as never);
    prismaMock.organizationMember.update.mockResolvedValueOnce({
      id: 'm2',
      userId: 'user-2',
      role: 'ADMIN',
    } as never);
    const res = await PATCH(makeReq('PATCH', { role: 'ADMIN' }), params('m2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.role).toBe('ADMIN');
  });

  it('409 LAST_OWNER si on rétrograde le seul OWNER', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: 'm2',
      organizationId: 'org1',
      userId: 'user-2',
      role: 'OWNER',
    } as never);
    prismaMock.organizationMember.count.mockResolvedValueOnce(1);
    const res = await PATCH(makeReq('PATCH', { role: 'MEMBER' }), params('m2'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('LAST_OWNER');
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('404 si le membre n’appartient pas à la boutique', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: 'm2',
      organizationId: 'autre-org',
      userId: 'user-2',
      role: 'MEMBER',
    } as never);
    const res = await PATCH(makeReq('PATCH', { role: 'ADMIN' }), params('m2'));
    expect(res.status).toBe(404);
  });

  it('403 si appelant non-OWNER', async () => {
    mockRequireOrgRole.mockResolvedValueOnce(
      NextResponse.json({ error: 'ORG_ROLE_INSUFFICIENT' }, { status: 403 }),
    );
    const res = await PATCH(makeReq('PATCH', { role: 'ADMIN' }), params('m2'));
    expect(res.status).toBe(403);
  });

  it('403 sans CSRF', async () => {
    const res = await PATCH(makeReq('PATCH', { role: 'ADMIN' }, 'missing'), params('m2'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/org/members/[id]', () => {
  it('retire un membre → 200', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: 'm2',
      organizationId: 'org1',
      role: 'MEMBER',
    } as never);
    prismaMock.organizationMember.delete.mockResolvedValueOnce({ id: 'm2' } as never);
    const res = await DELETE(makeReq('DELETE'), params('m2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('409 LAST_OWNER si dernier OWNER', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
      id: 'm2',
      organizationId: 'org1',
      role: 'OWNER',
    } as never);
    prismaMock.organizationMember.count.mockResolvedValueOnce(1);
    const res = await DELETE(makeReq('DELETE'), params('m2'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('LAST_OWNER');
    expect(prismaMock.organizationMember.delete).not.toHaveBeenCalled();
  });
});
