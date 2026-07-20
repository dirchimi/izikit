/**
 * purge.ts — local IndexedDB history purge/retention (Task 6.3 of the
 * offline-first plan; see docs/superpowers/plans/2026-07-20-offline-first-boutique.md).
 *
 * The Dexie mirror (`db.ts`) is append-only for its history tables (`sales`,
 * `saleItems`, `stockMovements`, `repayments`) plus the resolved-conflict
 * queue (`conflicts`) — nothing ever shrinks them on its own, so a
 * long-lived install (months of daily sales on a single device) grows
 * IndexedDB without bound. `purgeLocalHistory()` is a best-effort sweep that
 * drops rows old enough (`retentionDays`, default 60) to no longer matter for
 * the on-device screens (which only ever show recent history — reports that
 * need a longer window read the server, not this mirror) — WITHOUT ever
 * touching a row this device still needs to finish syncing.
 *
 * Working-SET tables (`products`, `customers`, `receivables`, `documents`,
 * `meta`, `outbox`, `session`) are current-state, not history, and are
 * deliberately never touched here — see the module's callers (`AppShell.tsx`)
 * for the "history only" invariant.
 *
 * Safety rules (all three must hold for a row to be dropped):
 *   1. Older than the cutoff (`retentionDays` ago), compared on the row's own
 *      entry-time field (`createdAt` for sales/stockMovements/repayments;
 *      conflicts also use `createdAt`) — never a business/back-dated field
 *      (an expense's `occurredAt` or a repayment's user-editable date could
 *      be back-dated by the shopkeeper on a row entered minutes ago; `db.ts`'s
 *      `RepaymentRow.createdAt` doc comment notes it MAY be back-dated too,
 *      but that back-dated value IS the row's only timestamp, so it is the
 *      only field available here — the `synced` gate below is what actually
 *      protects a freshly-entered-but-back-dated row, not the date check).
 *   2. `synced === true` EXACTLY (or, for conflicts, `resolved === 1`) — a
 *      row whose `synced` is `false` (still queued) is never purged, and
 *      neither is one whose `synced` is `undefined`. Every row this repo
 *      writes locally starts `synced: false` and is flipped to `true` only
 *      once the server has confirmed it (`sync-engine.ts`'s
 *      `applySyncSuccess`); a row pulled fresh from the server (`pull.ts`)
 *      never sets `synced` at all (see e.g. `toStockMovementRow`), so it
 *      reads as `undefined` forever, NOT `true`. Treating `undefined` as
 *      purgeable would be the more "complete" cleanup (most historical rows
 *      on a multi-vendeur boutique arrive this way), but this file
 *      deliberately takes the conservative reading of the spec instead: only
 *      a row this device can positively prove is server-confirmed
 *      (`synced === true`) is ever deleted. The cost is that rows seeded
 *      purely by `pullAll()` (this device never wrote them) are never
 *      purged by this sweep — a documented, intentional limitation, not a
 *      bug: on a small boutique's IndexedDB this is a few thousand rows at
 *      most, and "never delete data we can't prove is safe" matters more
 *      here than disk space.
 *   3. NOT referenced by any outbox row still in flight (`pending` /
 *      `syncing` / `error` / `conflict`) — see `buildReferencedIds` below.
 *      This is a defense-in-depth belt-and-suspenders check: today no row
 *      that would pass gate #2 (`synced === true`) is ever ALSO referenced by
 *      a live outbox row (the two states are mutually exclusive in the
 *      current state machine), but a future kind/flow could change that, and
 *      this check is cheap, so it stays.
 *
 * `saleItems` has no `createdAt`/`synced` of its own (see `db.ts`'s
 * `SaleItemRow` — it mirrors the server's item-less-of-its-own-timestamp
 * shape) — its rows are purged purely by cascade: an item is dropped iff its
 * parent `sale` was dropped by the rules above.
 */
import { db, type OutboxRow, type OutboxStatus } from './db';

/** Outbox statuses that mean "still needs this device" — mirrors
 * `sync-engine.ts` / `useSyncStatus.ts`'s own status sets, but widened with
 * `conflict` (a conflict row still references an outbox row a human hasn't
 * resolved yet — see `outbox.ts`'s `markConflict`). */
const ACTIVE_OUTBOX_STATUSES: readonly OutboxStatus[] = ['pending', 'syncing', 'error', 'conflict'];

/** Extracts the sale id out of a `cancel` op's endpoint
 * (`/api/sales/<id>/cancel`) — mirrors `sync-engine.ts`'s
 * `extractCancelSaleId`. A `cancel` op's `opId` is a FRESH clientOpId (NOT
 * the sale id, see `mutations.ts`'s `createCancelOffline`), so the sale it
 * protects has to be read out of the endpoint instead of `opId`. */
function extractCancelSaleId(endpoint: string): string | undefined {
  const match = /^\/api\/sales\/([^/]+)\/cancel$/.exec(endpoint);
  return match?.[1];
}

/**
 * Builds the set of entity ids a still-in-flight outbox row protects from
 * purge. For every kind but `cancel` that id IS `row.opId` (the same
 * client-generated id the payload/local row shares — `sale`/`expense`/
 * `repay`/`adjust`, see `mutations.ts`). `cancel` additionally protects the
 * SALE it targets (read from the endpoint, not `opId` — see
 * `extractCancelSaleId`) since a pending cancel is about to mutate that sale.
 *
 * Pure and exported so it's directly unit-testable without touching Dexie.
 */
