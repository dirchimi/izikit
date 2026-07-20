// @vitest-environment jsdom
/**
 * mutations.ts — companion unit test (Task 3.2, `createSaleOffline`).
 *
 * Same jsdom + `fake-indexeddb/auto` setup as `outbox.test.ts` / `pull.test.ts`
 * (Dexie needs a real-shaped IndexedDB API). No network is touched:
 * `createSaleOffline` only writes to Dexie + enqueues an outbox row; the caller
 * (Task 3.3) decides when to drain.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type ProductRow, type ReceivableRow } from './db';
import {
  createSaleOffline,
  createExpenseOffline,
  createCustomerOffline,
  createRepayOffline,
  createAdjustOffline,
  createCancelOffline,
} from './mutations';

const ORG = 'org-1';

function product(overrides: Partial<ProductRow> & { id: string }): ProductRow {
  return {
    organizationId: ORG,
    ref: `REF-${overrides.id}`,
    name: `Product ${overrides.id}`,
    category: 'Alimentation',
    buyPrice: 100,
    sellPrice: 500,
    prixGros: 0,
    unite: 'piece',
    qty: 10,
    threshold: 2,
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

async function seed(products: ProductRow[]): Promise<void> {
  await db.products.bulkPut(products);
}

async function reset(): Promise<void> {
  await Promise.all([
    db.products.clear(),
    db.customers.clear(),
    db.sales.clear(),
    db.saleItems.clear(),
    db.receivables.clear(),
    db.repayments.clear(),
    db.stockMovements.clear(),
    db.outbox.clear(),
    db.meta.clear(),
  ]);
}

describe('createSaleOffline', () => {
  beforeEach(reset);

  it('writes an optimistic sale, items, aggregated movement, decrements stock, enqueues one outbox row', async () => {
    await seed([
      product({ id: 'p1', name: 'Riz', sellPrice: 500, buyPrice: 300, qty: 10 }),
      product({ id: 'p2', name: 'Huile', sellPrice: 800, buyPrice: 500, qty: 4 }),
    ]);

    const res = await createSaleOffline({
      items: [
        { productId: 'p1', qty: 2, wholesale: false },
        { productId: 'p2', qty: 1, wholesale: false },
      ],
      method: 'cash',
    });

    // total = 2*500 + 1*800 = 1800
    expect(res.total).toBe(1800);
    expect(res.publicToken).toBeNull();
    expect(res.number).toMatch(/^#L\d+$/);

    const sale = await db.sales.get(res.id);
    expect(sale).toBeDefined();
    expect(sale?.synced).toBe(false);
    expect(sale?.total).toBe(1800);
    expect(sale?.method).toBe('CASH');
    expect(sale?.cashAmount).toBe(1800);
    expect(sale?.number).toBe(res.number);
    expect(sale?.status).toBe('ACTIVE');

    const items = await db.saleItems.where('saleId').equals(res.id).toArray();
    expect(items).toHaveLength(2);
    const p1Item = items.find((i) => i.productId === 'p1');
    expect(p1Item?.unitPrice).toBe(500);
    expect(p1Item?.qty).toBe(2);
    expect(p1Item?.buyPrice).toBe(300);
    expect(p1Item?.name).toBe('Riz');

    const movements = await db.stockMovements.where('productId').equals('p1').toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0]?.delta).toBe(-2);
    expect(movements[0]?.type).toBe('OUT');
    expect(movements[0]?.reason).toBe('sale');
    expect(movements[0]?.clientOpId).toBe(`${res.id}:p1`);

    // stock decremented
    expect((await db.products.get('p1'))?.qty).toBe(8);
    expect((await db.products.get('p2'))?.qty).toBe(3);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.kind).toBe('sale');
    expect(outbox[0]?.endpoint).toBe('/api/sales');
    expect(outbox[0]?.opId).toBe(res.id);
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.id).toBe(res.id);
    expect(payload.clientOpId).toBe(res.id);
    expect(payload.method).toBe('cash');
    expect(payload.items).toEqual([
      { productId: 'p1', qty: 2, wholesale: false },
      { productId: 'p2', qty: 1, wholesale: false },
    ]);
    // Task 6.2 — the payload forwards the SAME entry timestamp stamped on the
    // local sale row, so the server honors the true offline entry time
    // instead of stamping its own clock whenever the sync eventually happens.
    expect(payload.createdAt).toBe(sale?.createdAt);
  });

  it('aggregates duplicate lines of the same product into one movement (double scan)', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    const res = await createSaleOffline({
      items: [
        { productId: 'p1', qty: 2, wholesale: false },
        { productId: 'p1', qty: 3, wholesale: false },
      ],
      method: 'cash',
    });

    expect(res.total).toBe(2500);
    const movements = await db.stockMovements.where('productId').equals('p1').toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0]?.delta).toBe(-5);
    expect((await db.products.get('p1'))?.qty).toBe(5);
    // two sale-item lines are still written faithfully
    const items = await db.saleItems.where('saleId').equals(res.id).toArray();
    expect(items).toHaveLength(2);
  });

  it('honours wholesale pricing when prixGros > 0', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, prixGros: 400, qty: 10 })]);

    const res = await createSaleOffline({
      items: [{ productId: 'p1', qty: 2, wholesale: true }],
      method: 'cash',
    });

    expect(res.total).toBe(800); // 2 * 400 (wholesale)
  });

  it('applies a clamped discount', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    const res = await createSaleOffline({
      items: [{ productId: 'p1', qty: 2, wholesale: false }],
      method: 'cash',
      discount: 300,
    });

    expect(res.total).toBe(700); // 1000 - 300
    const sale = await db.sales.get(res.id);
    expect(sale?.discount).toBe(300);
  });

  it('throws PRODUCT_NOT_FOUND and writes nothing when a product is missing locally', async () => {
    await seed([product({ id: 'p1', qty: 10 })]);

    await expect(
      createSaleOffline({
        items: [{ productId: 'ghost', qty: 1, wholesale: false }],
        method: 'cash',
      }),
    ).rejects.toThrow('PRODUCT_NOT_FOUND');

    expect(await db.sales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('throws INSUFFICIENT_STOCK_LOCAL and rolls back everything', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 3 })]);

    await expect(
      createSaleOffline({
        items: [{ productId: 'p1', qty: 5, wholesale: false }],
        method: 'cash',
      }),
    ).rejects.toThrow('INSUFFICIENT_STOCK_LOCAL');

    expect(await db.sales.count()).toBe(0);
    expect(await db.saleItems.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.products.get('p1'))?.qty).toBe(3); // unchanged
  });

  it('aggregates duplicate lines for the stock check (each line alone would pass)', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 4 })]);

    await expect(
      createSaleOffline({
        items: [
          { productId: 'p1', qty: 3, wholesale: false },
          { productId: 'p1', qty: 3, wholesale: false },
        ],
        method: 'cash',
      }),
    ).rejects.toThrow('INSUFFICIENT_STOCK_LOCAL');

    expect((await db.products.get('p1'))?.qty).toBe(4);
  });

  it('throws PAYMENT_MISMATCH when the split does not equal net', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    await expect(
      createSaleOffline({
        items: [{ productId: 'p1', qty: 2, wholesale: false }],
        payments: [{ method: 'cash', amount: 900 }], // net is 1000
      }),
    ).rejects.toThrow('PAYMENT_MISMATCH');

    expect(await db.sales.count()).toBe(0);
  });

  it('throws CREDIT_NEEDS_CUSTOMER when a credit portion has no customer, writes nothing', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    await expect(
      createSaleOffline({
        items: [{ productId: 'p1', qty: 2, wholesale: false }],
        method: 'credit',
      }),
    ).rejects.toThrow('CREDIT_NEEDS_CUSTOMER');

    expect(await db.sales.count()).toBe(0);
    expect(await db.receivables.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('opens a receivable for the credit portion of a mixed sale', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    const res = await createSaleOffline({
      items: [{ productId: 'p1', qty: 2, wholesale: false }],
      payments: [
        { method: 'cash', amount: 600 },
        { method: 'credit', amount: 400 },
      ],
      customer: { id: 'cust-1' },
    });

    const sale = await db.sales.get(res.id);
    expect(sale?.method).toBe('MIXED');
    expect(sale?.cashAmount).toBe(600);
    expect(sale?.creditAmount).toBe(400);
    expect(sale?.customerId).toBe('cust-1');

    const receivables = await db.receivables.where('customerId').equals('cust-1').toArray();
    expect(receivables).toHaveLength(1);
    expect(receivables[0]?.amount).toBe(400);
    expect(receivables[0]?.amountPaid).toBe(0);
    expect(receivables[0]?.status).toBe('OPEN');
    expect(receivables[0]?.saleId).toBe(res.id);
  });

  it('creates a new offline customer (name, no id) and references it in the sale + payload', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    const res = await createSaleOffline({
      items: [{ productId: 'p1', qty: 2, wholesale: false }],
      method: 'credit',
      customer: { name: 'Awa Diop', phone: '221700000000' },
    });

    const customers = await db.customers.toArray();
    expect(customers).toHaveLength(1);
    const created = customers[0];
    expect(created?.name).toBe('Awa Diop');
    expect(created?.phone).toBe('221700000000');
    expect(created?.synced).toBe(false);

    const sale = await db.sales.get(res.id);
    expect(sale?.customerId).toBe(created?.id);

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as { customer?: Record<string, unknown> };
    expect(payload.customer).toEqual({
      id: created?.id,
      name: 'Awa Diop',
      phone: '221700000000',
    });

    // credit receivable opened against the new customer
    const receivables = await db.receivables.where('customerId').equals(created!.id).toArray();
    expect(receivables).toHaveLength(1);
    expect(receivables[0]?.amount).toBe(1000);
  });

  it('sends { id } in the payload for an existing customer', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    await createSaleOffline({
      items: [{ productId: 'p1', qty: 1, wholesale: false }],
      method: 'cash',
      customer: { id: 'existing-1' },
    });

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as { customer?: Record<string, unknown> };
    expect(payload.customer).toEqual({ id: 'existing-1' });
    // no offline customer row is fabricated for an existing id
    expect(await db.customers.count()).toBe(0);
  });

  it('increments the provisional number across sales', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 100 })]);

    const first = await createSaleOffline({
      items: [{ productId: 'p1', qty: 1, wholesale: false }],
      method: 'cash',
    });
    const second = await createSaleOffline({
      items: [{ productId: 'p1', qty: 1, wholesale: false }],
      method: 'cash',
    });

    const n1 = Number(first.number.replace('#L', ''));
    const n2 = Number(second.number.replace('#L', ''));
    expect(n2).toBe(n1 + 1);
  });

  it('does not include a discount key in the payload when discount is 0', async () => {
    await seed([product({ id: 'p1', sellPrice: 500, qty: 10 })]);

    await createSaleOffline({
      items: [{ productId: 'p1', qty: 1, wholesale: false }],
      method: 'cash',
    });

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect('discount' in payload).toBe(false);
    expect('customer' in payload).toBe(false);
  });
});

describe('createExpenseOffline', () => {
  beforeEach(async () => {
    await reset();
    await db.expenses.clear();
    await db.meta.put({ key: 'orgId', value: 'org-1' });
  });

  it('writes an optimistic expense row (unsynced, provisional number) and enqueues one outbox row', async () => {
    const res = await createExpenseOffline({ label: 'Loyer', amount: 30000, category: 'Loyer' });

    expect(res.number).toMatch(/^#L\d+$/);

    const expense = await db.expenses.get(res.id);
    expect(expense).toBeDefined();
    expect(expense?.organizationId).toBe('org-1');
    expect(expense?.label).toBe('Loyer');
    expect(expense?.amount).toBe(30000);
    expect(expense?.category).toBe('Loyer');
    expect(expense?.number).toBe(res.number);
    expect(expense?.synced).toBe(false);
    expect(typeof expense?.occurredAt).toBe('string');
    expect(typeof expense?.createdAt).toBe('string');

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.kind).toBe('expense');
    expect(outbox[0]?.endpoint).toBe('/api/expenses');
    expect(outbox[0]?.opId).toBe(res.id);
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.id).toBe(res.id);
    expect(payload.clientOpId).toBe(res.id);
    expect(payload.label).toBe('Loyer');
    expect(payload.amount).toBe(30000);
    expect(payload.category).toBe('Loyer');
    // Task 6.2 — the payload forwards the SAME entry timestamp stamped on the
    // local expense row, so the server honors the true offline entry time
    // instead of stamping its own clock whenever the sync eventually happens.
    expect(payload.createdAt).toBe(expense?.createdAt);
  });

  it('defaults category when omitted and increments the provisional number across expenses', async () => {
    const first = await createExpenseOffline({ label: 'Transport', amount: 500 });
    const second = await createExpenseOffline({ label: 'Eau', amount: 1000 });

    const e1 = await db.expenses.get(first.id);
    expect(e1?.category).toBe('Divers');

    const n1 = Number(first.number.replace('#L', ''));
    const n2 = Number(second.number.replace('#L', ''));
    expect(n2).toBe(n1 + 1);
  });

  it('uses the given occurredAt locally and forwards it in the payload', async () => {
    const res = await createExpenseOffline({
      label: 'Loyer',
      amount: 30000,
      occurredAt: '2026-07-01T00:00:00.000Z',
    });

    const expense = await db.expenses.get(res.id);
    expect(expense?.occurredAt).toBe('2026-07-01T00:00:00.000Z');

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.occurredAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('does not include occurredAt/note in the payload when not given', async () => {
    await createExpenseOffline({ label: 'Transport', amount: 500 });

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect('occurredAt' in payload).toBe(false);
    expect('note' in payload).toBe(false);
  });

  it('carries an optional note through to both the local row and the payload', async () => {
    const res = await createExpenseOffline({
      label: 'Loyer',
      amount: 30000,
      note: 'Payé en espèces',
    });

    const expense = await db.expenses.get(res.id);
    expect(expense?.note).toBe('Payé en espèces');

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.note).toBe('Payé en espèces');
  });

  it('throws NO_ORG and writes nothing when meta.orgId is absent', async () => {
    await db.meta.delete('orgId');

    await expect(createExpenseOffline({ label: 'Loyer', amount: 30000 })).rejects.toThrow('NO_ORG');

    expect(await db.expenses.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('throws AMOUNT_INVALID for a zero/negative amount and rolls back', async () => {
    await expect(createExpenseOffline({ label: 'Loyer', amount: 0 })).rejects.toThrow(
      'AMOUNT_INVALID',
    );
    await expect(createExpenseOffline({ label: 'Loyer', amount: -100 })).rejects.toThrow(
      'AMOUNT_INVALID',
    );

    expect(await db.expenses.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('throws AMOUNT_INVALID for a non-integer amount', async () => {
    await expect(createExpenseOffline({ label: 'Loyer', amount: 30000.5 })).rejects.toThrow(
      'AMOUNT_INVALID',
    );
    expect(await db.expenses.count()).toBe(0);
  });
});

describe('createCustomerOffline', () => {
  beforeEach(async () => {
    await reset();
    await db.meta.put({ key: 'orgId', value: 'org-1' });
  });

  it('writes an optimistic customer row (unsynced) and enqueues one outbox row', async () => {
    const res = await createCustomerOffline({ name: 'Awa Diop', phone: '221700000000' });

    const customer = await db.customers.get(res.id);
    expect(customer).toBeDefined();
    expect(customer?.organizationId).toBe('org-1');
    expect(customer?.name).toBe('Awa Diop');
    expect(customer?.phone).toBe('221700000000');
    expect(customer?.synced).toBe(false);
    expect(typeof customer?.updatedAt).toBe('string');

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.kind).toBe('customer');
    expect(outbox[0]?.endpoint).toBe('/api/customers');
    expect(outbox[0]?.opId).toBe(res.id);
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.id).toBe(res.id);
    expect(payload.clientOpId).toBe(res.id);
    expect(payload.name).toBe('Awa Diop');
    expect(payload.phone).toBe('221700000000');
  });

  it('trims the name and omits phone from the row/payload when not given', async () => {
    const res = await createCustomerOffline({ name: '  Moussa  ' });

    const customer = await db.customers.get(res.id);
    expect(customer?.name).toBe('Moussa');
    expect('phone' in (customer ?? {})).toBe(false);

    const outbox = await db.outbox.toArray();
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect('phone' in payload).toBe(false);
  });

  it('throws NAME_REQUIRED and writes nothing for an empty/blank name', async () => {
    await expect(createCustomerOffline({ name: '' })).rejects.toThrow('NAME_REQUIRED');
    await expect(createCustomerOffline({ name: '   ' })).rejects.toThrow('NAME_REQUIRED');

    expect(await db.customers.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('throws NO_ORG and writes nothing when meta.orgId is absent', async () => {
    await db.meta.delete('orgId');

    await expect(createCustomerOffline({ name: 'Awa Diop' })).rejects.toThrow('NO_ORG');

    expect(await db.customers.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('createRepayOffline', () => {
  const CUST = 'cust-1';

  function receivable(overrides: Partial<ReceivableRow> & { id: string }): ReceivableRow {
    return {
      organizationId: ORG,
      customerId: CUST,
      amount: 1000,
      amountPaid: 0,
      status: 'OPEN',
      updatedAt: '2026-07-01T00:00:00.000Z',
      ...overrides,
    };
  }

  beforeEach(async () => {
    await reset();
    await db.meta.put({ key: 'orgId', value: ORG });
  });

  it('spreads a payment over two receivables oldest-first, matching allocateRepayment', async () => {
    // r1 older (updatedAt earlier) → paid first; r2 newer → gets the remainder.
    await db.receivables.bulkPut([
      receivable({ id: 'r2', amount: 500, updatedAt: '2026-07-10T00:00:00.000Z' }),
      receivable({ id: 'r1', amount: 1000, updatedAt: '2026-07-01T00:00:00.000Z' }),
    ]);

    const res = await createRepayOffline({
      customerId: CUST,
      amount: 1200,
      method: 'cash',
      note: 'acompte',
    });

    // applied = min(1200, 1500) = 1200 ; remainingDebt = 1500 - 1200 = 300
    expect(res.applied).toBe(1200);
    expect(res.remainingDebt).toBe(300);

    // r1 fully paid, r2 partial — oldest-first allocation.
    const r1 = await db.receivables.get('r1');
    expect(r1?.amountPaid).toBe(1000);
    expect(r1?.status).toBe('PAID');
    const r2 = await db.receivables.get('r2');
    expect(r2?.amountPaid).toBe(200);
    expect(r2?.status).toBe('PARTIAL');

    // one repayment row (amount = APPLIED, unsynced)
    const reps = await db.repayments.where('customerId').equals(CUST).toArray();
    expect(reps).toHaveLength(1);
    expect(reps[0]?.id).toBe(res.id);
    expect(reps[0]?.amount).toBe(1200);
    expect(reps[0]?.method).toBe('cash');
    expect(reps[0]?.note).toBe('acompte');
    expect(reps[0]?.synced).toBe(false);
    expect(reps[0]?.organizationId).toBe(ORG);

    // one outbox row (kind repay, endpoint carries the customer id, payload has
    // id/clientOpId/amount = RAW input)
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.kind).toBe('repay');
    expect(outbox[0]?.endpoint).toBe(`/api/receivables/${CUST}/repay`);
    expect(outbox[0]?.opId).toBe(res.id);
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.id).toBe(res.id);
    expect(payload.clientOpId).toBe(res.id);
    expect(payload.amount).toBe(1200);
    expect(payload.method).toBe('cash');
    expect(payload.note).toBe('acompte');
  });

  it('caps the applied amount at the total debt (partial receivable included)', async () => {
    await db.receivables.put(
      receivable({ id: 'r1', amount: 1000, amountPaid: 400, status: 'PARTIAL' }),
    );

    const res = await createRepayOffline({ customerId: CUST, amount: 5000, method: 'mobile' });

    // due = 1000 - 400 = 600 → applied capped at 600, remainingDebt 0
    expect(res.applied).toBe(600);
    expect(res.remainingDebt).toBe(0);
    const r1 = await db.receivables.get('r1');
    expect(r1?.amountPaid).toBe(1000);
    expect(r1?.status).toBe('PAID');
    const reps = await db.repayments.toArray();
    expect(reps[0]?.amount).toBe(600);
    // payload keeps the RAW input amount (server caps it too)
    const payload = (await db.outbox.toArray())[0]?.payload as Record<string, unknown>;
    expect(payload.amount).toBe(5000);
  });

  it('ignores CANCELLED/PAID receivables when allocating', async () => {
    await db.receivables.bulkPut([
      receivable({ id: 'rc', amount: 1000, status: 'CANCELLED' }),
      receivable({ id: 'rp', amount: 1000, amountPaid: 1000, status: 'PAID' }),
      receivable({ id: 'ro', amount: 300, status: 'OPEN', updatedAt: '2026-07-05T00:00:00.000Z' }),
    ]);

    const res = await createRepayOffline({ customerId: CUST, amount: 1000, method: 'cash' });

    // only the OPEN 300 is available.
    expect(res.applied).toBe(300);
    expect((await db.receivables.get('rc'))?.amountPaid).toBe(0); // untouched
    expect((await db.receivables.get('ro'))?.status).toBe('PAID');
  });

  it('throws NO_DEBT and writes nothing when the customer has no open receivable', async () => {
    await db.receivables.put(
      receivable({ id: 'rp', amount: 1000, amountPaid: 1000, status: 'PAID' }),
    );

    await expect(
      createRepayOffline({ customerId: CUST, amount: 500, method: 'cash' }),
    ).rejects.toThrow('NO_DEBT');

    expect(await db.repayments.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.receivables.get('rp'))?.amountPaid).toBe(1000); // unchanged
  });

  it('throws AMOUNT_INVALID for zero/negative/non-integer and rolls back', async () => {
    await db.receivables.put(receivable({ id: 'r1' }));

    await expect(
      createRepayOffline({ customerId: CUST, amount: 0, method: 'cash' }),
    ).rejects.toThrow('AMOUNT_INVALID');
    await expect(
      createRepayOffline({ customerId: CUST, amount: -100, method: 'cash' }),
    ).rejects.toThrow('AMOUNT_INVALID');
    await expect(
      createRepayOffline({ customerId: CUST, amount: 10.5, method: 'cash' }),
    ).rejects.toThrow('AMOUNT_INVALID');

    expect(await db.repayments.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.receivables.get('r1'))?.amountPaid).toBe(0); // unchanged
  });

  it('throws NO_ORG and writes nothing when meta.orgId is absent', async () => {
    await db.meta.delete('orgId');
    await db.receivables.put(receivable({ id: 'r1' }));

    await expect(
      createRepayOffline({ customerId: CUST, amount: 500, method: 'cash' }),
    ).rejects.toThrow('NO_ORG');

    expect(await db.repayments.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('back-dates createdAt to the given date and forwards it in the payload', async () => {
    await db.receivables.put(receivable({ id: 'r1', amount: 1000 }));

    const res = await createRepayOffline({
      customerId: CUST,
      amount: 500,
      method: 'cash',
      date: '2026-07-05',
    });

    const rep = await db.repayments.get(res.id);
    expect(rep?.createdAt).toBe('2026-07-05');
    const payload = (await db.outbox.toArray())[0]?.payload as Record<string, unknown>;
    expect(payload.date).toBe('2026-07-05');
  });

  it('omits method/note/date from the payload when not given', async () => {
    await db.receivables.put(receivable({ id: 'r1', amount: 1000 }));

    await createRepayOffline({ customerId: CUST, amount: 500 });

    const payload = (await db.outbox.toArray())[0]?.payload as Record<string, unknown>;
    expect('method' in payload).toBe(false);
    expect('note' in payload).toBe(false);
    expect('date' in payload).toBe(false);
  });
});

describe('createAdjustOffline', () => {
  beforeEach(async () => {
    await reset();
    await db.meta.put({ key: 'orgId', value: ORG });
  });

  it('a positive delta (restock) increases qty, writes an unsynced movement with clientOpId, and enqueues an adjust op', async () => {
    await seed([product({ id: 'p1', qty: 10, buyPrice: 100 })]);

    const res = await createAdjustOffline({
      productId: 'p1',
      delta: 5,
      type: 'IN',
      reason: 'Réappro',
    });

    const p = await db.products.get('p1');
    expect(p?.qty).toBe(15);

    const movements = await db.stockMovements.toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0]?.delta).toBe(5);
    expect(movements[0]?.type).toBe('IN');
    expect(movements[0]?.reason).toBe('Réappro');
    expect(movements[0]?.clientOpId).toBe(res.id);
    expect(movements[0]?.synced).toBe(false);
    expect(movements[0]?.organizationId).toBe(ORG);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.kind).toBe('adjust');
    expect(outbox[0]?.endpoint).toBe('/api/products/p1/adjust');
    expect(outbox[0]?.opId).toBe(res.id);
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.clientOpId).toBe(res.id);
    expect(payload.delta).toBe(5);
    expect(payload.type).toBe('IN');
    expect(payload.reason).toBe('Réappro');
  });

  it('updates buyPrice locally and in the payload when given (réappro)', async () => {
    await seed([product({ id: 'p1', qty: 10, buyPrice: 100 })]);

    await createAdjustOffline({ productId: 'p1', delta: 5, type: 'IN', buyPrice: 150 });

    const p = await db.products.get('p1');
    expect(p?.buyPrice).toBe(150);

    const payload = (await db.outbox.toArray())[0]?.payload as Record<string, unknown>;
    expect(payload.buyPrice).toBe(150);
  });

  it('forwards supplierDebt in the payload only — no local supplierDebts table to mirror it into', async () => {
    await seed([product({ id: 'p1', qty: 10, buyPrice: 100 })]);

    await createAdjustOffline({
      productId: 'p1',
      delta: 5,
      type: 'IN',
      buyPrice: 100,
      supplierDebt: { amount: 300, supplierName: 'Fournisseur X' },
    });

    const payload = (await db.outbox.toArray())[0]?.payload as Record<string, unknown>;
    expect(payload.supplierDebt).toEqual({ amount: 300, supplierName: 'Fournisseur X' });
  });

  it('derives type from the sign of delta when omitted (IN for positive, OUT for negative)', async () => {
    await seed([product({ id: 'p1', qty: 10 }), product({ id: 'p2', qty: 10 })]);

    await createAdjustOffline({ productId: 'p1', delta: 3 });
    await createAdjustOffline({ productId: 'p2', delta: -1 });

    const movements = await db.stockMovements.toArray();
    const byProduct = new Map(movements.map((m) => [m.productId, m.type]));
    expect(byProduct.get('p1')).toBe('IN');
    expect(byProduct.get('p2')).toBe('OUT');
  });

  it('a negative delta beyond local stock throws INSUFFICIENT_STOCK_LOCAL and writes nothing (rollback)', async () => {
    await seed([product({ id: 'p1', qty: 3 })]);

    await expect(
      createAdjustOffline({ productId: 'p1', delta: -5, type: 'ADJUST', reason: 'Casse' }),
    ).rejects.toThrow('INSUFFICIENT_STOCK_LOCAL');

    const p = await db.products.get('p1');
    expect(p?.qty).toBe(3);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a negative delta exactly emptying stock (to 0) is allowed', async () => {
    await seed([product({ id: 'p1', qty: 5 })]);

    await createAdjustOffline({ productId: 'p1', delta: -5, type: 'ADJUST', reason: 'Inventaire' });

    const p = await db.products.get('p1');
    expect(p?.qty).toBe(0);
  });

  it('throws PRODUCT_NOT_FOUND and writes nothing when the product is not in the local mirror', async () => {
    await expect(
      createAdjustOffline({ productId: 'missing', delta: 5, type: 'IN' }),
    ).rejects.toThrow('PRODUCT_NOT_FOUND');

    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('throws NO_ORG and writes nothing when meta.orgId is absent', async () => {
    await seed([product({ id: 'p1', qty: 10 })]);
    await db.meta.delete('orgId');

    await expect(createAdjustOffline({ productId: 'p1', delta: 5, type: 'IN' })).rejects.toThrow(
      'NO_ORG',
    );

    const p = await db.products.get('p1');
    expect(p?.qty).toBe(10);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('createCancelOffline', () => {
  const SALE = 'sale-1';

  beforeEach(reset);

  async function seedCancellableSale(opts?: { withCredit?: boolean }): Promise<void> {
    await db.products.bulkPut([product({ id: 'p1', qty: 8 }), product({ id: 'p2', qty: 3 })]);
    await db.sales.put({
      id: SALE,
      organizationId: ORG,
      number: '#L1',
      method: opts?.withCredit ? 'CREDIT' : 'CASH',
      total: 1000,
      discount: 0,
      cashAmount: opts?.withCredit ? 0 : 1000,
      mobileAmount: 0,
      creditAmount: opts?.withCredit ? 1000 : 0,
      status: 'ACTIVE',
      createdAt: '2026-07-20T00:00:00.000Z',
      synced: false,
      ...(opts?.withCredit ? { customerId: 'cust-1' } : {}),
    });
    await db.saleItems.bulkPut([
      {
        id: 'it1',
        saleId: SALE,
        productId: 'p1',
        name: 'Riz',
        qty: 2,
        unitPrice: 500,
        buyPrice: 300,
      },
      {
        id: 'it2',
        saleId: SALE,
        productId: 'p2',
        name: 'Huile',
        qty: 1,
        unitPrice: 500,
        buyPrice: 400,
      },
    ]);
    if (opts?.withCredit) {
      await db.receivables.put({
        id: 'r1',
        organizationId: ORG,
        customerId: 'cust-1',
        saleId: SALE,
        amount: 1000,
        amountPaid: 0,
        status: 'OPEN',
        updatedAt: '2026-07-20T00:00:00.000Z',
      });
    }
  }

  it('cancels a credit sale: restocks 2 products, writes 2 IN movements, reverses the receivable, one outbox row', async () => {
    await seedCancellableSale({ withCredit: true });

    const res = await createCancelOffline({ saleId: SALE, reason: 'erreur de saisie' });

    // clientOpId (res.id) MUST differ from the sale id — else it would collide
    // with the sale's own create op's memoized result server-side.
    expect(res.id).not.toBe(SALE);

    // sale CANCELLED locally (unsynced)
    const sale = await db.sales.get(SALE);
    expect(sale?.status).toBe('CANCELLED');
    expect(sale?.cancelReason).toBe('erreur de saisie');
    expect(sale?.synced).toBe(false);
    expect(typeof sale?.cancelledAt).toBe('string');

    // stock re-credited per line
    expect((await db.products.get('p1'))?.qty).toBe(10); // 8 + 2
    expect((await db.products.get('p2'))?.qty).toBe(4); // 3 + 1

    // two IN movements, unsynced, clientOpId = `${res.id}:${productId}`
    const movements = await db.stockMovements.toArray();
    expect(movements).toHaveLength(2);
    for (const m of movements) {
      expect(m.type).toBe('IN');
      expect(m.synced).toBe(false);
      expect(m.organizationId).toBe(ORG);
      expect(m.clientOpId).toBe(`${res.id}:${m.productId}`);
    }
    expect(movements.find((m) => m.productId === 'p1')?.delta).toBe(2);
    expect(movements.find((m) => m.productId === 'p2')?.delta).toBe(1);

    // receivable reversed (status CANCELLED, amount intact — never zeroed)
    const r1 = await db.receivables.get('r1');
    expect(r1?.status).toBe('CANCELLED');
    expect(r1?.amount).toBe(1000);

    // one outbox row: kind cancel, endpoint carries the sale id, payload has
    // clientOpId (= res.id) + reason.
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.kind).toBe('cancel');
    expect(outbox[0]?.endpoint).toBe(`/api/sales/${SALE}/cancel`);
    expect(outbox[0]?.opId).toBe(res.id);
    const payload = outbox[0]?.payload as Record<string, unknown>;
    expect(payload.clientOpId).toBe(res.id);
    expect(payload.reason).toBe('erreur de saisie');
  });

  it('a cash sale (no receivable) touches no receivable and restocks', async () => {
    await seedCancellableSale();

    await createCancelOffline({ saleId: SALE, reason: 'x' });

    expect(await db.receivables.count()).toBe(0);
    expect((await db.products.get('p1'))?.qty).toBe(10);
    expect((await db.products.get('p2'))?.qty).toBe(4);
    expect((await db.sales.get(SALE))?.status).toBe('CANCELLED');
  });

  it('skips a line whose product was deleted locally (no crash), restocks the others only', async () => {
    await seedCancellableSale();
    await db.products.delete('p2'); // product gone from the mirror

    await createCancelOffline({ saleId: SALE, reason: 'x' });

    // p1 restocked; p2 line skipped entirely (no re-credit, no movement) —
    // mirrors the server's `existingIds` filter.
    expect((await db.products.get('p1'))?.qty).toBe(10);
    const movements = await db.stockMovements.toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0]?.productId).toBe('p1');
  });

  it('throws SALE_NOT_FOUND and writes nothing when the sale is absent', async () => {
    await expect(createCancelOffline({ saleId: 'ghost', reason: 'x' })).rejects.toThrow(
      'SALE_NOT_FOUND',
    );

    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('throws ALREADY_CANCELLED and writes nothing when the sale is already cancelled', async () => {
    await seedCancellableSale();
    await db.sales.update(SALE, { status: 'CANCELLED' });

    await expect(createCancelOffline({ saleId: SALE, reason: 'x' })).rejects.toThrow(
      'ALREADY_CANCELLED',
    );

    // Nothing written, stock untouched (no double re-credit).
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.products.get('p1'))?.qty).toBe(8);
  });
});
