'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { expenseCategories } from '@/lib/boutique/fixtures';

export interface NewExpenseInput {
  label: string;
  amount: number;
  category: string;
  note: string;
}

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/** Formulaire d'ajout de dépense (contrôlé). Ne se vide qu'en cas de succès. */
export default function AddExpenseForm({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (e: NewExpenseInput) => void | Promise<boolean | void>;
  disabled?: boolean;
}) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await onSubmit({
      label: label.trim(),
      amount: Number(amount) || 0,
      category: category || 'Charges',
      note: note.trim(),
    });
    if (ok === false) return;
    setLabel('');
    setAmount('');
    setCategory('');
    setNote('');
  }

  return (
    <div className="bg-surface border-border flex w-full flex-col border-t xl:w-[300px] xl:border-t-0 xl:border-s">
      <div className="border-border border-b px-5 py-4">
        <h2 className="font-headings text-foreground text-base font-bold">
          {t('depenses.form.title')}
        </h2>
        <p className="text-muted-foreground font-body mt-0.5 text-xs">
          {t('depenses.form.subtitle')}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ne-label">
            {t('depenses.col.label')}
          </label>
          <input
            id="ne-label"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('depenses.form.labelPlaceholder')}
            className={`${fieldClass} placeholder:text-muted-foreground`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ne-amount">
            {t('common.amount')}
          </label>
          <div className="border-border bg-input focus-within:border-primary flex items-center gap-2 rounded-md border px-3 py-2">
            <input
              id="ne-amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            />
            <span className="text-muted-foreground text-xs">{t('common.fcfa')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ne-cat">
            {t('common.category')}
          </label>
          <select
            id="ne-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${fieldClass} ${category ? '' : 'text-muted-foreground'}`}
          >
            <option value="">{t('common.select')}</option>
            {expenseCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>{t('common.date')}</span>
          <div className="border-border bg-input text-muted-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Icon i="calendar" size={13} className="text-muted-foreground" />
            <span>{t('common.today')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ne-note">
            {t('common.note')}
          </label>
          <textarea
            id="ne-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('depenses.form.notePlaceholder')}
            className={`${fieldClass} placeholder:text-muted-foreground min-h-16 resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
        >
          <Icon i="plus" size={15} />
          {t('depenses.form.submit')}
        </button>
      </form>
    </div>
  );
}
