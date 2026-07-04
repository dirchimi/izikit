'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';

export interface CartLineData {
  productId: string;
  name: string;
  /** Prix unitaire effectif (détail ou gros selon `wholesale`). */
  unitPrice: number;
  qty: number;
  sellPrice: number;
  prixGros: number;
  /** Ligne facturée au prix de gros. */
  wholesale: boolean;
}

/** Ligne du panier avec stepper quantité, bascule détail/gros et suppression. */
export default function CartLine({
  line,
  onInc,
  onDec,
  onSetQty,
  onRemove,
  onToggleWholesale,
}: {
  line: CartLineData;
  onInc: () => void;
  onDec: () => void;
  onSetQty: (qty: number) => void;
  onRemove: () => void;
  onToggleWholesale: (wholesale: boolean) => void;
}) {
  const t = useT();
  const hasWholesale = line.prixGros > 0;

  // Quantité éditable : on saisit directement le nombre (utile pour de grosses
  // commandes — pas besoin de taper « + » des centaines de fois). `draft` garde
  // la frappe en cours ; on valide (min 1) au blur ou sur Entrée.
  const [draft, setDraft] = useState(String(line.qty));
  useEffect(() => {
    setDraft(String(line.qty));
  }, [line.qty]);

  function commitQty() {
    const n = parseInt(draft.replace(/\D/g, ''), 10);
    const qty = Number.isFinite(n) && n > 0 ? n : 1;
    setDraft(String(qty));
    if (qty !== line.qty) onSetQty(qty);
  }
  return (
    <div className="border-border flex flex-col gap-2 border-b py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-body text-foreground truncate text-sm font-semibold">
            {line.name}
          </div>
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
          <input
            type="text"
            inputMode="numeric"
            aria-label={t('cart.quantity')}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            onFocus={(e) => e.target.select()}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="font-body text-foreground w-12 bg-transparent text-center text-sm font-semibold outline-none"
          />
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

      {/* Bascule détail / gros — seulement si un prix de gros est défini. */}
      {hasWholesale && (
        <div className="border-border ms-0 flex w-fit items-center overflow-hidden rounded-md border text-[11px]">
          {(['retail', 'wholesale'] as const).map((mode) => {
            const active = mode === 'wholesale' ? line.wholesale : !line.wholesale;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onToggleWholesale(mode === 'wholesale')}
                className={`font-body border-border px-2.5 py-1 first:border-e ${
                  active
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {mode === 'wholesale'
                  ? `${t('pos.wholesale')} · ${formatFCFA(line.prixGros)}`
                  : `${t('pos.retail')} · ${formatFCFA(line.sellPrice)}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
