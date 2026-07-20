/**
 * withIdempotency — companion unit test.
 *
 * Asserts:
 *   1. first call with a clientOpId executes `fn` and memoizes the result
 *      via `tx.offlineOperation.create`; a second call with the SAME
 *      clientOpId returns the memoized value WITHOUT re-invoking `fn`
 *      (spy call count stays at 1).
 *   2. `clientOpId: null` always executes `fn` and never touches
 *      `offlineOperation` (normal online path — nothing memoized).
 *   3. a P2002 race on `create` (two concurrent replays inserting the same
 *      clientOpId) is resolved by re-reading the row that won and
 *      returning IT as memoized, without surfacing the error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { Prisma } from '@prisma/client';
import { withIdempotency } from './idempotency';

type TxMock = DeepMockProxy<Prisma.TransactionClient>;

const txMock = mockDeep<Prisma.TransactionClient>() as unknown as TxMock;

beforeEach(() => mockReset(txMock));

const baseArgs = { organizationId: 'org_1', clientOpId: 'op_1', endpoint: 'sales' };

describe('withIdempotency', () => {
  it('memoizes by clientOpId: second call with same key does not re-run fn', async () => {
    const fn = vi.fn().mockResolvedValue({ n: 1 });

    // First call: no existing row yet.
    txMock.offlineOperation.findUnique.mockResolvedValueOnce(null);
    txMock.offlineOperation.create.mockResolvedValueOnce({
      id: 'op_row_1',
      organizationId: 'org_1',
      clientOpId: 'op_1',
      endpoint: 'sales',
      resultJson: { n: 1 },
      createdAt: new Date(),
    } as never);

    const a = await withIdempotency(txMock, baseArgs, fn);

    // Second call: row now exists.
    txMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op_row_1',
      organizationId: 'org_1',
      clientOpId: 'op_1',
      endpoint: 'sales',
      resultJson: { n: 1 },
      createdAt: new Date(),
    } as never);

    const b = await withIdempotency(txMock, baseArgs, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a.replayed).toBe(false);
    expect(a.result).toEqual({ n: 1 });
    expect(b.replayed).toBe(true);
    expect(b.result).toEqual({ n: 1 });
    expect(txMock.offlineOperation.create).toHaveBeenCalledTimes(1);
  });

  it('clientOpId null: runs fn and does not memoize (normal online path)', async () => {
    const fn = vi.fn().mockResolvedValue({ n: 42 });

    const out = await withIdempotency(txMock, { ...baseArgs, clientOpId: null }, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ result: { n: 42 }, replayed: false });
    expect(txMock.offlineOperation.findUnique).not.toHaveBeenCalled();
    expect(txMock.offlineOperation.create).not.toHaveBeenCalled();
  });

  it('handles the P2002 race: create collision re-reads and returns the memoized winner', async () => {
    const fn = vi.fn().mockResolvedValue({ n: 7 });

    txMock.offlineOperation.findUnique.mockResolvedValueOnce(null);
    const p2002 = Object.assign(
      new Error('Unique constraint failed on the fields: (`clientOpId`)'),
      {
        code: 'P2002',
        name: 'PrismaClientKnownRequestError',
      },
    );
    txMock.offlineOperation.create.mockRejectedValueOnce(p2002 as never);
    // Re-read after the race: the row the OTHER concurrent call inserted.
    txMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op_row_race',
      organizationId: 'org_1',
      clientOpId: 'op_1',
      endpoint: 'sales',
      resultJson: { n: 999 },
      createdAt: new Date(),
    } as never);

    const out = await withIdempotency(txMock, baseArgs, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(out.replayed).toBe(true);
    expect(out.result).toEqual({ n: 999 });
    expect(txMock.offlineOperation.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-P2002 errors from create so callers can decide whether to retry', async () => {
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    txMock.offlineOperation.findUnique.mockResolvedValueOnce(null);
    txMock.offlineOperation.create.mockRejectedValueOnce(new Error('connection lost'));

    await expect(withIdempotency(txMock, baseArgs, fn)).rejects.toThrow('connection lost');
  });
});
