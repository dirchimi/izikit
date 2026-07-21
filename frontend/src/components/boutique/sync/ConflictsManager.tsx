'use client';

/**
 * ConflictsManager.tsx — `/synchronisation` reconciliation screen (Task 4.2
 * of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 4).
 *
 * Two independent local-only sections, both read live from Dexie via
 * `useLocalResource` (no network call — this screen works fully offline):
 *
 *   1. « Écarts de stock » — `db.conflicts` rows the sync engine wrote when
 *      a sale synced successfully but the server signalled a stock
 *      shortfall (`sync-engine.ts`'s `applySyncSuccess`, Task 4.2 Change 2).
 *      Actions: link to `/stock` to restock, or dismiss with "Marquer
 *      résolu" once the shopkeeper has reconciled the physical count.
 *
 *   2. « Échecs de synchronisation » — `outbox` rows stuck at `status:
 *      'error'` (a non-conflict 4xx/5xx during replay — see
 *      `sync-engine.ts`'s docblock). "Réessayer" resets the row to
 *      `pending` (`retryOutboxRow`) and immediately kicks a drain
 *      (`triggerDrain`) so the retry doesn't just sit there until the next
 *      online event / 30s sweep.
 *
 * `error: null` is passed to every `AsyncState` — Dexie live-queries don't
 * fail the way a network `useApi` call can (see `pos/VendrePos.tsx` for the
 * same pattern with `useLocalResource`).
 */
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import AsyncState from '@/components/boutique/AsyncState';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocalResource } from '@/lib/offline/useLocalResource';
import { db, type ConflictRow, type OutboxRow } from '@/lib/offline/db';
import { retryOutboxRow } from '@/lib/offline/outbox';
import { triggerDrain } from '@/lib/offline/sync-triggers';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { useSyncStatus } from '@/lib/offline/useSyncStatus';
import { relativeTime } from '@/lib/i18n/relative-time';
import { ltrIsolate } from '@/lib/i18n/bidi';
import { conflictLineVars } from './conflict-format';
import { stateIcon } from './SyncIndicator';
import { syncIndicatorState, isSyncNowDisabled, syncStatusMessage } from './sync-indicator-state';

export default function ConflictsManager() {
  const t = useT();
  const { toast } = useToast();

  // Statut global + synchronisation manuelle (déplacés ici depuis la sidebar).
  // `conflicts` du hook est renommé `conflictCount` pour ne pas masquer la
  // liste `conflicts` (db.conflicts) chargée plus bas.
  const online = useOnlineStatus();
  const {
    pendingCount,
    syncing,
    conflicts: conflictCount,
    lastSyncedAt,
    syncNow,
  } = useSyncStatus();
  const syncState = syncIndicatorState({ pendingCount, conflicts: conflictCount, syncing, online });
  const syncMessage = syncStatusMessage(syncState, { pendingCount, conflicts: conflictCount });
  const syncDisabled = isSyncNowDisabled({
    pendingCount,
    conflicts: conflictCount,
    syncing,
    online,
  });

  async function handleSyncNow() {
    if (syncDisabled) return;
    await syncNow();
  }

  const { data: conflicts, loading: loadingConflicts } = useLocalResource(
    () => db.conflicts.where('resolved').equals(0).toArray(),
    [],
    [],
  );

  const { data: failedRows, loading: loadingFailed } = useLocalResource(
    () => db.outbox.where('status').equals('error').sortBy('seq'),
    [],
    [],
  );

  async function handleResolve(row: ConflictRow) {
    await db.conflicts.update(row.id, { resolved: 1 });
    toast(t('sync.conflict.resolvedToast'), 'success');
  }

  async function handleRetry(row: OutboxRow) {
    if (row.seq === undefined) return; // defensive — Dexie always assigns seq on insert
    await retryOutboxRow(row.seq);
    triggerDrain();
    toast(t('sync.error.retryToast'), 'success');
  }

  return (
    <>
      <TopBar title={t('sync.title')} subtitle={t('sync.subtitle')} />

      {/* Statut global + « Synchroniser maintenant » — le petit bouton sync de
          la TopBar ouvre cet écran. */}
      <div className="px-4 pt-6 md:px-8">
        <div className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                syncState === 'conflict'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon
                i={stateIcon(syncState)}
                size={16}
                className={syncState === 'syncing' ? 'animate-spin' : ''}
              />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="font-body text-foreground text-sm font-semibold">
                {t(syncMessage.key, syncMessage.vars)}
              </span>
              {lastSyncedAt && syncState !== 'syncing' && (
                <span className="text-muted-foreground font-body text-xs">
                  {t('sync.lastSynced', { time: relativeTime(lastSyncedAt, t) })}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSyncNow()}
            disabled={syncDisabled}
            className="border-border bg-surface text-foreground font-body flex shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
          >
            <Icon
              i={syncing ? 'loader-2' : 'refresh-cw'}
              size={14}
              className={syncing ? 'animate-spin' : ''}
            />
            {syncing ? t('sync.button.syncing') : t('sync.button.syncNow')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* Écarts de stock */}
        <section className="flex flex-col gap-3">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('sync.conflicts.heading')}
          </h2>
          <AsyncState
            loading={loadingConflicts}
            error={null}
            isEmpty={conflicts.length === 0}
            emptyLabel={t('sync.conflicts.empty')}
            emptyIcon="check-circle-2"
          >
            <div className="flex flex-col gap-3">
              {conflicts.map((row) => (
                <div
                  key={row.id}
                  className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-warning/10 text-warning flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                      <Icon i="alert-triangle" size={16} />
                    </div>
                    <p className="font-body text-foreground text-sm">
                      {t('sync.conflict.line', conflictLineVars(row))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href="/stock"
                      className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold"
                    >
                      <Icon i="package" size={13} />
                      {t('sync.conflict.adjustStock')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleResolve(row)}
                      className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold"
                    >
                      <Icon i="check" size={13} />
                      {t('sync.conflict.markResolved')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </AsyncState>
        </section>

        {/* Échecs de synchronisation */}
        <section className="flex flex-col gap-3">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('sync.errors.heading')}
          </h2>
          <AsyncState
            loading={loadingFailed}
            error={null}
            isEmpty={failedRows.length === 0}
            emptyLabel={t('sync.errors.empty')}
            emptyIcon="check-circle-2"
          >
            <div className="flex flex-col gap-3">
              {failedRows.map((row) => (
                <div
                  key={row.seq}
                  className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-danger/10 text-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                      <Icon i="x-circle" size={16} />
                    </div>
                    <p className="font-body text-foreground text-sm">
                      {t('sync.error.line', {
                        kind: t(`sync.kind.${row.kind}`),
                        reason: ltrIsolate(row.error ?? t('sync.error.unknown')),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRetry(row)}
                    className="border-border bg-surface text-foreground font-body flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold"
                  >
                    <Icon i="refresh-cw" size={13} />
                    {t('sync.error.retry')}
                  </button>
                </div>
              ))}
            </div>
          </AsyncState>
        </section>
      </div>
    </>
  );
}
