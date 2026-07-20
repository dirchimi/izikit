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
    // Task 4.1 — stock suffisant : aucun conflit (convention : tableau vide, jamais absent).
    expect(body.stockConflicts).toEqual([]);
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

  it('Task 4.1 — stock insuffisant au sync : enregistre la vente + signale le conflit (pas de rejet)', async () => {
    // La marchandise a déjà quitté la boutique (vendue offline) ; un autre
    // appareil a épuisé le stock serveur entre-temps. On enregistre la vente et
    // on borne le stock à 0 au lieu de refuser (perte d'une vente réelle).
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 1 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(makePost({ method: 'cash', items: [{ productId: 'p1', qty: 5 }] }));
    // La vente EST créée (succès), pas un 409.
    expect(res.status).toBe(201);
    const body = await res.json();
    // Total = quantité réellement vendue × prix (5 × 6000), pas le stock résiduel.
    expect(body.sale.total).toBe(30000);
    // Le conflit est signalé avec l'écart exact.
    expect(body.stockConflicts).toEqual([
      { productId: 'p1', name: 'Riz', requested: 5, available: 1, shortfall: 4 },
    ]);
    // Stock plancher 0 : décrément clampé à min(5, 1) = 1 (jamais négatif).
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { qty: { decrement: 1 } } }),
    );
    // Mouvement OUT du MÊME montant clampé (−1) → qty = Σ delta reste vrai.
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT', delta: -1 }) }),
    );
  });

  it('Task 4.1 — double scan du même produit au-delà du stock : enregistre + signale (delta clampé, agrégé)', async () => {
    // Stock = 5. Deux lignes de 3 → 6 cumulé > 5. La vente est enregistrée, le
    // conflit signalé (shortfall 1), un seul mouvement clampé à −5.
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
          { productId: 'p1', qty: 3 },
          { productId: 'p1', qty: 3 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sale.total).toBe(36000); // 6 × 6000 (quantité réellement vendue)
    expect(body.stockConflicts).toEqual([
      { productId: 'p1', name: 'Riz', requested: 6, available: 5, shortfall: 1 },
    ]);
    // Un seul décrément agrégé, clampé à min(6, 5) = 5 (stock plancher 0).
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { qty: { decrement: 5 } } }),
    );
    expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: -5 }) }),
    );
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

  it('Task 4.1 — PAYMENT_MISMATCH rejette toujours (validation réelle non affaiblie)', async () => {
    // La ventilation (1) ne couvre pas le total NET (6000) → rejet dur 422,
    // aucune vente créée. Le passage record+flag ne touche QUE le stock.
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    const res = await POST(
      makePost({
        items: [{ productId: 'p1', qty: 1 }],
        payments: [{ method: 'cash', amount: 1 }],
      }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('PAYMENT_MISMATCH');
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

describe('POST /api/sales — idempotence offline (id client + clientOpId)', () => {
  it('deux POST avec le même id : une seule Sale, stock décrémenté une fois, 2e réponse = 200', async () => {
    // --- 1er POST : crée la vente (aucune opération offline connue) ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 'sale-client-1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const first = await POST(
      makePost({ id: 'sale-client-1', method: 'cash', items: [{ productId: 'p1', qty: 2 }] }),
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.sale.id).toBe('sale-client-1');
    expect(prismaMock.sale.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);

    // Ce que withIdempotency a mémoïsé (JSON) pour ce clientOpId.
    const memoized = {
      kind: 'OK',
      saleId: 'sale-client-1',
      number: firstBody.sale.number,
      total: firstBody.sale.total,
      publicToken: firstBody.sale.publicToken,
    };

    // --- 2e POST : même id → rejoué, résultat mémoïsé, aucune ré-exécution ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op1',
      organizationId: 'org1',
      clientOpId: 'sale-client-1',
      endpoint: 'sales',
      resultJson: memoized,
      createdAt: new Date(),
    } as never);

    const second = await POST(
      makePost({ id: 'sale-client-1', method: 'cash', items: [{ productId: 'p1', qty: 2 }] }),
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.sale.id).toBe('sale-client-1');
    expect(secondBody.sale.number).toBe(firstBody.sale.number);
    expect(secondBody.sale.total).toBe(firstBody.sale.total);

    // Pas de duplication : ni Sale, ni décrément de stock une seconde fois.
    expect(prismaMock.sale.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(1);
  });

  it('rejeu d’un resultJson mémoïsé pré-Task-4.1 (sans clé stockConflicts) → réponse stockConflicts = []', async () => {
    // Simule une OfflineOperation mémoïsée par du code antérieur à Task 4.1 : le
    // resultJson n'a jamais eu de champ stockConflicts (undefined, pas [] ni absent
    // du JSON stocké). Le contrat "toujours un tableau" doit tenir quand même.
    const legacyMemoized = {
      kind: 'OK',
      saleId: 'sale-legacy-1',
      number: 'V-0001',
      total: 12000,
      publicToken: 'tok-legacy-1',
      // pas de stockConflicts ici — reproduit une mémoïsation pré-Task-4.1
    };

    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op-legacy',
      organizationId: 'org1',
      clientOpId: 'sale-legacy-1',
      endpoint: 'sales',
      resultJson: legacyMemoized,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({ id: 'sale-legacy-1', method: 'cash', items: [{ productId: 'p1', qty: 1 }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sale.id).toBe('sale-legacy-1');
    // Le contrat "toujours un tableau" tient même sur une mémoïsation legacy sans la clé.
    expect(body.stockConflicts).toEqual([]);
  });

  it('online inchangé : POST sans id → Sale créée, numéro V- serveur, aucune OfflineOperation', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(4);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's-server' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(makePost({ method: 'cash', items: [{ productId: 'p1', qty: 2 }] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sale.id).toBe('s-server');
    expect(body.sale.number).toBe('V-0005');
    // clientOpId null → chemin online pur : la table d'idempotence n'est jamais touchée.
    expect(prismaMock.offlineOperation.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();
  });

  it("utilise l'id client fourni verbatim comme id de la Sale", async () => {
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 'cuid-client-xyz' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({ id: 'cuid-client-xyz', method: 'cash', items: [{ productId: 'p1', qty: 1 }] }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'cuid-client-xyz' }) }),
    );
  });

  it('StockMovement porte clientOpId = `${saleId}:${productId}` (dédup par item)', async () => {
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 'sale-9' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({ id: 'sale-9', method: 'cash', items: [{ productId: 'p1', qty: 2 }] }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientOpId: 'sale-9:p1' }) }),
    );
  });

  it('double scan du même produit : un seul StockMovement agrégé (pas de collision clientOpId)', async () => {
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 'sale-agg' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({
        id: 'sale-agg',
        method: 'cash',
        items: [
          { productId: 'p1', qty: 2 },
          { productId: 'p1', qty: 3 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    // Un seul mouvement, delta cumulé = −5, clientOpId unique par (vente, produit).
    expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delta: -5, clientOpId: 'sale-agg:p1' }),
      }),
    );
  });

  it('un rejet de validation (crédit sans client) ne mémoïse RIEN : aucune OfflineOperation créée', async () => {
    // Task 4.1 — le stock insuffisant n'est plus un rejet ; on couvre ici
    // l'invariant « rollback ⇒ pas de mémoïsation » avec une rejection qui LÈVE
    // toujours (CREDIT_NEEDS_CUSTOMER). Le rejet fait avorter la $transaction →
    // withIdempotency n'atteint jamais son `create`. Sans ce rollback, l'échec
    // serait mémoïsé et rejouerait la même erreur pour toujours.
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);

    const res = await POST(
      makePost({ id: 'sale-reject-1', method: 'credit', items: [{ productId: 'p1', qty: 1 }] }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('CREDIT_NEEDS_CUSTOMER');
    // Le rejet ne doit persister NI la vente NI une ligne d'idempotence.
    expect(prismaMock.sale.create).not.toHaveBeenCalled();
    expect(prismaMock.offlineOperation.create).not.toHaveBeenCalled();
  });

  it('Task 4.1 — rejeu idempotent d’une vente en conflit de stock : même vente + mêmes stockConflicts, pas de double décrément', async () => {
    // --- 1er POST : stock insuffisant → vente enregistrée + conflit, mémoïsé ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 1 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 'sale-conflict-1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const first = await POST(
      makePost({ id: 'sale-conflict-1', method: 'cash', items: [{ productId: 'p1', qty: 5 }] }),
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.sale.id).toBe('sale-conflict-1');
    expect(firstBody.stockConflicts).toEqual([
      { productId: 'p1', name: 'Riz', requested: 5, available: 1, shortfall: 4 },
    ]);
    // Le conflit est désormais un SUCCÈS → il EST mémoïsé (contrairement à un rejet).
    expect(prismaMock.offlineOperation.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.sale.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);

    // Ce que withIdempotency a mémoïsé (JSON) pour ce clientOpId — conflit inclus.
    const memoized = {
      kind: 'OK',
      saleId: 'sale-conflict-1',
      number: firstBody.sale.number,
      total: firstBody.sale.total,
      publicToken: firstBody.sale.publicToken,
      stockConflicts: firstBody.stockConflicts,
    };

    // --- 2e POST : même id → rejoué, résultat mémoïsé, aucune ré-exécution ---
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op1',
      organizationId: 'org1',
      clientOpId: 'sale-conflict-1',
      endpoint: 'sales',
      resultJson: memoized,
      createdAt: new Date(),
    } as never);

    const second = await POST(
      makePost({ id: 'sale-conflict-1', method: 'cash', items: [{ productId: 'p1', qty: 5 }] }),
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.sale.id).toBe('sale-conflict-1');
    // Les mêmes stockConflicts sont restitués depuis le resultJson mémoïsé.
    expect(secondBody.stockConflicts).toEqual(firstBody.stockConflicts);
    // Aucun double décrément : Sale/update/mouvement ne repassent pas.
    expect(prismaMock.sale.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(1);
  });

  it('client créé offline : utilise customer.id fourni verbatim quand introuvable en base', async () => {
    prismaMock.offlineOperation.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.offlineOperation.create.mockResolvedValueOnce({} as never);
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.customer.findUnique.mockResolvedValueOnce(null as never); // pas encore synchronisé
    prismaMock.customer.create.mockResolvedValueOnce({ id: 'cust-client-1' } as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 'sale-10' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);
    prismaMock.receivable.create.mockResolvedValue({} as never);

    const res = await POST(
      makePost({
        id: 'sale-10',
        method: 'credit',
        items: [{ productId: 'p1', qty: 1 }],
        customer: { id: 'cust-client-1', name: 'Fatou' },
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'cust-client-1',
          name: 'Fatou',
          organizationId: 'org1',
        }),
      }),
    );
  });
});

