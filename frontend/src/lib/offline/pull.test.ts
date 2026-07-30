// @vitest-environment jsdom
/**
 * pull.ts — companion unit test (Task 1.3).
 *
 * Same jsdom + `fake-indexeddb/auto` setup as `db.test.ts` (Dexie needs a
 * real-shaped IndexedDB API). `@/lib/api` is mocked so no network call is
 * made — `pullAll`/`pullResource` only depend on `api()`'s return value.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';
import { api } from '@/lib/api';
import {
  pullAll,
  pullResource,
  getOrgId,
  getRole,
  getMemberNames,
  type PullResponse,
} from './pull';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
}));

const mockedApi = vi.mocked(api);

function makeResponse(overrides: Partial<PullResponse> = {}): PullResponse {
  return {
    products: [
      {
        id: 'p1',
        organizationId: 'o1',
        ref: 'RIZ-1',
        name: 'Riz',
        category: 'Alimentation',
        buyPrice: 400,
        sellPrice: 500,
        prixGros: 0,
        unite: 'piece',
        qty: 5,
        threshold: 2,
        imageUrl: null,
        barcode: null,
        expiryDate: null,
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    customers: [
      {
        id: 'c1',
        organizationId: 'o1',
        name: 'Awa',
        phone: '221700000000',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    sales: [
      {
        id: 's1',
        organizationId: 'o1',
        number: 'V-1',
        customerId: 'c1',
        method: 'CASH',
        total: 1000,
        discount: 0,
        cashAmount: 1000,
        mobileAmount: 0,
        creditAmount: 0,
        publicToken: null,
        status: 'ACTIVE',
        cancelledAt: null,
        cancelledById: null,
        cancelReason: null,
        createdById: 'u1',
        createdAt: '2026-07-20T00:00:00.000Z',
        items: [
          {
            id: 'si1',
            saleId: 's1',
            productId: 'p1',
            name: 'Riz',
            qty: 2,
            unitPrice: 500,
            buyPrice: 400,
          },
        ],
      },
    ],
    receivables: [
      {
        id: 'r1',
        organizationId: 'o1',
        customerId: 'c1',
        saleId: null,
        amount: 2000,
        amountPaid: 0,
        status: 'OPEN',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    expenses: [
      {
        id: 'e1',
        organizationId: 'o1',
        number: 'D-1',
        label: 'Loyer',
        category: 'Loyer',
        amount: 30000,
        note: null,
        createdById: 'u1',
        occurredAt: '2026-07-20T00:00:00.000Z',
        createdAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    documents: [
      {
        id: 'd1',
        organizationId: 'o1',
        type: 'FACTURE',
        number: 'F-1',
        saleId: 's1',
        customerId: 'c1',
        repaymentId: null,
        clientName: 'Awa',
        clientPhone: null,
        status: 'PAID',
        total: 1000,
        balanceAfter: null,
        note: null,
        lines: [{ article: 'Riz', qty: 2, unitPrice: 500 }],
        validityDays: null,
        issuedAt: '2026-07-20T00:00:00.000Z',
        createdAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    stockMovements: [
      {
        id: 'm1',
        organizationId: 'o1',
        productId: 'p1',
        type: 'OUT',
        delta: -2,
        reason: 'vente',
        createdById: 'u1',
        clientOpId: null,
        createdAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    repayments: [
      {
        id: 'rp1',
        organizationId: 'o1',
        customerId: 'c1',
        amount: 500,
        method: 'CASH',
        note: null,
        createdAt: '2026-07-20T00:00:00.000Z',
      },
    ],
    members: [
      { id: 'u1', name: 'Faris' },
      { id: 'u2', name: 'sansnom@example.com' },
    ],
    serverTime: '2026-07-20T00:00:00.000Z',
    orgId: 'o1',
    role: 'ADMIN',
    ...overrides,
  };
}

beforeEach(async () => {
  mockedApi.mockReset();
  await Promise.all([
    db.products.clear(),
    db.customers.clear(),
    db.sales.clear(),
    db.saleItems.clear(),
    db.receivables.clear(),
    db.expenses.clear(),
    db.documents.clear(),
    db.stockMovements.clear(),
    db.repayments.clear(),
    db.meta.clear(),
    db.outbox.clear(),
  ]);
});

/** Pose le drapeau « guérison des créances jumelles déjà faite » — les tests
 * qui vérifient le comportement INCRÉMENTAL normal doivent le poser, sinon
 * `pullAll()` force un snapshot complet (voir RECEIVABLE_HEAL_KEY). */
