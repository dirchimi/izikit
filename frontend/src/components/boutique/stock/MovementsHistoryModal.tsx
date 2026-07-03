'use client';

import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import AsyncState from '@/components/boutique/AsyncState';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';

interface Movement {
  id: string;
  type: string; // IN | OUT | ADJUST
  delta: number;
  resultingStock: number;
  reason: string | null;
  author: string | null;
  createdAt: string;
}

/** Libellé + style d'un mouvement selon son type et son motif. */
function movementKind(m: Movement): { labelKey: string; icon: string; cls: string } {
  if (m.type === 'OUT') {
    if (m.reason === 'sale')
      return { labelKey: 'stock.mv.sale', icon: 'shopping-cart', cls: 'text-danger' };
    return { labelKey: 'stock.mv.out', icon: 'arrow-down', cls: 'text-danger' };
  }
  if (m.type === 'ADJUST')
    return { labelKey: 'stock.mv.adjust', icon: 'sliders-horizontal', cls: 'text-warning' };
  // IN
  if (m.reason === 'initial')
    return { labelKey: 'stock.mv.initial', icon: 'package', cls: 'text-success' };
  return { labelKey: 'stock.mv.in', icon: 'package-plus', cls: 'text-success' };
}

/**
 * Historique complet des mouvements de stock d'un produit (traçabilité).
 * Charge /api/products/[id]/movements quand un produit est sélectionné.
 */
export default function MovementsHistoryModal({
  product,
  onClose,
}: {
  product: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const t = useT();
  const { data, loading, error, refresh } = useApi<{ movements: Movement[] }>(
    product ? `/api/products/${product.id}/movements` : '/api/products/_none/movements',
    { skip: !product },
  );
  const movements = data?.movements ?? [];

  return (
    <Modal
      open={product !== null}
      onClose={onClose}
      title={`${t('stock.history.title')}${product ? ` — ${product.name}` : ''}`}
      size="lg"
    >
      <AsyncState
        loading={loading}
        error={error}
        onRetry={refresh}
        isEmpty={movements.length === 0}
        emptyLabel={t('stock.history.empty')}
        emptyIcon="history"
      >
        <div className="flex flex-col gap-2">
          {movements.map((m) => {
            const k = movementKind(m);
            const d = new Date(m.createdAt);
            return (
              <div
                key={m.id}
                className="border-border bg-surface flex items-center gap-3 rounded-md border px-3 py-2.5"
              >
                <Icon i={k.icon} size={16} className={`${k.cls} shrink-0`} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-body text-foreground text-sm font-medium">
                    {t(k.labelKey)}
                    {m.reason && m.reason !== 'sale' && m.reason !== 'initial' ? (
                      <span className="text-muted-foreground font-normal"> — {m.reason}</span>
                    ) : null}
                  </span>
                  <span className="font-body text-muted-foreground text-[11px]">
                    {d.toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {m.author ? ` · ${m.author}` : ''}
                  </span>
                </div>
                <span
                  className={`font-body w-16 text-end text-sm font-bold ${
                    m.delta >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {m.delta >= 0 ? '+' : ''}
                  {m.delta}
                </span>
                <span className="font-body text-muted-foreground w-20 text-end text-xs">
                  → {m.resultingStock}
                </span>
              </div>
            );
          })}
        </div>
      </AsyncState>
    </Modal>
  );
}
