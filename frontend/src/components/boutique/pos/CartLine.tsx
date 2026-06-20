'use client';

import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';

export interface CartLineData {
  name: string;
  unitPrice: number;
  qty: number;
}

/** Ligne du panier avec stepper quantité et suppression. */
export default function CartLine({
  line,
  onInc,
  onDec,
  onRemove,
}: {
  line: CartLineData;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="border-border flex items-center gap-3 border-b py-3">
      <div className="min-w-0 flex-1">
        <div className="font-body text-foreground truncate text-sm font-semibold">{line.name}</div>
        <div className="font-body text-muted-foreground mt-0.5 text-xs">
          {formatFCFA(line.unitPrice)} {t('common.fcfa')} {t('cart.perUnit')}
        </div>
      </div>
      <div className="border-border flex items-center overflow-hidden rounded-md border">
        <button
          type="button"
          aria-label={t('cart.decrease')}
          onClick={onDec}
          className="text-muted-foreground border-border border-e px-2.5 py-1 text-sm font-bold"
        >
          −
        </button>
        <span className="font-body text-foreground w-7 text-center text-sm font-semibold">
          {line.qty}
        </span>
        <button
          type="button"
          aria-label={t('cart.increase')}
          onClick={onInc}
          className="text-muted-foreground border-border border-s px-2.5 py-1 text-sm font-bold"
        >
          +
        </button>
      </div>
      <span className="font-body text-foreground w-20 text-end text-sm font-bold">
        {formatFCFA(line.unitPrice * line.qty)} {t('common.fcfa')}
      </span>
      <button
        type="button"
        aria-label={t('cart.remove')}
        onClick={onRemove}
        className="text-muted-foreground ms-1"
      >
        <Icon i="x" size={14} />
      </button>
    </div>
  );
}
