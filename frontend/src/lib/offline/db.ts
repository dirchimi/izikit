/**
 * db.ts — Dexie (IndexedDB) local database schema for offline-first boutique.
 *
 * This is the client-side mirror of the server tables the boutique app
 * needs while offline (see docs/superpowers/plans/2026-07-20-offline-first-boutique.md,
 * PHASE 1). Row shapes intentionally mirror the Prisma models in
 * `frontend/prisma/schema.prisma` field-for-field (id, organizationId, the
 * display/calc fields) so `pull.ts` (Task 1.2/1.3) can `bulkPut` server
 * JSON straight into these tables with no reshaping. Server `DateTime`
 * columns are stored as ISO strings (IndexedDB has no native Date index
 * ordering guarantee across environments; ISO strings sort correctly as
 * plain strings and round-trip through `JSON` without a reviver).
 *
 * Two tables have no server counterpart:
 *   - `outbox` — the offline write queue (Phase 2 `sync-engine.ts` drains
 *     it in `seq` order). Auto-incrementing `seq` gives a stable replay
 *     order independent of wall-clock skew between devices.
 *   - `session` / `meta` — `session` holds the persisted auth snapshot
 *     (Task 1.4) so the app can boot with no network; `meta` is a small
 *     key/value store (e.g. `lastPull` cursor for Task 1.3).
 *
 * This file is schema + row types ONLY — no business logic (queueing,
 * sync, mutations) lives here; see `outbox.ts`, `sync-engine.ts`,
 * `pull.ts`, `mutations.ts` for that (later tasks in the same plan).
 */
import Dexie, { type Table } from 'dexie';

// ---------------------------------------------------------------------------
// Row types — mirror the corresponding Prisma model (see schema.prisma).
// ---------------------------------------------------------------------------

export interface ProductRow {
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
  imageUrl?: string;
  barcode?: string;
  expiryDate?: string; // ISO
  updatedAt: string; // ISO
}

export interface CustomerRow {
  id: string;
  organizationId: string;
  name: string;
  phone?: string;
  updatedAt: string; // ISO
  /** Set locally when the customer was created offline; cleared once the
   * corresponding outbox op reaches `done`. Absent for rows pulled from
   * the server (they are, by definition, already synced). */
  synced?: boolean;
}

export type SaleMethod = 'CASH' | 'MOBILE' | 'CREDIT' | 'MIXED';
export type SaleStatus = 'ACTIVE' | 'CANCELLED';

export interface SaleRow {
  id: string;
  organizationId: string;
  number: string;
  customerId?: string;
  method: SaleMethod;
  total: number;
  discount: number;
  cashAmount: number;
  mobileAmount: number;
  creditAmount: number;
  publicToken?: string;
  status: SaleStatus;
  cancelledAt?: string; // ISO
  cancelledById?: string;
  cancelReason?: string;
  createdById?: string;
  createdAt: string; // ISO — Sale has no `updatedAt` server-side
  synced?: boolean;
}

export interface SaleItemRow {
  id: string;
  saleId: string;
  productId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  buyPrice: number;
}

export type ReceivableStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface ReceivableRow {
  id: string;
  organizationId: string;
  customerId: string;
  saleId?: string;
  amount: number;
  amountPaid: number;
  status: ReceivableStatus;
  updatedAt: string; // ISO
}

export interface ExpenseRow {
  id: string;
  organizationId: string;
  number: string;
  label: string;
  category: string;
  amount: number;
  note?: string;
  createdById?: string;
  occurredAt: string; // ISO
  createdAt: string; // ISO
  synced?: boolean;
}

export type DocumentType = 'FACTURE' | 'PROFORMA' | 'RECU';
export type DocumentStatus = 'PAID' | 'PENDING' | 'CREDIT';

export interface DocumentLine {
  article: string;
  qty: number;
  unitPrice: number;
}

export interface DocumentRow {
  id: string;
  organizationId: string;
  type: DocumentType;
  number: string;
  saleId?: string;
  customerId?: string;
  repaymentId?: string;
  clientName: string;
  clientPhone?: string;
  status: DocumentStatus;
  total: number;
  balanceAfter?: number;
  note?: string;
  lines: DocumentLine[];
  validityDays?: number;
  issuedAt: string; // ISO
  createdAt: string; // ISO
}

export type StockMovementType = 'IN' | 'OUT' | 'ADJUST';

export interface StockMovementRow {
  id: string;
  organizationId: string;
  productId: string;
  type: StockMovementType;
  delta: number;
  reason?: string;
  createdById?: string;
  clientOpId?: string;
  createdAt: string; // ISO
  synced?: boolean;
}

// ---------------------------------------------------------------------------
// Outbox — client write queue (no server counterpart).
// ---------------------------------------------------------------------------

export type OutboxStatus = 'pending' | 'syncing' | 'done' | 'conflict' | 'error';

export interface OutboxRow {
  /** Auto-incremented by Dexie (`++seq`) — gives a stable, monotonic replay
   * order for `drainOutbox()` independent of device clocks. */
  seq?: number;
  status: OutboxStatus;
  /** Mutation kind, e.g. 'sale' | 'expense' | 'repay' | 'adjust' | 'customer'. */
  kind: string;
  /** The request payload to replay (shape depends on `kind`). */
  payload: unknown;
  /** The clientOpId/entity id this op carries — same value the server-side
   * `withIdempotency` dedups on. */
  opId: string;
  createdAt: string; // ISO
  retryAt?: string; // ISO — set by `markError` for backoff
  error?: string;
}

// ---------------------------------------------------------------------------
// Session — persisted auth snapshot for offline boot (Task 1.4).
// ---------------------------------------------------------------------------

export interface SessionRow {
  /** Fixed key — this table only ever holds one row (the current session). */
  id: 'current';
  userId: string;
  organizationId: string;
  role: string;
  name: string;
  email: string;
  savedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Meta — small key/value store (e.g. `lastPull` sync cursor).
// ---------------------------------------------------------------------------

export interface MetaRow {
  key: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// Dexie database.
// ---------------------------------------------------------------------------

class LocalDatabase extends Dexie {
  products!: Table<ProductRow, string>;
  customers!: Table<CustomerRow, string>;
  sales!: Table<SaleRow, string>;
  saleItems!: Table<SaleItemRow, string>;
  receivables!: Table<ReceivableRow, string>;
  expenses!: Table<ExpenseRow, string>;
  documents!: Table<DocumentRow, string>;
  stockMovements!: Table<StockMovementRow, string>;
  outbox!: Table<OutboxRow, number>;
  session!: Table<SessionRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('sahilley-offline');

    this.version(1).stores({
      products:
        'id, organizationId, updatedAt, [organizationId+ref], [organizationId+barcode], [organizationId+category]',
      customers: 'id, organizationId, updatedAt',
      sales: 'id, organizationId, createdAt, [organizationId+number], [organizationId+status]',
      saleItems: 'id, saleId, productId',
      receivables: 'id, organizationId, customerId, updatedAt, [organizationId+status]',
      expenses: 'id, organizationId, createdAt, [organizationId+number], [organizationId+category]',
      documents: 'id, organizationId, issuedAt, [organizationId+type], [organizationId+number]',
      stockMovements: 'id, organizationId, productId, createdAt',
      outbox: '++seq, status, kind, opId, createdAt',
      session: 'id',
      meta: 'key',
    });
  }
}

export const db = new LocalDatabase();
