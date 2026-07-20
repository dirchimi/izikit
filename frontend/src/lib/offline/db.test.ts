// @vitest-environment jsdom
/**
 * db.ts — companion unit test.
 *
 * Uses `fake-indexeddb/auto` to polyfill `indexedDB`/`IDBKeyRange` on the
 * jsdom global before Dexie opens the database (Dexie needs a real-shaped
 * IndexedDB API even under test — jsdom itself does not ship one).
 *
 * Asserts:
 *   1. the `products` table stores a row and it is queryable by the
 *      `organizationId` index (brief's Step 2 test, verbatim).
 *   2. `newId()`/`newOpId()` (from `./ids`) each return distinct,
 *      non-empty strings — the id generator this task also produces.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db } from './db';
import { newId, newOpId } from './ids';

describe('db (Dexie local database)', () => {
  it('stores and queries products by organizationId', async () => {
    await db.products.put({
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
      updatedAt: '2026-07-20T00:00:00Z',
    });

    const rows = await db.products.where('organizationId').equals('o1').toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Riz');
  });

  it('exposes the outbox/session/meta tables declared in the schema', () => {
    expect(db.outbox).toBeDefined();
    expect(db.session).toBeDefined();
    expect(db.meta).toBeDefined();
  });
});

describe('db.conflicts (Task 4.2 — stock-conflict reconciliation queue)', () => {
  it('stores a conflict row and queries it by the resolved index', async () => {
    await db.conflicts.put({
      id: 's1:p1',
      saleId: 's1',
      saleNumber: 'V-0001',
      productId: 'p1',
      productName: 'Riz',
      requested: 5,
      available: 2,
      shortfall: 3,
      createdAt: '2026-07-20T00:00:00Z',
      resolved: 0,
    });

    const unresolved = await db.conflicts.where('resolved').equals(0).toArray();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.id).toBe('s1:p1');
    expect(unresolved[0]?.productName).toBe('Riz');

    const resolved = await db.conflicts.where('resolved').equals(1).toArray();
    expect(resolved).toHaveLength(0);
  });

  it('dedupe key [saleId+productId] can be queried directly', async () => {
    await db.conflicts.put({
      id: 's2:p9',
      saleId: 's2',
      saleNumber: 'V-0002',
      productId: 'p9',
      productName: 'Sucre',
      requested: 10,
      available: 4,
      shortfall: 6,
      createdAt: '2026-07-20T00:00:00Z',
      resolved: 0,
    });

    const found = await db.conflicts.where('[saleId+productId]').equals(['s2', 'p9']).first();
    expect(found?.id).toBe('s2:p9');
  });
});

describe('newId / newOpId (cuid2 id generator)', () => {
  it('returns distinct, non-empty strings', () => {
    const a = newId();
    const b = newId();
    const opA = newOpId();
    const opB = newOpId();

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(opA.length).toBeGreaterThan(0);
    expect(opB.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
    expect(opA).not.toBe(opB);
    expect(a).not.toBe(opA);
  });
});
