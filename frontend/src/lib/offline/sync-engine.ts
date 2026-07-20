/**
 * sync-engine.ts — outbox drain/replay engine (Task 2.2 of the offline-first
 * plan; see docs/superpowers/plans/2026-07-20-offline-first-boutique.md,
 * PHASE 2).
 *
 * `outbox.ts` (Task 2.1) is queue CRUD only — this module is the state
 * machine that actually talks to the network: `drainOutbox()` reads
 * `listPending()` (ascending `seq` = FIFO) and, for each row IN ORDER, POSTs
 * `payload` to `endpoint` via the shared `api()` wrapper (never a raw
 * `fetch` — `api()`'s CSRF header + 401 auto-refresh still have to apply to
 * a replayed mutation). The payload always carries the client-generated
 * `id`/`clientOpId` (PHASE 0), so a row that was actually applied
 * server-side before the response reached the device is recognized and
 * dedup-returns 2xx with the already-existing entity — replaying is safe.
 *
 * Three failure branches, each a deliberate choice:
 *   - network/offline (`ApiError.status === 0`) → STOP the whole drain and
 *     reset the row back to `pending` (not `error` — `listPending()` only
 *     ever returns `pending` rows, so routing a network blip through
 *     `markError` would strand the row outside any retry path with no
 *     retry-from-`error` sweep built yet). Continuing past a network
 *     failure would silently reorder FIFO the next time the device comes
 *     online — a later row could succeed while an earlier, causally-prior
 *     one (e.g. a sale before a repay against it) is still stuck. One
 *     network blip should retry from the same head next drain, not skip
 *     ahead.
 *   - stock conflict (409 + a stock-conflict code) → `markConflict` and
 *     keep going; a stock shortfall on one sale is a per-row business
 *     outcome (PHASE 4's conflict screen), not a reason to block unrelated
 *     rows behind it.
 *   - anything else (4xx validation/not-found, or 5xx) → `markError` and
 *     keep going. A 5xx is the SERVER's problem with this specific op, not
 *     evidence the device itself is offline (a true network/timeout
 *     failure is already routed to `status === 0` by `api()`), so it does
 *     NOT get the same "stop everything" treatment as an actual
 *     connectivity loss. `error` rows are excluded by `listPending()`, so
 *     they don't spin forever — they're surfaced for manual triage instead.
 */
import { api, ApiError } from '@/lib/api';
import { db, type SaleRow, type ExpenseRow, type ConflictRow, type RepaymentRow } from './db';
import {
  listPending,
  markSyncing,
  markDone,
  markConflict,
  markError,
  type OutboxRow,
} from './outbox';

/**
 * Server error codes that mean "stock ran out during sync reconciliation",
 * not a hard failure — PHASE 4 routes these to the conflicts screen instead
 * of the generic error bucket.
 */
const STOCK_CONFLICT_CODES: ReadonlySet<string> = new Set(['INSUFFICIENT_STOCK']);

