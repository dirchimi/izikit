// Phase 3 — GET + POST /api/sales (checkout + historique).
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
  return new NextRequest('http://test/api/sales', { method: 'GET' });
}
function makePost(body: unknown, opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'tok';
    headers['cookie'] = 'app-csrf=tok';
  }
  return new NextRequest('http://test/api/sales', {
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

describe('POST /api/sales (checkout)', () => {
  it('vente comptant : crée la vente, décrémente le stock, mouvements OUT → 201', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
      { id: 'p2', name: 'Eau', sellPrice: 500, buyPrice: 300, qty: 30 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(5);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({
        method: 'cash',
        items: [
          { productId: 'p1', qty: 2 },
          { productId: 'p2', qty: 3 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sale.number).toBe('V-0006');
    expect(body.sale.total).toBe(13500);
    // Jeton du lien public de reçu : généré, non vide, et renvoyé au client.
    expect(typeof body.sale.publicToken).toBe('string');
    expect(body.sale.publicToken.length).toBeGreaterThan(0);
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicToken: expect.any(String) }),
      }),
    );
    expect(prismaMock.product.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT', delta: -2 }) }),
    );
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 13500, method: 'CASH' }) }),
    );
    // les lignes figent le prix d'achat (marge des rapports)
    const saleArg = prismaMock.sale.create.mock.calls[0]?.[0] as {
      data: { items: { create: { buyPrice: number }[] } };
    };
    expect(saleArg.data.items.create[0]?.buyPrice).toBe(4500);
  });

  it('applique une remise : total NET = brut − remise, discount enregistré', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({ method: 'cash', discount: 500, items: [{ productId: 'p1', qty: 2 }] }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sale.total).toBe(11500); // 12000 − 500
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 11500, discount: 500, cashAmount: 11500 }),
      }),
    );
  });

  it('remise bornée au brut (jamais de total négatif)', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({ method: 'cash', discount: 999999, items: [{ productId: 'p1', qty: 1 }] }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sale.total).toBe(0); // remise plafonnée à 6000
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ discount: 6000, total: 0 }) }),
    );
  });

  it('409 INSUFFICIENT_STOCK si la quantité dépasse le stock', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, qty: 1 },
    ] as never);
    const res = await POST(makePost({ method: 'cash', items: [{ productId: 'p1', qty: 5 }] }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('INSUFFICIENT_STOCK');
    expect(body.productId).toBe('p1');
    expect(prismaMock.sale.create).not.toHaveBeenCalled();
  });

  it('409 si deux lignes du MÊME produit dépassent le stock une fois cumulées (double scan)', async () => {
    // Stock = 5. Deux lignes de 3 → 3 ≤ 5 ligne par ligne, mais 6 > 5 cumulé.
    // Sans agrégation, la vente passait et le stock tombait à −1.
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 5 },
    ] as never);
    const res = await POST(
      makePost({
        method: 'cash',
        items: [
          { productId: 'p1', qty: 3 },
          { productId: 'p1', qty: 3 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('INSUFFICIENT_STOCK');
    expect(prismaMock.sale.create).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('accepte deux lignes du même produit si le cumul tient dans le stock', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 5 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({
        method: 'cash',
        items: [
          { productId: 'p1', qty: 2 },
          { productId: 'p1', qty: 3 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).sale.total).toBe(30000); // 5 × 6000
  });

  it('404 PRODUCT_NOT_FOUND si un produit n’est pas de la boutique', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([] as never);
    const res = await POST(makePost({ method: 'cash', items: [{ productId: 'pX', qty: 1 }] }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PRODUCT_NOT_FOUND');
  });

  it('422 CREDIT_NEEDS_CUSTOMER si vente à crédit sans client', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, qty: 10 },
    ] as never);
    const res = await POST(makePost({ method: 'credit', items: [{ productId: 'p1', qty: 1 }] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('CREDIT_NEEDS_CUSTOMER');
    expect(prismaMock.sale.create).not.toHaveBeenCalled();
  });

  it('crée le client à la volée pour une vente à crédit (nom fourni) → 201', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, qty: 10 },
    ] as never);
    prismaMock.customer.create.mockResolvedValueOnce({ id: 'c1' } as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.receivable.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({
        method: 'credit',
        items: [{ productId: 'p1', qty: 1 }],
        customer: { name: 'Moussa' },
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Moussa', organizationId: 'org1' }),
      }),
    );
    // une vente à crédit ouvre une créance pour le montant total
    expect(prismaMock.receivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: 'c1',
          saleId: 's1',
          amount: 6000,
          status: 'OPEN',
        }),
      }),
    );
  });

  it('applique le prix de gros quand wholesale=true', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 1000, prixGros: 800, buyPrice: 500, qty: 100 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({ method: 'cash', items: [{ productId: 'p1', qty: 2, wholesale: true }] }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).sale.total).toBe(1600); // 2 × 800 (gros)
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 1600 }) }),
    );
  });

  it('retombe au prix détail si wholesale=true mais prixGros non défini (0)', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 1000, prixGros: 0, buyPrice: 500, qty: 100 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({ method: 'cash', items: [{ productId: 'p1', qty: 2, wholesale: true }] }),
    );
    expect((await res.json()).sale.total).toBe(2000); // 2 × 1000 (détail, fallback)
  });

  it('403 sans CSRF', async () => {
    const res = await POST(
      makePost({ method: 'cash', items: [{ productId: 'p1', qty: 1 }] }, { csrf: 'missing' }),
    );
    expect(res.status).toBe(403);
  });

  it('403 SUBSCRIPTION_EXPIRED quand l’abonnement de la boutique est expiré (hors grâce)', async () => {
    // Essai fini en 2020 → largement au-delà de la grâce → écriture bloquée.
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      plan: 'SOLO',
      trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
      currentPeriodEnd: null,
    } as never);
    const res = await POST(makePost({ method: 'cash', items: [{ productId: 'p1', qty: 1 }] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('SUBSCRIPTION_EXPIRED');
    expect(prismaMock.sale.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/sales', () => {
  it('liste les ventes récentes avec lignes et client', async () => {
    prismaMock.sale.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        number: 'V-0006',
        method: 'CREDIT',
        total: 13500,
        discount: 0,
        cashAmount: 0,
        mobileAmount: 0,
        creditAmount: 13500,
        createdById: 'user-1',
        createdAt: new Date('2026-06-20T10:00:00Z'),
        customer: { name: 'Moussa' },
        items: [{ name: 'Riz', qty: 2, unitPrice: 6000 }],
      },
    ] as never);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'user-1', name: 'Awa', email: 'awa@example.com' },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sales).toHaveLength(1);
    expect(body.sales[0].number).toBe('V-0006');
    expect(body.sales[0].customerName).toBe('Moussa');
    expect(body.sales[0].items[0].name).toBe('Riz');
  });

  it('401 sans session', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});
