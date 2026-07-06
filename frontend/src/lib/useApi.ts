'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';

// In-memory stale-while-revalidate cache.
const cache = new Map<string, { data: unknown; ts: number }>();

const STALE_TIME = 2 * 60 * 1000;

// Registre des hooks montés, par chemin. Permet à une invalidation (après une
// mutation) OU au retour sur l'onglet de re-fetcher activement les écrans
// concernés — c'est ce qui rend les données « temps réel » sans actualiser.
const revalidators = new Map<string, Set<(force: boolean) => void>>();

function addRevalidator(path: string, fn: (force: boolean) => void): () => void {
  let set = revalidators.get(path);
  if (!set) {
    set = new Set();
    revalidators.set(path, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) revalidators.delete(path);
  };
}

/** Notifie les hooks montés d'un chemin qu'ils doivent se revalider. */
function notifyPath(path: string, force: boolean): void {
  revalidators.get(path)?.forEach((fn) => fn(force));
}

if (typeof window !== 'undefined') {
  // Retour sur l'app (focus fenêtre / onglet redevenu visible) → on revalide
  // tous les écrans montés (chacun ne re-fetche que s'il est périmé).
  const revalidateVisible = () => {
    if (document.visibilityState !== 'visible') return;
    for (const set of revalidators.values()) for (const fn of set) fn(false);
  };
  window.addEventListener('focus', revalidateVisible);
  document.addEventListener('visibilitychange', revalidateVisible);

  // Éviction des entrées de cache trop vieilles (mémoire).
  const EVICTION_THRESHOLD = 3 * STALE_TIME;
  window.setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of cache) {
        if (now - entry.ts > EVICTION_THRESHOLD) cache.delete(key);
      }
    },
    5 * 60 * 1000,
  );
}

interface UseApiOptions {
  skip?: boolean;
  staleTime?: number;
  /** Rafraîchit en arrière-plan toutes les N ms tant que l'onglet est visible. */
  pollMs?: number;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useApi<T>(path: string, options: UseApiOptions = {}): UseApiResult<T> {
  const { skip = false, staleTime = STALE_TIME, pollMs } = options;

  const cached = cache.get(path);
  const [data, setData] = useState<T | null>(cached ? (cached.data as T) : null);
  const [loading, setLoading] = useState(!cached && !skip);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pathRef = useRef(path);
  pathRef.current = path;
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(
    async (showLoading: boolean) => {
      if (skip) return;
      const currentFetchId = ++fetchIdRef.current;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const result = await api<T>(pathRef.current);
        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setData(result);
          cache.set(pathRef.current, { data: result, ts: Date.now() });
        }
      } catch (err) {
        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (mountedRef.current && fetchIdRef.current === currentFetchId) setLoading(false);
      }
    },
    [skip],
  );

  // Revalidation : re-fetche si forcé (invalidation) ou si l'entrée est périmée
  // (retour sur l'onglet). En arrière-plan (pas de spinner).
  const revalidate = useCallback(
    (force: boolean) => {
      if (skip) return;
      const entry = cache.get(pathRef.current);
      if (force || !entry || Date.now() - entry.ts > staleTime) {
        void fetchData(false);
      }
    },
    [skip, staleTime, fetchData],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (skip) {
      setLoading(false);
      return;
    }
    const entry = cache.get(path);
    if (entry) {
      setData(entry.data as T);
      setLoading(false);
      if (Date.now() - entry.ts > staleTime) {
        void fetchData(false);
      }
    } else {
      void fetchData(true);
    }
    return () => {
      mountedRef.current = false;
    };
    // fetchData is intentionally excluded; it depends only on `skip` which is in deps.
  }, [path, skip]);

  // Abonne le hook aux invalidations + au retour d'onglet (via le registre).
  useEffect(() => {
    if (skip) return;
    return addRevalidator(path, revalidate);
  }, [path, skip, revalidate]);

  // Polling léger, gelé quand l'onglet n'est pas visible (économe).
  useEffect(() => {
    if (skip || !pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchData(false);
    }, pollMs);
    return () => window.clearInterval(id);
  }, [skip, pollMs, fetchData]);

  const refresh = useCallback(async () => {
    cache.delete(pathRef.current);
    await fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
}

export function getCache<T>(path: string): T | null {
  const entry = cache.get(path);
  return entry ? (entry.data as T) : null;
}

export function setCache(path: string, data: unknown): void {
  cache.set(path, { data, ts: Date.now() });
}

export function invalidateCache(path: string): void {
  cache.delete(path);
  notifyPath(path, true);
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  // Re-fetche aussi les écrans montés dont le chemin correspond (ex. reports
  // avec query-string) même s'ils n'avaient pas encore d'entrée en cache.
  for (const key of revalidators.keys()) {
    if (key.startsWith(prefix)) notifyPath(key, true);
  }
}

/** Invalide plusieurs ressources d'un coup (après une mutation métier). */
export function revalidateResources(paths: readonly string[]): void {
  for (const p of paths) invalidateCachePrefix(p);
}
