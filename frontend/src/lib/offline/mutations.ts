/**
 * mutations.ts — offline write path for the boutique POS (Task 3.2 of the
 * offline-first plan; see docs/superpowers/plans/2026-07-20-offline-first-boutique.md,
 * PHASE 3).
 *
 * `createSaleOffline` records a sale against the LOCAL Dexie mirror
 * optimistically (decrementing local stock) and enqueues the same request the
 * online checkout POSTs to `/api/sales` (plus `id`/`clientOpId`) onto the
 * outbox. It returns a provisional sale for the receipt.
 *
 * The SERVER is authoritative: at sync it recomputes totals and assigns the
 * real sequential `V-000x` number (Phase 0 made `/api/sales` idempotent by the
 * client `id`, so a replay collides instead of duplicating). The local
 * computation therefore exists only for (a) the optimistic receipt shown
 * immediately and (b) the local stock decrement — exact byte-fidelity with the
 * server isn't required for correctness (server wins at sync), but the maths
 * here deliberately mirrors `frontend/src/app/api/sales/route.ts` so the
 * receipt matches what the server will ultimately store.
 *
 * The provisional number is a LOCAL placeholder (`#L<n>`, a monotonic counter
 * in `meta`), never a fabricated `V-` number — Task 3.4 swaps in the real
 * server number after sync.
 *
 * Atomicity: every local write (sale, items, movements, stock decrements,
 * receivable, offline-customer, and the outbox row) happens inside ONE Dexie
 * `rw` transaction. Any thrown validation error (product missing, local stock
 * shortfall, payment mismatch, credit without a customer) aborts the whole
 * transaction — nothing is written and the outbox stays clean.
 *
 * This module does NOT touch the network and does NOT trigger a drain — the
 * caller (Task 3.3) decides when to `triggerDrain()`.
 */
import {
  db,
  type ProductRow,
  type SaleMethod,
  type StockMovementRow,
  type SaleItemRow,
  type ReceivableRow,
  type CustomerRow,
  type SaleRow,
} from './db';
import { newId } from './ids';
import { enqueue } from './outbox';

/** `meta` key holding the monotonic provisional-sale counter (`#L<n>`). */
const LOCAL_SALE_SEQ_KEY = 'localSaleSeq';

type PayMethod = 'cash' | 'mobile' | 'credit';

export interface CreateSaleInput {
  items: { productId: string; qty: number; wholesale: boolean }[];
  method?: PayMethod;
  payments?: { method: PayMethod; amount: number }[];
  discount?: number;
  customer?: { id?: string; name?: string; phone?: string };
}

export interface ProvisionalSale {
  id: string;
  number: string;
  total: number;
  publicToken: string | null;
}

/** Pure total/split computation, mirroring the server (`/api/sales`). Throws
 * `PAYMENT_MISMATCH` when a supplied split doesn't sum to the net total. The
 * credit-without-customer check lives in `createSaleOffline` (it needs the
 * resolved customer id). */
export interface SaleTotals {
  gross: number;
  discount: number;
  total: number;
  cashAmount: number;
  mobileAmount: number;
  creditAmount: number;
  method: SaleMethod;
}

/** Unit price of a line: wholesale price when requested AND defined (> 0),
 * else the retail sell price — identical to `unitPriceFor` server-side. */
export function unitPriceFor(
  p: { sellPrice: number; prixGros: number },
  wholesale: boolean,
): number {
  return wholesale && p.prixGros > 0 ? p.prixGros : p.sellPrice;
}

/** The subset of the sale input the totals computation consumes. */
type ComputeOpts = {
  payments?: { method: PayMethod; amount: number }[];
  method?: PayMethod;
  discount?: number;
};

