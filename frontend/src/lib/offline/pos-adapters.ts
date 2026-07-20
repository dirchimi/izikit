/**
 * pos-adapters.ts — pure adapters bridging the offline Dexie mirror to the
 * POS `VendrePos` component (Task 3.3 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 3).
 *
 * `VendrePos` used to read the catalogue over the network from
 * `GET /api/products`, whose JSON shape is `productView(...)` server-side
 * (`lib/server/products/helpers.ts`): the raw product columns PLUS a derived
 * stock `status`. Reading from Dexie instead yields a `ProductRow` (the raw
 * columns only, with nullable columns stored as absent optional keys rather
 * than `null`), so `productRowToPos` reshapes a `ProductRow` back into the
 * exact `PosProduct` shape the component consumes — deriving `status` locally
 * with the same rule the server uses (`deriveStockStatus`, replicated here
 * because the server helper is `server-only` and can't be imported client-side)
 * and normalising absent optionals (`imageUrl`/`barcode`/`expiryDate`) to the
 * `null` the component's rendering expects.
 *
 * `resolveReceiptNumbers` picks the number + public token to print on the
 * receipt: after an online checkout the outbox drain upgrades the local sale
 * row in place (provisional `#L<n>` → server `V-000x`, and — once Task 3.4
 * lands — the `publicToken`), so a re-read row's values win; offline (or before
 * the drain has patched anything) it falls back to the provisional local values.
 *
 * Both functions are pure and React-free so they're unit-testable without a
 * render harness (this repo ships none) — see `pos-adapters.test.ts`.
 */
import { type ProductRow, type SaleRow } from './db';

export type PosStockStatus = 'ok' | 'low' | 'out';

/** Stock status derived from quantity and alert threshold. Byte-identical to
 * the server's `deriveStockStatus` (`lib/server/products/helpers.ts`), which
 * is `server-only` and therefore can't be imported into a client component. */
export function deriveStockStatus(qty: number, threshold: number): PosStockStatus {
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}

/** The product shape `VendrePos` renders — the raw catalogue columns plus the
 * derived stock `status`, with nullable columns as `T | null`. Matches the
 * JSON `GET /api/products` returned before the offline swap (`productView`). */
export interface PosProduct {
  id: string;
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  qty: number;
  threshold: number;
  status: PosStockStatus;
  imageUrl: string | null;
  barcode: string | null;
  expiryDate: string | null;
}

/** Reshapes a Dexie `ProductRow` into the `PosProduct` the component expects:
 * derives `status` locally and normalises absent optional keys to `null`. */
export function productRowToPos(row: ProductRow): PosProduct {
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    category: row.category,
    buyPrice: row.buyPrice,
    sellPrice: row.sellPrice,
    prixGros: row.prixGros,
    unite: row.unite,
    qty: row.qty,
    threshold: row.threshold,
    status: deriveStockStatus(row.qty, row.threshold),
    imageUrl: row.imageUrl ?? null,
    barcode: row.barcode ?? null,
    expiryDate: row.expiryDate ?? null,
  };
}

export interface ReceiptNumbers {
  number: string;
  publicToken: string | null;
}

/**
 * Resolves the sale number + public token to show on the receipt.
 *
 * `local` is the provisional sale `createSaleOffline` returned (`#L<n>` number,
 * `null` token). `syncedRow` is the same sale re-read from Dexie AFTER an online
 * drain: when present its server-assigned `number` (and, once Task 3.4 wires it,
 * `publicToken`) win. Offline — or before the drain patched the row — both fall
 * back to the provisional local values.
 */
export function resolveReceiptNumbers(
  local: ReceiptNumbers,
  syncedRow: Pick<SaleRow, 'number' | 'publicToken'> | undefined,
): ReceiptNumbers {
  return {
    number: syncedRow?.number ?? local.number,
    publicToken: syncedRow?.publicToken ?? local.publicToken,
  };
}
