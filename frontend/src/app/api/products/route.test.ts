// Phase 2 — GET + POST /api/products.
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
const orgCtx = {
  user: authedCtx.user,
  orgMember: { organizationId: 'org1', userId: 'user-1', role: 'OWNER' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/products', { method: 'GET' });
}
function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/products', {
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
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
});

describe('GET /api/products', () => {
  it('liste les produits avec statut dérivé', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        ref: 'P-1',
        name: 'Riz',
        category: 'Alim',
        buyPrice: 4200,
        sellPrice: 6000,
        qty: 3,
        threshold: 5,
      },
      {
        id: 'p2',
        ref: 'P-2',
        name: 'Eau',
        category: 'Boissons',
        buyPrice: 300,
        sellPrice: 500,
        qty: 30,
        threshold: 12,
      },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toHaveLength(2);
    expect(body.products[0].status).toBe('low');
    expect(body.products[1].status).toBe('ok');
  });

  it('404 sans boutique', async () => {
    mockPrimary.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/products', () => {
  it('crée un produit + mouvement IN initial → 201', async () => {
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'p9',
      ref: 'P-9',
      name: 'Sucre',
      category: 'Alim',
      buyPrice: 900,
      sellPrice: 1400,
      qty: 8,
      threshold: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);

    const res = await POST(
      makePost({
        name: 'Sucre',
        category: 'Alim',
        buyPrice: 900,
        sellPrice: 1400,
        qty: 8,
        threshold: 4,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.product.status).toBe('ok');
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'IN', delta: 8, organizationId: 'org1' }),
      }),
    );
  });

  it('stock pris « en prêt » → crée une dette fournisseur du reste dû (borné au coût)', async () => {
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'p9',
      ref: 'P-9',
      name: 'Sucre',
      category: 'Alim',
      buyPrice: 1000,
      sellPrice: 1400,
      qty: 10,
      threshold: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);
    prismaMock.supplierDebt.create.mockResolvedValueOnce({} as never);

    // Coût = 10 × 1000 = 10000. Payé 4000 → reste dû 6000.
    const res = await POST(
      makePost({
        name: 'Sucre',
        category: 'Alim',
        buyPrice: 1000,
        sellPrice: 1400,
        qty: 10,
        threshold: 4,
        supplierDebt: { amount: 6000, supplierName: 'Grossiste Ali' },
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.supplierDebt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org1',
          productId: 'p9',
          label: 'Sucre',
          amount: 6000,
          supplierName: 'Grossiste Ali',
          status: 'OPEN',
        }),
      }),
    );
  });

  it('borne la dette fournisseur au coût du stock ajouté', async () => {
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'p9',
      ref: 'P-9',
      name: 'Sucre',
      category: 'Alim',
      buyPrice: 500,
      sellPrice: 700,
      qty: 4,
      threshold: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);
    prismaMock.supplierDebt.create.mockResolvedValueOnce({} as never);

    // Coût = 4 × 500 = 2000. Dette demandée 999999 → bornée à 2000.
    await POST(
      makePost({
        name: 'Sucre',
        category: 'Alim',
        buyPrice: 500,
        sellPrice: 700,
        qty: 4,
        supplierDebt: { amount: 999999 },
      }),
    );
    expect(prismaMock.supplierDebt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2000 }) }),
    );
  });

  it('sans supplierDebt → aucune dette créée', async () => {
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'p9',
      ref: 'P-9',
      name: 'Sucre',
      category: 'Alim',
      buyPrice: 900,
      sellPrice: 1400,
      qty: 8,
      threshold: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);
    await POST(makePost({ name: 'Sucre', category: 'Alim', buyPrice: 900, qty: 8 }));
    expect(prismaMock.supplierDebt.create).not.toHaveBeenCalled();
  });

  it('400 si nom manquant', async () => {
    const res = await POST(makePost({ category: 'Alim' }));
    expect(res.status).toBe(400);
  });

  it('403 sans CSRF', async () => {
    const res = await POST(makePost({ name: 'X', category: 'Y' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
  });

  it('409 si réf déjà prise (P2002)', async () => {
    prismaMock.product.create.mockRejectedValueOnce({ code: 'P2002' } as never);
    const res = await POST(makePost({ ref: 'P-1', name: 'Dup', category: 'Alim' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REF_TAKEN');
  });

  it('409 BARCODE_TAKEN si code-barres en double (P2002 sur barcode)', async () => {
    prismaMock.product.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['organizationId', 'barcode'] },
    } as never);
    const res = await POST(makePost({ name: 'Dup', category: 'Alim', barcode: '3011234' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('BARCODE_TAKEN');
  });

  it('exige le rôle ADMIN (Manager) — le Vendeur ne crée pas de produit', async () => {
    prismaMock.product.create.mockResolvedValueOnce({
      id: 'p9',
      ref: 'P-9',
      name: 'Sucre',
      category: 'Alim',
      buyPrice: 900,
      sellPrice: 1400,
      qty: 8,
      threshold: 4,
    } as never);
    prismaMock.stockMovement.create.mockResolvedValueOnce({} as never);
    await POST(makePost({ name: 'Sucre', category: 'Alim', qty: 8 }));
    expect(mockRequireOrgRole).toHaveBeenCalledWith('org1', 'ADMIN');
  });
});