describe('POST /api/sales — Task 6.2 : createdAt client borné (offline entry time)', () => {
  function saleCreateData(): { createdAt?: Date } {
    const call = prismaMock.sale.create.mock.calls[0]?.[0] as { data: { createdAt?: Date } };
    return call.data;
  }

  it('createdAt valide (passé récent) : repris tel quel sur Sale.createdAt', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // hier
    const res = await POST(
      makePost({ method: 'cash', items: [{ productId: 'p1', qty: 1 }], createdAt: past }),
    );
    expect(res.status).toBe(201);
    expect(saleCreateData().createdAt?.toISOString()).toBe(past);
  });

  it('createdAt dans le futur : repli sur now() (pas la valeur future)', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
    const res = await POST(
      makePost({ method: 'cash', items: [{ productId: 'p1', qty: 1 }], createdAt: future }),
    );
    expect(res.status).toBe(201);
    const createdAt = saleCreateData().createdAt;
    expect(createdAt).toBeDefined();
    expect(createdAt).not.toEqual(new Date(future));
    expect(Math.abs((createdAt as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('createdAt trop ancien (> 30j) : repli sur now()', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const ancient = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45j
    const res = await POST(
      makePost({ method: 'cash', items: [{ productId: 'p1', qty: 1 }], createdAt: ancient }),
    );
    expect(res.status).toBe(201);
    const createdAt = saleCreateData().createdAt;
    expect(createdAt).toBeDefined();
    expect(Math.abs((createdAt as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('sans createdAt (online) : la clé est omise, @default(now()) du schéma s’applique — comportement inchangé', async () => {
    prismaMock.product.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Riz', sellPrice: 6000, buyPrice: 4500, qty: 10 },
    ] as never);
    prismaMock.sale.count.mockResolvedValueOnce(0);
    prismaMock.sale.create.mockResolvedValueOnce({ id: 's1' } as never);
    prismaMock.product.update.mockResolvedValue({} as never);
    prismaMock.stockMovement.create.mockResolvedValue({} as never);

    const res = await POST(makePost({ method: 'cash', items: [{ productId: 'p1', qty: 1 }] }));
    expect(res.status).toBe(201);
    expect('createdAt' in saleCreateData()).toBe(false);
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
