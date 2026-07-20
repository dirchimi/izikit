// @vitest-environment jsdom
/**
 * offline-integration.test.ts — capstone end-to-end scenario for the
 * offline-first boutique (Task 6.4 of
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md).
 *
 * Every OTHER test in this directory is a per-module unit test (mutations.ts
 * alone, sync-engine.ts alone, outbox.ts alone…). This file instead drives
 * the REAL client modules together — `createSaleOffline` /
 * `createExpenseOffline` / `drainOutbox` / the Dexie `db` — and only fakes
 * the network boundary (`@/lib/api`), to prove the guarantees the individual
 * unit tests establish in isolation actually compose:
 *
 *   1. A sale recorded while offline survives as a local-only row and syncs
 *      cleanly once back online, gaining the server's real `V-000x` number +
 *      `publicToken`.
 *   2. Replaying an already-synced op (whether because the outbox still had
 *      it `pending`, or because we force a row back to `pending` to emulate
 *      an app crash / dropped ack right after the server accepted it) never
 *      double-applies: the FAKE SERVER below dedupes by `clientOpId`
 *      exactly like the real `withIdempotency` helper the routes use.
 *   3. A stock shortfall discovered at sync time (another device sold the
 *      same stock while this device was offline) does NOT lose the sale —
 *      it is recorded server-side, stock is clamped to 0, and a
 *      `db.conflicts` row captures the shortfall for the shopkeeper to
 *      review — while unrelated queued sales still sync fine (Task 4.1 +
 *      4.2's contract, exercised end-to-end here rather than mocked).
 *   4. An expense follows the exact same offline → sync lifecycle as a sale.
 *
 * The FAKE SERVER is intentionally minimal: just enough state (products by
 * id, sales/expenses keyed by clientOpId for dedup, V-/D- counters) to be
 * faithful to `frontend/src/app/api/sales/route.ts` and
 * `frontend/src/app/api/expenses/route.ts`'s CONTRACT — not their
 * implementation. In particular it mirrors the real route's Task 4.1
 * decision: a stock shortfall is a 200 with a non-empty `stockConflicts`
 * array (stock clamped to >=0), never a 409 — see that route's
 * `CheckoutResult`/`StockConflict` types and the docblock above `POST`.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, type ProductRow } from './db';
import { createSaleOffline, createExpenseOffline } from './mutations';
import { drainOutbox } from './sync-engine';
import { pendingCount } from './outbox';
import { api, ApiError } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

// ---------------------------------------------------------------------------
// Fake server — see module docblock for the fidelity contract.
// ---------------------------------------------------------------------------

interface FakeProduct {
  id: string;
  name: string;
  qty: number;
  sellPrice: number;
}

interface FakeStockConflict {
  productId: string;
  name: string;
  requested: number;
  available: number;
  shortfall: number;
}

interface FakeSaleRecord {
  sale: { id: string; number: string; total: number; publicToken: string };
  stockConflicts: FakeStockConflict[];
}

interface FakeExpenseRecord {
  expense: {
    id: string;
    number: string;
    label: string;
    category: string;
    amount: number;
    note: string;
    occurredAt: string;
  };
}

/** Shape of the body `createSaleOffline`'s payload sends to `/api/sales`. */
interface SalePayload {
  id?: string;
  clientOpId?: string;
  items: { productId: string; qty: number; wholesale: boolean }[];
}

/** Shape of the body `createExpenseOffline`'s payload sends to `/api/expenses`. */
interface ExpensePayload {
  id?: string;
  clientOpId?: string;
  label: string;
  amount: number;
  category: string;
  createdAt: string;
  occurredAt?: string;
  note?: string;
}

class FakeServer {
  readonly products = new Map<string, FakeProduct>();
  /** Keyed by clientOpId — mirrors `withIdempotency`'s dedup key. */
  readonly sales = new Map<string, FakeSaleRecord>();
  readonly expenses = new Map<string, FakeExpenseRecord>();
  private saleSeq = 0;
  private expenseSeq = 0;

  reset(): void {
    this.products.clear();
    this.sales.clear();
    this.expenses.clear();
    this.saleSeq = 0;
    this.expenseSeq = 0;
  }

  setStock(id: string, qty: number, name: string, sellPrice: number): void {
    this.products.set(id, { id, name, qty, sellPrice });
  }

