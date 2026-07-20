/**
 * session.ts — persisted auth snapshot for offline boot (Task 1.4 of the
 * offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 1).
 *
 * Goal: the app can answer "who is logged in" without a network call, so it
 * boots offline. Product decision — an offline session is valid for 7 days
 * (`OFFLINE_SESSION_MAX_AGE_MS`), as a *sliding* window: every successful
 * online `/api/auth/me` calls `saveSession()` again, which bumps `savedAt`
 * and restarts the 7-day clock. After 7 days with no online refresh,
 * `loadSession()` treats the snapshot as absent — the app then requires a
 * reconnect + re-auth, same as today's logged-out path.
 *
 * This is app-runtime client code (not a server module), so `Date.now()` is
 * the right clock to use here — there is no request to derive a trusted
 * server time from while offline.
 *
 * The snapshot is for *identity/boot* only, not authorization: it carries
 * just enough to render "who is this" without a network round-trip.
 * `orgId`/`role` are nullable because `/api/auth/me` doesn't return them
 * today (see `AuthContext.tsx`'s `fetchUser`) — callers that do have them
 * are free to pass them through.
 */
import { db, type SessionRow } from './db';

export interface SessionSnapshot {
  userId: string;
  orgId: string | null;
  role: string | null;
  name: string | null;
  email: string | null;
  /** Epoch ms — when this snapshot was last (re)saved. */
  savedAt: number;
}

export const OFFLINE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Fixed key — the `session` Dexie table only ever holds one row. */
const SESSION_KEY: SessionRow['id'] = 'current';

/**
 * Persists (overwrites) the current session snapshot with `savedAt = now`.
 * Call this after every successful online `/api/auth/me` — that's what
 * makes the 7-day window "sliding" rather than a fixed expiry from first
 * login.
 */
export async function saveSession(snap: Omit<SessionSnapshot, 'savedAt'>): Promise<void> {
  const row: SessionRow = {
    id: SESSION_KEY,
    userId: snap.userId,
    orgId: snap.orgId,
    role: snap.role,
    name: snap.name,
    email: snap.email,
    savedAt: Date.now(),
  };
  await db.session.put(row);
}

/**
 * Returns the persisted snapshot, or `null` if there is none OR it is
 * older than `OFFLINE_SESSION_MAX_AGE_MS` (treated as absent — this is the
 * "sliding window" expiry check, not a delete-on-read; an expired row is
 * simply ignored until the next `saveSession`/`clearSession` touches it).
 */
export async function loadSession(): Promise<SessionSnapshot | null> {
  const row = await db.session.get(SESSION_KEY);
  if (!row) return null;
  if (Date.now() - row.savedAt > OFFLINE_SESSION_MAX_AGE_MS) return null;
  return {
    userId: row.userId,
    orgId: row.orgId,
    role: row.role,
    name: row.name,
    email: row.email,
    savedAt: row.savedAt,
  };
}

/** Deletes the persisted snapshot. Call this on logout (shared-device hygiene). */
export async function clearSession(): Promise<void> {
  await db.session.delete(SESSION_KEY);
}
