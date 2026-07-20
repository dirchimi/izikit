// @vitest-environment jsdom
/**
 * finalize-sale.ts — companion unit test (Task 3.4).
 *
 * jsdom + `fake-indexeddb/auto` for the real Dexie re-read; `./sync-engine`'s
 * `drainOutbox` is mocked (this helper's own online drain must not hit the
 * network). Covers the three post-commit branches: online+synced (server
 * number/token win), online+re-read-throws (swallowed → provisional, no throw),
 * and offline (provisional, no drain attempted).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, type SaleRow } from './db';
import { drainOutbox } from './sync-engine';
import { finalizeSaleReceipt } from './finalize-sale';

vi.mock('./sync-engine', () => ({
  drainOutbox: vi.fn(async () => ({ done: 1, conflicts: 0, errors: 0 })),
}));

const mockedDrain = vi.mocked(drainOutbox);

function makeSaleRow(id: string, over: Partial<SaleRow> = {}): SaleRow {
  return {
    id,
    organizationId: 'o1',
    number: `#L${id}`,
    method: 'CASH',
    total: 100,
    discount: 0,
    cashAmount: 100,
    mobileAmount: 0,
    creditAmount: 0,
    status: 'ACTIVE',
    createdAt: '2026-07-20T00:00:00.000Z',
    synced: false,
    ...over,
  };
}

beforeEach(async () => {
  mockedDrain.mockClear();
  mockedDrain.mockResolvedValue({ done: 1, conflicts: 0, errors: 0 });
  await db.sales.clear();
});

describe('finalizeSaleReceipt', () => {
  it('online + synced row → returns the server number and publicToken', async () => {
    await db.sales.put(makeSaleRow('s7', { number: 'V-0007', publicToken: 'tok_x', synced: true }));

    const numbers = await finalizeSaleReceipt(
      { id: 's7', number: '#L1', publicToken: null },
      { online: true },
    );

    expect(mockedDrain).toHaveBeenCalledTimes(1);
    expect(numbers).toEqual({ number: 'V-0007', publicToken: 'tok_x' });
  });

  it('online + re-read throws → falls back to provisional values without throwing', async () => {
    const getSpy = vi.spyOn(db.sales, 'get').mockRejectedValueOnce(new Error('idb read failed'));

    const numbers = await finalizeSaleReceipt(
      { id: 's8', number: '#L2', publicToken: null },
      { online: true },
    );

    expect(mockedDrain).toHaveBeenCalledTimes(1);
    expect(numbers).toEqual({ number: '#L2', publicToken: null });
    getSpy.mockRestore();
  });

  it('offline → returns provisional values and never drains', async () => {
    const numbers = await finalizeSaleReceipt(
      { id: 's9', number: '#L3', publicToken: null },
      { online: false },
    );

    expect(mockedDrain).not.toHaveBeenCalled();
    expect(numbers).toEqual({ number: '#L3', publicToken: null });
  });
});
