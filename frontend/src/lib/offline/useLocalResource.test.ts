// @vitest-environment jsdom
/**
 * useLocalResource.ts — companion unit test (Task 3.1).
 *
 * The repo has no React render-test harness (no @testing-library/react, and
 * the vitest include glob is `.test.ts` only — see vitest.config.ts). So
 * this file does NOT attempt to render the hook. Instead it covers the two
 * pieces of real logic separately, same pattern as `useSyncStatus.test.ts`:
 *
 *   1. `resolveLocalResult` — the pure undefined→fallback defaulting helper
 *      — exercised directly with plain values (no Dexie/React involved).
 *   2. A representative Dexie querier (`() =>
 *      db.products.where('organizationId').equals(org).toArray()`) run
 *      against `fake-indexeddb`, proving the querier pattern
 *      `useLocalResource` is designed to wrap actually reads rows back out.
 *
 * The `useLiveQuery` composition itself (the hook body) is verified via
 * `pnpm typecheck` + read — see the task report.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db } from './db';
import { resolveLocalResult } from './useLocalResource';

describe('resolveLocalResult', () => {
  it('returns the fallback with loading: true when the live value is undefined', () => {
    const fallback: string[] = [];
    expect(resolveLocalResult(undefined, fallback)).toEqual({ data: fallback, loading: true });
  });

  it('returns the resolved value with loading: false once the live query resolves', () => {
    const resolved = [{ id: 'p1' }];
    expect(resolveLocalResult(resolved, [])).toEqual({ data: resolved, loading: false });
  });

  it('treats a resolved empty array as loaded, not as "still loading"', () => {
    // Distinguishes "no data yet" (undefined) from "queried and empty" ([]).
    expect(resolveLocalResult<string[]>([], ['fallback'])).toEqual({ data: [], loading: false });
  });

  it('treats a resolved falsy-but-defined value (0) as loaded', () => {
    expect(resolveLocalResult<number>(0, -1)).toEqual({ data: 0, loading: false });
  });
});

describe('representative Dexie querier (products by organizationId)', () => {
  it('seeds a row and reads it back via the querier pattern useLocalResource wraps', async () => {
    await db.products.put({
      id: 'p1',
      organizationId: 'o1',
      ref: 'RIZ-1',
      name: 'Riz',
      category: 'Alimentation',
      buyPrice: 400,
      sellPrice: 500,
      prixGros: 0,
      unite: 'piece',
      qty: 5,
      threshold: 2,
      updatedAt: '2026-07-20T00:00:00Z',
    });

    const querier = () => db.products.where('organizationId').equals('o1').toArray();
    const rows = await querier();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Riz');

    // Feeding the querier's resolved result through resolveLocalResult
    // matches what the hook returns once useLiveQuery settles.
    expect(resolveLocalResult(rows, [])).toEqual({ data: rows, loading: false });
  });

  it('an org with no rows resolves to an empty array, not undefined', async () => {
    const querier = () => db.products.where('organizationId').equals('missing-org').toArray();
    const rows = await querier();

    expect(rows).toEqual([]);
    expect(resolveLocalResult(rows, [])).toEqual({ data: [], loading: false });
  });
});