  async handle(path: string, opts?: { method?: string; body?: unknown }): Promise<unknown> {
    const method = (opts?.method ?? 'GET').toUpperCase();
    if (path === '/api/sales' && method === 'POST') {
      return this.postSale(opts?.body as SalePayload);
    }
    if (path === '/api/expenses' && method === 'POST') {
      return this.postExpense(opts?.body as ExpensePayload);
    }
    throw new Error(`fake server: unhandled route ${method} ${path}`);
  }

  private postSale(body: SalePayload): FakeSaleRecord {
    const clientOpId = body.clientOpId ?? body.id;
    if (!clientOpId) throw new Error('fake server: sale payload missing id/clientOpId');

    // Idempotent replay — same clientOpId returns the SAME recorded sale,
    // with NO further stock effect (mirrors `withIdempotency`'s memoized
    // success path).
    const existing = this.sales.get(clientOpId);
    if (existing) return existing;

    const needed = new Map<string, number>();
    for (const item of body.items) {
      needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.qty);
    }

    // Total is computed from the REQUESTED qty regardless of shortfall — the
    // real route bills for what actually left the shop, per its docblock.
    let total = 0;
    for (const item of body.items) {
      const p = this.products.get(item.productId);
      total += item.qty * (p?.sellPrice ?? 0);
    }

    const stockConflicts: FakeStockConflict[] = [];
    for (const [productId, requested] of needed) {
      const p = this.products.get(productId);
      const available = p?.qty ?? 0;
      if (requested > available) {
        stockConflicts.push({
          productId,
          name: p?.name ?? productId,
          requested,
          available,
          shortfall: requested - available,
        });
      }
      if (p) p.qty = Math.max(0, p.qty - requested);
    }

    this.saleSeq += 1;
    const number = `V-${String(this.saleSeq).padStart(4, '0')}`;
    const id = body.id ?? clientOpId;
    const record: FakeSaleRecord = {
      sale: { id, number, total, publicToken: `pub_${id}` },
      stockConflicts,
    };
    this.sales.set(clientOpId, record);
    return record;
  }

  private postExpense(body: ExpensePayload): FakeExpenseRecord {
    const clientOpId = body.clientOpId ?? body.id;
    if (!clientOpId) throw new Error('fake server: expense payload missing id/clientOpId');

    const existing = this.expenses.get(clientOpId);
    if (existing) return existing;

    this.expenseSeq += 1;
    const number = `D-${String(this.expenseSeq).padStart(4, '0')}`;
    const id = body.id ?? clientOpId;
    const record: FakeExpenseRecord = {
      expense: {
        id,
        number,
        label: body.label,
        category: body.category,
        amount: body.amount,
        note: body.note ?? '',
        occurredAt: body.occurredAt ?? body.createdAt,
      },
    };
    this.expenses.set(clientOpId, record);
    return record;
  }
}

const server = new FakeServer();

/** Switches the mocked `api()` to simulate no connectivity — every call
 * rejects with `ApiError(0, …)`, exactly what `sync-engine.ts`'s
 * network-stop branch expects (see its docblock). */
function goOffline(): void {
  mockedApi.mockImplementation(async () => {
    throw new ApiError(0, 'Aucune connexion (test)');
  });
}

/** Switches the mocked `api()` to hit the in-memory fake server. */
function goOnline(): void {
  mockedApi.mockImplementation(async (path, options) => server.handle(path, options));
}

function salesPostCount(): number {
  return mockedApi.mock.calls.filter(([path, opts]) => {
    const o = opts as { method?: string } | undefined;
    return path === '/api/sales' && o?.method === 'POST';
  }).length;
}

function product(overrides: Partial<ProductRow> & { id: string }): ProductRow {
  return {
    organizationId: 'org-int-1',
    ref: `REF-${overrides.id}`,
    name: `Product ${overrides.id}`,
    category: 'Alimentation',
    buyPrice: 100,
    sellPrice: 500,
    prixGros: 0,
    unite: 'piece',
    qty: 10,
    threshold: 2,
    updatedAt: '2026-07-21T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  mockedApi.mockReset();
  server.reset();
  await Promise.all([
    db.products.clear(),
    db.customers.clear(),
    db.sales.clear(),
    db.saleItems.clear(),
    db.receivables.clear(),
    db.repayments.clear(),
    db.expenses.clear(),
    db.stockMovements.clear(),
    db.outbox.clear(),
    db.conflicts.clear(),
    db.meta.clear(),
  ]);
});

