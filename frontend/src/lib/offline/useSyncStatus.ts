'use client';

/**
 * useSyncStatus.ts — sync status React hook (Task 2.4 of the offline-first
 * plan; see docs/superpowers/plans/2026-07-20-offline-first-boutique.md,
 * PHASE 2).
 *
 * Thin composition over `dexie-react-hooks`'s `useLiveQuery` — the
 * maintained, SSR-safe React binding for Dexie's `liveQuery` (re-runs the
 * querier whenever the observed table changes, no manual subscribe/teardown
 * needed). Each of the four live values is backed by a small, independently
 * testable query function (`countPending`/`countSyncing`/`countConflicts`/
 * `readLastSyncedAt`) exported below so `useSyncStatus.test.ts` can assert
 * the actual query logic against `fake-indexeddb` without a React render
 * harness (this repo has none — see the test file's docblock).
 *
 * Status-set semantics deliberately mirror the rest of Phase 2:
 *   - `pendingCount` mirrors `outbox.ts`'s `pendingCount()` — `pending` +
 *     `syncing` + `error` (the "N à synchroniser" badge's set). It is NOT
 *     just re-exported from `outbox.ts` because that function returns a
 *     single Promise, not a live-queryable subscription; the counting
 *     query itself (same status set) is duplicated here on purpose so this
 *     hook's live count and the badge's documented count never drift.
 *   - `syncing` is derived from a live count of `status: 'syncing'` rows
 *     rather than a new flag on `sync-engine.ts`: `drainOutbox()` already
 *     marks each row `syncing` for the duration of its POST (see
 *     `sync-engine.ts`'s `markSyncing` call), so "is a drain in flight"
 *     falls out of the existing state machine for free.
 *   - `conflicts` (fixed post-Task-4.3 — see this function's own docblock
 *     below) is the count of UNRESOLVED rows in `db.conflicts`, the same
 *     table the `/synchronisation` screen's `ConflictsManager` reads
 *     (`.where('resolved').equals(0)`) — NOT a count of outbox rows. Since
 *     Task 4.1, a stock conflict on a sale is a 200 response carrying
 *     `stockConflicts`, which `sync-engine.ts`'s `applySyncSuccess` records
 *     into `db.conflicts` while the sale's outbox row still drains as
 *     `done` — it never gets outbox `status: 'conflict'`. The one path that
 *     still sets outbox `status: 'conflict'` today is the legacy 409
 *     `INSUFFICIENT_STOCK` branch used by `/api/products/[id]/adjust`; those
 *     rows carry no `db.conflicts` entry of their own, so `countConflicts`
 *     adds them in defensively (summed, not double-counted — the two
 *     sources never overlap) so a stock-adjust conflict still lights up the
 *     badge too. It is surfaced separately from `pendingCount` (not folded
 *     in) for the same reason `outbox.ts` excludes it from its own
 *     `pendingCount()` — a conflict needs a human decision on the
 *     dedicated conflicts screen (PHASE 4), not just "still needs syncing".
 *   - `lastSyncedAt` reads the `meta.lastPull` cursor `pull.ts` (Task 1.3)
 *     already maintains — no new bookkeeping.
 *
 * SSR-safe: `useLiveQuery` returns its `defaultResult` (passed explicitly
 * below) until the first live result resolves, so every value here is a
 * concrete `number`/`string | null` on the very first render — never
 * `undefined` — with no extra guard needed at call sites.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type OutboxStatus } from './db';
import { drainOutbox } from './sync-engine';
import { getOrgId } from './pull';

/** Same set `outbox.ts`'s `pendingCount()` documents — kept as a literal
 * here (rather than imported) since `outbox.ts` doesn't export it. */
const PENDING_COUNT_STATUSES: readonly OutboxStatus[] = ['pending', 'syncing', 'error'];

