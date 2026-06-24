'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { api } from '@/lib/api';

interface Hit {
  id: string;
  label: string;
  sub: string;
  href: string;
}
interface SearchResult {
  products: Hit[];
  customers: Hit[];
  sales: Hit[];
  expenses: Hit[];
  total: number;
}

const GROUPS: Array<{ key: keyof SearchResult; label: string; icon: string }> = [
  { key: 'products', label: 'Produits', icon: 'package' },
  { key: 'customers', label: 'Clients', icon: 'users' },
  { key: 'sales', label: 'Ventes', icon: 'receipt-text' },
  { key: 'expenses', label: 'Dépenses', icon: 'wallet' },
];

/** Recherche globale (TopBar) : produits, clients, ventes, dépenses. */
export default function GlobalSearch() {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<SearchResult | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Recherche débouncée.
  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(() => {
      void api<SearchResult>(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setRes(r))
        .catch(() => setRes(null))
        .finally(() => setLoading(false));
    }, 280);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    setQ('');
    router.push(href);
  }

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <div className="border-border bg-input focus-within:border-primary flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors">
        <Icon i="search" size={16} className="text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('search.placeholder')}
          className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
        />
      </div>

      {showPanel && (
        <div className="animate-scale-in border-border bg-surface absolute z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border p-2 shadow-xl">
          {loading && !res ? (
            <p className="text-muted-foreground font-body px-3 py-6 text-center text-sm">
              {t('search.searching')}
            </p>
          ) : res && res.total > 0 ? (
            GROUPS.map((g) => {
              const hits = res[g.key] as Hit[];
              if (hits.length === 0) return null;
              return (
                <div key={g.key} className="mb-1">
                  <div className="text-muted-foreground font-body flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider uppercase">
                    <Icon i={g.icon} size={12} />
                    {g.label}
                  </div>
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => go(h.href)}
                      className="hover:bg-muted flex w-full flex-col items-start rounded-lg px-3 py-2 text-start transition-colors"
                    >
                      <span className="font-body text-foreground text-sm font-medium">
                        {h.label}
                      </span>
                      <span className="text-muted-foreground font-body text-xs">{h.sub}</span>
                    </button>
                  ))}
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground font-body px-3 py-6 text-center text-sm">
              {t('search.empty')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
