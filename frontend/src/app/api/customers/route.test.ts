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

describe('POST /api/customers — idempotence offline (Task 0.5)', () => {
  it('deux POST avec le même id : le 2e rejoue le même client (200), aucun doublon', async () => {
    const existing = { id: 'client-offline-1', name: 'Amina', phone: null };

    // 1er appel : création normale, id client accepté tel quel.
    prismaMock.customer.create.mockResolvedValueOnce(existing as never);
    const res1 = await POST(makePost({ id: 'client-offline-1', name: 'Amina' }));
    expect(res1.status).toBe(201);
    expect((await res1.json()).customer).toEqual(existing);
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'client-offline-1' }) }),
    );

    // 2e appel (replay) : create rejette en P2002 (id déjà pris), le handler
    // doit refetch et renvoyer le client existant sans en créer un second.
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['id'] },
    });
    prismaMock.customer.create.mockRejectedValueOnce(p2002 as never);
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      ...existing,
      organizationId: 'org1',
    } as never);

    const res2 = await POST(makePost({ id: 'client-offline-1', name: 'Amina' }));
    expect(res2.status).toBe(200);
    expect((await res2.json()).customer).toEqual(existing);
    expect(prismaMock.customer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'client-offline-1' } }),
    );
    // Un seul create a réellement abouti au total (le 2e a levé P2002).
    expect(prismaMock.customer.create).toHaveBeenCalledTimes(2);
  });

  it('online inchangé : POST sans id → création avec id serveur, 201', async () => {
    prismaMock.customer.create.mockResolvedValueOnce({
      id: 'server-generated-id',
      name: 'Boutique Sans Id',
      phone: null,
    } as never);

    const res = await POST(makePost({ name: 'Boutique Sans Id' }));
    expect(res.status).toBe(201);
    expect((await res.json()).customer.id).toBe('server-generated-id');
    const createArg = prismaMock.customer.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).not.toHaveProperty('id');
    expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
  });

  it('garde-fou cross-tenant : id existant appartient à une autre org → erreur, pas de fuite', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['id'] },
    });
    prismaMock.customer.create.mockRejectedValueOnce(p2002 as never);
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      id: 'client-other-org',
      name: 'Client Autre Boutique',
      phone: null,
      organizationId: 'org-OTHER',
    } as never);

    const res = await POST(makePost({ id: 'client-other-org', name: 'Client Autre Boutique' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('CUSTOMER_ID_CONFLICT');
    // On ne doit jamais renvoyer les données du client de l'autre boutique.
    expect(JSON.stringify(body)).not.toContain('org-OTHER');
  });
});
