/**
 * pull.ts — seed/refresh the local Dexie mirror from `GET /api/sync/pull`
 * (Task 1.3 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 1).
 *
 * The server endpoint (`frontend/src/app/api/sync/pull/route.ts`, Task 1.2)
 * always returns a FULL batch of the 8 org-scoped tables (the original 7 +
 * `repayments`, added Task 5.2) in one round trip — there is no
 * per-resource filter param. `Sale.items` (SaleItem) arrives
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
import { wipeLocalMirror } from './wipe';
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
  type RepaymentRow,
} from './db';

const LAST_PULL_KEY = 'lastPull';
/** Task 5.1 — `meta` key holding the current boutique id, written by
 * `pullAll()` from the response's `orgId` and read back by `getOrgId()`. */
const ORG_ID_KEY = 'orgId';
/** Task 5.3 — `meta` key holding the caller's org role, written by
 * `pullAll()` from the response's `role` and read back by `getRole()`. Feeds
 * an offline-first fallback for ADMIN/OWNER-gated UI (e.g. `StockManager`'s
 * `canManage`) when the live `/api/org/current` role lookup is unreachable —
 * the SERVER still enforces the real role at sync regardless (defense in
 * depth, see `requireOrgRole` on every mutating route). */
const ROLE_KEY = 'role';

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

/** Task 5.2 — server shape of a `Repayment` row, as returned by
 * `/api/sync/pull` (org-scoped, `createdAt > since` filtered — Repayment is
 * append-only/immutable, no `@updatedAt` column). */
interface ServerRepayment {
  id: string;
  organizationId: string;
  customerId: string;
  amount: number;
  method: string;
  note: string | null;
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
  /** Task 5.2 — the org's Repayment rows (append-only, `createdAt`-filtered).
   * Additive on the server response, same shape contract as the other 7
   * resources. */
  repayments: ServerRepayment[];
  /** Task 5.1 — the caller's boutique id (additive on the server response).
   * Stored into `meta.orgId` by `pullAll()` below; read back via `getOrgId()`
   * by product-less offline writes (expenses, later customers/adjust/repay)
   * that have no referenced row to derive an org id from. */
  orgId: string;
  /** Task 5.3 — the caller's role in that boutique (`'OWNER' | 'ADMIN' |
   * 'MEMBER'`, same string the server's `requireOrgRole` compares against —
   * kept as a plain `string` here rather than importing the server-only
   * `OrgRole` type, mirroring how `SessionRow.role` already does it). Stored
   * into `meta.role` by `pullAll()` below; read back via `getRole()`. */
  role: string;
  serverTime: string;
}

/** Every resource `pullResource()` can refresh independently — the same
 * top-level keys the `/api/sync/pull` response carries (`serverTime`/`orgId`
 * are cursors, not resources). */
export type ResourceName =
  | 'products'
  | 'customers'
  | 'sales'
  | 'receivables'
  | 'expenses'
  | 'documents'
  | 'stockMovements'
  | 'repayments';

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

/** `synced: true` unconditionally — mirrors `toRepaymentRow`'s reasoning
 * (Task 6.3 cleanup): every row this mapper sees came FROM the server, so
 * it's authoritative by definition, whether it started as this device's own
 * optimistic insert (now echoed back post-sync, `bulkPut` overwrites cleanly
 * by `id`) or another device's/other-vendeur's history this device never
 * wrote. Marking it `synced: true` is also what makes `purge.ts` treat pulled
 * history as purgeable-when-old — the data is still on the server regardless
 * (viewable online), so bounding local growth from it is correct and
 * desirable, not a data-loss risk. */
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
    synced: true,
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

/** `synced: true` unconditionally — see `toSaleRow`'s doc comment (same
 * reasoning, Task 6.3 cleanup). */
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
    synced: true,
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

/** `synced: true` unconditionally — see `toSaleRow`'s doc comment (same
 * reasoning, Task 6.3 cleanup). */
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
    synced: true,
  };
}

/** Task 5.2 — maps a server `Repayment` row to its Dexie `RepaymentRow`.
 * Always `synced: true`: every row this mapper sees came FROM the server,
 * so it's authoritative by definition — including a row that started life
 * as this device's own optimistic insert (`createRepayOffline`) and is now
 * being echoed back post-sync. `bulkPut` keys on `id`, so the server row
 * cleanly overwrites the local optimistic one rather than duplicating it. */
function toRepaymentRow(r: ServerRepayment): RepaymentRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    customerId: r.customerId,
    amount: r.amount,
    ...(r.method != null ? { method: r.method } : {}),
    ...(r.note != null ? { note: r.note } : {}),
    createdAt: r.createdAt,
    synced: true,
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
    case 'repayments':
      await db.repayments.bulkPut(res.repayments.map(toRepaymentRow));
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
  'repayments',
];

/**
 * Seeds/refreshes every local table from `GET /api/sync/pull`, using the
 * stored `meta.lastPull` cursor for an incremental pull (omitted on the
 * first-ever pull, which fetches a full org snapshot). All writes — the 8
 * resources (including `repayments`, Task 5.2) plus the new cursor — commit
 * in a single Dexie transaction so a failure never leaves a
 * partially-advanced cursor pointing past data that was never persisted.
 */
export async function pullAll(): Promise<void> {
  const since = await getCursor();
  let res = await fetchPull(since);

  // Garde anti-mélange de comptes (même appareil, boutique différente) : si
  // la boutique renvoyée par le serveur n'est pas celle du miroir local, TOUT
  // le miroir appartient à l'ancienne boutique → on le vide puis on re-fetch
  // un snapshot COMPLET (le fetch ci-dessus était incrémental sur le curseur
  // de l'ancienne boutique, donc incomplet pour la nouvelle). Ceinture +
  // bretelles avec la purge d'AuthContext au changement d'utilisateur — cette
  // garde-ci couvre aussi un snapshot de session absent/expiré.
  const storedOrg = await getOrgId();
  if (storedOrg !== null && storedOrg !== res.orgId) {
    await wipeLocalMirror();
    res = await fetchPull(undefined);
  }

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
      db.repayments,
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
      // Task 5.3 foundation — store the caller's role alongside the cursor,
      // same atomicity guarantee (never left pointing at an unpersisted
      // pull). Feeds the offline fallback for `canManage`-style gates.
      await db.meta.put({ key: ROLE_KEY, value: res.role });
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
 * Reads the org role last stored by `pullAll()` (Task 5.3). `null` before the
 * first successful pull has ever completed. This is an OFFLINE FALLBACK only
 * — callers that can reach `/api/org/current` should prefer that live value;
 * this exists so an ADMIN/OWNER-gated UI doesn't hide itself just because the
 * network call failed. The server independently re-checks the real role via
 * `requireOrgRole` on every mutating route, so a stale/forged local value
 * here is not a security concern, only a UI-affordance one.
 */
export async function getRole(): Promise<string | null> {
  const row = await db.meta.get(ROLE_KEY);
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
