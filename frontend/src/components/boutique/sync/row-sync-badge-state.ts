/**
 * row-sync-badge-state.ts — pure state logic for `RowSyncBadge.tsx` (Task 6.3
 * of the offline-first plan). Kept dependency-free and outside the component
 * so it's directly unit-testable without a React render harness — same
 * reasoning `sync-indicator-state.ts` documents for `SyncIndicator.tsx`.
 */

export type RowSyncBadgeState = 'synced' | 'pending' | 'conflict';

/**
 * Single discriminant driving what a per-row sync badge shows. `conflict`
 * wins over `pending` — a row that hit a stock mismatch (see
 * `db.ts`'s `ConflictRow`) needs the shopkeeper's attention on
 * `/synchronisation` regardless of whether it also happens to be `!synced`.
 */
export function rowSyncBadgeState(synced: boolean, conflict = false): RowSyncBadgeState {
  if (conflict) return 'conflict';
  if (!synced) return 'pending';
  return 'synced';
}