export function computeSaleTotals(
  items: { productId: string; qty: number; wholesale: boolean }[],
  priceById: Map<string, { sellPrice: number; prixGros: number }>,
  opts: ComputeOpts,
): SaleTotals {
  const gross = items.reduce((sum, item) => {
    const p = priceById.get(item.productId);
    return sum + item.qty * (p ? unitPriceFor(p, item.wholesale) : 0);
  }, 0);
  const discount = Math.min(Math.max(0, opts.discount ?? 0), gross);
  const total = gross - discount;

  const bd = { CASH: 0, MOBILE: 0, CREDIT: 0 };
  if (opts.payments && opts.payments.length > 0) {
    for (const p of opts.payments) {
      bd[p.method.toUpperCase() as keyof typeof bd] += p.amount;
    }
    if (bd.CASH + bd.MOBILE + bd.CREDIT !== total) {
      throw new Error('PAYMENT_MISMATCH');
    }
  } else {
    bd[(opts.method ?? 'cash').toUpperCase() as keyof typeof bd] = total;
  }

  const parts = (['CASH', 'MOBILE', 'CREDIT'] as const).filter((k) => bd[k] > 0);
  const method: SaleMethod = parts.length >= 2 ? 'MIXED' : (parts[0] ?? 'CASH');

  return {
    gross,
    discount,
    total,
    cashAmount: bd.CASH,
    mobileAmount: bd.MOBILE,
    creditAmount: bd.CREDIT,
    method,
  };
}

/**
 * Records a sale locally (optimistic) and enqueues it for the server.
 *
 * @throws Error('PRODUCT_NOT_FOUND') a referenced product isn't in the local mirror
 * @throws Error('INSUFFICIENT_STOCK_LOCAL') aggregate qty for a product exceeds local stock
 * @throws Error('PAYMENT_MISMATCH') a supplied split doesn't sum to the net total
 * @throws Error('CREDIT_NEEDS_CUSTOMER') a credit portion has no customer
 */
