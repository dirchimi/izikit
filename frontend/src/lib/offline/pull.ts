/**
 * pull.ts — seed/refresh the local Dexie mirror from `GET /api/sync/pull`
 * (Task 1.3 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 1).
 *
 * The server endpoint (`frontend/src/app/api/sync/pull/route.ts`, Task 1.2)
 * always returns a FULL batch of the 7 org-scoped tables in one round trip
 * — there is no per-resource filter param. `Sale.items` (SaleItem) arrives
 * nested inside each sale (`sale.items[]`) because SaleItem has no
 * `organizationId`/`updatedAt` of its own to filter on independently; this
 * module flattens that nesting into the separate Dexie `saleItems` table.
 *
 * Client-side DB rows use `exactOptionalPropertyTypes` (see
 * `tsconfig.base.json`), so nullable server fields (`T | null`, the JSON
 * shape of a nullable Prisma column) are mapped to the Dexie Row types'
 * optional fields (`T | undefined`, i.e. present-or-absent) via conditional
 * spreads rather than `field: value ?? undefined` — the latter would set
 * the key to `undefined` explicitly, which `exactOptionalPropertyTypes`
 * rejects for a `field?: T` property.
 *
 * `pullAll()` and `pullResource()` share every mapping/flatten function
 * below (`toProductRow`, `splitSales`, …) via the single `applyResource`
 * dispatcher — see its doc comment for how the cursor is handled
 * differently between the two entry points.
 */
import { api } from '@/lib/api';
import {
  db,
  type ProductRow,
  type CustomerRow,
  type SaleRow,
  type SaleItemRow,
  type SaleMethod,
  type SaleStatus,
  type ReceivableRow,
  type ReceivableStatus,
  type ExpenseRow,
  type DocumentRow,
  type DocumentType,
  type DocumentStatus,
  type DocumentLine,
  type StockMovementRow,
  type StockMovementType,
} from './db';

const LAST_PULL_KEY = 'lastPull';
/** Task 5.1 — `meta` key holding the current boutique id, written by
 * `pullAll()` from the response's `orgId` and read back by `getOrgId()`. */
const ORG_ID_KEY = 'orgId';

// ---------------------------------------------------------------------------
// Server response shapes — mirror the Prisma models field-for-field as they
// serialize to JSON (DateTime -> ISO string, nullable column -> `T | null`).
// ---------------------------------------------------------------------------

interface ServerProduct {
  id: string;
  organizationId: string;
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  qty: number;
  threshold: number;
  imageUrl: string | null;
  barcode: string | null;
  expiryDate: string | null;
  updatedAt: string;
}

interface ServerCustomer {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  updatedAt: string;
}

interface ServerSaleItem {
  id: string;
  saleId: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  buyPrice: number;
}

interface ServerSale {
  id: string;
  organizationId: string;
  number: string;
  customerId: string | null;
  method: SaleMethod;
  total: number;
  discount: number;
  cashAmount: number;
  mobileAmount: number;
  creditAmount: number;
  publicToken: string | null;
  status: SaleStatus;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancelReason: string | null;
  createdById: string | null;
  createdAt: string;
  items: ServerSaleItem[];
}

interface ServerReceivable {
  id: string;
  organizationId: string;
  customerId: string;
  saleId: string | null;
  amount: number;
  amountPaid: number;
  status: ReceivableStatus;
  updatedAt: string;
}

interface ServerExpense {
  id: string;
  organizationId: string;
  number: string;
  label: string;
  category: string;
  amount: number;
  note: string | null;
  createdById: string | null;
  occurredAt: string;
  createdAt: string;
}

interface ServerDocument {
  id: string;
  organizationId: string;
  type: DocumentType;
  number: string;
  saleId: string | null;
  customerId: string | null;
  repaymentId: string | null;
  clientName: string;
  clientPhone: string | null;
  status: DocumentStatus;
  total: number;
  balanceAfter: number | null;
  note: string | null;
  lines: DocumentLine[];
  validityDays: number | null;
  issuedAt: string;
  createdAt: string;
}

interface ServerStockMovement {
  id: string;
  organizationId: string;
  productId: string;
  type: StockMovementType;
  delta: number;
  reason: string | null;
  createdById: string | null;
  clientOpId: string | null;
  createdAt: string;
}

export interface PullResponse {
  products: ServerProduct[];
  customers: ServerCustomer[];
  sales: ServerSale[];
  receivables: ServerReceivable[];
  expenses: ServerExpense[];
  documents: ServerDocument[];
  stockMovements: ServerStockMovement[];
  /** Task 5.1 — the caller's boutique id (additive on the server response).
   * Stored into `meta.orgId` by `pullAll()` below; read back via `getOrgId()`
   * by product-less offline writes (expenses, later customers/adjust/repay)
   * that have no referenced row to derive an org id from. */
  orgId: string;
  serverTime: string;
}

/** Every resource `pullResource()` can refresh independently — the same 7
 * top-level keys the `/api/sync/pull` response carries (`serverTime` is a
 * cursor, not a resource). */
