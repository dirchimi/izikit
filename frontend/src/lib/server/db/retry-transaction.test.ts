import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { withTxRetry } from './retry-transaction';

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('conflict', {
    code,
    clientVersion: 'test',
  });
}

describe('withTxRetry', () => {
  it('returns the result on first success (no retry)', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    await expect(withTxRetry(run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries on P2034 (serialization failure) then succeeds', async () => {
    const run = vi.fn().mockRejectedValueOnce(knownError('P2034')).mockResolvedValueOnce('ok');
    await expect(withTxRetry(run, 3)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('retries on P2002 (unique collision) then succeeds', async () => {
    const run = vi.fn().mockRejectedValueOnce(knownError('P2002')).mockResolvedValueOnce('ok');
    await expect(withTxRetry(run, 3)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a non-retryable error (rethrows immediately)', async () => {
    const run = vi.fn().mockRejectedValue(knownError('P2025')); // record not found
    await expect(withTxRetry(run, 3)).rejects.toMatchObject({ code: 'P2025' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after `attempts` retryable failures and throws the last error', async () => {
    const run = vi.fn().mockRejectedValue(knownError('P2034'));
    await expect(withTxRetry(run, 3)).rejects.toMatchObject({ code: 'P2034' });
    expect(run).toHaveBeenCalledTimes(3);
  });
});
