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
 *
 * Réessai rapide (connexions instables) : quand un drain s'arrête sur une
 * coupure transitoire (`DrainResult.stopped` — voir sync-engine.ts), attendre
 * le balayage de 30 s fait ramer la file sur les réseaux qui flanchent par
 * à-coups de quelques secondes (cas courant au Tchad). On programme donc un
 * réessai en escalier — 3 s, puis 8 s, puis 20 s, en boucle — tant qu'il
 * reste des lignes et que l'arrêt est transitoire. L'escalier revient à 3 s
 * dès qu'un drain fait AVANCER la file (`done > 0` : la connexion marche par
 * intermittence, on insiste vite) et s'annule sur un drain complet. Chaque
 * tentative est un unique POST léger, single-flight — pas de tempête de
 * requêtes.
 */
import { drainOutbox, type DrainResult } from './sync-engine';
import { pendingCount, reclaimOrphanedSyncing } from './outbox';

const SWEEP_INTERVAL_MS = 30_000;
/** Escalier de réessai après un arrêt transitoire (voir docblock module). */
export const RETRY_DELAYS_MS: readonly number[] = [3_000, 8_000, 20_000];

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;

function cancelRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** Programme le prochain réessai de l'escalier (no-op si un est déjà armé). */
function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const delay = RETRY_DELAYS_MS[retryStep % RETRY_DELAYS_MS.length] ?? SWEEP_INTERVAL_MS;
  retryStep++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void pendingCount().then((count) => {
      if (count > 0) runDrain();
    });
  }, delay);
}

/** Lance un drain et pilote l'escalier de réessai selon son résultat. */
function runDrain(): void {
  void drainOutbox()
    .then((res: DrainResult) => {
      // De la progression ⇒ la connexion marche par intermittence : on
      // repart du bas de l'escalier pour insister rapidement.
      if (res.done > 0) retryStep = 0;
      if (res.stopped) scheduleRetry();
      else retryStep = 0;
    })
    .catch((err: unknown) => {
      console.warn('[sync-triggers] drainOutbox failed', err);
    });
}

/**
 * Fire-and-forget: kicks off a drain if the browser reports connectivity.
 * Never awaited by callers, never throws — `drainOutbox()` already resolves
 * gracefully on its own internal failures, but a caller-side `.catch` is
 * kept defensively in case a future change makes it reject.
 */
export function triggerDrain(): void {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  runDrain();
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

  const handleOnline = () => {
    // Connectivité fraîche ⇒ escalier remis à zéro (le prochain échec
    // réessaiera vite) avant le drain immédiat.
    retryStep = 0;
    triggerDrain();
  };
  window.addEventListener('online', handleOnline);

  const interval = setInterval(() => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    void pendingCount().then((count) => {
      if (count > 0) triggerDrain();
    });
  }, SWEEP_INTERVAL_MS);

  // Récupère tout de suite (même hors-ligne) les lignes orphelines en `syncing`
  // — un drain interrompu en plein POST (app fermée/rechargée) laisse sinon le
  // spinner « Synchronisation… » bloqué à vie et le bouton désactivé, y compris
  // hors-ligne où `triggerDrain()` ci-dessous ne s'exécute pas. `drainOutbox`
  // fait déjà ce reclaim en ligne ; ceci couvre le cas chargé hors-ligne.
  void reclaimOrphanedSyncing();

  // Initial sweep — the app may have launched with a non-empty queue while
  // already online (e.g. a previous drain stopped mid-way on a network
  // blip, per sync-engine.ts's docblock).
  triggerDrain();

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(interval);
    cancelRetry();
  };
}