export type ResourceName =
  | 'products'
  | 'customers'
  | 'sales'
  | 'receivables'
  | 'expenses'
  | 'documents'
  | 'stockMovements';

// ---------------------------------------------------------------------------
// Row mappers — server JSON shape -> Dexie Row type.
// ---------------------------------------------------------------------------

function toProductRow(p: ServerProduct): ProductRow {
  return {
    id: p.id,
    organizationId: p.organizationId,
    ref: p.ref,
    name: p.name,
    category: p.category,
    buyPrice: p.buyPrice,
    sellPrice: p.sellPrice,
    prixGros: p.prixGros,
    unite: p.unite,
    qty: p.qty,
    threshold: p.threshold,
    ...(p.imageUrl != null ? { imageUrl: p.imageUrl } : {}),
    ...(p.barcode != null ? { barcode: p.barcode } : {}),
    ...(p.expiryDate != null ? { expiryDate: p.expiryDate } : {}),
    updatedAt: p.updatedAt,
  };
}

function toCustomerRow(c: ServerCustomer): CustomerRow {
  return {
    id: c.id,
    organizationId: c.organizationId,
    name: c.name,
    ...(c.phone != null ? { phone: c.phone } : {}),
    updatedAt: c.updatedAt,
  };
}

function toSaleRow(s: Omit<ServerSale, 'items'>): SaleRow {
  return {
    id: s.id,
    organizationId: s.organizationId,
    number: s.number,
    ...(s.customerId != null ? { customerId: s.customerId } : {}),
    method: s.method,
    total: s.total,
    discount: s.discount,
    cashAmount: s.cashAmount,
    mobileAmount: s.mobileAmount,
    creditAmount: s.creditAmount,
    ...(s.publicToken != null ? { publicToken: s.publicToken } : {}),
    status: s.status,
    ...(s.cancelledAt != null ? { cancelledAt: s.cancelledAt } : {}),
    ...(s.cancelledById != null ? { cancelledById: s.cancelledById } : {}),
    ...(s.cancelReason != null ? { cancelReason: s.cancelReason } : {}),
    ...(s.createdById != null ? { createdById: s.createdById } : {}),
    createdAt: s.createdAt,
  };
}

function toSaleItemRow(it: ServerSaleItem): SaleItemRow {
  return {
    id: it.id,
    saleId: it.saleId,
    ...(it.productId != null ? { productId: it.productId } : {}),
    name: it.name,
    qty: it.qty,
    unitPrice: it.unitPrice,
    buyPrice: it.buyPrice,
  };
}

/** Splits the nested `sale.items[]` server shape into the two flat Dexie
 * tables (`sales` without `items`, `saleItems` carrying `saleId`). Shared by
 * `applyResource('sales', …)` so `pullAll` and `pullResource('sales')` never
 * duplicate the flatten logic. */
function splitSales(serverSales: ServerSale[]): { sales: SaleRow[]; items: SaleItemRow[] } {
  const sales: SaleRow[] = [];
  const items: SaleItemRow[] = [];
  for (const s of serverSales) {
    const { items: serverItems, ...rest } = s;
    sales.push(toSaleRow(rest));
    for (const it of serverItems) {
      items.push(toSaleItemRow(it));
    }
  }
  return { sales, items };
}

function toReceivableRow(r: ServerReceivable): ReceivableRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    customerId: r.customerId,
    ...(r.saleId != null ? { saleId: r.saleId } : {}),
    amount: r.amount,
    amountPaid: r.amountPaid,
    status: r.status,
    updatedAt: r.updatedAt,
  };
}

function toExpenseRow(e: ServerExpense): ExpenseRow {
  return {
    id: e.id,
    organizationId: e.organizationId,
    number: e.number,
    label: e.label,
    category: e.category,
    amount: e.amount,
    ...(e.note != null ? { note: e.note } : {}),
    ...(e.createdById != null ? { createdById: e.createdById } : {}),
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
  };
}

function toDocumentRow(d: ServerDocument): DocumentRow {
  return {
    id: d.id,
    organizationId: d.organizationId,
    type: d.type,
    number: d.number,
    ...(d.saleId != null ? { saleId: d.saleId } : {}),
    ...(d.customerId != null ? { customerId: d.customerId } : {}),
    ...(d.repaymentId != null ? { repaymentId: d.repaymentId } : {}),
    clientName: d.clientName,
    ...(d.clientPhone != null ? { clientPhone: d.clientPhone } : {}),
    status: d.status,
    total: d.total,
    ...(d.balanceAfter != null ? { balanceAfter: d.balanceAfter } : {}),
    ...(d.note != null ? { note: d.note } : {}),
    lines: d.lines,
    ...(d.validityDays != null ? { validityDays: d.validityDays } : {}),
    issuedAt: d.issuedAt,
    createdAt: d.createdAt,
  };
}

