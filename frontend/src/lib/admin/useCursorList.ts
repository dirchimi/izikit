'use client';

import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface ListResponse<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Liste admin paginée par curseur. Le curseur vit dans un ref pour éviter les
 * fermetures périmées. `load(true, params)` réinitialise ; `load(false, params)`
 * ajoute la page suivante. `setItems` permet la mise à jour optimiste après une
 * mutation (changement de rôle / statut).
 */
export function useCursorList<T>(basePath: string) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const load = useCallback(
    async (reset: boolean, params: Record<string, string | undefined> = {}) => {
      setLoading(true);
      setError(null);
      if (reset) cursorRef.current = null;
      try {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
        sp.set('limit', '30');
        if (cursorRef.current) sp.set('cursor', cursorRef.current);
        const res = await api<ListResponse<T>>(`${basePath}?${sp.toString()}`);
        cursorRef.current = res.nextCursor;
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setHasMore(!!res.nextCursor);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Erreur réseau');
      } finally {
        setLoading(false);
      }
    },
    [basePath],
  );

  return { items, setItems, hasMore, loading, error, load };
}
