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
import { db, type SaleRow, type ExpenseRow } from './db';
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
 * Patches the local mirror row for a successfully-replayed op: flips
 * `synced: true` and, when the server assigned a display number (sales
 * `V-`, expenses `D-`), writes it onto the local row so the UI stops
 * showing the provisional "Local #n" placeholder.
 *
 * Keyed by `row.opId` — the same client id the payload carried (PHASE 0's
 * dedup key). For `sale`/`expense`/`customer`/`cancel` that id IS the local
 * table's primary key; for `adjust` the natural local row is instead the
 * `stockMovement` carrying that `clientOpId` (there is no separate local
 * "adjustment" entity). `repay` has no local row to patch yet — see the
 * case comment below.
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
      // POST /api/sales → { sale: { id, number, total, publicToken } }.
      const sale = isRecord(body.sale) ? body.sale : undefined;
      const changes: Partial<SaleRow> = { synced: true };
      if (sale && typeof sale.number === 'string') changes.number = sale.number;
      await db.sales.update(row.opId, changes);
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
      // POST /api/receivables/[id]/repay → { applied, remainingDebt } — no
      // per-repayment id in the response, and `db.ts` has no local
      // `repayments` table yet (Task 5.2 adds one, plus a provisional
      // local RECU `document`, and will extend this case then). Until
      // that lands, the receivable's true balance simply arrives on the
      // next `pull.ts` pass — nothing to patch here today.
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
      // `mutations.ts` (PHASE 5.5); here we only confirm the round-trip.
      await db.sales.update(row.opId, { synced: true });
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
      if (!(err instanceof ApiError)) throw err;

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

      // Any other 4xx (validation/not-found) or 5xx — see module docblock
      // for why 5xx does NOT get the network-stop treatment.
      await markError(seq, err.code || err.message);
      errors++;
      continue;
    }

    await markDone(seq);
    await applySyncSuccess(row, response);
    done++;
  }

  return { done, conflicts, errors };
}
