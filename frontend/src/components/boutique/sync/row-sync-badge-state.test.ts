/**
 * row-sync-badge-state.ts — companion unit tests (Task 6.3).
 */
import { describe, it, expect } from 'vitest';
import { rowSyncBadgeState } from './row-sync-badge-state';

describe('rowSyncBadgeState', () => {
  it('is "synced" when synced and no conflict', () => {
    expect(rowSyncBadgeState(true)).toBe('synced');
    expect(rowSyncBadgeState(true, false)).toBe('synced');
  });

  it('is "pending" when not synced and no conflict', () => {
    expect(rowSyncBadgeState(false)).toBe('pending');
    expect(rowSyncBadgeState(false, false)).toBe('pending');
  });

  it('is "conflict" whenever conflict is true, regardless of synced', () => {
    expect(rowSyncBadgeState(true, true)).toBe('conflict');
    expect(rowSyncBadgeState(false, true)).toBe('conflict');
  });

  it('defaults conflict to false when omitted', () => {
    expect(rowSyncBadgeState(true)).toBe('synced');
    expect(rowSyncBadgeState(false)).toBe('pending');
  });
});
