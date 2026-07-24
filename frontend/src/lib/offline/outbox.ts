/**
 * outbox.ts — persistent client write-queue (Task 2.1 of the offline-first
 * plan; see docs/superpowers/plans/2026-07-20-offline-first-boutique.md,
 * PHASE 2).
 *
 * This module is queue CRUD ONLY — enqueue an op, list what's pending,
 * transition its status. It does NOT talk to the network and does NOT drain
 * the queue; that's `sync-engine.ts` (Task 2.2), which reads rows via
 * `listPending()`, POSTs `payload` to `endpoint`, and calls
 * `markSyncing`/`markDone`/`markConflict`/`markError` as it goes.
 *
 * Row shape (`OutboxRow`) lives in `./db.ts` (the schema source of truth) —
 * this file only adds the typed, documented operations on top of it. The
 * Dexie table is declared `'++seq, status, kind, opId, createdAt'`: `seq` is
 * an auto-incrementing primary key AND the row's only identifier (no
 * separate `id` column), so every mutator below takes `seq: number`.
 *
 * `pendingCount()` — the set backing the "N à synchroniser" nav badge — is
 * deliberately `pending + syncing + error`, NOT `conflict`. A `conflict` row
 * (e.g. a stock-shortfall signal from the server) needs a human decision on
 * the dedicated conflicts screen (PHASE 4), so it's surfaced separately
 * rather than inflating the generic "still needs syncing" counter. `done`
 * rows are terminal-success and excluded, obviously.
 */
import { db, type OutboxRow, type OutboxStatus } from './db';
import { getOrgId } from './pull';

export type { OutboxRow, OutboxStatus };

/** The mutation domains PHASE 3/5 enqueue. Kept in sync with the plan's
 * domain list (vente, dépense, remboursement, ajustement stock, client,
 * annulation de vente). */
export type OutboxKind = 'sale' | 'expense' | 'repay' | 'adjust' | 'customer' | 'cancel';

/** Statuses counted toward `pendingCount()` — everything not yet terminal
 * (`done`) and not awaiting a human conflict resolution (`conflict`). */
const PENDING_COUNT_STATUSES: readonly OutboxStatus[] = ['pending', 'syncing', 'error'];

/**
 * Inserts a new queue entry with `status: 'pending'`, an auto-assigned
 * monotonic `seq`, and `createdAt` set to now (ISO). Returns the full row
 * (including the generated `seq`) so callers can reference it immediately
 * (e.g. to patch the local entity once the op is later mapped to a server
 * id).
 */
export async function enqueue(input: {
  kind: OutboxKind;
  payload: unknown;
  opId: string;
  endpoint: string;
}): Promise<OutboxRow> {
  // Estampille la boutique courante (meta.orgId, posé par pullAll) : c'est ce
  // qui empêche `listPending()` de rejouer cette écriture sous la session
  // d'un AUTRE compte après un changement de compte sur le même appareil.
  // `null` avant le tout premier pull → ligne non estampillée, traitée comme
  // « boutique courante » (elle vient forcément d'être créée par la session
  // active).
  const orgId = await getOrgId().catch(() => null);
  const row: OutboxRow = {
    status: 'pending',
    kind: input.kind,
    payload: input.payload,
    opId: input.opId,
    endpoint: input.endpoint,
    ...(orgId !== null ? { orgId } : {}),
    createdAt: new Date().toISOString(),
  };
  const seq = await db.outbox.add(row);
  return { ...row, seq };
}

/**
 * Rows still waiting to be replayed, in FIFO (ascending `seq`) order — the
 * order `sync-engine.ts` must POST them in to preserve causality (e.g. a
 * sale before a repay against it). Only `status: 'pending'` rows are
 * returned; `syncing`/`error`/`conflict` rows are the sync engine's own
 * concern (retry scheduling, conflict surfacing) and intentionally excluded
 * here to keep this function simple.
 *
 * Filtre par boutique : une ligne estampillée d'un `orgId` différent de la
 * boutique courante (`meta.orgId`) n'est PAS servie — la rejouer sous la
 * session d'un autre compte l'enregistrerait dans la mauvaise boutique
 * côté serveur. Elle reste `pending` et repartira quand son compte se
 * reconnectera sur cet appareil. Une ligne SANS estampille (héritage
 * d'avant ce champ) est toujours servie (comportement mono-compte
 * historique) ; quand `meta.orgId` est absent (miroir tout juste purgé,
 * premier pull pas encore passé), seules ces lignes-là partent — le FIFO
 * par boutique est préservé (la causalité n'existe qu'à l'intérieur d'une
 * même boutique).
 */
