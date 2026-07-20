// @vitest-environment jsdom
/**
 * purge.ts — companion unit test (Task 6.3).
 *
 * Same jsdom + `fake-indexeddb/auto` setup as `db.test.ts` (Dexie needs a
 * real-shaped IndexedDB API). Covers both the pure eligibility functions
 * (no Dexie needed) and the full `purgeLocalHistory()` sweep against a
 * seeded in-memory database.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type OutboxRow } from './db';
import { purgeLocalHistory, isPurgeable, isConflictPurgeable, buildReferencedIds } from './purge';

const OLD = '2020-01-01T00:00:00.000Z'; // far older than any retention window
const RECENT = new Date().toISOString(); // now

describe('isPurgeable (pure)', () => {
  const cutoff = '2026-01-01T00:00:00.000Z';

  it('is purgeable: synced true, older than cutoff, not referenced', () => {
    expect(
      isPurgeable({ dateIso: '2025-01-01T00:00:00.000Z', synced: true, referenced: false }, cutoff),
    ).toBe(true);
  });

  it('is NOT purgeable when synced is false', () => {
    expect(
      isPurgeable(
        { dateIso: '2025-01-01T00:00:00.000Z', synced: false, referenced: false },
        cutoff,
      ),
    ).toBe(false);
  });

  it('is NOT purgeable when synced is undefined (conservative — see module docblock)', () => {
    expect(
      isPurgeable(
        { dateIso: '2025-01-01T00:00:00.000Z', synced: undefined, referenced: false },
        cutoff,
      ),
    ).toBe(false);
  });

  it('is NOT purgeable when referenced by a live outbox row, even if synced+old', () => {
    expect(
      isPurgeable({ dateIso: '2025-01-01T00:00:00.000Z', synced: true, referenced: true }, cutoff),
    ).toBe(false);
  });

  it('is NOT purgeable when not old enough, even if synced+unreferenced', () => {
    expect(
      isPurgeable({ dateIso: '2026-06-01T00:00:00.000Z', synced: true, referenced: false }, cutoff),
    ).toBe(false);
  });
});

describe('isConflictPurgeable (pure)', () => {
  const cutoff = '2026-01-01T00:00:00.000Z';

  it('is purgeable when resolved and old', () => {
    expect(isConflictPurgeable({ dateIso: '2025-01-01T00:00:00.000Z', resolved: 1 }, cutoff)).toBe(
      true,
    );
  });

  it('is NOT purgeable when unresolved, even if old', () => {
    expect(isConflictPurgeable({ dateIso: '2025-01-01T00:00:00.000Z', resolved: 0 }, cutoff)).toBe(
      false,
    );
  });

  it('is NOT purgeable when resolved but not old enough', () => {
    expect(isConflictPurgeable({ dateIso: '2026-06-01T00:00:00.000Z', resolved: 1 }, cutoff)).toBe(
      false,
    );
  });
});

describe('buildReferencedIds (pure)', () => {
  function outboxRow(over: Partial<OutboxRow> & { opId: string; kind: string }): OutboxRow {
    return {
      status: 'pending',
      payload: {},
      endpoint: '/api/x',
      createdAt: '2026-07-20T00:00:00.000Z',
      ...over,
    };
  }

  it('protects a plain op by its opId', () => {
    const ids = buildReferencedIds([outboxRow({ opId: 's1', kind: 'sale' })]);
    expect(ids.has('s1')).toBe(true);
  });

  it('protects the sale a pending cancel op targets (read from the endpoint, not opId)', () => {
    const ids = buildReferencedIds([
      outboxRow({ opId: 'cancel-op-1', kind: 'cancel', endpoint: '/api/sales/s1/cancel' }),
    ]);
    expect(ids.has('s1')).toBe(true);
    expect(ids.has('cancel-op-1')).toBe(true);
  });

  it('ignores done/terminal rows', () => {
    const ids = buildReferencedIds([outboxRow({ opId: 's1', kind: 'sale', status: 'done' })]);
    expect(ids.has('s1')).toBe(false);
  });

  it("includes conflict-status rows (a human hasn't resolved it yet)", () => {
    const ids = buildReferencedIds([outboxRow({ opId: 's1', kind: 'sale', status: 'conflict' })]);
    expect(ids.has('s1')).toBe(true);
  });
});

describe('purgeLocalHistory (against fake-indexeddb)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.sales.clear(),
      db.saleItems.clear(),
      db.stockMovements.clear(),
      db.repayments.clear(),
      db.conflicts.clear(),
      db.outbox.clear(),
    ]);
  });

  it('deletes only old+synced+unreferenced rows; keeps recent, unsynced, and outbox-referenced rows', async () => {
    // --- sales -----------------------------------------------------------
    await db.sales.bulkPut([
      // old + synced + unreferenced → DELETED, along with its items
      {
        id: 'sale-old-synced',
        organizationId: 'org-1',
        number: 'V-1',
        method: 'CASH',
        total: 1000,
        discount: 0,
        cashAmount: 1000,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'ACTIVE',
        createdAt: OLD,
        synced: true,
      },
      // recent + synced → KEPT (not old enough)
      {
        id: 'sale-recent-synced',
        organizationId: 'org-1',
        number: 'V-2',
        method: 'CASH',
        total: 500,
        discount: 0,
        cashAmount: 500,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'ACTIVE',
        createdAt: RECENT,
        synced: true,
      },
      // old + UNSYNCED → KEPT (never delete pending data)
      {
        id: 'sale-old-unsynced',
        organizationId: 'org-1',
        number: '#L1',
        method: 'CASH',
        total: 700,
        discount: 0,
        cashAmount: 700,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'ACTIVE',
        createdAt: OLD,
        synced: false,
      },
      // old + synced BUT referenced by a pending outbox row (e.g. a pending
      // cancel targeting it) → KEPT
      {
        id: 'sale-old-referenced',
        organizationId: 'org-1',
        number: 'V-3',
        method: 'CASH',
        total: 300,
        discount: 0,
        cashAmount: 300,
        mobileAmount: 0,
        creditAmount: 0,
        status: 'ACTIVE',
        createdAt: OLD,
        synced: true,
      },
    ]);

    // --- saleItems ---------------------------------------------------------
    await db.saleItems.bulkPut([
      {
        id: 'item-of-deleted',
        saleId: 'sale-old-synced',
        name: 'Riz',
        qty: 1,
        unitPrice: 1000,
        buyPrice: 700,
      },
      {
        id: 'item-of-kept',
        saleId: 'sale-recent-synced',
        name: 'Huile',
        qty: 1,
        unitPrice: 500,
        buyPrice: 300,
      },
    ]);

    // --- stockMovements ------------------------------------------------
    await db.stockMovements.bulkPut([
      {
        id: 'mv-old-synced',
        organizationId: 'org-1',
        productId: 'p1',
        type: 'ADJUST',
        delta: -1,
        clientOpId: 'adjust-op-old',
        createdAt: OLD,
        synced: true,
      },
      {
        id: 'mv-old-unsynced',
        organizationId: 'org-1',
        productId: 'p1',
        type: 'ADJUST',
        delta: -1,
        clientOpId: 'adjust-op-unsynced',
        createdAt: OLD,
        synced: false,
      },
    ]);

    // --- repayments ------------------------------------------------------
    await db.repayments.bulkPut([
      {
        id: 'rp-old-synced',
        organizationId: 'org-1',
        customerId: 'c1',
        amount: 500,
        createdAt: OLD,
        synced: true,
      },
      {
        id: 'rp-recent-synced',
        organizationId: 'org-1',
        customerId: 'c1',
        amount: 500,
        createdAt: RECENT,
        synced: true,
      },
      {
        id: 'rp-old-unsynced',
        organizationId: 'org-1',
        customerId: 'c1',
        amount: 500,
        createdAt: OLD,
        synced: false,
      },
    ]);

    // --- conflicts -------------------------------------------------------
    await db.conflicts.bulkPut([
      {
        id: 'sale-old-synced:p1',
        saleId: 'sale-old-synced',
        saleNumber: 'V-1',
        productId: 'p1',
        productName: 'Riz',
        requested: 5,
        available: 2,
        shortfall: 3,
        createdAt: OLD,
        resolved: 1,
      },
      {
        id: 'sale-old-synced:p2',
        saleId: 'sale-old-synced',
        saleNumber: 'V-1',
        productId: 'p2',
        productName: 'Sucre',
        requested: 5,
        available: 2,
        shortfall: 3,
        createdAt: OLD,
        resolved: 0, // unresolved → kept
      },
    ]);

    // --- outbox: one live row referencing sale-old-referenced (a pending
    // cancel) so its `opId` isn't the sale's own id — protection comes from
    // the endpoint parse, exercising `buildReferencedIds`'s cancel branch.
    await db.outbox.add({
      status: 'pending',
      kind: 'cancel',
      payload: { clientOpId: 'cancel-1', reason: 'test' },
      opId: 'cancel-1',
      endpoint: '/api/sales/sale-old-referenced/cancel',
      createdAt: RECENT,
    });

    const result = await purgeLocalHistory(60);

    // sales
    const remainingSaleIds = (await db.sales.toArray()).map((s) => s.id).sort();
    expect(remainingSaleIds).toEqual(
      ['sale-old-referenced', 'sale-old-unsynced', 'sale-recent-synced'].sort(),
    );

    // saleItems cascade
    const remainingItemIds = (await db.saleItems.toArray()).map((i) => i.id).sort();
    expect(remainingItemIds).toEqual(['item-of-kept']);

    // stockMovements
    const remainingMovementIds = (await db.stockMovements.toArray()).map((m) => m.id).sort();
    expect(remainingMovementIds).toEqual(['mv-old-unsynced']);

    // repayments
    const remainingRepaymentIds = (await db.repayments.toArray()).map((r) => r.id).sort();
    expect(remainingRepaymentIds).toEqual(['rp-old-unsynced', 'rp-recent-synced'].sort());

    // conflicts
    const remainingConflictIds = (await db.conflicts.toArray()).map((c) => c.id).sort();
    expect(remainingConflictIds).toEqual(['sale-old-synced:p2']);

    // deleted count: 1 sale + 1 item + 1 movement + 1 repayment + 1 conflict
    expect(result.deleted).toBe(5);
  });

  it('defaults retentionDays to 60 and never deletes anything inside that window', async () => {
    const within60Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.sales.put({
      id: 'sale-within-window',
      organizationId: 'org-1',
      number: 'V-1',
      method: 'CASH',
      total: 1000,
      discount: 0,
      cashAmount: 1000,
      mobileAmount: 0,
      creditAmount: 0,
      status: 'ACTIVE',
      createdAt: within60Days,
      synced: true,
    });

    const result = await purgeLocalHistory();

    expect(result.deleted).toBe(0);
    expect(await db.sales.get('sale-within-window')).toBeDefined();
  });
});
