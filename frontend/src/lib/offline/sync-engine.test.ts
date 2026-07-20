// @vitest-environment jsdom
/**
 * sync-engine.ts — companion unit test (Task 2.2).
 *
 * Same jsdom + `fake-indexeddb/auto` setup as `outbox.test.ts`. `@/lib/api`
 * is partially mocked: `api()` becomes a `vi.fn()` so no real network call
 * is made, but `ApiError` stays the real class (via `importActual`) so
 * `err instanceof ApiError` inside `sync-engine.ts` still matches the
 * errors constructed here.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, type SaleRow } from './db';
import { api, ApiError } from '@/lib/api';
import { enqueue, listPending } from './outbox';
import { drainOutbox } from './sync-engine';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

function makeSaleRow(id: string): SaleRow {
  return {
    id,
    organizationId: 'o1',
    number: `Local #${id}`,
    method: 'CASH',
    total: 100,
    discount: 0,
    cashAmount: 100,
    mobileAmount: 0,
    creditAmount: 0,
    status: 'ACTIVE',
    createdAt: '2026-07-20T00:00:00.000Z',
    synced: false,
  };
}

beforeEach(async () => {
  mockedApi.mockReset();
  await Promise.all([db.outbox.clear(), db.sales.clear(), db.expenses.clear()]);
});

describe('drainOutbox', () => {
  it('replays pending rows FIFO; a 409 stock conflict marks conflict and does not block later rows', async () => {
    await enqueue({ kind: 'sale', payload: { id: 's1' }, opId: 's1', endpoint: '/api/sales' });
    await enqueue({ kind: 'sale', payload: { id: 's2' }, opId: 's2', endpoint: '/api/sales' });
    await enqueue({ kind: 'sale', payload: { id: 's3' }, opId: 's3', endpoint: '/api/sales' });
    await db.sales.bulkPut([makeSaleRow('s1'), makeSaleRow('s2'), makeSaleRow('s3')]);

    mockedApi
      .mockResolvedValueOnce({
        sale: { id: 's1', number: 'V-0001', total: 100, publicToken: null },
      })
      .mockRejectedValueOnce(
        new ApiError(409, 'Stock insuffisant', { error: 'INSUFFICIENT_STOCK' }),
      )
      .mockResolvedValueOnce({
        sale: { id: 's3', number: 'V-0003', total: 100, publicToken: null },
      });

    const result = await drainOutbox();

    expect(result).toEqual({ done: 2, conflicts: 1, errors: 0 });

    // FIFO: #2 must have been attempted before #3, in seq order.
    expect(mockedApi).toHaveBeenNthCalledWith(1, '/api/sales', {
      method: 'POST',
      body: { id: 's1' },
    });
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/api/sales', {
      method: 'POST',
      body: { id: 's2' },
    });
    expect(mockedApi).toHaveBeenNthCalledWith(3, '/api/sales', {
      method: 'POST',
      body: { id: 's3' },
    });

    const rows = await db.outbox.toArray();
    const byOpId = Object.fromEntries(rows.map((r) => [r.opId, r]));
    expect(byOpId.s1?.status).toBe('done');
    expect(byOpId.s2?.status).toBe('conflict');
    expect(byOpId.s2?.error).toBe('INSUFFICIENT_STOCK');
    expect(byOpId.s3?.status).toBe('done');

    const sale1 = await db.sales.get('s1');
    expect(sale1?.synced).toBe(true);
    expect(sale1?.number).toBe('V-0001');

    const sale3 = await db.sales.get('s3');
    expect(sale3?.synced).toBe(true);
    expect(sale3?.number).toBe('V-0003');

    // Conflict row's local mirror is untouched (still provisional/unsynced).
    const sale2 = await db.sales.get('s2');
    expect(sale2?.synced).toBe(false);
  });

  it('stops immediately on a network error (status 0) and leaves later rows untouched/pending', async () => {
    await enqueue({ kind: 'sale', payload: { id: 's1' }, opId: 's1', endpoint: '/api/sales' });
    await enqueue({ kind: 'sale', payload: { id: 's2' }, opId: 's2', endpoint: '/api/sales' });

    mockedApi.mockRejectedValueOnce(new ApiError(0, 'Network error'));

    const result = await drainOutbox();

    expect(result).toEqual({ done: 0, conflicts: 0, errors: 0 });
    // op #2 was never POSTed.
    expect(mockedApi).toHaveBeenCalledTimes(1);

    const pending = await listPending();
    expect(pending.map((r) => r.opId)).toEqual(['s1', 's2']);
  });

  it('a non-conflict 4xx (validation) marks error and continues draining', async () => {
    await enqueue({
      kind: 'expense',
      payload: { id: 'e1' },
      opId: 'e1',
      endpoint: '/api/expenses',
    });
    await enqueue({
      kind: 'expense',
      payload: { id: 'e2' },
      opId: 'e2',
      endpoint: '/api/expenses',
    });

    mockedApi
      .mockRejectedValueOnce(new ApiError(422, 'invalide', { error: 'VALIDATION_FAILED' }))
      .mockResolvedValueOnce({ expense: { id: 'e2', number: 'D-0002' } });

    const result = await drainOutbox();

    expect(result).toEqual({ done: 1, conflicts: 0, errors: 1 });

    const rows = await db.outbox.toArray();
    const e1 = rows.find((r) => r.opId === 'e1');
    expect(e1?.status).toBe('error');
    expect(e1?.error).toBe('VALIDATION_FAILED');

    // Errored row is excluded from listPending — no rows left blocking the queue.
    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it('single-flight: a concurrent drainOutbox() call does not double-POST', async () => {
    await enqueue({ kind: 'sale', payload: { id: 's1' }, opId: 's1', endpoint: '/api/sales' });
    await db.sales.put(makeSaleRow('s1'));

    // Deferred promise created UP FRONT (not inside the mock factory): the
    // factory is only invoked once `first`'s internal `markSyncing` Dexie
    // write has actually completed and the loop reaches the `api()` call,
    // which can take more real ticks than `second`'s trivial early-return.
    // Binding `resolveApi` eagerly means calling it is safe regardless of
    // that timing — resolving a promise object created before the mock
    // call, rather than racing to reassign a closure variable only set
    // once the mock factory itself runs.
    let resolveApi!: (value: unknown) => void;
    const gate = new Promise<unknown>((resolve) => {
      resolveApi = resolve;
    });
    mockedApi.mockImplementationOnce(() => gate);

    const first = drainOutbox();
    const second = drainOutbox(); // fired while `first` is still in flight

    await expect(second).resolves.toEqual({ done: 0, conflicts: 0, errors: 0 });

    resolveApi({ sale: { id: 's1', number: 'V-0001', total: 100, publicToken: null } });
    await expect(first).resolves.toEqual({ done: 1, conflicts: 0, errors: 0 });

    expect(mockedApi).toHaveBeenCalledTimes(1);
  });

  it('a non-ApiError (e.g. a raw SyntaxError from a malformed 2xx body) resets the row to pending and stops the drain without rejecting', async () => {
    await enqueue({ kind: 'sale', payload: { id: 's1' }, opId: 's1', endpoint: '/api/sales' });
    await enqueue({ kind: 'sale', payload: { id: 's2' }, opId: 's2', endpoint: '/api/sales' });
    await db.sales.bulkPut([makeSaleRow('s1'), makeSaleRow('s2')]);

    mockedApi.mockRejectedValueOnce(new SyntaxError('Unexpected end of JSON input'));

    await expect(drainOutbox()).resolves.toEqual({ done: 0, conflicts: 0, errors: 0 });

    // op #2 was never POSTed — the loop stopped after the non-ApiError.
    expect(mockedApi).toHaveBeenCalledTimes(1);

    // Row #1 is back to `pending` (not stuck at `syncing`), so it is visible
    // to a follow-up listPending() and will be retried, in order, next drain.
    const pending = await listPending();
    expect(pending.map((r) => r.opId)).toEqual(['s1', 's2']);

    const rows = await db.outbox.toArray();
    const s1 = rows.find((r) => r.opId === 's1');
    expect(s1?.status).toBe('pending');
  });

  it('applySyncSuccess throwing does not abort the drain — the row stays done and later rows still process', async () => {
    await enqueue({ kind: 'sale', payload: { id: 's1' }, opId: 's1', endpoint: '/api/sales' });
    await enqueue({ kind: 'sale', payload: { id: 's2' }, opId: 's2', endpoint: '/api/sales' });
    await db.sales.bulkPut([makeSaleRow('s1'), makeSaleRow('s2')]);

    mockedApi
      .mockResolvedValueOnce({
        sale: { id: 's1', number: 'V-0001', total: 100, publicToken: null },
      })
      .mockResolvedValueOnce({
        sale: { id: 's2', number: 'V-0002', total: 100, publicToken: null },
      });

    // First call (row s1's patch) throws; subsequent calls (row s2's patch)
    // fall through to the real Dexie `update` untouched.
    const updateSpy = vi.spyOn(db.sales, 'update').mockImplementationOnce(() => {
      throw new Error('local patch failed');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await drainOutbox();

    expect(result).toEqual({ done: 2, conflicts: 0, errors: 0 });
    expect(warnSpy).toHaveBeenCalledWith(
      '[sync-engine] applySyncSuccess failed for row',
      's1',
      expect.any(Error),
    );

    // Both rows are `done` in the outbox — the server accepted both writes,
    // even though row #1's local cosmetic patch threw.
    const rows = await db.outbox.toArray();
    const byOpId = Object.fromEntries(rows.map((r) => [r.opId, r]));
    expect(byOpId.s1?.status).toBe('done');
    expect(byOpId.s2?.status).toBe('done');

    updateSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
