'use client';

/**
 * SyncIndicator.tsx — sync badge + "Synchroniser maintenant" button + nav
 * badge (Task 4.3 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 4).
 *
 * All the state/label decisions live in `sync-indicator-state.ts` (pure,
 * unit-tested) — this component only wires `useSyncStatus()` +
 * `useOnlineStatus()` to that logic and renders it, mirroring the
 * SidebarNav connection dot's look (`bg-muted` pill, small dot + label).
 *
 * Two render modes:
 *   - Full (default) — the state line + "Synchroniser maintenant" button,
 *     mounted in `SidebarNav.tsx` right under the connection-status pill
 *     (desktop sidebar AND the mobile drawer, since the drawer renders the
 *     same `SidebarNav`).
 *   - `compact` — an icon-only link to `/synchronisation` with a badge
 *     overlay, mounted in `AppShell.tsx`'s mobile header so the status is
 *     visible without opening the drawer (same visual language as
 *     `NotificationBell`'s bell + count badge).
 */
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { useSyncStatus } from '@/lib/offline/useSyncStatus';
import { relativeTime } from '@/lib/i18n/relative-time';
import { ltrIsolate } from '@/lib/i18n/bidi';
import { syncIndicatorState, isSyncNowDisabled, syncStatusMessage } from './sync-indicator-state';

/** Small pill badge for a count, shared by the compact icon and the nav
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
function stateIcon(state: ReturnType<typeof syncIndicatorState>): string {
  switch (state) {
    case 'conflict':
      return 'alert-triangle';
    case 'syncing':
      return 'loader-2';
    case 'offline':
      return 'cloud-off';
    default:
      return 'refresh-cw';
  }
}

export default function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const online = useOnlineStatus();
  const { pendingCount, syncing, conflicts, lastSyncedAt, syncNow } = useSyncStatus();

  const state = syncIndicatorState({ pendingCount, conflicts, syncing, online });
  const disabled = isSyncNowDisabled({ pendingCount, conflicts, syncing, online });
  const message = syncStatusMessage(state, { pendingCount, conflicts });
  const icon = stateIcon(state);

  async function handleSyncNow() {
    if (disabled) return;
    await syncNow();
  }

  if (compact) {
    // Icon-only variant — mobile header (AppShell.tsx). No button here: tap
    // through to /synchronisation, which has its own actions.
    return (
      <Link
        href="/synchronisation"
        aria-label={t('nav.sync')}
        title={t(message.key, message.vars)}
        className="text-sidebar-foreground relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
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

  // Full variant — sidebar block under the connection-status pill.
  return (
    <div className="bg-muted mx-4 mt-1 mb-1 flex flex-col gap-2 rounded-md px-3 py-2">
      <Link href="/synchronisation" className="flex items-center gap-2">
        <Icon
          i={icon}
          size={14}
          className={`shrink-0 ${state === 'conflict' ? 'text-danger' : 'text-muted-foreground'} ${
            state === 'syncing' ? 'animate-spin' : ''
          }`}
        />
        <span className="text-muted-foreground font-body flex-1 truncate text-xs font-semibold">
          {t(message.key, message.vars)}
        </span>
      </Link>

      {lastSyncedAt && state !== 'syncing' && (
        <span className="text-muted-foreground font-body px-[1px] text-[10px] opacity-70">
          {t('sync.lastSynced', { time: relativeTime(lastSyncedAt, t) })}
        </span>
      )}

      <button
        type="button"
        onClick={() => void handleSyncNow()}
        disabled={disabled}
        className="border-border bg-surface text-foreground font-body flex items-center justify-center gap-2 rounded-md border px-2 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
      >
        <Icon
          i={syncing ? 'loader-2' : 'refresh-cw'}
          size={13}
          className={syncing ? 'animate-spin' : ''}
        />
        {syncing ? t('sync.button.syncing') : t('sync.button.syncNow')}
      </button>
    </div>
  );
}
