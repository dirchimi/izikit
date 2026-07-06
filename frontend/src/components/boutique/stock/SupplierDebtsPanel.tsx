'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { formatFCFA } from '@/lib/boutique/format';
import { api } from '@/lib/api';

export interface SupplierDebtRow {
  id: string;
  label: string;
  supplierName: string;
  amount: number;
  amountPaid: number;
  remaining: number;
  status: string; // open | partial
  createdAt: string;
}

/**
 * Panneau « Dettes fournisseurs » (ce que la boutique doit encore). Caché par
 * défaut, ouvert au clic sur la carte « À payer ». Chaque ligne se règle
 * (partiellement ou en totalité) via /api/supplier-debts/[id]/pay.
 */
export default function SupplierDebtsPanel({
  debts,
  totalOwed,
  onPaid,
  onClose,
}: {
  debts: SupplierDebtRow[];
  totalOwed: number;
  onPaid: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [target, setTarget] = useState<SupplierDebtRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function openPay(row: SupplierDebtRow) {
    setTarget(row);
    setPayAmount(String(row.remaining)); // défaut = solder la dette
  }

  async function pay() {
    if (!target) return;
    const amt = Math.trunc(Number(payAmount) || 0);
    if (amt <= 0) {
      toast(t('stock.debts.amountRequired'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/supplier-debts/${target.id}/pay`, {
        method: 'POST',
        body: { amount: amt },
      });
      toast(t('stock.debts.paidToast'), 'success');
      setTarget(null);
      onPaid();
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface border-border animate-fade-in flex flex-col rounded-lg border">
      {/* En-tête */}
      <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <Icon i="hand-coins" size={16} className="text-warning" />
          <span className="font-headings text-foreground text-sm font-bold">
            {t('stock.debts.title')}
          </span>
          <span className="text-warning font-body text-sm font-semibold">
            · {formatFCFA(totalOwed)} {t('common.fcfa')}
          </span>
        </div>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon i="x" size={16} />
        </button>
      </div>

      {debts.length === 0 ? (
        <div className="text-muted-foreground font-body px-5 py-6 text-sm">
          {t('stock.debts.empty')}
        </div>
      ) : (
        <div className="flex flex-col">
          {debts.map((d) => (
            <div
              key={d.id}
              className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-body text-foreground truncate text-sm font-medium">{d.label}</p>
                <p className="text-muted-foreground font-body truncate text-xs">
                  {d.supplierName || t('stock.debts.noSupplier')}
                  {d.amountPaid > 0 && (
                    <>
                      {' · '}
                      {t('stock.debts.partialPaid', { paid: formatFCFA(d.amountPaid) })}
                    </>
                  )}
                </p>
              </div>
              <span
                className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${
                  d.status === 'partial'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-warning/15 text-warning'
                }`}
              >
                {t(
                  d.status === 'partial' ? 'stock.debts.status.partial' : 'stock.debts.status.open',
                )}
              </span>
              <span className="font-headings text-foreground w-28 text-end text-sm font-bold">
                {formatFCFA(d.remaining)} {t('common.fcfa')}
              </span>
              <button
                type="button"
                onClick={() => openPay(d)}
                className="bg-primary text-primary-foreground font-body flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold"
              >
                <Icon i="check" size={13} />
                {t('stock.debts.pay')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modale de paiement (défaut = solder la dette, modifiable pour un partiel) */}
      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={t('stock.debts.payTitle')}
        size="sm"
      >
        {target && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pay();
            }}
            className="flex flex-col gap-4"
          >
            <div className="bg-muted/40 border-border text-muted-foreground font-body flex items-center justify-between rounded-md border px-3 py-2 text-xs">
              <span className="truncate">{target.supplierName || target.label}</span>
              <span>
                {t('stock.debts.remaining')} :{' '}
                <b className="text-foreground">
                  {formatFCFA(target.remaining)} {t('common.fcfa')}
                </b>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-foreground font-body text-xs font-semibold"
                htmlFor="sd-pay-amount"
              >
                {t('stock.debts.payAmount')}
              </label>
              <input
                id="sd-pay-amount"
                type="number"
                min="1"
                max={target.remaining}
                inputMode="numeric"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                autoFocus
                className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground font-body flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <Icon i="check" size={15} />
              {t('stock.debts.paySubmit')}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
