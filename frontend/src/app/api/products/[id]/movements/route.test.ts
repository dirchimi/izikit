// GET /api/products/[id]/movements — historique des mouvements (LOT 2).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn(), requireOrgRole: vi.fn() }));
vi.mock('@/lib/server/boutique/ensure-boutique', () => ({ getPrimaryMembership: vi.fn() }));

import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgRole = vi.mocked(requireOrgRole);
const mockPrimary = vi.mocked(getPrimaryMembership);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'MEMBER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/products/p1/movements', { method: 'GET' });
}
function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockPrimary.mockResolvedValue({ organizationId: 'org1', role: 'MEMBER' });
  mockRequireOrgRole.mockResolvedValue(orgCtx);
});

describe('GET /api/products/[id]/movements', () => {
  it('cumule le stock résultant et renvoie le plus récent en premier', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({
      organizationId: 'org1',
      name: 'Riz',
      unite: 'pièce',
    } as never);
    // La route lit désormais les mouvements du plus récent au plus ancien
    // (orderBy desc, take borné) → le mock renvoie m3, m2, m1.
    prismaMock.stockMovement.findMany.mockResolvedValueOnce([
      {
        id: 'm3',
        type: 'ADJUST',
        delta: 5,
        reason: 'Inventaire',
        createdAt: new Date('2026-06-03'),
        createdById: null,
      },
      {
        id: 'm2',
        type: 'OUT',
        delta: -3,
        reason: 'sale',
        createdAt: new Date('2026-06-02'),
        createdById: 'u2',
      },
      {
        id: 'm1',
        type: 'IN',
        delta: 10,
        reason: 'initial',
        createdAt: new Date('2026-06-01'),
        createdById: 'u1',
      },
    ] as never);
    // Somme totale des deltas = stock courant (10 − 3 + 5 = 12) : sert à
    // redérouler le stock résultant sur la fenêtre affichée.
    prismaMock.stockMovement.aggregate.mockResolvedValueOnce({ _sum: { delta: 12 } } as never);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'u1', name: 'Patron', email: 'p@x' },
      { id: 'u2', name: null, email: 'emp@x' },
    ] as never);

    const res = await GET(makeGet(), params('p1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movements).toHaveLength(3);
    // plus récent (m3) en premier ; stock résultant cumulé depuis l'origine
    expect(body.movements[0].id).toBe('m3');
    expect(body.movements[0].resultingStock).toBe(12);
    expect(body.movements[1].id).toBe('m2');
    expect(body.movements[1].resultingStock).toBe(7);
    expect(body.movements[2].id).toBe('m1');
    expect(body.movements[2].resultingStock).toBe(10);
    // auteur résolu (name sinon email), null si aucun
    expect(body.movements[2].author).toBe('Patron');
    expect(body.movements[1].author).toBe('emp@x');
    expect(body.movements[0].author).toBeNull();
  });

  it('404 si le produit est hors boutique', async () => {
    prismaMock.product.findUnique.mockResolvedValueOnce({
      organizationId: 'autre',
      name: 'X',
      unite: 'pièce',
    } as never);
    const res = await GET(makeGet(), params('p1'));
    expect(res.status).toBe(404);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet(), params('p1'));
    expect(res.status).toBe(401);
  });
});