async function markReceivablesHealed(): Promise<void> {
  await db.meta.put({ key: 'receivableDedupV1', value: true });
}

describe('pullAll', () => {
  it('seeds every table from the sync/pull response, flattens sale items, and stores the cursor', async () => {
    const res = makeResponse();
    mockedApi.mockResolvedValueOnce(res);

    await pullAll();

    expect(mockedApi).toHaveBeenCalledWith('/api/sync/pull');

    const products = await db.products.toArray();
    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe('Riz');

    const customers = await db.customers.toArray();
    expect(customers[0]?.name).toBe('Awa');

    const sales = await db.sales.toArray();
    expect(sales).toHaveLength(1);
    expect(sales[0]?.id).toBe('s1');
    expect(sales[0]).not.toHaveProperty('items');
    // Task 6.3 — pulled sales are stamped synced:true (server-confirmed by
    // definition), matching toRepaymentRow, so purge.ts's retention sweep
    // bounds growth from pulled history uniformly.
    expect(sales[0]?.synced).toBe(true);

    const saleItems = await db.saleItems.toArray();
    expect(saleItems).toHaveLength(1);
    expect(saleItems[0]?.saleId).toBe('s1');
    expect(saleItems[0]?.name).toBe('Riz');

    const receivables = await db.receivables.toArray();
    expect(receivables[0]?.amount).toBe(2000);

    const expenses = await db.expenses.toArray();
    expect(expenses[0]?.label).toBe('Loyer');
    expect(expenses[0]?.synced).toBe(true);

    const documents = await db.documents.toArray();
    expect(documents[0]?.lines).toEqual([{ article: 'Riz', qty: 2, unitPrice: 500 }]);

    const stockMovements = await db.stockMovements.toArray();
    expect(stockMovements[0]?.delta).toBe(-2);
    expect(stockMovements[0]?.synced).toBe(true);

    const repayments = await db.repayments.toArray();
    expect(repayments).toHaveLength(1);
    expect(repayments[0]?.id).toBe('rp1');
    expect(repayments[0]?.amount).toBe(500);
    expect(repayments[0]?.synced).toBe(true);

    const cursor = await db.meta.get('lastPull');
    expect(cursor?.value).toBe(res.serverTime);

    // Annuaire d'équipe stocké → getMemberNames résout userId → nom.
    expect(await getMemberNames()).toEqual({ u1: 'Faris', u2: 'sansnom@example.com' });
  });

  it("getMemberNames est vide (et l'annuaire existant survit) si le serveur ne renvoie pas members", async () => {
    // Réponse d'un serveur pas encore à jour : pas de champ `members`.
    const withoutMembers: Partial<PullResponse> = { ...makeResponse() };
    delete withoutMembers.members;
    mockedApi.mockResolvedValueOnce(withoutMembers as PullResponse);
    await pullAll();
    expect(await getMemberNames()).toEqual({});

    // Un annuaire déjà stocké n'est pas écrasé par une réponse sans members.
    await db.meta.put({ key: 'members', value: [{ id: 'u9', name: 'Awa' }] });
    mockedApi.mockResolvedValueOnce(withoutMembers as PullResponse);
    await pullAll();
    expect(await getMemberNames()).toEqual({ u9: 'Awa' });
  });

  it('marks pulled repayments synced:true, overwriting an optimistic local echo with the same id (Task 5.2)', async () => {
    // Simulate a repayment this device created offline and already inserted
    // optimistically (createRepayOffline), not yet marked synced.
    await db.repayments.put({
      id: 'rp1',
      organizationId: 'o1',
      customerId: 'c1',
      amount: 500,
      method: 'cash',
      createdAt: '2026-07-19T00:00:00.000Z',
      synced: false,
    });

    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullAll();

    const repayments = await db.repayments.toArray();
    expect(repayments).toHaveLength(1);
    expect(repayments[0]?.synced).toBe(true);
  });

  it('stores the response orgId into meta.orgId, readable via getOrgId (Task 5.1)', async () => {
    mockedApi.mockResolvedValueOnce(makeResponse({ orgId: 'o1' }));
    await pullAll();

    const stored = await db.meta.get('orgId');
    expect(stored?.value).toBe('o1');
    await expect(getOrgId()).resolves.toBe('o1');
  });

  it('getOrgId resolves null before any pull has ever run', async () => {
    await expect(getOrgId()).resolves.toBeNull();
  });

  it('stores the response role into meta.role, readable via getRole (Task 5.3)', async () => {
    mockedApi.mockResolvedValueOnce(makeResponse({ role: 'OWNER' }));
    await pullAll();

    const stored = await db.meta.get('role');
    expect(stored?.value).toBe('OWNER');
    await expect(getRole()).resolves.toBe('OWNER');
  });

  it('getRole resolves null before any pull has ever run', async () => {
    await expect(getRole()).resolves.toBeNull();
  });

  it('omits nullable server fields rather than storing them as null', async () => {
    const res = makeResponse();
    mockedApi.mockResolvedValueOnce(res);

    await pullAll();

    const product = await db.products.get('p1');
    expect(product).toBeDefined();
    expect(product && 'imageUrl' in product).toBe(false);
    expect(product && 'barcode' in product).toBe(false);
  });

  it('sends the stored cursor as ?since= on the next pull', async () => {
    const first = makeResponse({ serverTime: '2026-07-20T00:00:00.000Z' });
    mockedApi.mockResolvedValueOnce(first);
    await pullAll();

    const second = makeResponse({ serverTime: '2026-07-20T00:05:00.000Z' });
    mockedApi.mockResolvedValueOnce(second);
    await pullAll();

    expect(mockedApi).toHaveBeenNthCalledWith(
      2,
      `/api/sync/pull?since=${encodeURIComponent('2026-07-20T00:00:00.000Z')}`,
    );

    const cursor = await db.meta.get('lastPull');
    expect(cursor?.value).toBe('2026-07-20T00:05:00.000Z');
  });
});

