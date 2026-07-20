'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { createAdjustOffline } from '@/lib/offline/mutations';
import { triggerDrain } from '@/lib/offline/sync-triggers';

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/**
 * Ajustement de stock (correction : casse, vol, inventaire, erreur). Correction
 * en plus ou en moins avec MOTIF OBLIGATOIRE (mouvement type ADJUST). Refuse
 * une sortie qui ferait passer le stock sous 0.
 *
 * Offline-first (Task 5.3) : écriture locale optimiste via
 * `createAdjustOffline` + mise en file d'attente (jamais de réseau direct
 * ici) — même schéma que `createExpenseOffline` pour les dépenses. Le
 * serveur (`/api/products/[id]/adjust`) reste seul à valider VRAIMENT à la
 * synchro ; le refus local (`INSUFFICIENT_STOCK_LOCAL`) n'est qu'un
 * feedback immédiat au commerçant.
 */
export default function AdjustStockForm({
  product,
  onSuccess,
}: {
  product: { id: string; name: string; unite: string; qty: number };
  onSuccess: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [sense, setSense] = useState<'add' | 'remove'>('remove');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) {
      toast(t('stock.adjust.qtyRequired'), 'error');
      return;
    }
    if (reason.trim() === '') {
      toast(t('stock.adjust.reasonRequired'), 'error');
      return;
    }
    const delta = sense === 'remove' ? -q : q;
    setSubmitting(true);
    try {
      await createAdjustOffline({
        productId: product.id,
        delta,
        type: 'ADJUST',
        reason: reason.trim(),
      });
      triggerDrain();
      toast(t('stock.adjust.success', { name: product.name }), 'success');
      onSuccess();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast(
        code === 'INSUFFICIENT_STOCK_LOCAL' ? t('stock.adjust.insufficient') : t('async.error'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const preview =
    sense === 'remove' ? product.qty - (Number(qty) || 0) : product.qty + (Number(qty) || 0);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="bg-muted/40 border-border text-muted-foreground font-body flex items-center justify-between rounded-md border px-3 py-2 text-xs">
        <span>{product.name}</span>
        <span>
          {t('stock.col.stock')} : <b className="text-foreground">{product.qty}</b> {product.unite}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>{t('stock.adjust.senseField')}</label>
        <div className="border-border flex overflow-hidden rounded-md border">
          {(['remove', 'add'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSense(s)}
              className={`font-body flex-1 px-3 py-2 text-sm ${
                sense === s
                  ? s === 'remove'
                    ? 'bg-danger text-danger-foreground font-semibold'
                    : 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {t(s === 'remove' ? 'stock.adjust.remove' : 'stock.adjust.add')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="aj-qty">
          {t('stock.adjust.qtyField')}
        </label>
        <input
          id="aj-qty"
          type="number"
          min="1"
          required
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          className={`${fieldClass} placeholder:text-muted-foreground`}
        />
        {qty !== '' && (
          <p className="text-muted-foreground font-body text-[11px]">
            {t('stock.adjust.preview', { qty: preview })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="aj-reason">
          {t('stock.adjust.reasonField')}
        </label>
        <input
          id="aj-reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('stock.adjust.reasonPlaceholder')}
          className={`${fieldClass} placeholder:text-muted-foreground`}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
      >
        <Icon i="sliders-horizontal" size={15} />
        {t('stock.adjust.submit')}
      </button>
    </form>
  );
}
