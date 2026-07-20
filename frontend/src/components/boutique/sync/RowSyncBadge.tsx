'use client';

/**
 * RowSyncBadge.tsx — small per-row sync-state pill (Task 6.3 of the
 * offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md).
 *
 * Mounted next to a row's existing number/label on the list screens that now
 * read from the Dexie mirror (`VentesManager`, `DepensesManager`,
 * `RepaymentsView` — see each for the exact wiring) so the shopkeeper can see
 * AT A GLANCE which rows are still waiting on this device's outbox, without
 * opening `/synchronisation`. The state decision itself lives in
 * `row-sync-badge-state.ts` (pure, unit-tested) — this component only wires
 * `useT()` + a couple of Tailwind classes on top of it, mirroring
 * `SyncIndicator.tsx`'s own split between decision and presentation.
 *
 * Renders nothing when the row is already synced (an unobtrusive default —
 * most rows, most of the time) so it never adds visual noise to a
 * fully-synced list.
 */
import { useT } from '@/contexts/LocaleContext';
import { rowSyncBadgeState } from './row-sync-badge-state';

export interface RowSyncBadgeProps {
  /** The row's own `synced` flag (`SaleRow`/`ExpenseRow`/`RepaymentRow`, …). */
  synced: boolean;
  /** Set when this row also has an unresolved stock conflict against it
   * (see `db.ts`'s `ConflictRow`) — takes visual priority over "pending". */
  conflict?: boolean;
}

export default function RowSyncBadge({ synced, conflict = false }: RowSyncBadgeProps) {
  const t = useT();
  const state = rowSyncBadgeState(synced, conflict);

  if (state === 'synced') return null;

  if (state === 'conflict') {
    return (
      <span
        className="bg-danger/10 text-danger font-body inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold"
        title={t('sync.row.conflict')}
      >
        <span aria-hidden="true">⚠</span>
        {t('sync.row.conflict')}
      </span>
    );
  }

  return (
    <span
      className="bg-warning/10 text-warning font-body inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold"
      title={t('sync.row.pending')}
    >
      <span aria-hidden="true">⏳</span>
      {t('sync.row.pending')}
    </span>
  );
}
