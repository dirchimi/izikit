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
  type ExpenseRow,
  type RepaymentRow,
} from './db';
import { newId } from './ids';
import { enqueue } from './outbox';
import { getOrgId } from './pull';
import { allocateRepayment } from '@/lib/shared/allocate-repayment';

/** `meta` key holding the monotonic provisional-sale counter (`#L<n>`). */
const LOCAL_SALE_SEQ_KEY = 'localSaleSeq';
/** `meta` key holding the monotonic provisional-expense counter (`#L<n>`).
 * Deliberately a SEPARATE counter from `LOCAL_SALE_SEQ_KEY` — sales and
 * expenses are different domains with their own server-assigned display
 * sequences (`V-` vs `D-`), so sharing one counter would make the
 * provisional local number carry no meaningful relation to either. */
const LOCAL_EXPENSE_SEQ_KEY = 'localExpenseSeq';

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

// ---------------------------------------------------------------------------
// createExpenseOffline (Task 5.1) — the `expense` mirror of createSaleOffline
// above.
// ---------------------------------------------------------------------------

/** Free-form server-side (`category: z.string().trim().min(1).max(40)` in
 * `frontend/src/app/api/expenses/route.ts`) — used only when the caller
 * omits one. `DepensesManager`'s form always supplies a category (defaulting
 * to 'Charges' itself), so this is a defensive fallback for any other future
 * caller of `createExpenseOffline`, not the primary path. */
const DEFAULT_EXPENSE_CATEGORY = 'Divers';

export interface CreateExpenseInput {
  label: string;
  amount: number;
  /** ISO. Defaults to "now" locally. NOTE: `/api/expenses`'s Body schema has
   * no `occurredAt` field today — the server always stamps its own — so this
   * only affects the optimistic local row's display date, not what's
   * eventually persisted server-side. */
  occurredAt?: string;
  /** Defaults to `DEFAULT_EXPENSE_CATEGORY` — required (non-empty) server-side. */
  category?: string;
  /** Not in Task 5.1's literal spec, but kept optional and additive so an
   * offline expense doesn't silently drop the note the online path already
   * supports (`/api/expenses`'s Body has `note` as optional). */
  note?: string;
}

export interface ProvisionalExpense {
  id: string;
  number: string;
}

/**
 * Records an expense locally (optimistic) and enqueues it for the server —
 * the `expense` counterpart of `createSaleOffline`. Unlike a sale, an expense
 * references no product, so the org id can't be derived from a loaded row —
 * it comes instead from `meta.orgId` (Task 5.1's foundation, populated by
 * `pullAll()` from `/api/sync/pull`'s `orgId`).
 *
 * @throws Error('NO_ORG') `meta.orgId` hasn't been populated yet (no
 *   successful pull has ever run) — shouldn't happen once onboarding is past
 *   the first sync, but guarded rather than assumed.
 * @throws Error('AMOUNT_INVALID') `amount` isn't a positive integer
 */
export async function createExpenseOffline(input: CreateExpenseInput): Promise<ProvisionalExpense> {
  const id = newId();
  const createdAt = new Date().toISOString();

  return db.transaction(
    'rw',
    [db.expenses, db.meta, db.outbox],
    async (): Promise<ProvisionalExpense> => {
      const orgId = await getOrgId();
      if (!orgId) throw new Error('NO_ORG');

      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new Error('AMOUNT_INVALID');
      }

      // Provisional local number (`#L<n>`), monotonic across expenses —
      // same shape as the sale counter, but tracked separately (see
      // `LOCAL_EXPENSE_SEQ_KEY`'s doc comment).
      const seqRow = await db.meta.get(LOCAL_EXPENSE_SEQ_KEY);
      const prev = typeof seqRow?.value === 'number' ? seqRow.value : 0;
      const nextSeq = prev + 1;
      await db.meta.put({ key: LOCAL_EXPENSE_SEQ_KEY, value: nextSeq });
      const number = `#L${nextSeq}`;

      const category = input.category ?? DEFAULT_EXPENSE_CATEGORY;
      const occurredAt = input.occurredAt ?? createdAt;

      const row: ExpenseRow = {
        id,
        organizationId: orgId,
        number,
        label: input.label,
        category,
        amount: input.amount,
        occurredAt,
        createdAt,
        synced: false,
        ...(input.note ? { note: input.note } : {}),
      };
      await db.expenses.put(row);

      // Enqueue the outbox op — same shape the online POST sends, plus
      // `id`/`clientOpId`. `category` is always sent (server requires it,
      // non-optional); `occurredAt` only when the caller explicitly gave one
      // (the server ignores unknown Body keys, so this is harmless either
      // way — see the field's doc comment above).
      const payload: Record<string, unknown> = {
        id,
        clientOpId: id,
        label: input.label,
        amount: input.amount,
        category,
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        ...(input.note ? { note: input.note } : {}),
      };
      await enqueue({ kind: 'expense', endpoint: '/api/expenses', opId: id, payload });

      return { id, number };
    },
  );
}

