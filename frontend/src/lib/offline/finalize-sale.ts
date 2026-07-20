/**
 * finalize-sale.ts — post-commit checkout orchestration for the POS (Task 3.4
 * of the offline-first plan; see docs/superpowers/plans/2026-07-20-offline-first-boutique.md,
 * PHASE 3).
 *
 * Called by `VendrePos.validate()` AFTER `createSaleOffline` has already
 * committed the sale to Dexie and queued it on the outbox — the sale is
 * durable and will reach the server whether or not anything below succeeds.
 * This helper only resolves which number + public token to PRINT on the
 * receipt:
 *   - online → drain the outbox now (single-flight, fast) and re-read the
 *     local sale to pick up the server-assigned `V-000x` number + `publicToken`
 *     that `applySyncSuccess` patched in; if the drain OR the re-read throws
 *     for ANY reason, silently fall back to the provisional local values.
 *   - offline → the provisional `#L<n>` number and `null` token (the real
 *     values arrive on a later drain / `pull`).
 *
 * Critically it NEVER throws: a committed sale must always yield a receipt, so
 * the caller can print + reset the cart unconditionally. Routing a failed
 * post-commit re-read to an error toast (with the cart still full) would let a
 * cashier retry and mint a SECOND sale — this helper exists to make that
 * impossible.
 */
import { db } from './db';
import { drainOutbox } from './sync-engine';
import { resolveReceiptNumbers, type ReceiptNumbers } from './pos-adapters';

/**
 * Resolves the receipt number + public token to display for an
 * already-committed sale, swallowing any drain/re-read failure.
 *
 * @param local  the provisional sale returned by `createSaleOffline` (its `id`
 *               is the Dexie key to re-read; `number`/`publicToken` are the
 *               fallbacks).
 * @param opts.online whether the device is online (drives whether we attempt a
 *               synchronous drain + re-read at all).
 */
export async function finalizeSaleReceipt(
  local: ReceiptNumbers & { id: string },
  opts: { online: boolean },
): Promise<ReceiptNumbers> {
  const provisional: ReceiptNumbers = { number: local.number, publicToken: local.publicToken };
  if (!opts.online) return provisional;
  try {
    await drainOutbox();
    const syncedRow = await db.sales.get(local.id);
    return resolveReceiptNumbers(local, syncedRow);
  } catch {
    // Drain infra or the post-commit re-read threw — the sale is ALREADY
    // committed + queued, so fall back to the provisional values and let the
    // caller print + reset regardless. Never rethrow.
    return provisional;
  }
}
