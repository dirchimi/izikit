// @vitest-environment jsdom
/**
 * session.ts — companion unit test (Task 1.4).
 *
 * Uses `fake-indexeddb/auto` to polyfill `indexedDB`/`IDBKeyRange` on the
 * jsdom global before Dexie opens the database, same pattern as
 * `db.test.ts`.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from './db';
import { saveSession, loadSession, clearSession, OFFLINE_SESSION_MAX_AGE_MS } from './session';

describe('session.ts (offline session persistence)', () => {
  beforeEach(async () => {
    await db.session.clear();
  });

  it('saveSession then loadSession returns the snapshot', async () => {
    await saveSession({
      userId: 'u1',
      orgId: 'o1',
      role: 'OWNER',
      name: 'Awa',
      email: 'awa@example.com',
    });

    const snap = await loadSession();

    expect(snap).not.toBeNull();
    expect(snap?.userId).toBe('u1');
    expect(snap?.orgId).toBe('o1');
    expect(snap?.role).toBe('OWNER');
    expect(snap?.name).toBe('Awa');
    expect(snap?.email).toBe('awa@example.com');
    expect(typeof snap?.savedAt).toBe('number');
  });

  it('saves nullable orgId/role/name/email as null when not provided', async () => {
    await saveSession({ userId: 'u2', orgId: null, role: null, name: null, email: null });

    const snap = await loadSession();

    expect(snap).toEqual({
      userId: 'u2',
      orgId: null,
      role: null,
      name: null,
      email: null,
      savedAt: expect.any(Number),
    });
  });

  it('loadSession returns null when there is no persisted session', async () => {
    const snap = await loadSession();
    expect(snap).toBeNull();
  });

  it('loadSession returns null once the snapshot is older than 7 days (expired)', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await saveSession({ userId: 'u3', orgId: null, role: null, name: null, email: null });

    // Just over the 7-day sliding window.
    vi.spyOn(Date, 'now').mockReturnValue(now + OFFLINE_SESSION_MAX_AGE_MS + 1);

    const snap = await loadSession();
    expect(snap).toBeNull();

    vi.restoreAllMocks();
  });

  it('loadSession still returns the snapshot at exactly the boundary (not yet expired)', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await saveSession({ userId: 'u4', orgId: null, role: null, name: null, email: null });

    vi.spyOn(Date, 'now').mockReturnValue(now + OFFLINE_SESSION_MAX_AGE_MS);

    const snap = await loadSession();
    expect(snap).not.toBeNull();
    expect(snap?.userId).toBe('u4');

    vi.restoreAllMocks();
  });

  it('a fresh saveSession resets the sliding window for an otherwise-expiring session', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await saveSession({ userId: 'u5', orgId: null, role: null, name: null, email: null });

    // 6 days later — still valid — re-save (simulates an online /me refresh).
    const sixDaysLater = now + 6 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(sixDaysLater);
    await saveSession({ userId: 'u5', orgId: null, role: null, name: null, email: null });

    // 6 more days later (12 total, but only 6 since the refresh) — should
    // still be valid because the window slid forward.
    vi.spyOn(Date, 'now').mockReturnValue(sixDaysLater + 6 * 24 * 60 * 60 * 1000);
    const snap = await loadSession();
    expect(snap).not.toBeNull();

    vi.restoreAllMocks();
  });

  it('clearSession removes the persisted row', async () => {
    await saveSession({ userId: 'u6', orgId: null, role: null, name: null, email: null });
    expect(await loadSession()).not.toBeNull();

    await clearSession();

    expect(await loadSession()).toBeNull();
    expect(await db.session.get('current')).toBeUndefined();
  });

  it('saveSession overwrites (single-row table, not multi-row growth)', async () => {
    await saveSession({ userId: 'first', orgId: null, role: null, name: null, email: null });
    await saveSession({ userId: 'second', orgId: null, role: null, name: null, email: null });

    const count = await db.session.count();
    expect(count).toBe(1);
    const snap = await loadSession();
    expect(snap?.userId).toBe('second');
  });
});
