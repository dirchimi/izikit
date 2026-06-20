'use client';

import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

/**
 * Enveloppe d'état asynchrone réutilisable (Phase 0 — socle des écrans branchés
 * sur l'API). Gère loading / erreur (avec retry) / vide, puis rend `children`.
 *
 * Usage :
 *   const { data, loading, error, refresh } = useApi<T>('/api/…');
 *   <AsyncState loading={loading} error={error} onRetry={refresh}
 *               isEmpty={!data?.items.length} emptyLabel={t('stock.empty')}>
 *     …contenu avec data…
 *   </AsyncState>
 */
export default function AsyncState({
  loading,
  error,
  isEmpty = false,
  onRetry,
  emptyLabel,
  emptyIcon = 'inbox',
  children,
}: {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyLabel?: string;
  emptyIcon?: string;
  children: ReactNode;
}) {
  const t = useT();

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="text-muted-foreground font-body flex items-center justify-center gap-2 px-6 py-12 text-sm"
      >
        <Icon i="loader-2" size={16} className="animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border-border flex flex-col items-center gap-3 rounded-lg border px-6 py-12 text-center">
        <div className="bg-danger/10 text-danger flex h-12 w-12 items-center justify-center rounded-full">
          <Icon i="alert-triangle" size={20} />
        </div>
        <p className="text-foreground font-body text-sm font-semibold">{t('async.error')}</p>
        <p className="text-muted-foreground font-body max-w-sm text-xs">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="border-border bg-surface text-foreground font-body mt-1 flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold"
          >
            <Icon i="refresh-cw" size={13} />
            {t('async.retry')}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="bg-surface border-border flex flex-col items-center gap-2 rounded-lg border px-6 py-12 text-center">
        <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
          <Icon i={emptyIcon} size={20} />
        </div>
        <p className="text-muted-foreground font-body text-sm">{emptyLabel ?? t('async.empty')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
