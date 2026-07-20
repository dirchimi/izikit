// Task 6.2 (offline-first) — honor a client-supplied entry timestamp on
// money/reporting-critical writes (sales, expenses) instead of always
// stamping the SERVER's clock at sync time.
//
// An offline sale/expense is recorded on the device at the true moment it
// happened, then queued in the outbox and POSTed to the server whenever the
// device regains connectivity — which can be hours or days later. If the
// server always stamped `now()`, a sale made Monday 3pm but synced Tuesday
// would show up as Tuesday in every report/dashboard/caisse view — wrong.
//
// Security note: a client-supplied `createdAt` on a financial record is
// trusted input from an authenticated member of the SAME organization —
// it can only misdate that org's own data, not another org's, and every
// mutation is still gated by `requireOrgRole`/`requireActiveSubscription`
// same as before. To bound the abuse surface (a compromised/buggy client
// backdating figures into a closed accounting period, or postdating into
// the future to dodge a report window), the value is clamped to a sane
// window instead of trusted verbatim:
//   - not more than `MAX_FUTURE_SKEW_MS` ahead of the server's clock
//     (small allowance for clock drift between the device and the server,
//     NOT a real "future" entry — a sale cannot happen in the future);
//   - not older than `MAX_PAST_AGE_MS` (an offline device is expected to
//     resync well within this window; anything older reads as abuse or a
//     badly stuck clock rather than a legitimate offline gap).
// Out-of-bounds (or unparsable) values fall back to the server's `now()`
// rather than rejecting the write — a clock issue on one device must never
// cost the shop a real sale or expense.

/** Allowed clock drift ahead of the server's clock (device clock running fast). */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum age of a backdated client entry timestamp. */
export const MAX_PAST_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Resolves the `createdAt` to persist for a client-originated write.
 *
 * - `iso` undefined (online caller omits the field) → returns `null`: the
 *   caller should omit the column from its Prisma `create` data entirely so
 *   the schema's `@default(now())` applies, keeping the online path
 *   byte-identical to before this task.
 * - `iso` unparsable, in the future beyond `MAX_FUTURE_SKEW_MS`, or older
 *   than `MAX_PAST_AGE_MS` → returns `now` (the fallback described above).
 * - Otherwise → returns the parsed `Date` (the true client entry time).
 */
export function resolveClientCreatedAt(
  iso: string | undefined,
  now: Date = new Date(),
): Date | null {
  if (iso === undefined) return null;

  const parsed = new Date(iso);
  const t = parsed.getTime();
  if (Number.isNaN(t)) return now;
  if (t > now.getTime() + MAX_FUTURE_SKEW_MS) return now;
  if (t < now.getTime() - MAX_PAST_AGE_MS) return now;
  return parsed;
}
