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
 *   3. a P2002 from `create` propagates uncaught (NOT swallowed/re-read
 *      inside the same tx) so the caller's `withTxRetry` can retry the
 *      whole transaction.
 *   4. non-P2002 errors from `create` also propagate.
 *   5. an existing row whose `organizationId` doesn't match the caller's
 *      throws instead of leaking another tenant's memoized result
 *      (fail-safe guard; impossible in practice since clientOpId is a
 *      globally-unique cuid2).
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

  it('lets a P2002 from create propagate uncaught (does not re-read inside the tx)', async () => {
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

    await expect(withIdempotency(txMock, baseArgs, fn)).rejects.toBe(p2002);

    // Must NOT attempt a second read on the (now-aborted, on real Postgres)
    // transaction — only the up-front miss should have happened.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(txMock.offlineOperation.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-P2002 errors from create so callers can decide whether to retry', async () => {
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    txMock.offlineOperation.findUnique.mockResolvedValueOnce(null);
    txMock.offlineOperation.create.mockRejectedValueOnce(new Error('connection lost'));

    await expect(withIdempotency(txMock, baseArgs, fn)).rejects.toThrow('connection lost');
  });

  it("throws on an organizationId mismatch instead of leaking another tenant's memoized result", async () => {
    const fn = vi.fn().mockResolvedValue({ n: 1 });
    txMock.offlineOperation.findUnique.mockResolvedValueOnce({
      id: 'op_row_other_org',
      organizationId: 'org_OTHER',
      clientOpId: 'op_1',
      endpoint: 'sales',
      resultJson: { n: 999 },
      createdAt: new Date(),
    } as never);

    await expect(withIdempotency(txMock, baseArgs, fn)).rejects.toThrow(/org_OTHER/);
    expect(fn).not.toHaveBeenCalled();
  });
});
