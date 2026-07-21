// @vitest-environment jsdom
/**
 * sync-triggers.ts — companion unit test (Task 2.3).
 *
 * `./sync-engine` and `./outbox` are fully mocked — this module only cares
 * that the right trigger conditions call `drainOutbox()`, not about the
 * drain's internals (already covered by `sync-engine.test.ts`).
 *
 * `navigator.onLine` is redefined per-test via `Object.defineProperty`
 * (jsdom's own property is not configurable-writable by plain assignment).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drainOutbox } from './sync-engine';
import { pendingCount } from './outbox';
import { triggerDrain, installSyncTriggers } from './sync-triggers';

vi.mock('./sync-engine', () => ({
  drainOutbox: vi.fn(),
}));
vi.mock('./outbox', () => ({
  pendingCount: vi.fn(),
  reclaimOrphanedSyncing: vi.fn(),
}));

const mockedDrain = vi.mocked(drainOutbox);
const mockedPendingCount = vi.mocked(pendingCount);

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  mockedDrain.mockReset();
  mockedPendingCount.mockReset();
  mockedDrain.mockResolvedValue({ done: 0, conflicts: 0, errors: 0 });
  mockedPendingCount.mockResolvedValue(0);
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
});

describe('triggerDrain', () => {
  it('calls drainOutbox when online', () => {
    setOnline(true);
    triggerDrain();
    expect(mockedDrain).toHaveBeenCalledTimes(1);
  });

  it('does not call drainOutbox when offline', () => {
    setOnline(false);
    triggerDrain();
    expect(mockedDrain).not.toHaveBeenCalled();
  });

  it('swallows a rejecting drainOutbox without throwing', () => {
    setOnline(true);
    mockedDrain.mockRejectedValueOnce(new Error('boom'));
    expect(() => triggerDrain()).not.toThrow();
  });
});

describe('installSyncTriggers', () => {
  it('fires an initial drain on install', () => {
    const cleanup = installSyncTriggers();
    expect(mockedDrain).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('drains when the window online event fires', () => {
    const cleanup = installSyncTriggers();
    mockedDrain.mockClear();

    window.dispatchEvent(new Event('online'));

    expect(mockedDrain).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('sweeps every 30s when online and pendingCount > 0', async () => {
    vi.useFakeTimers();
    mockedPendingCount.mockResolvedValue(3);
    const cleanup = installSyncTriggers();
    mockedDrain.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockedDrain).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('does not sweep when pendingCount === 0', async () => {
    vi.useFakeTimers();
    mockedPendingCount.mockResolvedValue(0);
    const cleanup = installSyncTriggers();
    mockedDrain.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockedDrain).not.toHaveBeenCalled();
    cleanup();
  });

  it('does not sweep when offline even if pendingCount > 0', async () => {
    vi.useFakeTimers();
    setOnline(false);
    mockedPendingCount.mockResolvedValue(3);
    const cleanup = installSyncTriggers();
    mockedDrain.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockedDrain).not.toHaveBeenCalled();
    cleanup();
  });

  it('cleanup stops further interval and online triggers', async () => {
    vi.useFakeTimers();
    mockedPendingCount.mockResolvedValue(3);
    const cleanup = installSyncTriggers();
    mockedDrain.mockClear();

    cleanup();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockedDrain).not.toHaveBeenCalled();
  });
});