export interface DrainResult {
  done: number;
  conflicts: number;
  errors: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Shape of one entry of the `/api/sales` response's `stockConflicts` array
 * (see `frontend/src/app/api/sales/route.ts`'s `StockConflict`, Task 4.1).
 */
interface StockConflictPayload {
  productId: string;
  name: string;
  requested: number;
  available: number;
  shortfall: number;
}

/** Parses the product id out of an `/api/products/<id>/adjust` endpoint
 * string — the fallback path in the `adjust` case of `applySyncSuccess`
 * below, for the rare case the local `stockMovement` row is already gone. */
function extractProductId(endpoint: string): string | undefined {
  const match = /^\/api\/products\/([^/]+)\/adjust$/.exec(endpoint);
  return match?.[1];
}

/** Parses the sale id out of an `/api/sales/<id>/cancel` endpoint string — the
 * fallback the `cancel` case of `applySyncSuccess` uses when the response body
 * carries no `sale.id` (e.g. a memoized replay, or the SALE_ALREADY_CANCELLED
 * success branch which has no useful body). The `cancel` op's `opId` is a FRESH
 * clientOpId (NOT the sale id — see `mutations.ts`'s `createCancelOffline`), so
 * the sale row can't be keyed by `row.opId`; the sale id lives in the endpoint. */
function extractCancelSaleId(endpoint: string): string | undefined {
  const match = /^\/api\/sales\/([^/]+)\/cancel$/.exec(endpoint);
  return match?.[1];
}

function isStockConflictPayload(value: unknown): value is StockConflictPayload {
  return (
    isRecord(value) &&
    typeof value.productId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.requested === 'number' &&
    typeof value.available === 'number' &&
    typeof value.shortfall === 'number'
  );
}

/**
 * Pure mapper from a sale's `stockConflicts` response entries to local
 * `ConflictRow`s (Task 4.2). Exported (and kept side-effect-free) so the
 * dedupe-key shape and field mapping are directly unit-testable without
 * touching Dexie — see `sync-engine.test.ts`.
 *
 * Any entry that doesn't match `StockConflictPayload` is silently skipped
 * rather than throwing: `applySyncSuccess`'s caller already isolated this
 * whole path in a try/catch (see `drainPending`'s docblock), but a
 * defensive filter here means a single malformed entry can't blank out the
 * other, valid conflicts in the same response.
 */
export function buildConflictRows(
  saleId: string,
  saleNumber: string,
  createdAt: string,
  stockConflicts: unknown[],
): ConflictRow[] {
  return stockConflicts.filter(isStockConflictPayload).map((c) => ({
    id: `${saleId}:${c.productId}`,
    saleId,
    saleNumber,
    productId: c.productId,
    productName: c.name,
    requested: c.requested,
    available: c.available,
    shortfall: c.shortfall,
    createdAt,
    resolved: 0,
  }));
}

/**
 * Inserts each row unless a row with the same `id` (the deterministic
 * `${saleId}:${productId}` dedupe key) already exists. Deliberately an
 * existence-check-then-`add`, NOT a `put` — a replayed sale (Task 2.2's
 * idempotent retry) must not clobber a conflict the shopkeeper already
 * marked `resolved` on the `/synchronisation` screen.
 */
async function upsertConflicts(rows: ConflictRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await db.conflicts.get(row.id);
    if (!existing) {
      await db.conflicts.add(row);
    }
  }
}

/**
 * Patches the local mirror row for a successfully-replayed op: flips
 * `synced: true` and, when the server assigned a display number (sales
 * `V-`, expenses `D-`), writes it onto the local row so the UI stops
 * showing the provisional "Local #n" placeholder.
 *
 * Keyed by `row.opId` — the same client id the payload carried (PHASE 0's
 * dedup key). For `sale`/`expense`/`customer`/`cancel`/`repay` that id IS
 * the local table's primary key (for `repay`, the `repayments` row
 * `createRepayOffline` inserted optimistically); for `adjust` the natural
 * local row is instead the `stockMovement` carrying that `clientOpId`
 * (there is no separate local "adjustment" entity) — see the case comment
 * below.
 *
 * Every write here is a guarded no-op if the local row is already gone
 * (e.g. purged, or never inserted because this drain ran ahead of the
 * PHASE 3/5 optimistic-insert code) — Dexie's `update(key, changes)`
 * resolves to `0` rather than throwing when `key` isn't found, so a
 * missing row is silently skipped by design, not an error.
 */
async function applySyncSuccess(row: OutboxRow, response: unknown): Promise<void> {
  const body = isRecord(response) ? response : {};

  switch (row.kind) {
    case 'sale': {
      // POST /api/sales → { sale: { id, number, total, publicToken } }. Persist
      // BOTH the server display number (V-000x) and the receipt `publicToken`
      // onto the local mirror so the POS receipt can drop the provisional
      // placeholder and print a working public receipt link. Each field is
      // written only when present as a string — a missing/`null` field is a
      // guarded no-op, and an absent local row makes Dexie's `update` resolve
      // to `0` rather than throw.
      const sale = isRecord(body.sale) ? body.sale : undefined;
      const changes: Partial<SaleRow> = { synced: true };
      if (sale && typeof sale.number === 'string') changes.number = sale.number;
      if (sale && typeof sale.publicToken === 'string') changes.publicToken = sale.publicToken;
      await db.sales.update(row.opId, changes);

      // Task 4.2 — stock conflicts the server signalled for THIS sale (see
      // Task 4.1's `stockConflicts`, always present as an array, empty when
      // there's nothing to reconcile). `saleNumber`/`createdAt` are read
      // back from the just-patched local row so a replay (no `sale.number`
      // in the response, e.g. an old memoized result) still gets the real
      // `V-000x` if a previous sync already wrote it.
      const stockConflicts = Array.isArray(body.stockConflicts) ? body.stockConflicts : [];
      if (stockConflicts.length > 0) {
        const patchedSale = await db.sales.get(row.opId);
        const saleNumber = patchedSale?.number ?? row.opId;
        const createdAt = patchedSale?.createdAt ?? new Date().toISOString();
        await upsertConflicts(buildConflictRows(row.opId, saleNumber, createdAt, stockConflicts));
      }
      break;
    }
    case 'expense': {
      // POST /api/expenses → { expense: { id, number, ... } }.
      const expense = isRecord(body.expense) ? body.expense : undefined;
      const changes: Partial<ExpenseRow> = { synced: true };
      if (expense && typeof expense.number === 'string') changes.number = expense.number;
      await db.expenses.update(row.opId, changes);
      break;
    }
    case 'repay': {
      // POST /api/receivables/[id]/repay → { applied, remainingDebt }. The
      // local `repayments` row (Task 5.2) was inserted optimistically by
      // `createRepayOffline` with `id === row.opId`; flip it `synced: true`
      // and record the server's authoritative `applied`/`remainingDebt` echo
      // when present (cosmetic — the row's `amount` was already the optimistic
      // applied value, which matches the server's since both run the same
      // `allocateRepayment`).
      //
      // What we DON'T reconcile here: the per-receivable balances. The server
      // owns the final allocation (Serializable, strictly oldest-first by
      // `createdAt`); the next `pull.ts` pass overwrites the local
      // `receivables` rows with the server's truth. `/api/sync/pull` also
      // returns the Repayment table (Task 5.2), so this same row is later
      // re-confirmed (and, for other devices' repayments, newly seeded) by
      // `pull.ts`'s `toRepaymentRow` — that's a harmless `bulkPut` overwrite
      // keyed by the same `id` (see `RepaymentRow`'s docblock). A missing
      // local row here (drain ran ahead of the optimistic insert) is a
      // guarded no-op: Dexie's `update` resolves to `0`.
      const changes: Partial<RepaymentRow> = { synced: true };
      if (typeof body.applied === 'number') changes.applied = body.applied;
      if (typeof body.remainingDebt === 'number') changes.remainingDebt = body.remainingDebt;
      await db.repayments.update(row.opId, changes);
      break;
    }
    case 'adjust': {
      // POST /api/products/[id]/adjust → { product: {...} }. The natural
      // local row is the `stockMovement` carrying this op's clientOpId
      // (`StockMovementRow.clientOpId`, set when the offline adjustment
      // was queued), not a table keyed by the outbox opId directly. Not
      // an indexed lookup (clientOpId isn't in the Dexie schema's index
      // list) — a linear `.filter()` is fine for a small local table.
      const movement = await db.stockMovements.filter((m) => m.clientOpId === row.opId).first();
      if (movement) {
        await db.stockMovements.update(movement.id, { synced: true });
      }

      // Task 5.3 — reconcile the product's qty (and buyPrice, when the op
      // updated it) from the server's authoritative echo NOW, rather than
      // waiting for the next `pullAll()`. `createAdjustOffline` computed the
      // optimistic `newQty` from whatever this device's local mirror showed
      // at write time; if a SECOND device (or a concurrent server-side
      // write) also adjusted the same product in between, the server's
      // `{ qty: { increment: delta } }` composed correctly but this
      // device's local qty is now stale until the next pull. Patching it
      // here closes that window immediately. Guarded: only applied when the
      // product row still exists locally and the response actually carries
      // a numeric `qty` — a missing/malformed response leaves the qty as-is
      // (self-heals on the next `pullAll()` regardless).
      const productBody = isRecord(body.product) ? body.product : undefined;
      if (productBody && typeof productBody.qty === 'number') {
        // The product id is normally read off the just-located `movement`
        // row; if that row is already gone (e.g. purged), fall back to
        // parsing it out of `row.endpoint` (`/api/products/<id>/adjust`) —
        // the same id `createAdjustOffline` built the endpoint from.
        const productId = movement?.productId ?? extractProductId(row.endpoint);
        if (productId) {
          const changes: { qty: number; buyPrice?: number } = { qty: productBody.qty };
          if (typeof productBody.buyPrice === 'number') changes.buyPrice = productBody.buyPrice;
          await db.products.update(productId, changes);
        }
      }
      break;
    }
    case 'customer': {
      // POST /api/customers → { customer: { id, name, phone } }. Dedup is
      // by `id`, so there's no server-assigned field to backfill — just
      // flip `synced`.
      await db.customers.update(row.opId, { synced: true });
      break;
    }
    case 'cancel': {
      // POST /api/sales/[id]/cancel → { ok, sale: { id, number, status } }.
      // The optimistic local status flip to CANCELLED happens in
      // `mutations.ts` (Task 5.5); here we only confirm the round-trip by
      // flipping the local sale row `synced: true`. The sale row is keyed by
      // the SALE id, which is NOT `row.opId` (the cancel op carries a fresh
      // clientOpId) — read it from the response `sale.id`, falling back to the
      // sale id embedded in the endpoint (`/api/sales/<id>/cancel`) when the
      // body is absent (memoized replay / the SALE_ALREADY_CANCELLED success
      // branch). Guarded: Dexie's `update` is a no-op if the row is gone.
      const sale = isRecord(body.sale) ? body.sale : undefined;
      const saleId =
        (sale && typeof sale.id === 'string' ? sale.id : undefined) ??
        extractCancelSaleId(row.endpoint);
      if (saleId) {
        await db.sales.update(saleId, { synced: true });
      }
      break;
    }
    default:
      // Unknown/future kind — nothing local to patch.
      break;
  }
}

let draining = false;

/**
 * Replays every `pending` outbox row against the server, in FIFO (`seq`)
 * order.
 *
 * Single-flight: a `drainOutbox()` call that arrives while another is
 * still running returns immediately with a zeroed result rather than
 * running a second concurrent replay (which could double-POST the
 * head-of-queue row before the first call has had a chance to mark it
 * `syncing`/`done`). This is a plain module-level boolean guard — same
 * shape as `api.ts`'s refresh-token lock — rather than a shared in-flight
 * promise, since callers here don't need the *other* call's result, only
 * the fact that a drain is already in progress. The full trigger wiring
 * (online event, post-enqueue, polling) is Task 2.3.
 */
export async function drainOutbox(): Promise<DrainResult> {
  if (draining) {
    return { done: 0, conflicts: 0, errors: 0 };
  }
  draining = true;
  try {
    return await drainPending();
  } finally {
    draining = false;
  }
}

async function drainPending(): Promise<DrainResult> {
  const rows = await listPending();

  let done = 0;
  let conflicts = 0;
  let errors = 0;

  for (const row of rows) {
    const seq = row.seq;
    if (seq === undefined) continue; // defensive — Dexie always assigns seq on insert

    await markSyncing(seq);

    let response: unknown;
    try {
      response = await api(row.endpoint, { method: 'POST', body: row.payload });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // Non-ApiError (e.g. a raw SyntaxError from api.ts's unawaited
        // `response.json()` on a truncated/malformed 2xx body) bypasses
        // api.ts's ApiError(0, ...) wrapping entirely. Treat it the same as
        // the network-stop branch below: reset the row to `pending` (never
        // leave it `syncing` — `listPending()` only returns `pending` rows,
        // so a row stuck at `syncing` becomes invisible to every future
        // drain, orphaned forever, and later `seq` rows would then process
        // ahead of it, breaking FIFO) and STOP the loop gracefully rather
        // than rethrowing (a rejecting `drainOutbox()` would break the
        // Task 2.3 trigger loop). Retrying on the next drain is safe: every
        // mutation endpoint is idempotent via the client id/clientOpId in
        // the payload (PHASE 0) — if the server already applied it, the
        // retry dedup-returns the existing entity.
        await db.outbox.update(seq, { status: 'pending' });
        break;
      }

      if (err.status === 0) {
        // Offline mid-drain — see module docblock for why this resets to
        // `pending` (not `markError`) and stops rather than continuing.
        await db.outbox.update(seq, { status: 'pending' });
        break;
      }

      if (err.status === 409 && STOCK_CONFLICT_CODES.has(err.code)) {
        await markConflict(seq, err.code || 'conflict');
        conflicts++;
        continue;
      }

      // A `cancel` op that 409s with SALE_ALREADY_CANCELLED is NOT a failure:
      // the desired end-state (the sale is cancelled server-side) is already
      // achieved — this is a dropped-ack replay of a genuine cancel. Treat it
      // as success (markDone), same as a clean 200, and flip the local sale
      // row `synced: true`. Scoped narrowly to `kind === 'cancel'` + this exact
      // code so a real conflict (e.g. CANCEL_WINDOW_EXPIRED, another 409) still
      // falls through to `markError` below.
      if (row.kind === 'cancel' && err.status === 409 && err.code === 'SALE_ALREADY_CANCELLED') {
        await markDone(seq);
        try {
          await applySyncSuccess(row, undefined);
        } catch (patchErr) {
          console.warn('[sync-engine] applySyncSuccess failed for row', row.opId, patchErr);
        }
        done++;
        continue;
      }

      // Any other 4xx (validation/not-found) or 5xx — see module docblock
      // for why 5xx does NOT get the network-stop treatment.
      await markError(seq, err.code || err.message);
      errors++;
      continue;
    }

    await markDone(seq);
    try {
      await applySyncSuccess(row, response);
    } catch (patchErr) {
      // The server already accepted the write (row is correctly `done`) —
      // a failed LOCAL cosmetic patch (e.g. a future kind added without a
      // guarded local-table lookup) must not abort the drain.
      console.warn('[sync-engine] applySyncSuccess failed for row', row.opId, patchErr);
    }
    done++;
  }

  return { done, conflicts, errors };
}
