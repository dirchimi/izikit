'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/**
 * Réapprovisionnement (entrée de stock). Ajoute une quantité reçue au stock
 * existant via /api/products/[id]/adjust (mouvement type IN), met à jour le
 * prix d'achat si renseigné, trace une note. Ne recrée jamais le produit.
 */
export default function ReapproForm({
  product,
  onSuccess,
}: {
  product: { id: string; name: string; unite: string; qty: number; buyPrice: number };
  onSuccess: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [qty, setQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) {
      toast(t('stock.reappro.qtyRequired'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/products/${product.id}/adjust`, {
        method: 'POST',
        body: {
          delta: q,
          type: 'IN',
          ...(buyPrice.trim() !== '' ? { buyPrice: Number(buyPrice) || 0 } : {}),
          reason: note.trim() || t('stock.reappro.defaultReason'),
        },
      });
      toast(t('stock.reappro.success', { qty: q, name: product.name }), 'success');
      onSuccess();
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="bg-muted/40 border-border text-muted-foreground font-body flex items-center justify-between rounded-md border px-3 py-2 text-xs">
        <span>{product.name}</span>
        <span>
          {t('stock.col.stock')} : <b className="text-foreground">{product.qty}</b> {product.unite}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="re-qty">
          {t('stock.reappro.qtyField')}
        </label>
        <input
          id="re-qty"
          type="number"
          min="1"
          required
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          className={`${fieldClass} placeholder:text-muted-foreground`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="re-buy">
          {t('stock.reappro.buyPriceField')}
        </label>
        <input
          id="re-buy"
          type="number"
          min="0"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          placeholder={String(product.buyPrice)}
          className={`${fieldClass} placeholder:text-muted-foreground`}
        />
        <p className="text-muted-foreground font-body text-[11px]">
          {t('stock.reappro.buyPriceHint')}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="re-note">
          {t('stock.reappro.noteField')}
        </label>
        <input
          id="re-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('stock.reappro.notePlaceholder')}
          className={`${fieldClass} placeholder:text-muted-foreground`}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
      >
        <Icon i="package-plus" size={15} />
        {t('stock.reappro.submit')}
      </button>
    </form>
  );
}
