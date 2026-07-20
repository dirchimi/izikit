/**
 * customer-adapters.ts — companion unit test (Task 5.4).
 *
 * Pure function, no render harness needed (this repo ships none — the
 * vitest include glob is `.test.ts` only). Mirrors `expense-adapters.test.ts`'s
 * shape. Also exercises the mapper against a real (fake-indexeddb) Dexie
 * table, since Task 5.4's requirement is specifically that locally-created
 * (`synced: false`) customers are included alongside pulled ones — a plain
 * in-memory array test wouldn't prove anything about Dexie's own storage.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type CustomerRow } from './db';
import { customerRowToApi } from './customer-adapters';

const baseRow: CustomerRow = {
  id: 'c1',
  organizationId: 'org-1',
  name: 'Awa Diop',
  updatedAt: '2026-07-20T00:00:00.000Z',
};

describe('customerRowToApi', () => {
  it('maps every field ClientPicker reads', () => {
    expect(customerRowToApi({ ...baseRow, phone: '221700000000' })).toEqual({
      id: 'c1',
      name: 'Awa Diop',
      phone: '221700000000',
    });
  });

  it('defaults an absent phone to null rather than undefined', () => {
    const mapped = customerRowToApi(baseRow);
    expect(mapped.phone).toBeNull();
    expect('phone' in mapped).toBe(true);
  });

  it('does not leak internal fields (organizationId, updatedAt, synced)', () => {
    const mapped = customerRowToApi({ ...baseRow, synced: false });
    expect(mapped).not.toHaveProperty('organizationId');
    expect(mapped).not.toHaveProperty('updatedAt');
    expect(mapped).not.toHaveProperty('synced');
  });
});

describe('customerRowToApi against db.customers (fake-indexeddb)', () => {
  beforeEach(async () => {
    await db.customers.clear();
  });

  it('includes locally-created (synced: false) customers alongside synced ones', async () => {
    await db.customers.bulkPut([
      { ...baseRow, id: 'c1', name: 'Awa Diop' }, // pulled from server (no `synced` key)
      {
        ...baseRow,
        id: 'c2',
        name: 'Moussa (hors ligne)',
        synced: false, // created offline mid-sale, not yet drained
      },
    ]);

    const rows = await db.customers.toArray();
    const mapped = rows.map(customerRowToApi);

    expect(mapped).toHaveLength(2);
    expect(mapped.some((c) => c.id === 'c2' && c.name === 'Moussa (hors ligne)')).toBe(true);
  });
});
