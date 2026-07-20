/**
 * withIdempotency — offline-write dedup gate.
 *
 * The offline-first mutation endpoints (Tasks 0.3-0.7) wrap their
 * transaction body in this helper. A boutique-side POS can be offline for
 * minutes/hours; when connectivity resumes, queued writes are replayed and
 * MUST land at-most-once even if the client retries a request whose
 * response it never saw (e.g. connection dropped after commit).
 *
 * Contract:
 *   - `clientOpId === null` → normal online path. `fn` always runs, nothing
 *     is memoized (no `OfflineOperation` row).
 *   - `clientOpId` seen before (an `OfflineOperation` row already exists)
 *     → `fn` is NOT called; the memoized `resultJson` is returned as
 *     `result`, `replayed: true`.
 *   - otherwise → `fn()` runs, its result is persisted via
 *     `tx.offlineOperation.create`, and `{ result, replayed: false }` is
 *     returned.
 *
 * Race handling: two concurrent replays of the same clientOpId can both
 * pass the initial `findUnique` miss and both call `fn()` before either
 * commits. The `create` call has `clientOpId @unique` as the DB-level
 * arbiter: the loser's `create` throws P2002. On real Postgres, once a
 * statement in a transaction errors the whole transaction is aborted
 * (`25P02`) — Prisma interactive transactions do NOT wrap individual
 * queries in savepoints, so any further query on `tx` (e.g. an in-catch
 * re-read) would itself throw. We therefore do NOT catch P2002 here: it
 * propagates out of `withIdempotency` and out of the caller's
 * `prisma.$transaction(...)`. Callers MUST wrap that transaction in
 * `withTxRetry` (see `db/retry-transaction.ts`, which already retries the
 * whole transaction on P2002/P2034) — on the retry, the up-front
 * `findUnique` at the top of this function cleanly finds the winner's row
 * and returns `{ result, replayed: true }` without any in-tx re-read.
 */
import type { Prisma } from '@prisma/client';

export interface WithIdempotencyArgs {
  organizationId: string;
  clientOpId: string | null;
  endpoint: string;
}

export interface WithIdempotencyOutcome<T> {
  result: T;
  replayed: boolean;
}

export async function withIdempotency<T>(
  tx: Prisma.TransactionClient,
  args: WithIdempotencyArgs,
  fn: () => Promise<T>,
): Promise<WithIdempotencyOutcome<T>> {
  const { organizationId, clientOpId, endpoint } = args;

  // Normal online path: no client-supplied op id, nothing to dedupe.
  if (clientOpId === null) {
    const result = await fn();
    return { result, replayed: false };
  }

  const existing = await tx.offlineOperation.findUnique({ where: { clientOpId } });
  if (existing) {
    // clientOpId is globally unique (cuid2) by construction, so a row for
    // this key can only ever belong to the org that created it — a mismatch
    // here is impossible in practice. Fail safe anyway rather than ever
    // returning one tenant's memoized result to another.
    if (existing.organizationId !== organizationId) {
      throw new Error(
        `withIdempotency: clientOpId ${clientOpId} belongs to organization ${existing.organizationId}, not ${organizationId}`,
      );
    }
    return { result: existing.resultJson as T, replayed: true };
  }

  const result = await fn();

  // Let P2002 propagate uncaught: on real Postgres a failed statement aborts
  // the whole transaction, so an in-catch re-read on this same `tx` would
  // itself throw. Instead the error bubbles up through the caller's
  // `prisma.$transaction(...)`, which MUST be wrapped in `withTxRetry` — the
  // retry's up-front `findUnique` above will then find the winner's row.
  await tx.offlineOperation.create({
    data: {
      organizationId,
      clientOpId,
      endpoint,
      resultJson: result as Prisma.InputJsonValue,
    },
  });
  return { result, replayed: false };
}