describe('offline pipeline — end-to-end (Task 6.4)', () => {
  it('sells offline then syncs, is replay-safe, records stock conflicts without losing sales, and round-trips an expense', async () => {
    const ORG = 'org-int-1';

    // -----------------------------------------------------------------------
    // Setup — seed the local mirror as if a pull already happened: two
    // products + `meta.orgId` (createExpenseOffline needs the latter).
    // -----------------------------------------------------------------------
    await db.products.bulkPut([
      product({ id: 'p-a', name: 'Riz 25kg', sellPrice: 500, qty: 20 }),
      product({ id: 'p-b', name: 'Huile 5L', sellPrice: 300, qty: 20 }),
    ]);
    await db.meta.put({ key: 'orgId', value: ORG });

    // The fake server's stock mirrors what this device last pulled — same
    // starting point, but a SEPARATE store from `db.products` (exactly like
    // the real client/server split): local writes below only touch the
    // Dexie copy until a drain actually reaches the network.
    server.setStock('p-a', 20, 'Riz 25kg', 500);
    server.setStock('p-b', 20, 'Huile 5L', 300);

    // -----------------------------------------------------------------------
    // 1. Sell offline, then sync.
    // -----------------------------------------------------------------------
    goOffline();

    const sale1 = await createSaleOffline({
      items: [{ productId: 'p-a', qty: 3, wholesale: false }],
    });
    const sale2 = await createSaleOffline({
      items: [{ productId: 'p-b', qty: 2, wholesale: false }],
    });

    expect(sale1.number).toMatch(/^#L/);
    expect(sale2.number).toMatch(/^#L/);
    expect(sale1.number).not.toBe(sale2.number);

    const rowsAfterOffline = await db.sales.toArray();
    expect(rowsAfterOffline).toHaveLength(2);
    for (const row of rowsAfterOffline) {
      expect(row.synced).toBe(false);
      expect(row.number).toMatch(/^#L/);
    }
    expect(await pendingCount()).toBe(2);

    // Local stock decremented optimistically.
    expect((await db.products.get('p-a'))?.qty).toBe(17);
    expect((await db.products.get('p-b'))?.qty).toBe(18);

    // A drain attempted while still offline must not corrupt anything: the
    // network-stop branch resets the in-flight row back to `pending` and
    // stops the whole loop (FIFO — never skip ahead past a connectivity
    // blip), so BOTH rows remain untouched.
    const offlineDrain = await drainOutbox();
    expect(offlineDrain).toEqual({ done: 0, conflicts: 0, errors: 0 });
    expect(await pendingCount()).toBe(2);
    expect(salesPostCount()).toBe(1); // the one attempt that hit ApiError(0)

    // Now go online and drain for real.
    goOnline();
    const onlineDrain = await drainOutbox();
    expect(onlineDrain).toEqual({ done: 2, conflicts: 0, errors: 0 });

    expect(salesPostCount()).toBe(3); // 1 offline attempt + 2 real POSTs
    expect(server.sales.size).toBe(2);
    expect(await pendingCount()).toBe(0);

    const syncedSale1 = await db.sales.get(sale1.id);
    const syncedSale2 = await db.sales.get(sale2.id);
    expect(syncedSale1).toMatchObject({
      synced: true,
      number: 'V-0001',
      publicToken: 'pub_' + sale1.id,
    });
    expect(syncedSale2).toMatchObject({
      synced: true,
      number: 'V-0002',
      publicToken: 'pub_' + sale2.id,
    });

    // Server-side effect: exactly the two sales, stock decremented once each.
    expect(server.products.get('p-a')?.qty).toBe(17);
    expect(server.products.get('p-b')?.qty).toBe(18);

    // -----------------------------------------------------------------------
    // 2. Idempotent double-drain.
    // -----------------------------------------------------------------------
    // (a) Nothing pending — a second drain is a pure no-op, no network call.
    const noopDrain = await drainOutbox();
    expect(noopDrain).toEqual({ done: 0, conflicts: 0, errors: 0 });
    expect(salesPostCount()).toBe(3);

    // (b) Force a REPLAY of an already-`done` row — emulating an app crash
    // (or a dropped ack) right after the server accepted sale1 but before the
    // local outbox row was flipped to `done`. This is the scenario that
    // actually exercises server-side idempotency end to end (a fresh
    // `pending` row with no rows left for the trivial (a) case to catch).
    const rowsBeforeReplay = await db.outbox.toArray();
    const sale1Row = rowsBeforeReplay.find((r) => r.opId === sale1.id);
    if (sale1Row?.seq === undefined) throw new Error('sale1 outbox row missing seq');
    await db.outbox.update(sale1Row.seq, { status: 'pending' });

    const replayDrain = await drainOutbox();
    expect(replayDrain).toEqual({ done: 1, conflicts: 0, errors: 0 });
    expect(salesPostCount()).toBe(4); // one more POST attempted…

    // …but the fake server deduped it: still exactly 2 sales recorded, same
    // V- number, and — crucially — stock was NOT decremented a second time.
    expect(server.sales.size).toBe(2);
    expect(server.products.get('p-a')?.qty).toBe(17);
    const replayedSale1 = await db.sales.get(sale1.id);
    expect(replayedSale1).toMatchObject({ synced: true, number: 'V-0001' });
    expect(await pendingCount()).toBe(0);

    // -----------------------------------------------------------------------
    // 3. Stock conflict on collision — another device sold p-a's remaining
    // stock server-side while this one stayed on 17 locally.
    // -----------------------------------------------------------------------
    server.setStock('p-a', 1, 'Riz 25kg', 500);

    const sale3 = await createSaleOffline({
      items: [{ productId: 'p-a', qty: 5, wholesale: false }],
    });
    // A second, UNRELATED sale queued right after — must still sync cleanly
    // even though sale3 ahead of it in FIFO order hits a conflict.
    const sale4 = await createSaleOffline({
      items: [{ productId: 'p-b', qty: 2, wholesale: false }],
    });

    expect(await pendingCount()).toBe(2);

    const conflictDrain = await drainOutbox();
    // NOTE (finding, see task report): `DrainResult.conflicts` only counts
    // the LEGACY 409-INSUFFICIENT_STOCK branch (still exercised in
    // sync-engine.test.ts for an older contract) — the current Task 4.1
    // contract is a 200 with a `stockConflicts` array, which takes the
    // `markDone` path, so this counter stays 0 even though a real conflict
    // was captured (asserted via `db.conflicts` below). Documented as a gap
    // in the task report, not fixed here (out of scope for this test).
    expect(conflictDrain).toEqual({ done: 2, conflicts: 0, errors: 0 });

    // The sale is NOT lost: recorded server-side, given a real V- number.
    expect(server.sales.size).toBe(4);
    const syncedSale3 = await db.sales.get(sale3.id);
    expect(syncedSale3).toMatchObject({ synced: true, number: 'V-0003' });
    // Server stock clamped to 0, never negative.
    expect(server.products.get('p-a')?.qty).toBe(0);

    // The conflict is captured for the shopkeeper to review.
    const conflictRows = await db.conflicts.toArray();
    expect(conflictRows).toHaveLength(1);
    expect(conflictRows[0]).toMatchObject({
      id: `${sale3.id}:p-a`,
      saleId: sale3.id,
      saleNumber: 'V-0003',
      productId: 'p-a',
      productName: 'Riz 25kg',
      requested: 5,
      available: 1,
      shortfall: 4,
      resolved: 0,
    });

    // The unrelated sale queued behind it still synced fine — a conflict on
    // one row never blocks the rest of the FIFO.
    const syncedSale4 = await db.sales.get(sale4.id);
    expect(syncedSale4).toMatchObject({ synced: true, number: 'V-0004' });
    expect(server.products.get('p-b')?.qty).toBe(16);
    expect(await pendingCount()).toBe(0);

    // -----------------------------------------------------------------------
    // 4. Expense offline → sync round trip.
    // -----------------------------------------------------------------------
    goOffline();
    const expense = await createExpenseOffline({
      label: 'Facture eau',
      amount: 15000,
      category: 'Charges',
    });
    const expenseRowOffline = await db.expenses.get(expense.id);
    expect(expenseRowOffline).toMatchObject({ synced: false, number: expense.number });
    expect(expense.number).toMatch(/^#L/);

    goOnline();
    const expenseDrain = await drainOutbox();
    expect(expenseDrain).toEqual({ done: 1, conflicts: 0, errors: 0 });

    const syncedExpense = await db.expenses.get(expense.id);
    expect(syncedExpense).toMatchObject({ synced: true, number: 'D-0001' });
    expect(server.expenses.size).toBe(1);
  });
});