describe('guérison des créances jumelles (bug id optimiste ≠ id serveur)', () => {
  const RCV = {
    organizationId: 'o1',
    customerId: 'c1',
    amount: 2000,
    amountPaid: 0,
    status: 'OPEN',
    updatedAt: '2026-07-20T00:00:00.000Z',
  } as const;

  it('pull incrémental : la ligne serveur écrase sa jumelle optimiste (même saleId, autre id)', async () => {
    await markReceivablesHealed();
    await db.meta.put({ key: 'orgId', value: 'o1' });
    await db.meta.put({ key: 'lastPull', value: '2026-07-19T00:00:00.000Z' });
    // Jumelle optimiste d'une vente pré-correctif + une créance sans rapport.
    await db.receivables.put({ ...RCV, id: 'opt-9', saleId: 's9' });
    await db.receivables.put({ ...RCV, id: 'r-keep', customerId: 'c2' });

    mockedApi.mockResolvedValueOnce(
      makeResponse({
        receivables: [
          {
            id: 'srv-9',
            organizationId: 'o1',
            customerId: 'c1',
            saleId: 's9',
            amount: 2000,
            amountPaid: 0,
            status: 'OPEN',
            updatedAt: '2026-07-20T00:00:00.000Z',
          },
        ],
      }),
    );
    await pullAll();

    expect(mockedApi).toHaveBeenCalledWith(
      `/api/sync/pull?since=${encodeURIComponent('2026-07-19T00:00:00.000Z')}`,
    );
    const ids = (await db.receivables.toArray()).map((r) => r.id).sort();
    // La jumelle 'opt-9' a disparu ; la créance sans rapport survit.
    expect(ids).toEqual(['r-keep', 'srv-9']);
  });

  it('guérison unique : sans drapeau et outbox vide → snapshot complet, purge des orphelines, drapeau posé', async () => {
    await db.meta.put({ key: 'orgId', value: 'o1' });
    await db.meta.put({ key: 'lastPull', value: '2026-07-19T00:00:00.000Z' });
    // Orpheline du bug : absente du serveur, aucune vente en attente.
    await db.receivables.put({ ...RCV, id: 'fantome', saleId: 's-vieux' });

    const first = makeResponse({ serverTime: '2026-07-21T00:00:00.000Z' });
    mockedApi.mockResolvedValueOnce(first);
    await pullAll();

    // Le curseur stocké est IGNORÉ : fetch complet pour connaître l'ensemble
    // exact des créances serveur.
    expect(mockedApi).toHaveBeenNthCalledWith(1, '/api/sync/pull');
    const ids = (await db.receivables.toArray()).map((r) => r.id);
    expect(ids).toEqual(['r1']); // l'orpheline 'fantome' a été purgée
    expect((await db.meta.get('receivableDedupV1'))?.value).toBe(true);

    // Pull suivant : de nouveau incrémental (le drapeau est posé).
    mockedApi.mockResolvedValueOnce(makeResponse({ serverTime: '2026-07-22T00:00:00.000Z' }));
    await pullAll();
    expect(mockedApi).toHaveBeenNthCalledWith(
      2,
      `/api/sync/pull?since=${encodeURIComponent('2026-07-21T00:00:00.000Z')}`,
    );
  });

  it("guérison DIFFÉRÉE tant que l'outbox contient des écritures à envoyer (jamais purger une créance pas encore synchronisée)", async () => {
    await db.meta.put({ key: 'orgId', value: 'o1' });
    await db.meta.put({ key: 'lastPull', value: '2026-07-19T00:00:00.000Z' });
    // Vente offline PAS ENCORE synchronisée : sa créance optimiste n'existe
    // pas côté serveur — la purge doit l'épargner.
    await db.outbox.put({
      opId: 'sale-pending',
      kind: 'sale',
      endpoint: '/api/sales',
      payload: {},
      status: 'pending',
      createdAt: '2026-07-20T00:00:00.000Z',
    });
    await db.receivables.put({ ...RCV, id: 'sale-pending', saleId: 'sale-pending' });

    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullAll();

    // Pull incrémental normal (pas de snapshot forcé), créance intacte,
    // drapeau toujours absent → la guérison réessaiera plus tard.
    expect(mockedApi).toHaveBeenCalledWith(
      `/api/sync/pull?since=${encodeURIComponent('2026-07-19T00:00:00.000Z')}`,
    );
    const ids = (await db.receivables.toArray()).map((r) => r.id).sort();
    expect(ids).toEqual(['r1', 'sale-pending']);
    expect(await db.meta.get('receivableDedupV1')).toBeUndefined();
  });
});