export function buildReferencedIds(outboxRows: readonly OutboxRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of outboxRows) {
    if (!ACTIVE_OUTBOX_STATUSES.includes(row.status)) continue;
    ids.add(row.opId);
    if (row.kind === 'cancel') {
      const saleId = extractCancelSaleId(row.endpoint);
      if (saleId) ids.add(saleId);
    }
  }
  return ids;
}

/**
 * Whether `id` is protected by `referenced` — a direct match (sales/
 * expenses/repayments, whose own id equals the outbox `opId`), OR a
 * colon-prefixed match (`stockMovements`, whose `clientOpId` is
 * `${saleOrAdjustOpId}:${productId}` — see `mutations.ts`'s
 * `createSaleOffline`/`createCancelOffline`/`createAdjustOffline`). `id`
 * itself (the exact `clientOpId`) is also checked directly first, since a
 * plain `adjust` op's `clientOpId` carries no colon at all.
 */
function isReferencedId(id: string | undefined, referenced: ReadonlySet<string>): boolean {
  if (id === undefined) return false;
  if (referenced.has(id)) return true;
  const sep = id.indexOf(':');
  return sep > 0 && referenced.has(id.slice(0, sep));
}

export interface PurgeRowInput {
  /** ISO — the row's own entry-time field (see module docblock). */
  dateIso: string;
  /** `undefined` (never explicitly synced — e.g. a pulled row, see module
   * docblock) is treated the SAME as `false`: not purgeable. A plain
   * `boolean | undefined` (not an optional `synced?:`) so callers can pass
   * a Dexie row's own possibly-`undefined` field straight through under
   * `exactOptionalPropertyTypes`. */
  synced: boolean | undefined;
  /** Whether a still-in-flight outbox row references this entity. */
  referenced: boolean;
}

/**
 * Pure purge-eligibility check shared by every history table but
 * `conflicts` (which has no `synced` field — see `isConflictPurgeable`).
 * Exported (and dependency-free) for direct unit testing — see
 * `purge.test.ts`.
 */
export function isPurgeable(row: PurgeRowInput, cutoffIso: string): boolean {
  if (row.referenced) return false;
  if (row.synced !== true) return false;
  return row.dateIso < cutoffIso;
}

export interface PurgeConflictInput {
  dateIso: string;
  resolved: 0 | 1;
}

/** `conflicts` purge-eligibility: resolved (the shopkeeper already acted on
 * it, see `ConflictsManager.tsx`'s "Marquer résolu") AND old enough. */
export function isConflictPurgeable(row: PurgeConflictInput, cutoffIso: string): boolean {
  return row.resolved === 1 && row.dateIso < cutoffIso;
}

export interface PurgeResult {
  deleted: number;
}

/**
 * Drops history rows older than `retentionDays` (default 60) that are
 * provably safe to drop — see the module docblock for the exact rules.
 * Best-effort: callers (`AppShell.tsx`) are expected to `.catch(() => {})`
 * this — a failed sweep just means the mirror keeps growing until the next
 * successful one, never a correctness issue.
 *
 * Every read + delete runs inside ONE Dexie `rw` transaction so a mid-sweep
 * failure never leaves e.g. a sale deleted but its items orphaned.
 */
export async function purgeLocalHistory(retentionDays = 60): Promise<PurgeResult> {
  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  return db.transaction(
    'rw',
    [db.sales, db.saleItems, db.stockMovements, db.repayments, db.conflicts, db.outbox],
    async (): Promise<PurgeResult> => {
      const [outboxRows, sales, movements, repayments, conflicts] = await Promise.all([
        db.outbox.toArray(),
        db.sales.toArray(),
        db.stockMovements.toArray(),
        db.repayments.toArray(),
        db.conflicts.toArray(),
      ]);

      const referenced = buildReferencedIds(outboxRows);

      const saleIds = sales
        .filter((s) =>
          isPurgeable(
            {
              dateIso: s.createdAt,
              synced: s.synced,
              referenced: isReferencedId(s.id, referenced),
            },
            cutoffIso,
          ),
        )
        .map((s) => s.id);

      const movementIds = movements
        .filter((m) =>
          isPurgeable(
            {
              dateIso: m.createdAt,
              synced: m.synced,
              referenced: isReferencedId(m.clientOpId, referenced),
            },
            cutoffIso,
          ),
        )
        .map((m) => m.id);

      const repaymentIds = repayments
        .filter((r) =>
          isPurgeable(
            {
              dateIso: r.createdAt,
              synced: r.synced,
              referenced: isReferencedId(r.id, referenced),
            },
            cutoffIso,
          ),
        )
        .map((r) => r.id);

      const conflictIds = conflicts
        .filter((c) =>
          isConflictPurgeable({ dateIso: c.createdAt, resolved: c.resolved }, cutoffIso),
        )
        .map((c) => c.id);

      // saleItems: cascade-only — an item is dropped iff its parent sale is.
      let itemIds: string[] = [];
      if (saleIds.length > 0) {
        const items = await db.saleItems.where('saleId').anyOf(saleIds).toArray();
        itemIds = items.map((i) => i.id);
      }

      await db.sales.bulkDelete(saleIds);
      await db.saleItems.bulkDelete(itemIds);
      await db.stockMovements.bulkDelete(movementIds);
      await db.repayments.bulkDelete(repaymentIds);
      await db.conflicts.bulkDelete(conflictIds);

      return {
        deleted:
          saleIds.length +
          itemIds.length +
          movementIds.length +
          repaymentIds.length +
          conflictIds.length,
      };
    },
  );
}