export async function listPending(): Promise<OutboxRow[]> {
  const rows = await db.outbox.where('status').equals('pending').sortBy('seq');
  const currentOrg = await getOrgId().catch(() => null);
  return rows.filter((r) => r.orgId == null || r.orgId === currentOrg);
}

/** Marks a row as currently being replayed (set right before the POST). */
export async function markSyncing(seq: number): Promise<void> {
  await db.outbox.update(seq, { status: 'syncing' });
}

/** Marks a row as successfully replayed (terminal — excluded from `pendingCount()`). */
export async function markDone(seq: number): Promise<void> {
  await db.outbox.update(seq, { status: 'done' });
}

/**
 * Marks a row as needing human resolution (e.g. the server signalled a
 * stock shortfall). `reason` is stored on the row's `error` field for
 * display on the conflicts screen (PHASE 4).
 */
export async function markConflict(seq: number, reason: string): Promise<void> {
  await db.outbox.update(seq, { status: 'conflict', error: reason });
}

/**
 * Marks a row as failed (non-conflict 4xx, or the sync engine giving up
 * after retries). `reason` is stored on `error`; `retryAt` (ISO), when
 * given, is the backoff schedule the sync engine consults before retrying —
 * omitted entirely (not set to `undefined`) when the caller has no backoff
 * to record, per `exactOptionalPropertyTypes`.
 */
export async function markError(seq: number, reason: string, retryAt?: string): Promise<void> {
  const changes: Partial<OutboxRow> = { status: 'error', error: reason };
  if (retryAt !== undefined) {
    changes.retryAt = retryAt;
  }
  await db.outbox.update(seq, changes);
}

/**
 * Resets an `error` row back to `pending` (Task 4.2 — the manual
 * « Réessayer » action on the `/synchronisation` screen's "Échecs de
 * synchronisation" section). The row's `error`/`retryAt` fields are left as
 * they were — they describe the PREVIOUS attempt and are simply overwritten
 * again by `markError`/`markDone` on the next drain; nothing reads them
 * while the row is `pending`. The caller is expected to also kick a drain
 * (e.g. `triggerDrain()`) so the retry actually runs — this function only
 * makes the row visible to `listPending()` again.
 */
export async function retryOutboxRow(seq: number): Promise<void> {
  await db.outbox.update(seq, { status: 'pending' });
}

/**
 * Resets rows orphaned at `status: 'syncing'` back to `pending`. A row is
 * flipped to `syncing` right before its POST (`markSyncing`); if the JS context
 * is torn down mid-POST (tab closed, reload, crash), the in-memory single-flight
 * lock is lost but the row stays `syncing` in IndexedDB — invisible to
 * `listPending()` forever, so the sync indicator sticks on "Synchronisation…"
 * and the "Synchroniser maintenant" button stays permanently disabled.
 *
 * Call this ONLY when no drain is live: the sync engine calls it while holding
 * the single-flight guard, and the triggers call it once at install (before any
 * drain). Any `syncing` row is then, by definition, orphaned. Replay is
 * idempotent (client id / clientOpId), so re-POSTing a reclaimed row is safe.
 */
export async function reclaimOrphanedSyncing(): Promise<void> {
  await db.outbox.where('status').equals('syncing').modify({ status: 'pending' });
}

/**
 * Count of rows not yet in a terminal-success state: `pending` + `syncing`
 * + `error`. `conflict` rows are deliberately excluded — see the module
 * docblock. This backs the "N à synchroniser" badge.
 */
export async function pendingCount(): Promise<number> {
  return db.outbox
    .where('status')
    .anyOf(...PENDING_COUNT_STATUSES)
    .count();
}