function toStockMovementRow(m: ServerStockMovement): StockMovementRow {
  return {
    id: m.id,
    organizationId: m.organizationId,
    productId: m.productId,
    type: m.type,
    delta: m.delta,
    ...(m.reason != null ? { reason: m.reason } : {}),
    ...(m.createdById != null ? { createdById: m.createdById } : {}),
    ...(m.clientOpId != null ? { clientOpId: m.clientOpId } : {}),
    createdAt: m.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Fetch + cursor helpers.
// ---------------------------------------------------------------------------

async function getCursor(): Promise<string | undefined> {
  const row = await db.meta.get(LAST_PULL_KEY);
  return typeof row?.value === 'string' ? row.value : undefined;
}

async function fetchPull(since: string | undefined): Promise<PullResponse> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return api<PullResponse>(`/api/sync/pull${qs}`);
}

/** Writes one resource's rows from an already-fetched `PullResponse` into
 * its Dexie table(s). The single place both `pullAll` and `pullResource`
 * call into, so the mapping/flatten logic (above) is never duplicated. */
async function applyResource(name: ResourceName, res: PullResponse): Promise<void> {
  switch (name) {
    case 'products':
      await db.products.bulkPut(res.products.map(toProductRow));
      return;
    case 'customers':
      await db.customers.bulkPut(res.customers.map(toCustomerRow));
      return;
    case 'sales': {
      const { sales, items } = splitSales(res.sales);
      // sales+saleItems must land together — nest a transaction so a
      // standalone pullResource('sales') call stays atomic too. When
      // called from pullAll's outer transaction (below), Dexie joins the
      // existing transaction instead of opening a second one (both table
      // sets are already in scope).
      await db.transaction('rw', [db.sales, db.saleItems], async () => {
        await db.sales.bulkPut(sales);
        await db.saleItems.bulkPut(items);
      });
      return;
    }
    case 'receivables':
      await db.receivables.bulkPut(res.receivables.map(toReceivableRow));
      return;
    case 'expenses':
      await db.expenses.bulkPut(res.expenses.map(toExpenseRow));
      return;
    case 'documents':
      await db.documents.bulkPut(res.documents.map(toDocumentRow));
      return;
    case 'stockMovements':
      await db.stockMovements.bulkPut(res.stockMovements.map(toStockMovementRow));
      return;
  }
}

const ALL_RESOURCES: readonly ResourceName[] = [
  'products',
  'customers',
  'sales',
  'receivables',
  'expenses',
  'documents',
  'stockMovements',
];

/**
 * Seeds/refreshes every local table from `GET /api/sync/pull`, using the
 * stored `meta.lastPull` cursor for an incremental pull (omitted on the
 * first-ever pull, which fetches a full org snapshot). All writes — the 7
 * resources plus the new cursor — commit in a single Dexie transaction so a
 * failure never leaves a partially-advanced cursor pointing past data that
 * was never persisted.
 */
export async function pullAll(): Promise<void> {
  const since = await getCursor();
  const res = await fetchPull(since);

  await db.transaction(
    'rw',
    [
      db.products,
      db.customers,
      db.sales,
      db.saleItems,
      db.receivables,
      db.expenses,
      db.documents,
      db.stockMovements,
      db.meta,
    ],
    async () => {
      for (const name of ALL_RESOURCES) {
        await applyResource(name, res);
      }
      await db.meta.put({ key: LAST_PULL_KEY, value: res.serverTime });
      // Task 5.1 foundation — store the boutique id alongside the cursor so
      // product-less offline writes (createExpenseOffline, …) can resolve
      // it without a referenced row. Same transaction as the rest of the
      // pull: a failure never leaves `meta.orgId` pointing at data that was
      // never actually persisted.
      await db.meta.put({ key: ORG_ID_KEY, value: res.orgId });
    },
  );
}

/**
 * Reads the boutique id last stored by `pullAll()` (Task 5.1). `null` before
 * the first successful pull has ever completed — callers that need an org id
 * for a product-less offline write (expenses, …) treat that as a hard error
 * (`NO_ORG`) rather than silently guessing.
 */
export async function getOrgId(): Promise<string | null> {
  const row = await db.meta.get(ORG_ID_KEY);
  return typeof row?.value === 'string' ? row.value : null;
}

/**
 * Refreshes a single resource's table(s) on demand (e.g. re-checking stock
 * right before a sale). `/api/sync/pull` has no per-resource filter param —
 * it always returns the full 7-table batch — so this still does a full
 * fetch, but only applies the requested resource's rows.
 *
 * Deliberately does NOT advance `meta.lastPull`: the fetched response may
 * carry newer data for the other 6 resources that this call chose not to
 * persist. Bumping the cursor here would make the next `pullAll()` start
 * its `?since=` window past that unpersisted data, permanently skipping it.
 * Only `pullAll()` — which applies (and therefore accounts for) every
 * resource in the batch — is allowed to move the cursor.
 */
export async function pullResource(name: ResourceName): Promise<void> {
  const since = await getCursor();
  const res = await fetchPull(since);
  await applyResource(name, res);
}
