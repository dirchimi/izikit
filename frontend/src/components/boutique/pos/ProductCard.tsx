'use client';

import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import type { PosProduct } from '@/lib/boutique/fixtures';

/** Carte produit cliquable du catalogue POS. Bordure ambre si stock bas. */
export default function ProductCard({
  product,
  onAdd,
}: {
  product: PosProduct;
  onAdd: (product: PosProduct) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className={`bg-surface flex flex-col gap-2 rounded-lg border px-4 py-4 text-start transition-colors hover:border-primary ${
        product.low ? 'border-warning' : 'border-border'
      }`}
    >
      <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-md">
        <Icon i="package" size={16} className="text-muted-foreground" />
      </div>
      <span className="font-body text-foreground text-sm leading-tight font-semibold">
        {product.name}
      </span>
      <div className="flex items-center justify-between">
        <span className="font-body text-primary text-sm font-bold">
          {formatFCFA(product.price)}{' '}
          <span className="text-muted-foreground text-xs font-normal">{t('common.fcfa')}</span>
        </span>
        <span
          className={`font-body rounded-sm px-1.5 py-0.5 text-xs font-semibold ${
            product.low ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {product.stock}
        </span>
      </div>
    </button>
  );
}
