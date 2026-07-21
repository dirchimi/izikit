'use client';

/**
 * SyncIndicator.tsx — compact sync-status icon for the TopBar, sitting right
 * next to `NotificationBell` (same visual language: a 40px icon button + a
 * count badge). One tap opens `/synchronisation`, which carries the full
 * status line, the "Synchroniser maintenant" button and the conflict/error
 * lists (see `ConflictsManager.tsx`).
 *
 * All the state/label decisions live in `sync-indicator-state.ts` (pure,
 * unit-tested) — this component only wires `useSyncStatus()` +
 * `useOnlineStatus()` to that logic and renders it. The count badge
 * (`SyncCountBadge`) is shared with the sidebar nav item; conflicts (danger)
 * take visual priority over pending (warning), mirroring `syncIndicatorState`.
 */
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { useSyncStatus } from '@/lib/offline/useSyncStatus';
import { ltrIsolate } from '@/lib/i18n/bidi';
import { syncIndicatorState, syncStatusMessage } from './sync-indicator-state';

/** Small pill badge for a count, shared by the top-bar icon and the nav
 * item. Conflicts (danger) take visual priority over pending (warning) —
 * mirrors `syncIndicatorState`'s own precedence. */
export function SyncCountBadge({
  pendingCount,
  conflicts,
}: {
  pendingCount: number;
  conflicts: number;
}) {
  if (conflicts > 0) {
    return (
      <span
        className="bg-danger text-danger-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold"
        aria-hidden="true"
      >
        {conflicts > 99 ? '99+' : ltrIsolate(conflicts)}
      </span>
    );
  }
  if (pendingCount > 0) {
    return (
      <span
        className="bg-warning text-warning-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold"
        aria-hidden="true"
      >
        {pendingCount > 99 ? '99+' : ltrIsolate(pendingCount)}
      </span>
    );
  }
  return null;
}

/** Icon name for a given indicator state — kept here (not in the pure
 * module) since it's a presentational, not a decision, concern. */
export function stateIcon(state: ReturnType<typeof syncIndicatorState>): string {
  switch (state) {
    case 'conflict':
      return 'alert-triangle';
    case 'syncing':
      return 'loader-2';
    case 'offline':
      return 'cloud-off';
    case 'idle':
      return 'check-circle-2';
    default:
      return 'refresh-cw';
  }
}

export default function SyncIndicator() {
  const t = useT();
  const online = useOnlineStatus();
  const { pendingCount, syncing, conflicts } = useSyncStatus();

  const state = syncIndicatorState({ pendingCount, conflicts, syncing, online });
  const message = syncStatusMessage(state, { pendingCount, conflicts });
  const icon = stateIcon(state);

  // Icon-only link to /synchronisation — mirrors NotificationBell's look and
  // sizing so the two sit cleanly side by side in the TopBar.
  return (
    <Link
      href="/synchronisation"
      aria-label={t('nav.sync')}
      title={t(message.key, message.vars)}
      className="text-foreground hover:bg-muted relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors"
    >
      <Icon i={icon} size={19} className={state === 'syncing' ? 'animate-spin' : ''} />
      {(conflicts > 0 || pendingCount > 0) && (
        <span className="absolute top-1 right-1">
          <SyncCountBadge pendingCount={pendingCount} conflicts={conflicts} />
        </span>
      )}
    </Link>
  );
}
