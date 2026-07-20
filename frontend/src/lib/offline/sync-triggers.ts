'use client';

/**
 * sync-triggers.ts — drain triggers (Task 2.3 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 2).
 *
 * `sync-engine.ts` (Task 2.2) knows HOW to drain (`drainOutbox()`, already
 * single-flight via its own module-level lock). This module only decides
 * WHEN to call it:
 *   - once on install (in case the app launched with a non-empty queue
 *     while online — nothing else would kick the first drain);
 *   - whenever the browser regains connectivity (`window`'s `online` event);
 *   - every 30s while online AND the queue is non-empty (a sweep for rows
 *     left `pending` after e.g. a network blip stopped a previous drain
 *     mid-way — see `sync-engine.ts`'s docblock on the network-stop branch).
 *
 * `triggerDrain()` is also exported standalone: Phase 3's `mutations.ts`
 * calls it after every `enqueue()`, and the manual "Synchroniser
 * maintenant" button (Task 2.4) calls it too. Because `drainOutbox()` is
 * single-flight, any number of callers can fire `triggerDrain()` freely
 * without risking a double-POST.
 */
import { drainOutbox } from './sync-engine';
import { pendingCount } from './outbox';

const SWEEP_INTERVAL_MS = 30_000;

/**
 * Fire-and-forget: kicks off a drain if the browser reports connectivity.
 * Never awaited by callers, never throws — `drainOutbox()` already resolves
 * gracefully on its own internal failures, but a caller-side `.catch` is
 * kept defensively in case a future change makes it reject.
 */
export function triggerDrain(): void {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  void drainOutbox().catch((err: unknown) => {
    console.warn('[sync-triggers] drainOutbox failed', err);
  });
}

/**
 * Installs the global drain triggers (online event + periodic sweep) and
 * returns a cleanup function that removes them. SSR-safe: a no-op cleanup
 * is returned when `window` isn't available.
 *
 * Intended to be installed once for the app's lifetime — see
 * `AppShell.tsx`'s `useEffect(() => installSyncTriggers(), [])`.
 */
export function installSyncTriggers(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleOnline = () => triggerDrain();
  window.addEventListener('online', handleOnline);

  const interval = setInterval(() => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    void pendingCount().then((count) => {
      if (count > 0) triggerDrain();
    });
  }, SWEEP_INTERVAL_MS);

  // Initial sweep — the app may have launched with a non-empty queue while
  // already online (e.g. a previous drain stopped mid-way on a network
  // blip, per sync-engine.ts's docblock).
  triggerDrain();

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(interval);
  };
}
