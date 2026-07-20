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
 * One display-only limitation vs the server version (never a money value): the
 * Dexie mirror has no local `users` table, so `sellerName` is always `null`
 * (the seller filter still works — it falls back to `sellerId`, which is the
 * sale's `createdById`, present on pulled sales). The server view resolves the
 * seller's display name; offline, the id is all we have.
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
}

/**
 * Joins locally-mirrored sales, sale items and customers into the `ApiSale[]`
 * shape `VentesManager` renders, newest-first (matching the server's
 * `orderBy: { createdAt: 'desc' }`). Pure (no Dexie / clock), so it is
 * unit-testable directly.
 */
export function aggregateSales(
  sales: SaleRow[],
  items: SaleItemRow[],
  customers: CustomerRow[],
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
        sellerName: null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        items: (itemsBySale.get(s.id) ?? []).map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
      };
    });
}
