'use client';

import { forwardRef, useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import DatePicker from '@/components/ui/DatePicker';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';

const labelClass = 'text-foreground font-body text-xs font-semibold';

/** Date du jour au format 'YYYY-MM-DD' (local) — défaut du champ date. */
function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Modes de remboursement acceptés par l'API (/api/receivables/[id]/repay). */
export type RepayMethod = 'cash' | 'mobile';
const REPAY_METHODS: { value: RepayMethod; key: string }[] = [
  { value: 'cash', key: 'method.cash' },
  { value: 'mobile', key: 'method.mobile' },
];

interface Props {
  debtorName: string;
  maxAmount: number;
  disabled?: boolean;
  onSubmit: (amount: number, method: RepayMethod, note: string, date: string) => void;
}

/**
 * Formulaire d'enregistrement d'un remboursement (contrôlé). Le champ
 * « Montant reçu » est exposé via `ref` pour que le CTA de l'en-tête puisse
 * lui donner le focus. Remonté à chaque changement de client (clé sur l'id).
 */
const RepaymentForm = forwardRef<HTMLInputElement, Props>(function RepaymentForm(
  { debtorName, maxAmount, disabled = false, onSubmit },
  ref,
) {
  const t = useT();
  const today = todayYmd();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<RepayMethod>('cash');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(Number(amount) || 0, method, note.trim(), date);
    setAmount('');
    setNote('');
    setDate(today);
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
            onChange={(e) => setMethod(e.target.value as RepayMethod)}
            className="border-border bg-input text-foreground font-body focus:border-primary rounded-md border px-3 py-2.5 text-sm outline-none"
          >
            {REPAY_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.key)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 lg:w-[160px]">
          <label className={labelClass}>{t('creances.form.date')}</label>
          <DatePicker value={date} onChange={setDate} max={today} />
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
          disabled={disabled}
          className="bg-primary text-primary-foreground font-body flex shrink-0 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
        >
          <Icon i="check" size={15} />
          {t('creances.form.validate')}
        </button>
      </div>
    </form>
  );
});

export default RepaymentForm;