// ---------------------------------------------------------------------------
// createCustomerOffline (Task 5.4) — standalone `customer` mirror of
// createExpenseOffline above. `createSaleOffline` already materialises an
// offline customer INLINE when a sale names a new client (see step 6 above);
// this export exists for a standalone "create a customer" caller that isn't
// tied to a sale. As of Task 5.4, `ClientPicker` (the only current consumer
// of `/api/customers`) has no such standalone action — customers are only
// ever created inline while building a sale — so nothing calls this yet. It
// is kept exported and tested so a future standalone "add customer" screen
// can use it without re-deriving the outbox-enqueue shape.
// ---------------------------------------------------------------------------

export interface CreateCustomerInput {
  name: string;
  phone?: string;
}

export interface ProvisionalCustomer {
  id: string;
}

/**
 * Records a customer locally (optimistic) and enqueues it for the server —
 * the `customer` counterpart of `createExpenseOffline`. Like an expense, a
 * customer references no product, so the org id comes from `meta.orgId`
 * (Task 5.1's foundation) rather than a loaded row.
 *
 * @throws Error('NO_ORG') `meta.orgId` hasn't been populated yet (no
 *   successful pull has ever run)
 * @throws Error('NAME_REQUIRED') `name` is empty (after trimming)
 */
export async function createCustomerOffline(
  input: CreateCustomerInput,
): Promise<ProvisionalCustomer> {
  const id = newId();
  const createdAt = new Date().toISOString();

  return db.transaction(
    'rw',
    [db.customers, db.meta, db.outbox],
    async (): Promise<ProvisionalCustomer> => {
      const orgId = await getOrgId();
      if (!orgId) throw new Error('NO_ORG');

      const name = input.name.trim();
      if (!name) throw new Error('NAME_REQUIRED');

      const row: CustomerRow = {
        id,
        organizationId: orgId,
        name,
        updatedAt: createdAt,
        synced: false,
        ...(input.phone ? { phone: input.phone } : {}),
      };
      await db.customers.put(row);

      // Enqueue the outbox op — same shape the online POST sends, plus
      // `id`/`clientOpId` for idempotent dedup server-side (see
      // `frontend/src/app/api/customers/route.ts`'s `Body.id`).
      const payload: Record<string, unknown> = {
        id,
        clientOpId: id,
        name,
        ...(input.phone ? { phone: input.phone } : {}),
      };
      await enqueue({ kind: 'customer', endpoint: '/api/customers', opId: id, payload });

      return { id };
    },
  );
}

