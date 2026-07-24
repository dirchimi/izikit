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

/**
 * Repayment (créance remboursée) — the local echo of a `Repayment` server row
 * (Task 5.2). Seeded two ways: optimistically by `createRepayOffline` (this
 * device's own writes) AND by `pull.ts`'s `toRepaymentRow` mapper, which
 * `bulkPut`s the org's full server-side Repayment history (pre-existing rows
 * + other devices' rows) keyed by `id` — a locally-created repayment that
 * later syncs shares its id with the server row, so the pulled copy cleanly
 * overwrites the optimistic one rather than duplicating it. The
 * money-critical debtor totals (debt / repaid) are still NOT derived from
 * here — they come from the `receivables` table (which IS pulled and
 * reconciled) — so this table only feeds the repayment *timeline* shown on
 * the créances/repayments screens, never a balance.
 *
 * `amount` is the amount ACTUALLY applied (`allocateRepayment`'s `applied`,
 * capped at the total debt), matching what the server persists — never the
 * raw amount the user typed. `createdAt` is the repayment date (may be
 * back-dated via the form's date field, hence stored as given rather than
 * always "now"). `synced` flips true once the outbox `repay` op drains
 * (`sync-engine.ts`'s `applySyncSuccess`) OR once a `pull.ts` refresh echoes
 * the row back from the server (always `true` there — a pulled row is
 * server truth by definition); `applied`/`remainingDebt` are the server's
 * authoritative echo, stored cosmetically when the drain response carries
 * them.
 */
export interface RepaymentRow {
  id: string;
  organizationId: string;
  customerId: string;
  amount: number;
  method?: string; // 'cash' | 'mobile'
  note?: string;
  createdAt: string; // ISO (or back-dated 'YYYY-MM-DD' from the form)
  synced: boolean;
  applied?: number;
  remainingDebt?: number;
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
  /** Mutation kind, e.g. 'sale' | 'expense' | 'repay' | 'adjust' | 'customer'
   * | 'cancel' (see `OutboxKind` in `outbox.ts` for the exact union). */
  kind: string;
  /** The request payload to replay (shape depends on `kind`). */
  payload: unknown;
  /** The clientOpId/entity id this op carries — same value the server-side
   * `withIdempotency` dedups on. */
  opId: string;
  /** The API route this op replays against, e.g. `/api/sales` — what
   * `sync-engine.ts` (Task 2.2) POSTs the `payload` to. */
  endpoint: string;
  /** Boutique à laquelle cette écriture appartient (estampillée par
   * `enqueue()` depuis `meta.orgId`). Non indexé (pas de bump de version
   * Dexie). `listPending()` ne sert que les lignes de la boutique courante :
   * après un changement de compte sur le même appareil, les écritures de
   * l'ancienne boutique ne doivent JAMAIS être rejouées sous la session du
   * nouveau compte (le serveur les enregistrerait dans la mauvaise
   * boutique) — elles attendent le retour de leur compte. Absent sur les
   * lignes d'avant ce champ (traitées comme « boutique courante », le
   * comportement historique mono-compte). */
  orgId?: string;
  createdAt: string; // ISO
  /** ISO — posé par `markDone` au moment où le serveur a accepté l'écriture.
   * Alimente l'historique « Dernières synchronisations » de l'écran
   * `/synchronisation` (voir `sync-history.ts`). Absent sur les lignes
   * terminées avant l'ajout du champ → l'historique retombe sur `createdAt`. */
  syncedAt?: string;
  retryAt?: string; // ISO — set by `markError` for backoff
  /** Failure/conflict reason, set by `markError`/`markConflict`. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Conflicts — local stock-conflict reconciliation queue (Task 4.2). No
// server counterpart: a sale that synced successfully but hit an
// insufficient-server-stock shortfall (see `frontend/src/app/api/sales/route.ts`'s
// `stockConflicts`, Task 4.1) is recorded here so the shopkeeper can review
// it on `/synchronisation` and either restock or dismiss it.
// ---------------------------------------------------------------------------

export interface ConflictRow {
  /** Deterministic `${saleId}:${productId}` — doubles as the dedupe key so a
   * replayed sale (same saleId) never creates a duplicate conflict row for
   * the same product (see `sync-engine.ts`'s `applySyncSuccess`). */
  id: string;
  saleId: string;
  saleNumber: string;
  productId: string;
  productName: string;
  requested: number;
  available: number;
  shortfall: number;
  createdAt: string; // ISO
  /** `0 | 1`, NOT a literal `boolean` — IndexedDB does not accept `boolean`
   * as an indexed key (a boolean-valued indexed property is silently
   * dropped from the index rather than throwing, so
   * `.where('resolved').equals(true)` would never match any row). Storing
   * `0 | 1` keeps the `resolved` index actually queryable. */
  resolved: 0 | 1;
}

// ---------------------------------------------------------------------------
// Session — persisted auth snapshot for offline boot (Task 1.4).
// ---------------------------------------------------------------------------

export interface SessionRow {
  /** Fixed key — this table only ever holds one row (the current session). */
  id: 'current';
  userId: string;
  /** `/api/auth/me` doesn't return org/role today, so these stay `null`
   * until a caller has them to save — the snapshot is for identity/boot,
   * not authorization (see `lib/offline/session.ts`). */
  orgId: string | null;
  role: string | null;
  name: string | null;
  email: string | null;
  /** Epoch ms (not ISO, unlike the other tables) — `session.ts` compares it
   * against `Date.now()` directly for the 7-day sliding-window expiry. */
  savedAt: number;
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
  repayments!: Table<RepaymentRow, string>;
  expenses!: Table<ExpenseRow, string>;
  documents!: Table<DocumentRow, string>;
  stockMovements!: Table<StockMovementRow, string>;
  outbox!: Table<OutboxRow, number>;
  session!: Table<SessionRow, string>;
  meta!: Table<MetaRow, string>;
  conflicts!: Table<ConflictRow, string>;

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

    // Task 4.2 — adds `conflicts` only; every store from version(1) that
    // isn't re-declared here carries its schema forward unchanged (Dexie's
    // incremental versioning contract).
    this.version(2).stores({
      conflicts: 'id, resolved, saleId, [saleId+productId]',
    });

    // Task 5.2 — adds `repayments` (local echo of offline repayments). Indexed
    // on `customerId` (per-debtor timeline) and `createdAt` (period-filtered
    // repayments list, newest-first). `synced` is deliberately NOT indexed: it
    // is a boolean, and IndexedDB silently drops boolean-valued index keys (see
    // `ConflictRow.resolved`'s `0 | 1` note above) — no query ever filters by
    // it (the drain patches by primary key), so an index would be dead weight.
    this.version(3).stores({
      repayments: 'id, customerId, createdAt',
    });

    // Garde anti-mélange de comptes — `pull.ts`'s `countForeignRows` fait un
    // `where('organizationId')` sur les 8 tables miroir ; `repayments` était
    // la seule sans cet index (les 7 autres l'ont depuis la version 1).
    this.version(4).stores({
      repayments: 'id, organizationId, customerId, createdAt',
    });
  }
}

export const db = new LocalDatabase();
