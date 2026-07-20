/**
 * ids.ts — client-side id generator for the offline-first write path.
 *
 * Every entity a boutique creates while offline (a sale, a customer, a
 * stock adjustment…) needs a globally-unique id *before* it ever reaches
 * the server, because that id doubles as the idempotency key: replaying
 * the same write during sync collides on a unique DB constraint
 * (`clientOpId @unique` / the row's own `id @unique`) instead of creating
 * a duplicate. cuid2 (`@paralleldrive/cuid2`) is collision-resistant,
 * sortable-enough, and safe to generate on a client with no server
 * round-trip — see docs/superpowers/plans/2026-07-20-offline-first-boutique.md
 * ("Décisions d'architecture").
 *
 * `newId` and `newOpId` are intentionally the same generator under two
 * names: `newId()` names an *entity* (Sale.id, Customer.id, …) while
 * `newOpId()` names an *operation* (the `clientOpId` passed to
 * `withIdempotency` for aggregate mutations like repay/adjust that don't
 * map 1:1 onto a single new row). Keeping them distinct call sites — even
 * though the implementation is identical — makes call sites self-documenting
 * and leaves room for the two to diverge later (e.g. a distinct prefix)
 * without a call-site rename.
 */
import { createId } from '@paralleldrive/cuid2';

export function newId(): string {
  return createId();
}

export function newOpId(): string {
  return createId();
}