// ---------------------------------------------------------------------------
// createRepayOffline (Task 5.2) — the `repay` mirror of the mutations above.
// A repayment is entered against a CUSTOMER and spread over that customer's
// open receivables OLDEST-FIRST, using the SHARED `allocateRepayment` (the
// exact same pure allocator the server route runs — Task 5.6), so the
// optimistic local split matches what the server will ultimately compute.
//
// The server is authoritative for the FINAL allocation: `POST
// /api/receivables/[id]/repay` re-runs `allocateRepayment` inside a
// Serializable transaction ordered strictly by `createdAt`, so the next
// `pull.ts` pass reconciles the per-receivable balances regardless of the
// local ordering. Because `applied` and `remainingDebt` are order-INDEPENDENT
// (`applied = min(amount, Σ due)`, `remainingDebt = Σ amount − Σ amountPaid −
// applied`), the totals shown to the shopkeeper are exact even before sync.
//
// NOTE on ordering: `ReceivableRow` carries no `createdAt` (only `updatedAt`),
// so oldest-first is approximated by `updatedAt` ascending — a faithful proxy
// for freshly-pulled/created receivables (whose `updatedAt` == creation time
// until first payment). Any divergence from the server's `createdAt` order
// only affects WHICH receivable optimistically absorbs the payment, never the
// totals, and self-heals on the next pull.
//
// Deliberately does NOT create a local RECU `Document` — the server assigns
// the sequential RECU number and the document arrives via `pull.ts`; the
// documents screen is online-refreshed (Task 5.2 decision).
// ---------------------------------------------------------------------------

export interface CreateRepayInput {
  customerId: string;
  amount: number;
  method?: string;
  note?: string;
  /** 'YYYY-MM-DD' (back-dated) or ISO. Defaults to "now" locally. */
  date?: string;
}

export interface RepayResult {
  id: string;
  applied: number;
  remainingDebt: number;
}

/**
 * Records a receivable repayment locally (optimistic allocation) and enqueues
 * it for the server.
 *
 * @throws Error('NO_ORG') `meta.orgId` hasn't been populated yet (no
 *   successful pull has ever run)
 * @throws Error('AMOUNT_INVALID') `amount` isn't a positive integer
 * @throws Error('NO_DEBT') the customer has no OPEN/PARTIAL receivable to apply
 *   the payment to (nothing is written — full rollback)
 */
export async function createRepayOffline(input: CreateRepayInput): Promise<RepayResult> {
  const id = newId();
  const now = new Date().toISOString();

  return db.transaction(
    'rw',
    [db.receivables, db.repayments, db.meta, db.outbox],
    async (): Promise<RepayResult> => {
      const orgId = await getOrgId();
      if (!orgId) throw new Error('NO_ORG');

      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new Error('AMOUNT_INVALID');
      }

      // Customer's open receivables, oldest-first (updatedAt proxy — see note).
      const forCustomer = await db.receivables
        .where('customerId')
        .equals(input.customerId)
        .toArray();
      const open = forCustomer
        .filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));
      if (open.length === 0) throw new Error('NO_DEBT');

      const { allocations, applied, remainingDebt } = allocateRepayment(
        open.map((r) => ({ id: r.id, amount: r.amount, amountPaid: r.amountPaid })),
        input.amount,
      );
      if (applied <= 0) throw new Error('NO_DEBT');

      // Apply the optimistic allocation to the local receivables.
      for (const a of allocations) {
        await db.receivables.update(a.id, {
          amountPaid: a.newAmountPaid,
          status: a.status,
          updatedAt: now,
        });
      }

      // Local echo row: `amount` is the APPLIED (capped) value the server
      // persists, not the raw input.
      const row: RepaymentRow = {
        id,
        organizationId: orgId,
        customerId: input.customerId,
        amount: applied,
        createdAt: input.date ?? now,
        synced: false,
        ...(input.method ? { method: input.method } : {}),
        ...(input.note ? { note: input.note } : {}),
      };
      await db.repayments.put(row);

      // Enqueue — same shape the online POST sends, plus `id`/`clientOpId`.
      // `amount` is the RAW input (the server caps it via allocateRepayment);
      // `[id]` in the endpoint is the customer id (see the route's docblock).
      const payload: Record<string, unknown> = {
        id,
        clientOpId: id,
        amount: input.amount,
        ...(input.method ? { method: input.method } : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(input.date ? { date: input.date } : {}),
      };
      await enqueue({
        kind: 'repay',
        endpoint: `/api/receivables/${input.customerId}/repay`,
        opId: id,
        payload,
      });

      return { id, applied, remainingDebt };
    },
  );
}
