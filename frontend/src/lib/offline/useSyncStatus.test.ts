// @vitest-environment jsdom
/**
 * useSyncStatus.ts — companion unit test (Task 2.4).
 *
 * The repo has no React render-test harness (no @testing-library/react, and
 * the vitest include glob is `.test.ts` only — see vitest.config.ts). So
 * this file does NOT attempt to render the hook. Instead it exercises the
 * small exported query functions the hook composes
 * (`countPending`/`countSyncing`/`countConflicts`/`readLastSyncedAt`)
 * directly against `fake-indexeddb`, same pattern as `db.test.ts` /
 * `outbox.test.ts`. The hook wrapper itself (the `useLiveQuery` composition
 * + `syncNow`) is verified via `pnpm typecheck` + read — see the task
 * report.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { enqueue, markSyncing, markDone, markConflict, markError } from './outbox';
import { countPending, countSyncing, countConflicts, readLastSyncedAt } from './useSyncStatus';

describe('useSyncStatus query functions', () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.meta.clear();
    await db.conflicts.clear();
  });

  describe('countPending', () => {
    it('is 0 on an empty outbox', async () => {
      expect(await countPending()).toBe(0);
    });

    it('counts pending + syncing + error, excludes done and conflict', async () => {
      // a stays pending
      await enqueue({ kind: 'sale', payload: {}, opId: 'a', endpoint: '/api/sales' });
      const b = await enqueue({ kind: 'sale', payload: {}, opId: 'b', endpoint: '/api/sales' });
      const c = await enqueue({ kind: 'sale', payload: {}, opId: 'c', endpoint: '/api/sales' });
      const d = await enqueue({ kind: 'sale', payload: {}, opId: 'd', endpoint: '/api/sales' });
      const e = await enqueue({ kind: 'sale', payload: {}, opId: 'e', endpoint: '/api/sales' });
      await markSyncing(b.seq as number);
      await markError(c.seq as number, 'oops');
      await markDone(d.seq as number);
      await markConflict(e.seq as number, 'stock shortfall');

      expect(await countPending()).toBe(3); // a (pending) + b (syncing) + c (error)
    });
  });

  describe('countSyncing', () => {
    it('is 0 when no row is currently syncing', async () => {
      await enqueue({ kind: 'sale', payload: {}, opId: 'a', endpoint: '/api/sales' });
      expect(await countSyncing()).toBe(0);
    });

    it('counts only rows with status syncing', async () => {
      const a = await enqueue({ kind: 'sale', payload: {}, opId: 'a', endpoint: '/api/sales' });
      const b = await enqueue({ kind: 'sale', payload: {}, opId: 'b', endpoint: '/api/sales' });
      await enqueue({ kind: 'sale', payload: {}, opId: 'c', endpoint: '/api/sales' });
      await markSyncing(a.seq as number);
      await markSyncing(b.seq as number);

      expect(await countSyncing()).toBe(2);
    });
  });

  describe('countConflicts', () => {
    it('is 0 when there are no conflicts', async () => {
      await enqueue({ kind: 'sale', payload: {}, opId: 'a', endpoint: '/api/sales' });
      expect(await countConflicts()).toBe(0);
    });

    it('counts UNRESOLVED db.conflicts rows (the reconciliation table), not outbox status', async () => {
      // Task 6.4 regression: a stock conflict since Task 4.1 arrives as a
      // 200 + `stockConflicts` and is recorded into `db.conflicts` by
      // `sync-engine.ts`'s `applySyncSuccess` — the sale's OWN outbox row
      // still drains as `done`, never `conflict`. So seeding `db.conflicts`
      // directly (2 unresolved + 1 resolved) with an EMPTY outbox must still
      // count 2, proving the count is no longer sourced from outbox status.
      await db.conflicts.bulkAdd([
        {
          id: 's1:p1',
          saleId: 's1',
          saleNumber: 'V-0001',
          productId: 'p1',
          productName: 'Riz',
          requested: 5,
          available: 2,
          shortfall: 3,
          createdAt: '2026-07-20T00:00:00.000Z',
          resolved: 0,
        },
        {
          id: 's1:p2',
          saleId: 's1',
          saleNumber: 'V-0001',
          productId: 'p2',
          productName: 'Sucre',
          requested: 4,
          available: 0,
          shortfall: 4,
          createdAt: '2026-07-20T00:00:00.000Z',
          resolved: 0,
        },
        {
          id: 's2:p3',
          saleId: 's2',
          saleNumber: 'V-0002',
          productId: 'p3',
          productName: 'Huile',
          requested: 1,
          available: 0,
          shortfall: 1,
          createdAt: '2026-07-20T00:00:00.000Z',
          resolved: 1, // shopkeeper already resolved it on /synchronisation
        },
      ]);

      expect(await countConflicts()).toBe(2);
    });

    it('sums in legacy outbox status:conflict rows (the adjust 409 path) alongside db.conflicts', async () => {
      // The legacy 409 INSUFFICIENT_STOCK path (used by
      // /api/products/[id]/adjust) still marks the outbox row `conflict`
      // directly and never writes to `db.conflicts` — countConflicts must
      // still surface it so an adjust-stock conflict lights up the badge.
      const a = await enqueue({
        kind: 'adjust',
        payload: {},
        opId: 'a',
        endpoint: '/api/products/p1/adjust',
      });
      await markConflict(a.seq as number, 'INSUFFICIENT_STOCK');
      await db.conflicts.add({
        id: 's1:p1',
        saleId: 's1',
        saleNumber: 'V-0001',
        productId: 'p1',
        productName: 'Riz',
        requested: 5,
        available: 2,
        shortfall: 3,
        createdAt: '2026-07-20T00:00:00.000Z',
        resolved: 0,
      });

      expect(await countConflicts()).toBe(2); // 1 from db.conflicts + 1 from outbox
    });
  });

  describe('readLastSyncedAt', () => {
    it('returns null when meta.lastPull was never set', async () => {
      expect(await readLastSyncedAt()).toBeNull();
    });

    it('returns the stored ISO string when meta.lastPull is set', async () => {
      await db.meta.put({ key: 'lastPull', value: '2026-07-20T12:00:00.000Z' });

      expect(await readLastSyncedAt()).toBe('2026-07-20T12:00:00.000Z');
    });

    it('returns null defensively if meta.lastPull holds a non-string value', async () => {
      // `MetaRow.value` is typed `unknown` — a corrupted/legacy row should
      // not surface as a fake "last synced" timestamp.
      await db.meta.put({ key: 'lastPull', value: 12345 });

      expect(await readLastSyncedAt()).toBeNull();
    });
  });
});
