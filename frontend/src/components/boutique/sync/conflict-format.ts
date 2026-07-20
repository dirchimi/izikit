/**
 * conflict-format.ts — pure formatting helper for `ConflictsManager.tsx`
 * (Task 4.2 of the offline-first plan).
 *
 * Kept out of the component (and dependency-free) so it's directly
 * unit-testable without a React render harness — same reasoning
 * `useLocalResource.ts`/`useSyncStatus.ts` document for exporting their own
 * pure/query helpers.
 */
import type { ConflictRow } from '@/lib/offline/db';
import { ltrIsolate } from '@/lib/i18n/bidi';

/**
 * Maps a `ConflictRow` to the `vars` object for the `sync.conflict.line`
 * i18n template (`t('sync.conflict.line', conflictLineVars(row))`). Every
 * numeric/number-derived value is wrapped with `ltrIsolate` — interpolated
 * into Arabic text, an un-isolated number/reference like "V-0001" or "3"
 * gets visually reordered by the BiDi algorithm (see `lib/i18n/bidi.ts`).
 */
export function conflictLineVars(row: ConflictRow): Record<string, string> {
  return {
    saleNumber: ltrIsolate(row.saleNumber),
    productName: row.productName,
    shortfall: ltrIsolate(row.shortfall),
    requested: ltrIsolate(row.requested),
    available: ltrIsolate(row.available),
  };
}
