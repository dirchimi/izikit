// @vitest-environment jsdom
/**
 * sync-history.ts — companion unit test. Même montage fake-indexeddb que
 * `outbox.test.ts` : lignes outbox `done` + entités miroir insérées à la
 * main, puis on vérifie l'ordre (plus récent d'abord), les libellés résolus
 * et le repli `detail: null` quand l'entité a été purgée du miroir.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type OutboxRow } from './db';
import { listRecentSynced } from './sync-history';

function doneRow(overrides: Partial<OutboxRow> & { opId: string }): OutboxRow {
  return {
    status: 'done',
    kind: 'sale',
    payload: {},
    endpoint: '/api/sales',
    createdAt: '2026-07-20T08:00:00.000Z',
    syncedAt: '2026-07-20T09:00:00.000Z',
    ...overrides,
  };
}

describe('listRecentSynced', () => {
  beforeEach(async () => {
    await Promise.all([
      db.outbox.clear(),
      db.sales.clear(),
      db.expenses.clear(),
      db.customers.clear(),
      db.repayments.clear(),
      db.stockMovements.clear(),
      db.products.clear(),
    ]);
  });

  it('liste les lignes done uniquement, la plus récente (seq) d’abord, libellés résolus', async () => {
    await db.sales.put({
      id: 'sale-1',
      organizationId: 'o1',
      number: 'V-0012',
      method: 'CASH',
      total: 14500,
      discount: 0,
      cashAmount: 14500,
      mobileAmount: 0,
      creditAmount: 0,
      status: 'ACTIVE',
      createdAt: '2026-07-20T08:00:00.000Z',
    });
    await db.expenses.put({
      id: 'exp-1',
      organizationId: 'o1',
      number: 'D-0003',
      label: 'Loyer',
      category: 'Loyer',
      amount: 30000,
      occurredAt: '2026-07-20T08:00:00.000Z',
      createdAt: '2026-07-20T08:00:00.000Z',
    });

    await db.outbox.add(doneRow({ opId: 'sale-1' }));
    await db.outbox.add(doneRow({ opId: 'exp-1', kind: 'expense', endpoint: '/api/expenses' }));
    // Une ligne encore pending ne doit PAS apparaître dans l'historique.
    await db.outbox.add(doneRow({ opId: 'sale-x', status: 'pending' }));

    const entries = await listRecentSynced();

    expect(entries.map((e) => e.kind)).toEqual(['expense', 'sale']);
    expect(entries[0]?.detail).toContain('Loyer');
    expect(entries[1]?.detail).toContain('V-0012');
    expect(entries[1]?.at).toBe('2026-07-20T09:00:00.000Z');
  });

  it('entité purgée du miroir → detail null (le type + l’heure restent), createdAt en repli sans syncedAt', async () => {
    const legacy = doneRow({ opId: 'sale-disparue' });
    delete legacy.syncedAt; // ligne d'avant l'ajout du champ
    await db.outbox.add(legacy);

    const entries = await listRecentSynced();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.detail).toBeNull();
    expect(entries[0]?.at).toBe('2026-07-20T08:00:00.000Z'); // createdAt
  });

  it("cancel : résout le numéro de vente depuis l'endpoint (l'opId d'un cancel n'est pas l'id de la vente)", async () => {
    await db.sales.put({
      id: 'sale-9',
      organizationId: 'o1',
      number: 'V-0044',
      method: 'CASH',
      total: 500,
      discount: 0,
      cashAmount: 500,
      mobileAmount: 0,
      creditAmount: 0,
      status: 'CANCELLED',
      createdAt: '2026-07-20T08:00:00.000Z',
    });
    await db.outbox.add(
      doneRow({ opId: 'op-frais', kind: 'cancel', endpoint: '/api/sales/sale-9/cancel' }),
    );

    const entries = await listRecentSynced();
    expect(entries[0]?.detail).toBe('V-0044');
  });

  it('respecte la limite (les N plus récentes seulement)', async () => {
    for (let i = 0; i < 5; i++) {
      await db.outbox.add(doneRow({ opId: `op-${i}` }));
    }
    const entries = await listRecentSynced(2);
    expect(entries).toHaveLength(2);
    // Les 2 dernières lignes ajoutées (seq les plus hauts), plus récente d'abord.
    const all = await db.outbox.toArray();
    const maxSeq = Math.max(...all.map((r) => r.seq ?? 0));
    expect(entries[0]?.seq).toBe(maxSeq);
  });
});
