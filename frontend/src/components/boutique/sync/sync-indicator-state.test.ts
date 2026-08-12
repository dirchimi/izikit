/**
 * sync-indicator-state.ts — companion unit tests (Task 4.3).
 *
 * Pure state/label logic extracted out of `SyncIndicator.tsx` so it's
 * testable without a React render harness (this repo has none — see
 * `conflict-format.test.ts` for the same reasoning).
 */
import { describe, it, expect } from 'vitest';
import {
  syncIndicatorState,
  isSyncNowDisabled,
  pendingBadgeVars,
  conflictBadgeVars,
  syncStatusMessage,
} from './sync-indicator-state';

const base = { pendingCount: 0, conflicts: 0, syncing: false, online: true };

describe('syncIndicatorState', () => {
  it('is "idle" when there is nothing pending, no conflicts, not syncing, online', () => {
    expect(syncIndicatorState(base)).toBe('idle');
  });

  it('is "pending" when there are pending rows and the device is online', () => {
    expect(syncIndicatorState({ ...base, pendingCount: 3 })).toBe('pending');
  });

  it('is "offline" when there are pending rows but no network', () => {
    expect(syncIndicatorState({ ...base, pendingCount: 3, online: false })).toBe('offline');
  });

  it('is "idle", not "offline", when offline with nothing pending', () => {
    expect(syncIndicatorState({ ...base, online: false })).toBe('idle');
  });

  it('is "syncing" when a drain is in flight, even with pending rows', () => {
    expect(syncIndicatorState({ ...base, pendingCount: 2, syncing: true })).toBe('syncing');
  });

  it('is "conflict" whenever conflicts > 0, taking priority over syncing/pending', () => {
    expect(syncIndicatorState({ ...base, conflicts: 1 })).toBe('conflict');
    expect(syncIndicatorState({ ...base, conflicts: 1, syncing: true })).toBe('conflict');
    expect(syncIndicatorState({ ...base, conflicts: 1, pendingCount: 5, online: false })).toBe(
      'conflict',
    );
  });
});

describe('isSyncNowDisabled', () => {
  it('is disabled when nothing to do', () => {
    expect(isSyncNowDisabled(base)).toBe(true);
  });

  it('is disabled while a drain is already in flight', () => {
    expect(isSyncNowDisabled({ ...base, pendingCount: 2, syncing: true })).toBe(true);
  });

  it('stays ENABLED when the browser claims offline (navigator.onLine lies on some devices) — the manual attempt is the source of truth', () => {
    expect(isSyncNowDisabled({ ...base, pendingCount: 2, online: false })).toBe(false);
  });

  it('is enabled when there are pending rows, online, not syncing', () => {
    expect(isSyncNowDisabled({ ...base, pendingCount: 2 })).toBe(false);
  });

  it('is enabled when there are only conflicts (no pending rows) — a manual drain is a safe no-op', () => {
    expect(isSyncNowDisabled({ ...base, conflicts: 1 })).toBe(false);
  });
});

describe('pendingBadgeVars / conflictBadgeVars', () => {
  it('isolates the pending count for RTL', () => {
    expect(pendingBadgeVars(7)).toEqual({ n: '⁦7⁩' });
  });

  it('isolates the conflict count for RTL', () => {
    expect(conflictBadgeVars(2)).toEqual({ n: '⁦2⁩' });
  });
});

describe('syncStatusMessage', () => {
  it('maps "idle" to sync.upToDate with no vars', () => {
    expect(syncStatusMessage('idle', { pendingCount: 0, conflicts: 0 })).toEqual({
      key: 'sync.upToDate',
    });
  });

  it('maps "pending" to sync.badge.pending with the isolated count', () => {
    expect(syncStatusMessage('pending', { pendingCount: 4, conflicts: 0 })).toEqual({
      key: 'sync.badge.pending',
      vars: { n: '⁦4⁩' },
    });
  });

  it('maps "conflict" to sync.badge.conflict with the isolated count', () => {
    expect(syncStatusMessage('conflict', { pendingCount: 0, conflicts: 2 })).toEqual({
      key: 'sync.badge.conflict',
      vars: { n: '⁦2⁩' },
    });
  });

  it('maps "syncing" to sync.status.syncing with no vars', () => {
    expect(syncStatusMessage('syncing', { pendingCount: 1, conflicts: 0 })).toEqual({
      key: 'sync.status.syncing',
    });
  });

  it('maps "offline" to sync.status.offline with no vars', () => {
    expect(syncStatusMessage('offline', { pendingCount: 1, conflicts: 0 })).toEqual({
      key: 'sync.status.offline',
    });
  });
});
