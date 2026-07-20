// @vitest-environment jsdom
/**
 * outbox.ts — companion unit test (Task 2.1).
 *
 * Uses `fake-indexeddb/auto` to polyfill `indexedDB`/`IDBKeyRange` on the
 * jsdom global before Dexie opens the database, same pattern as
 * `db.test.ts` / `session.test.ts`.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  enqueue,
  listPending,
  markSyncing,
  markDone,
  markConflict,
  markError,
  pendingCount,
} from './outbox';

describe('outbox.ts (client write-queue)', () => {
  beforeEach(async () => {
    await db.outbox.clear();
  });

  it('enqueue inserts a pending row with an assigned seq', async () => {
    const row = await enqueue({
      kind: 'sale',
      payload: { total: 500 },
      opId: 'op1',
      endpoint: '/api/sales',
    });

    expect(row.status).toBe('pending');
    expect(row.kind).toBe('sale');
    expect(row.opId).toBe('op1');
    expect(row.endpoint).toBe('/api/sales');
    expect(row.payload).toEqual({ total: 500 });
    expect(typeof row.seq).toBe('number');
    expect(typeof row.createdAt).toBe('string');
  });

  it('two enqueues preserve FIFO seq order in listPending', async () => {
    const first = await enqueue({ kind: 'sale', payload: {}, opId: 'op1', endpoint: '/api/sales' });
    const second = await enqueue({
      kind: 'expense',
      payload: {},
      opId: 'op2',
      endpoint: '/api/expenses',
    });

    const pending = await listPending();

    expect(pending).toHaveLength(2);
    expect(pending[0]?.seq).toBe(first.seq);
    expect(pending[1]?.seq).toBe(second.seq);
    expect(first.seq).toBeLessThan(second.seq as number);
  });

  it('listPending returns only status:pending rows, ascending seq', async () => {
    const a = await enqueue({ kind: 'sale', payload: {}, opId: 'op-a', endpoint: '/api/sales' });
    const b = await enqueue({ kind: 'sale', payload: {}, opId: 'op-b', endpoint: '/api/sales' });
    const c = await enqueue({ kind: 'sale', payload: {}, opId: 'op-c', endpoint: '/api/sales' });

    await markDone(b.seq as number);
    await markSyncing(c.seq as number);

    const pending = await listPending();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.seq).toBe(a.seq);
    expect(pending[0]?.status).toBe('pending');
  });

  it('markSyncing sets status to syncing', async () => {
    const row = await enqueue({ kind: 'repay', payload: {}, opId: 'op1', endpoint: '/api/x' });
    await markSyncing(row.seq as number);

    const stored = await db.outbox.get(row.seq as number);
    expect(stored?.status).toBe('syncing');
  });

  it('markDone sets status to done and removes it from pendingCount', async () => {
    const row = await enqueue({ kind: 'adjust', payload: {}, opId: 'op1', endpoint: '/api/x' });
    expect(await pendingCount()).toBe(1);

    await markDone(row.seq as number);

    const stored = await db.outbox.get(row.seq as number);
    expect(stored?.status).toBe('done');
    expect(await pendingCount()).toBe(0);
  });

  it('markConflict sets status to conflict and stores the reason', async () => {
    const row = await enqueue({ kind: 'sale', payload: {}, opId: 'op1', endpoint: '/api/sales' });
    await markConflict(row.seq as number, 'stock shortfall: Riz -3');

    const stored = await db.outbox.get(row.seq as number);
    expect(stored?.status).toBe('conflict');
    expect(stored?.error).toBe('stock shortfall: Riz -3');
  });

  it('markError sets status to error, stores reason and optional retryAt', async () => {
    const row = await enqueue({ kind: 'customer', payload: {}, opId: 'op1', endpoint: '/api/x' });
    await markError(row.seq as number, 'network timeout', '2026-07-20T01:00:00Z');

    const stored = await db.outbox.get(row.seq as number);
    expect(stored?.status).toBe('error');
    expect(stored?.error).toBe('network timeout');
    expect(stored?.retryAt).toBe('2026-07-20T01:00:00Z');
  });

  it('markError works without a retryAt', async () => {
    const row = await enqueue({ kind: 'cancel', payload: {}, opId: 'op1', endpoint: '/api/x' });
    await markError(row.seq as number, 'bad request');

    const stored = await db.outbox.get(row.seq as number);
    expect(stored?.status).toBe('error');
    expect(stored?.error).toBe('bad request');
    expect(stored?.retryAt).toBeUndefined();
  });

  it('pendingCount counts pending + syncing + error, excludes done and conflict', async () => {
    await enqueue({ kind: 'sale', payload: {}, opId: 'a', endpoint: '/api/sales' });
    const b = await enqueue({ kind: 'sale', payload: {}, opId: 'b', endpoint: '/api/sales' });
    const c = await enqueue({ kind: 'sale', payload: {}, opId: 'c', endpoint: '/api/sales' });
    const d = await enqueue({ kind: 'sale', payload: {}, opId: 'd', endpoint: '/api/sales' });
    // a stays pending
    await markSyncing(b.seq as number);
    await markError(c.seq as number, 'oops');
    await markDone(d.seq as number);
    const e = await enqueue({ kind: 'sale', payload: {}, opId: 'e', endpoint: '/api/sales' });
    await markConflict(e.seq as number, 'stock shortfall');

    expect(await pendingCount()).toBe(3); // a (pending) + b (syncing) + c (error)
  });
});