/** Live-queryable count backing `pendingCount` — see module docblock for
 * why this isn't just `outbox.ts`'s `pendingCount()` re-exported.
 *
 * Scopé boutique comme `listPending` : une ligne estampillée d'un AUTRE
 * `orgId` (autre compte passé par cet appareil) est invisible pour le drain
 * de la session courante — la compter affichait « N à synchroniser » à vie et
 * « Synchroniser maintenant » semblait ne rien faire (vu en prod). `getOrgId`
 * lit `db.meta` via Dexie, donc `useLiveQuery` re-calcule aussi quand la
 * boutique courante change (changement de compte). */
export async function countPending(): Promise<number> {
  const rows = await db.outbox
    .where('status')
    .anyOf(...PENDING_COUNT_STATUSES)
    .toArray();
  const currentOrg = await getOrgId().catch(() => null);
  return rows.filter((r) => r.orgId == null || r.orgId === currentOrg).length;
}

/** Live-queryable count backing `syncing` (`> 0` ⇒ a drain is in flight). */
export async function countSyncing(): Promise<number> {
  return db.outbox
    .where('status')
    .equals('syncing' satisfies OutboxStatus)
    .count();
}

/**
 * Live-queryable count backing `conflicts`.
 *
 * Primary source: `db.conflicts` rows where `resolved === 0` — the stock
 * reconciliation table `sync-engine.ts`'s `applySyncSuccess` writes to when a
 * sale's response carries `stockConflicts` (Task 4.1/4.2). This matches the
 * `/synchronisation` screen's `ConflictsManager` exactly
 * (`db.conflicts.where('resolved').equals(0)`) so the nav badge and the
 * dedicated screen never disagree on count.
 *
 * Defensively summed with outbox rows still sitting at `status: 'conflict'`
 * — today that's only the legacy 409 `INSUFFICIENT_STOCK` branch (used by
 * `/api/products/[id]/adjust`, see `sync-engine.ts`), which never touches
 * `db.conflicts`. The two sources are disjoint (a sale's stock conflict never
 * sets outbox `status: 'conflict'`; an adjust's 409 conflict never writes a
 * `db.conflicts` row), so summing them cannot double-count the same
 * conflict.
 */
export async function countConflicts(): Promise<number> {
  const [unresolved, legacyOutboxConflicts] = await Promise.all([
    db.conflicts.where('resolved').equals(0).count(),
    db.outbox
      .where('status')
      .equals('conflict' satisfies OutboxStatus)
      .count(),
  ]);
  return unresolved + legacyOutboxConflicts;
}

/**
 * Live-queryable read of the `meta.lastPull` cursor `pull.ts` maintains.
 * Defensively returns `null` (rather than throwing or surfacing a bogus
 * value) if the stored value isn't a string — `MetaRow.value` is typed
 * `unknown`, so a corrupted/legacy row must not masquerade as a real
 * "last synced" timestamp.
 */
export async function readLastSyncedAt(): Promise<string | null> {
  const row = await db.meta.get('lastPull');
  return typeof row?.value === 'string' ? row.value : null;
}

export interface SyncStatus {
  pendingCount: number;
  syncing: boolean;
  conflicts: number;
  lastSyncedAt: string | null;
  syncNow: () => Promise<void>;
}

/**
 * Reactive sync status for nav badges / conflict indicators / a manual
 * "Synchroniser maintenant" button. All four fields update live as the
 * outbox/meta tables change underneath — no polling, no manual refresh.
 */
export function useSyncStatus(): SyncStatus {
  const pendingCount = useLiveQuery(countPending, [], 0);
  const syncingCount = useLiveQuery(countSyncing, [], 0);
  const conflicts = useLiveQuery(countConflicts, [], 0);
  const lastSyncedAt = useLiveQuery(readLastSyncedAt, [], null);

  return {
    pendingCount,
    syncing: syncingCount > 0,
    conflicts,
    lastSyncedAt,
    // `drainOutbox()` is single-flight (module-level lock in
    // `sync-engine.ts`), so calling this from a button that's already
    // mid-drain is safe — it resolves immediately with a zeroed result
    // rather than double-POSTing.
    syncNow: async () => {
      await drainOutbox();
    },
  };
}
