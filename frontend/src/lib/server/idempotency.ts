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
 * commits (`fn` itself may run twice across the two transactions — that is
 * inherent to any check-then-insert race and is why callers must keep `fn`
 * itself safe to attempt twice, e.g. by staying inside the same tx as the
 * OfflineOperation insert so a whole-transaction rollback on P2002 is safe
 * to consider). The `create` call has `clientOpId @unique` as the DB-level
 * arbiter: the loser's `create` throws P2002, at which point we re-read the
 * row the winner inserted and return ITS `resultJson` as memoized — never
 * surfacing the race to the caller.
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

function isP2002(err: unknown): boolean {
  // Duck-typed P2002 check (mirrors notifications/index.ts + slug.ts) — works
  // across Prisma client edge cases that don't always tag the proper subclass.
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
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
    return { result: existing.resultJson as T, replayed: true };
  }

  const result = await fn();

  try {
    await tx.offlineOperation.create({
      data: {
        organizationId,
        clientOpId,
        endpoint,
        resultJson: result as Prisma.InputJsonValue,
      },
    });
    return { result, replayed: false };
  } catch (err) {
    if (!isP2002(err)) throw err;
    // Concurrent replay won the race and inserted first — re-read its row
    // and return IT as the memoized result rather than surfacing the
    // collision to the caller.
    const winner = await tx.offlineOperation.findUnique({ where: { clientOpId } });
    if (winner) {
      return { result: winner.resultJson as T, replayed: true };
    }
    // Row vanished between the failed create and the re-read (should not
    // happen in practice — nothing deletes OfflineOperation rows) — surface
    // the original error rather than silently returning a fabricated result.
    throw err;
  }
}
