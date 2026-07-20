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
import { pullAll, pullResource, getOrgId, type PullResponse } from './pull';

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
    serverTime: '2026-07-20T00:00:00.000Z',
    orgId: 'o1',
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
  ]);
});

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

    const saleItems = await db.saleItems.toArray();
    expect(saleItems).toHaveLength(1);
    expect(saleItems[0]?.saleId).toBe('s1');
    expect(saleItems[0]?.name).toBe('Riz');

    const receivables = await db.receivables.toArray();
    expect(receivables[0]?.amount).toBe(2000);

    const expenses = await db.expenses.toArray();
    expect(expenses[0]?.label).toBe('Loyer');

    const documents = await db.documents.toArray();
    expect(documents[0]?.lines).toEqual([{ article: 'Riz', qty: 2, unitPrice: 500 }]);

    const stockMovements = await db.stockMovements.toArray();
    expect(stockMovements[0]?.delta).toBe(-2);

    const repayments = await db.repayments.toArray();
    expect(repayments).toHaveLength(1);
    expect(repayments[0]?.id).toBe('rp1');
    expect(repayments[0]?.amount).toBe(500);
    expect(repayments[0]?.synced).toBe(true);

    const cursor = await db.meta.get('lastPull');
    expect(cursor?.value).toBe(res.serverTime);
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