export async function createSaleOffline(input: CreateSaleInput): Promise<ProvisionalSale> {
  const id = newId();
  const createdAt = new Date().toISOString();

  return db.transaction(
    'rw',
    [
      db.products,
      db.customers,
      db.sales,
      db.saleItems,
      db.receivables,
      db.stockMovements,
      db.meta,
      db.outbox,
    ],
    async (): Promise<ProvisionalSale> => {
      // 1/2. Load referenced products (dedup ids for the lookup).
      const uniqueIds = Array.from(new Set(input.items.map((i) => i.productId)));
      const loaded = await db.products.bulkGet(uniqueIds);
      const byId = new Map<string, ProductRow>();
      loaded.forEach((p, idx) => {
        if (p) byId.set(uniqueIds[idx] as string, p);
      });
      for (const pid of uniqueIds) {
        if (!byId.has(pid)) throw new Error('PRODUCT_NOT_FOUND');
      }

      // Derive orgId from the products (all must belong to the same boutique).
      const orgIds = new Set(Array.from(byId.values()).map((p) => p.organizationId));
      if (orgIds.size !== 1) throw new Error('MIXED_ORG_PRODUCTS');
      const orgId = orgIds.values().next().value as string;

      // 3. Aggregate requested qty per product, then check LOCAL stock.
      const neededByProduct = new Map<string, number>();
      for (const item of input.items) {
        neededByProduct.set(item.productId, (neededByProduct.get(item.productId) ?? 0) + item.qty);
      }
      for (const [productId, needed] of neededByProduct) {
        const p = byId.get(productId) as ProductRow;
        if (needed > p.qty) throw new Error('INSUFFICIENT_STOCK_LOCAL');
      }

      // 4. Totals + split (throws PAYMENT_MISMATCH). Mirrors the server maths.
      const totals = computeSaleTotals(
        input.items,
        byId as Map<string, { sellPrice: number; prixGros: number }>,
        buildComputeOpts(input),
      );

      // 6. Resolve the customer. An existing `id` is used as-is; a `name`
      // without an `id` materialises a fresh offline customer row.
      let customerId: string | undefined;
      let payloadCustomer: { id?: string; name?: string; phone?: string } | undefined;
      if (input.customer?.id) {
        customerId = input.customer.id;
        payloadCustomer = { id: input.customer.id };
      } else if (input.customer?.name) {
        const newCustomerId = newId();
        const customerRow: CustomerRow = {
          id: newCustomerId,
          organizationId: orgId,
          name: input.customer.name,
          updatedAt: createdAt,
          synced: false,
          ...(input.customer.phone ? { phone: input.customer.phone } : {}),
        };
        await db.customers.put(customerRow);
        customerId = newCustomerId;
        payloadCustomer = {
          id: newCustomerId,
          name: input.customer.name,
          ...(input.customer.phone ? { phone: input.customer.phone } : {}),
        };
      }

      // Credit portion requires a resolved customer.
      if (totals.creditAmount > 0 && !customerId) {
        throw new Error('CREDIT_NEEDS_CUSTOMER');
      }

      // 5. Provisional local number (`#L<n>`), monotonic across sales.
      const seqRow = await db.meta.get(LOCAL_SALE_SEQ_KEY);
      const prev = typeof seqRow?.value === 'number' ? seqRow.value : 0;
      const nextSeq = prev + 1;
      await db.meta.put({ key: LOCAL_SALE_SEQ_KEY, value: nextSeq });
      const number = `#L${nextSeq}`;

      // 7. Write the local rows (all `synced:false`).
      const saleRow: SaleRow = {
        id,
        organizationId: orgId,
        number,
        method: totals.method,
        total: totals.total,
        discount: totals.discount,
        cashAmount: totals.cashAmount,
        mobileAmount: totals.mobileAmount,
        creditAmount: totals.creditAmount,
        status: 'ACTIVE',
        createdAt,
        synced: false,
        ...(customerId ? { customerId } : {}),
      };
      await db.sales.put(saleRow);

      const itemRows: SaleItemRow[] = input.items.map((item) => {
        const p = byId.get(item.productId) as ProductRow;
        return {
          id: newId(),
          saleId: id,
          productId: item.productId,
          name: p.name,
          qty: item.qty,
          unitPrice: unitPriceFor(p, item.wholesale),
          buyPrice: p.buyPrice,
        };
      });
      await db.saleItems.bulkPut(itemRows);

      // One aggregated OUT movement per product + decrement local stock.
      const movementRows: StockMovementRow[] = [];
      for (const [productId, needed] of neededByProduct) {
        const p = byId.get(productId) as ProductRow;
        movementRows.push({
          id: newId(),
          organizationId: orgId,
          productId,
          type: 'OUT',
          delta: -needed,
          reason: 'sale',
          clientOpId: `${id}:${productId}`,
          createdAt,
          synced: false,
        });
        await db.products.update(productId, { qty: p.qty - needed });
      }
      await db.stockMovements.bulkPut(movementRows);

      // Credit portion → open a local receivable.
      if (totals.creditAmount > 0 && customerId) {
        const receivable: ReceivableRow = {
          id: newId(),
          organizationId: orgId,
          customerId,
          saleId: id,
          amount: totals.creditAmount,
          amountPaid: 0,
          status: 'OPEN',
          updatedAt: createdAt,
        };
        await db.receivables.put(receivable);
      }

      // 8. Enqueue the outbox op — same shape the online POST sends, plus
      // `id`/`clientOpId`. Inside the tx so a rollback also drops the queue row.
      const inputDiscount = input.discount ?? 0;
      const payload: Record<string, unknown> = {
        id,
        clientOpId: id,
        ...(input.payments ? { payments: input.payments } : { method: input.method ?? 'cash' }),
        ...(inputDiscount > 0 ? { discount: inputDiscount } : {}),
        items: input.items,
        ...(payloadCustomer ? { customer: payloadCustomer } : {}),
      };
      await enqueue({ kind: 'sale', endpoint: '/api/sales', opId: id, payload });

      // 9. Provisional sale for the receipt.
      return { id, number, total: totals.total, publicToken: null };
    },
  );
}

/** Narrows `CreateSaleInput` to the subset `computeSaleTotals` consumes,
 * omitting `undefined` keys per `exactOptionalPropertyTypes`. */
function buildComputeOpts(input: CreateSaleInput): ComputeOpts {
  return {
    ...(input.payments ? { payments: input.payments } : {}),
    ...(input.method ? { method: input.method } : {}),
    ...(input.discount !== undefined ? { discount: input.discount } : {}),
  };
}
