'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { api } from '@/lib/api';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const COUNT_POLL_MS = 60_000;

/** Icône lucide par type d'alerte. */
const TYPE_ICON: Record<string, string> = {
  LOW_STOCK: 'package',
  RECEIVABLE_OVERDUE: 'clock',
  SALE_MADE: 'shopping-cart',
  BIG_EXPENSE: 'banknote',
};

/** Date ISO → libellé relatif FR ("À l'instant", "il y a 5 min", …). */
function relativeTime(iso: string, t: Translate): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t('notif.ago.now');
  if (min < 60) return t('notif.ago.min', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('notif.ago.hour', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('notif.ago.day', { n: days });
  return new Date(iso).toLocaleDateString('fr-FR');
}

export default function NotificationBell() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await api<{ count: number }>('/api/notifications/count');
      setCount(res.count);
    } catch {
      // silencieux — la cloche ne doit jamais casser l'écran.
    }
  }, []);

  // Sondage du compteur (montage + toutes les 60 s).
  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), COUNT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: Notif[] }>('/api/notifications?limit=20');
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  }

  async function markRead(n: Notif) {
    if (n.readAt) return;
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
    );
    setCount((c) => Math.max(0, c - 1));
    try {
      await api('/api/notifications', { method: 'PATCH', body: { ids: [n.id] } });
    } catch {
      void refreshCount();
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setCount(0);
    try {
      await api('/api/notifications', { method: 'PATCH', body: { ids: 'all' } });
    } catch {
      void refreshCount();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('notif.aria')}
        aria-haspopup="true"
        aria-expanded={open}
        className="text-foreground hover:bg-muted relative flex h-10 w-10 items-center justify-center rounded-md transition-colors"
      >
        <Icon i="bell" size={19} />
        {count > 0 && (
          <span className="bg-danger text-danger-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="border-border bg-surface absolute end-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border shadow-lg">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <span className="font-headings text-foreground text-sm font-bold">
              {t('notif.title')}
            </span>
            {items.some((n) => !n.readAt) && (
              <button
                type="button"
                onClick={markAll}
                className="text-primary font-body text-xs font-semibold"
              >
                {t('notif.markAll')}
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <p className="text-muted-foreground font-body px-4 py-8 text-center text-sm">
                {t('notif.loading')}
              </p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Icon i="bell-off" size={22} className="text-muted-foreground" />
                <p className="text-muted-foreground font-body text-sm">{t('notif.empty')}</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void markRead(n)}
                  className={`border-border hover:bg-muted/50 flex w-full items-start gap-3 border-b px-4 py-3 text-start last:border-b-0 ${
                    n.readAt ? 'opacity-60' : ''
                  }`}
                >
                  <div className="bg-muted text-foreground mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                    <Icon i={TYPE_ICON[n.type] ?? 'bell'} size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-body text-foreground truncate text-sm font-semibold">
                        {n.title}
                      </span>
                      {!n.readAt && <span className="bg-primary h-2 w-2 shrink-0 rounded-full" />}
                    </div>
                    <p className="text-muted-foreground font-body mt-0.5 text-xs">{n.body}</p>
                    <p className="text-muted-foreground font-body mt-1 text-[11px] opacity-70">
                      {relativeTime(n.createdAt, t)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
