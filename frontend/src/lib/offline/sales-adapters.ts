/**
 * sales-adapters.ts — pure Dexie → UI-shape adapter for the offline ventes
 * screen (Task 5.5 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 5).
 *
 * Mirrors the small-pure-mapper pattern `pos-adapters.ts` / `expense-adapters.ts`
 * / `creances-adapters.ts` established (see their docblocks): dependency-free
 * functions, directly unit-testable with no render harness, that `VentesManager`
 * applies to rows read live from Dexie. Keeping the output shape byte-identical
 * to what `GET /api/sales` returned (`saleView` in
 * `frontend/src/app/api/sales/route.ts`) means the component's filtering / KPI /
 * receipt logic needs no other change once the source switches from `useApi` to
 * `useLocalResource`.
 *
 * The join is `sales` × `saleItems` (by `saleId`) × `customers` (by
 * `customerId`) — the three tables `pull.ts` already mirrors.
 *
 * Seller display names: the Dexie mirror has no local `users` table, but
 * `pullAll()` stores the org's member directory in `meta.members`
 * (`getMemberNames()` in pull.ts) — pass it as `memberNames` to resolve
 * `sellerName` from the sale's `createdById`. Without it (pre-first-pull, or
 * a member deleted since), `sellerName` is `null` and the UI falls back to
 * the raw id.
 */
import type { SaleRow, SaleItemRow, CustomerRow, SaleMethod } from './db';

export interface ApiSaleItem {
  name: string;
  qty: number;
  unitPrice: number;
}

/** Byte-identical to the former `/api/sales` JSON row (`saleView`). */
export interface ApiSale {
  id: string;
  number: string;
  method: SaleMethod;
  total: number;
  discount: number;
  cashAmount: number;
  mobileAmount: number;
  creditAmount: number;
  status: string; // ACTIVE | CANCELLED
  createdAt: string; // ISO
  sellerId: string | null;
  sellerName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: ApiSaleItem[];
  /** Task 6.3 — feeds `RowSyncBadge` on `VentesManager`. `SaleRow.synced` is
   * `undefined` for a row seeded purely by `pullAll()` (a pulled row is
   * server truth by definition, never "still pending") — that case maps to
   * `true` here, NOT the row's raw `undefined`, so the badge only ever shows
   * "à synchroniser" for a row THIS device knows is still queued
   * (`synced === false`). */
  synced: boolean;
}

/**
 * Joins locally-mirrored sales, sale items and customers into the `ApiSale[]`
 * shape `VentesManager` renders, newest-first (matching the server's
 * `orderBy: { createdAt: 'desc' }`). Pure (no Dexie / clock), so it is
 * unit-testable directly.
 *
 * `memberNames` (facultatif) : annuaire `userId → nom d'affichage` stocké par
 * `pullAll()` (`getMemberNames()` dans pull.ts) — résout `sellerName` pour
 * que le filtre vendeurs et les lignes affichent un NOM et plus un id
 * technique, y compris hors ligne. Absent/incomplet → `sellerName: null` et
 * l'UI retombe sur l'id (comportement d'avant).
 */
export function aggregateSales(
  sales: SaleRow[],
  items: SaleItemRow[],
  customers: CustomerRow[],
  memberNames?: Record<string, string>,
): ApiSale[] {
  const itemsBySale = new Map<string, SaleItemRow[]>();
  for (const it of items) {
    const arr = itemsBySale.get(it.saleId);
    if (arr) arr.push(it);
    else itemsBySale.set(it.saleId, [it]);
  }

  const customerById = new Map(customers.map((c) => [c.id, c]));

  return sales
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map((s) => {
      const customer = s.customerId ? customerById.get(s.customerId) : undefined;
      return {
        id: s.id,
        number: s.number,
        method: s.method,
        total: s.total,
        discount: s.discount,
        cashAmount: s.cashAmount,
        mobileAmount: s.mobileAmount,
        creditAmount: s.creditAmount,
        status: s.status,
        createdAt: s.createdAt,
        sellerId: s.createdById ?? null,
        sellerName: s.createdById ? (memberNames?.[s.createdById] ?? null) : null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        synced: s.synced !== false,
        items: (itemsBySale.get(s.id) ?? []).map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
      };
    });
}
