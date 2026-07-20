'use client';

/**
 * useLocalResource.ts — generic reactive local-read React hook (Task 3.1 of
 * the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 3).
 *
 * This is the local (Dexie) counterpart to the network `useApi` hook
 * (`frontend/src/lib/api.ts` consumers) — offline screens read
 * products/sales/customers/etc. live from IndexedDB instead of over the
 * network. Same thin-composition-over-`dexie-react-hooks` pattern as
 * `useSyncStatus.ts`: `useLiveQuery` re-runs `querier` whenever the Dexie
 * tables it reads change, no manual subscribe/teardown needed.
 *
 * Unlike `useSyncStatus.ts` (which always has a concrete default and so
 * never surfaces a loading state), callers here generally want to
 * distinguish "no data yet" (first render / SSR, before the live query has
 * resolved once) from "queried and empty" — hence the `{ data, loading }`
 * shape instead of a bare defaulted value. `useLiveQuery` represents "not
 * resolved yet" as `undefined`, which is also a legitimate value some
 * queriers could theoretically resolve to (though none of this repo's do —
 * they return arrays/objects), so the `undefined` check below is on the
 * *live-query* result, not on `T` allowing `undefined` as a member type.
 *
 * `resolveLocalResult` is extracted as a small pure function (rather than
 * inlined in the hook body) precisely because this repo has no React render
 * harness (no @testing-library/react; the vitest include glob is `.test.ts`
 * only) — pulling the undefined→fallback defaulting logic out into a pure
 * function makes it directly unit-testable without rendering anything, same
 * reasoning `useSyncStatus.ts` documents for exporting its query functions.
 */
import { useLiveQuery } from 'dexie-react-hooks';

export interface LocalResource<T> {
  data: T;
  loading: boolean;
}

/**
 * Maps a `useLiveQuery` result (`undefined` while unresolved) to the
 * `{ data, loading }` shape callers consume. Pure and dependency-free so it
 * can be unit-tested directly — see `useLocalResource.test.ts`.
 */
export function resolveLocalResult<T>(liveValue: T | undefined, fallback: T): LocalResource<T> {
  if (liveValue === undefined) {
    return { data: fallback, loading: true };
  }
  return { data: liveValue, loading: false };
}

/**
 * Reactive read of a Dexie query. `querier` is any async function reading
 * the local database (e.g.
 * `() => db.products.where('organizationId').equals(org).toArray()`);
 * `deps` mirrors `useLiveQuery`'s own dependency array (the querier re-runs
 * when any entry changes, same as `useEffect`/`useMemo` deps); `fallback` is
 * returned — with `loading: true` — until the first live result resolves
 * (covers the very first render and SSR, where IndexedDB isn't available).
 */
export function useLocalResource<T>(
  querier: () => Promise<T>,
  deps: unknown[],
  fallback: T,
): LocalResource<T> {
  const liveValue = useLiveQuery(querier, deps);
  return resolveLocalResult(liveValue, fallback);
}
