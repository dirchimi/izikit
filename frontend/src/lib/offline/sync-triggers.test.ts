// @vitest-environment jsdom
/**
 * sync-triggers.ts — companion unit test (Task 2.3 + escalier de réessai).
 *
 * `./sync-engine` and `./outbox` are fully mocked — this module only cares
 * that the right trigger conditions call `drainOutbox()`, not about the
 * drain's internals (already covered by `sync-engine.test.ts`).
 *
 * Les mocks passent par une indirection (`() => drainOutbox()`) : chaque test
 * fait `vi.resetModules()` + import dynamique pour remettre à zéro l'état
 * module de sync-triggers (retryStep/retryTimer de l'escalier) — la fabrique
 * de mock est re-exécutée à chaque re-import mais délègue toujours au même
 * spy externe, donc les compteurs d'appels restent observables.
 *
 * `navigator.onLine` is redefined per-test via `Object.defineProperty`
 * (jsdom's own property is not configurable-writable by plain assignment).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DrainResult } from './sync-engine';

const drainOutbox = vi.fn<() => Promise<DrainResult>>();
const pendingCount = vi.fn<() => Promise<number>>();

vi.mock('./sync-engine', () => ({ drainOutbox: () => drainOutbox() }));
vi.mock('./outbox', () => ({
  pendingCount: () => pendingCount(),
  reclaimOrphanedSyncing: () => Promise.resolve(0),
}));

function result(partial: Partial<DrainResult>): DrainResult {
  return { done: 0, conflicts: 0, errors: 0, stopped: false, ...partial };
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

/** Laisse les micro-tâches (then-chains du drain) se vider. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function loadTriggers() {
  return import('./sync-triggers');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  drainOutbox.mockReset();
  pendingCount.mockReset();
  drainOutbox.mockResolvedValue(result({}));
  pendingCount.mockResolvedValue(0);
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
});

describe('triggerDrain', () => {
  it('calls drainOutbox when online', async () => {
    const { triggerDrain } = await loadTriggers();
    triggerDrain();
    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });

  it('does not call drainOutbox when offline', async () => {
    const { triggerDrain } = await loadTriggers();
    setOnline(false);
    triggerDrain();
    expect(drainOutbox).not.toHaveBeenCalled();
  });

  it('swallows a rejecting drainOutbox without throwing', async () => {
    const { triggerDrain } = await loadTriggers();
    drainOutbox.mockRejectedValueOnce(new Error('boom'));
    expect(() => triggerDrain()).not.toThrow();
    await flushMicrotasks();
  });
});

describe('installSyncTriggers', () => {
  it('fires an initial drain on install', async () => {
    const { installSyncTriggers } = await loadTriggers();
    const cleanup = installSyncTriggers();
    expect(drainOutbox).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('drains when the window online event fires', async () => {
    const { installSyncTriggers } = await loadTriggers();
    const cleanup = installSyncTriggers();
    drainOutbox.mockClear();

    window.dispatchEvent(new Event('online'));

    expect(drainOutbox).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('sweeps every 30s when online and pendingCount > 0', async () => {
    pendingCount.mockResolvedValue(3);
    const { installSyncTriggers } = await loadTriggers();
    const cleanup = installSyncTriggers();
    await flushMicrotasks();
    drainOutbox.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(drainOutbox).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('does not sweep when pendingCount === 0', async () => {
    pendingCount.mockResolvedValue(0);
    const { installSyncTriggers } = await loadTriggers();
    const cleanup = installSyncTriggers();
    await flushMicrotasks();
    drainOutbox.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(drainOutbox).not.toHaveBeenCalled();
    cleanup();
  });

  it('does not sweep when offline even if pendingCount > 0', async () => {
    setOnline(false);
    pendingCount.mockResolvedValue(3);
    const { installSyncTriggers } = await loadTriggers();
    const cleanup = installSyncTriggers();
    await flushMicrotasks();
    drainOutbox.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(drainOutbox).not.toHaveBeenCalled();
    cleanup();
  });

  it('cleanup stops further interval and online triggers', async () => {
    pendingCount.mockResolvedValue(3);
    const { installSyncTriggers } = await loadTriggers();
    const cleanup = installSyncTriggers();
    await flushMicrotasks();
    drainOutbox.mockClear();

    cleanup();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(drainOutbox).not.toHaveBeenCalled();
  });
});

describe('escalier de réessai (connexions instables)', () => {
  beforeEach(() => {
    pendingCount.mockResolvedValue(1);
  });

  it('un drain arrêté (stopped) programme un réessai à 3 s — pas 30 s', async () => {
    const { triggerDrain } = await loadTriggers();
    drainOutbox.mockResolvedValue(result({ stopped: true }));

    triggerDrain();
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(1);

    // Avant 3 s : rien.
    await vi.advanceTimersByTimeAsync(2_900);
    expect(drainOutbox).toHaveBeenCalledTimes(1);

    // À 3 s : le réessai part (file non vide, en ligne).
    await vi.advanceTimersByTimeAsync(200);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(2);
  });

  it("l'escalier monte (3 s puis 8 s) quand les arrêts se répètent sans progression", async () => {
    const { triggerDrain } = await loadTriggers();
    drainOutbox.mockResolvedValue(result({ stopped: true }));

    triggerDrain();
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(3_100);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(2); // réessai n°1 (3 s)

    // Le 2e réessai est à 8 s (armé pendant le 1er réessai, vers t≈3 s) :
    // rien à t≈10 s…
    await vi.advanceTimersByTimeAsync(7_000);
    expect(drainOutbox).toHaveBeenCalledTimes(2);
    // …et il part une fois les 8 s écoulées (t≈11,5 s).
    await vi.advanceTimersByTimeAsync(1_500);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(3);
  });

  it('de la progression (done > 0) remet l’escalier à 3 s même si le drain reste stoppé', async () => {
    const { triggerDrain } = await loadTriggers();
    // 1er drain : stoppé sans progression → prochain à 3 s.
    drainOutbox.mockResolvedValueOnce(result({ stopped: true }));
    // 2e drain (le réessai) : avance de 2 lignes PUIS coupe → l'escalier doit
    // repartir du bas (3 s), pas monter à 8 s.
    drainOutbox.mockResolvedValueOnce(result({ done: 2, stopped: true }));
    drainOutbox.mockResolvedValue(result({ stopped: true }));

    triggerDrain();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(3_100);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(2);

    // Progression au 2e drain ⇒ réessai suivant de nouveau à ~3 s.
    await vi.advanceTimersByTimeAsync(3_100);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(3);
  });

  it('un drain complet (stopped: false) n’arme aucun réessai', async () => {
    const { triggerDrain } = await loadTriggers();
    drainOutbox.mockResolvedValue(result({ done: 3 }));

    triggerDrain();
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(25_000);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });

  it('le réessai est un no-op si la file s’est vidée entre-temps', async () => {
    const { triggerDrain } = await loadTriggers();
    drainOutbox.mockResolvedValue(result({ stopped: true }));

    triggerDrain();
    await flushMicrotasks();

    pendingCount.mockResolvedValue(0);
    await vi.advanceTimersByTimeAsync(3_100);
    await flushMicrotasks();
    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });
});
