/**
 * sync-indicator-state.ts — pure state/label logic for `SyncIndicator.tsx`
 * (Task 4.3 of the offline-first plan). Kept dependency-free (besides
 * `ltrIsolate`) and outside the component so it's directly unit-testable
 * without a React render harness — same reasoning `conflict-format.ts` /
 * `useLocalResource.ts` document for their own exported pure helpers.
 */
import { ltrIsolate } from '@/lib/i18n/bidi';

export type SyncIndicatorState = 'idle' | 'pending' | 'conflict' | 'syncing' | 'offline';

export interface SyncIndicatorInput {
  pendingCount: number;
  conflicts: number;
  syncing: boolean;
  online: boolean;
}

/**
 * Single discriminant driving what the indicator shows. Precedence (highest
 * first):
 *   1. `conflict` — a stock mismatch needs a human decision on
 *      `/synchronisation`. `conflicts` (from `useSyncStatus.ts`'s
 *      `countConflicts`) is a live query over `db.conflicts` (the
 *      reconciliation table `sync-engine.ts`'s `applySyncSuccess` writes to
 *      when a sale's response carries `stockConflicts`), summed with any
 *      outbox row still at `status: 'conflict'` (the legacy 409 path used
 *      by `/api/products/[id]/adjust`) — so this state wins even MID-drain:
 *      a conflict recorded by `applySyncSuccess` partway through a drain
 *      flips the indicator to `conflict` immediately, even while `syncing`
 *      is still `true`.
 *   2. `syncing` — a drain is actively in flight (`drainOutbox()` running).
 *   3. `offline` — no network AND there's outbox work stuck behind it; not
 *      shown when there's nothing pending (no point alarming the user about
 *      connectivity when there's nothing to sync).
 *   4. `pending` — outbox rows waiting for the next drain, online.
 *   5. `idle` — nothing to do, up to date.
 */
export function syncIndicatorState({
  pendingCount,
  conflicts,
  syncing,
  online,
}: SyncIndicatorInput): SyncIndicatorState {
  if (conflicts > 0) return 'conflict';
  if (syncing) return 'syncing';
  if (!online && pendingCount > 0) return 'offline';
  if (pendingCount > 0) return 'pending';
  return 'idle';
}

/**
 * Whether the "Synchroniser maintenant" button should be disabled:
 *   - a drain already in flight (`syncing`) — safe no-op if called again
 *     (`drainOutbox()` is single-flight per `useSyncStatus.ts`'s docblock)
 *     but pointless to trigger twice from the UI;
 *   - nothing to do (`pendingCount === 0 && conflicts === 0`).
 *
 * Volontairement PAS désactivé quand `online === false` : `navigator.onLine`
 * ment sur certains téléphones/proxys (portail captif, données mobiles
 * capricieuses) — il peut annoncer « hors ligne » alors que le réseau passe.
 * Le bouton manuel doit toujours tenter RÉELLEMENT : si le réseau est
 * vraiment coupé, la requête échoue vite (timeout 30 s max), la ligne
 * repasse `pending` et rien n'est perdu. `online` reste dans l'input pour
 * l'INDICATEUR (`syncIndicatorState` ci-dessus), pas pour bloquer l'action.
 */
export function isSyncNowDisabled({
  pendingCount,
  conflicts,
  syncing,
}: SyncIndicatorInput): boolean {
  if (syncing) return true;
  if (pendingCount === 0 && conflicts === 0) return true;
  return false;
}

/** i18n `vars` for the `sync.badge.pending` template — isolates the count
 * for RTL (see `lib/i18n/bidi.ts`). */
export function pendingBadgeVars(pendingCount: number): Record<string, string> {
  return { n: ltrIsolate(pendingCount) };
}

/** i18n `vars` for the `sync.badge.conflict` template. */
export function conflictBadgeVars(conflicts: number): Record<string, string> {
  return { n: ltrIsolate(conflicts) };
}

export interface SyncStatusMessage {
  key: string;
  vars?: Record<string, string>;
}

/**
 * Maps a `SyncIndicatorState` to the i18n key (+ vars, when the template
 * needs one) to render as the indicator's status line. Pure — no `t`
 * dependency — so the mapping itself is testable without a translate stub.
 */
export function syncStatusMessage(
  state: SyncIndicatorState,
  { pendingCount, conflicts }: { pendingCount: number; conflicts: number },
): SyncStatusMessage {
  switch (state) {
    case 'conflict':
      return { key: 'sync.badge.conflict', vars: conflictBadgeVars(conflicts) };
    case 'syncing':
      return { key: 'sync.status.syncing' };
    case 'offline':
      return { key: 'sync.status.offline' };
    case 'pending':
      return { key: 'sync.badge.pending', vars: pendingBadgeVars(pendingCount) };
    case 'idle':
      return { key: 'sync.upToDate' };
  }
}
