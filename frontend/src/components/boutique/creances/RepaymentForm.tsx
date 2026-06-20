'use client';

import { forwardRef, useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { paymentLabelKey } from '@/lib/boutique/payment-label';
import { creditPaymentMethods } from '@/lib/boutique/fixtures';

const labelClass = 'text-foreground font-body text-xs font-semibold';

interface Props {
  debtorName: string;
  maxAmount: number;
  onSubmit: (amount: number, method: string, note: string) => void;
}

/**
 * Formulaire d'enregistrement d'un remboursement (contrôlé). Le champ
 * « Montant reçu » est exposé via `ref` pour que le CTA de l'en-tête puisse
 * lui donner le focus. Remonté à chaque changement de client (clé sur l'id).
 */
const RepaymentForm = forwardRef<HTMLInputElement, Props>(function RepaymentForm(
  { debtorName, maxAmount, onSubmit },
  ref,
) {
  const t = useT();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(creditPaymentMethods[0] ?? 'Espèces');
  const [note, setNote] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(Number(amount) || 0, method, note.trim());
    setAmount('');
    setNote('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border-border rounded-lg border px-5 py-5 md:px-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-headings text-foreground text-base font-bold">
          {t('creances.form.title', { name: debtorName })}
        </h3>
        <span className="text-muted-foreground font-body text-xs">
          {t('creances.form.balance', { amount: formatFCFA(maxAmount) })}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="rp-amount">
            {t('creances.form.amount')}
          </label>
          <div className="border-border bg-input focus-within:border-primary flex items-center gap-2 rounded-md border px-3 py-2.5">
            <input
              id="rp-amount"
              ref={ref}
              type="number"
              min="0"
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            />
            <span className="text-muted-foreground text-xs">{t('common.fcfa')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 lg:w-[170px]">
          <label className={labelClass} htmlFor="rp-method">
            {t('creances.form.method')}
          </label>
          <select
            id="rp-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2.5 text-sm outline-none"
          >
            {creditPaymentMethods.map((m) => (
              <option key={m} value={m}>
                {t(paymentLabelKey(m))}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="rp-note">
            {t('creances.form.note')}
          </label>
          <input
            id="rp-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('creances.form.notePlaceholder')}
            className="border-border bg-input text-foreground font-body placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2.5 text-sm outline-none"
          />
        </div>

        <button
          type="submit"
          className="bg-primary text-primary-foreground font-body flex shrink-0 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold"
        >
          <Icon i="check" size={15} />
          {t('creances.form.validate')}
        </button>
      </div>
    </form>
  );
});

export default RepaymentForm;