describe('pullResource', () => {
  it('applies only the requested resource and does not advance the cursor', async () => {
    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullResource('products');

    const products = await db.products.toArray();
    expect(products).toHaveLength(1);

    // Other resources from the same batch were fetched but not persisted.
    const customers = await db.customers.toArray();
    expect(customers).toHaveLength(0);

    const cursor = await db.meta.get('lastPull');
    expect(cursor).toBeUndefined();
  });

  it('flattens sale items when refreshing the sales resource', async () => {
    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullResource('sales');

    const sales = await db.sales.toArray();
    expect(sales).toHaveLength(1);
    expect(sales[0]).not.toHaveProperty('items');

    const saleItems = await db.saleItems.toArray();
    expect(saleItems).toHaveLength(1);
    expect(saleItems[0]?.saleId).toBe('s1');
  });
});

describe('pullAll — garde anti-mélange de comptes (changement de boutique)', () => {
  /** Réponse minimale pour une AUTRE boutique (o2) : un seul produit, tout le
   * reste vide — ce qui compte est que rien d'o1 ne doit survivre. */
  function makeO2Response(): PullResponse {
    return makeResponse({
      orgId: 'o2',
      products: [
        {
          id: 'p9',
          organizationId: 'o2',
          ref: 'THE-1',
          name: 'Thé',
          category: 'Alimentation',
          buyPrice: 100,
          sellPrice: 200,
          prixGros: 0,
          unite: 'piece',
          qty: 3,
          threshold: 1,
          imageUrl: null,
          barcode: null,
          expiryDate: null,
          updatedAt: '2026-07-21T00:00:00.000Z',
        },
      ],
      customers: [],
      sales: [],
      receivables: [],
      expenses: [],
      documents: [],
      stockMovements: [],
      repayments: [],
      serverTime: '2026-07-21T00:00:00.000Z',
    });
  }

  it('vide le miroir puis re-fetch un snapshot COMPLET (sans curseur) quand la boutique du serveur change', async () => {
    // 1er pull : boutique o1 — remplit le miroir, stocke meta.orgId = o1.
    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullAll();
    expect(await getOrgId()).toBe('o1');
    expect(await db.products.count()).toBe(1);
    expect(await db.sales.count()).toBe(1);

    // 2e pull : un AUTRE compte (boutique o2) est connecté sur le même
    // appareil. Le fetch incrémental (parti avec le curseur d'o1) répond o2 →
    // la garde vide le miroir et re-fetch complet, SANS ?since.
    mockedApi.mockResolvedValueOnce(makeO2Response());
    mockedApi.mockResolvedValueOnce(makeO2Response());
    await pullAll();

    expect(mockedApi).toHaveBeenCalledTimes(3);
    expect(mockedApi).toHaveBeenNthCalledWith(
      2,
      '/api/sync/pull?since=2026-07-20T00%3A00%3A00.000Z',
    );
    expect(mockedApi).toHaveBeenNthCalledWith(3, '/api/sync/pull');

    // Plus AUCUNE donnée d'o1 : le miroir est intégralement celui d'o2.
    const products = await db.products.toArray();
    expect(products).toHaveLength(1);
    expect(products[0]?.id).toBe('p9');
    expect(await db.customers.count()).toBe(0);
    expect(await db.sales.count()).toBe(0);
    expect(await db.saleItems.count()).toBe(0);
    expect(await db.receivables.count()).toBe(0);
    expect(await db.expenses.count()).toBe(0);
    expect(await db.repayments.count()).toBe(0);
    expect(await getOrgId()).toBe('o2');
    expect((await db.meta.get('lastPull'))?.value).toBe('2026-07-21T00:00:00.000Z');
  });

  it('auto-guérison : miroir déjà contaminé (meta.orgId déjà écrasé par l’ancien code) → purge + re-fetch complet', async () => {
    // État hérité d'AVANT la garde : des produits d'une autre boutique (o2)
    // traînent dans le miroir, mais meta.orgId vaut DÉJÀ 'o1' (l'ancien code
    // l'écrasait à chaque pull) et un curseur existe — la comparaison
    // d'orgId seule ne détecte rien.
    await db.products.put({
      id: 'p-etranger',
      organizationId: 'o2',
      ref: 'X-1',
      name: 'Produit fantôme',
      category: 'Test',
      buyPrice: 1,
      sellPrice: 2,
      prixGros: 0,
      unite: 'piece',
      qty: 1,
      threshold: 0,
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    await db.meta.put({ key: 'orgId', value: 'o1' });
    await db.meta.put({ key: 'lastPull', value: '2026-07-19T00:00:00.000Z' });
    // Appareil déjà guéri des créances jumelles : on teste ICI le chemin
    // contamination (1er fetch incrémental), pas la guérison des créances.
    await markReceivablesHealed();

    // Le serveur répond pour o1 (incrémental), puis re-fetch complet.
    mockedApi.mockResolvedValueOnce(makeResponse());
    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullAll();

    expect(mockedApi).toHaveBeenCalledTimes(2);
    expect(mockedApi).toHaveBeenNthCalledWith(
      1,
      '/api/sync/pull?since=2026-07-19T00%3A00%3A00.000Z',
    );
    // Re-fetch SANS curseur : le curseur contaminé a fait sauter des pans du
    // catalogue de la boutique courante — seul un snapshot complet répare.
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/api/sync/pull');

    const products = await db.products.toArray();
    expect(products.map((p) => p.id)).toEqual(['p1']); // le fantôme o2 a disparu
    expect(await getOrgId()).toBe('o1');
  });

  it('même boutique → pull incrémental normal, jamais de purge', async () => {
    mockedApi.mockResolvedValueOnce(makeResponse());
    await pullAll();

    // Deuxième pull, même orgId : un seul fetch (incrémental), miroir intact.
    mockedApi.mockResolvedValueOnce(
      makeResponse({ products: [], customers: [], serverTime: '2026-07-22T00:00:00.000Z' }),
    );
    await pullAll();

    expect(mockedApi).toHaveBeenCalledTimes(2);
    expect(await db.products.count()).toBe(1);
    expect(await db.customers.count()).toBe(1);
    expect(await getOrgId()).toBe('o1');
  });
});
