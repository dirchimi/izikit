'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { posCategories } from '@/lib/boutique/fixtures';

export interface NewProductInput {
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  threshold: number;
}

const categoryOptions = posCategories.filter((c) => c !== 'Tous');

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/** Formulaire d'ajout de produit (contrôlé). Appelle onSubmit puis se réinitialise. */
export default function AddProductForm({ onSubmit }: { onSubmit: (p: NewProductInput) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [qty, setQty] = useState('');
  const [threshold, setThreshold] = useState('5');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      category: category || 'Alimentation',
      buyPrice: Number(buyPrice) || 0,
      sellPrice: Number(sellPrice) || 0,
      qty: Number(qty) || 0,
      threshold: Number(threshold) || 0,
    });
    setName('');
    setCategory('');
    setBuyPrice('');
    setSellPrice('');
    setQty('');
    setThreshold('5');
  }

  return (
    <div className="bg-surface border-border flex w-full flex-col border-t xl:w-[300px] xl:border-t-0 xl:border-s">
      <div className="border-border border-b px-5 py-4">
        <h2 className="font-headings text-foreground text-base font-bold">
          {t('stock.form.title')}
        </h2>
        <p className="text-muted-foreground font-body mt-0.5 text-xs">{t('stock.form.subtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="np-name">
            {t('stock.form.name')}
          </label>
          <input
            id="np-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('stock.form.namePlaceholder')}
            className={`${fieldClass} placeholder:text-muted-foreground`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="np-cat">
            {t('common.category')}
          </label>
          <select
            id="np-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${fieldClass} ${category ? '' : 'text-muted-foreground'}`}
          >
            <option value="">{t('common.select')}</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelClass} htmlFor="np-buy">
              {t('stock.col.buyPrice')}
            </label>
            <input
              id="np-buy"
              type="number"
              min="0"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="0"
              className={`${fieldClass} placeholder:text-muted-foreground`}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelClass} htmlFor="np-sell">
              {t('stock.col.sellPrice')}
            </label>
            <input
              id="np-sell"
              type="number"
              min="0"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="0"
              className={`${fieldClass} placeholder:text-muted-foreground`}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelClass} htmlFor="np-qty">
              {t('stock.form.qtyField')}
            </label>
            <input
              id="np-qty"
              type="number"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className={`${fieldClass} placeholder:text-muted-foreground`}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelClass} htmlFor="np-threshold">
              {t('stock.form.thresholdField')}
            </label>
            <input
              id="np-threshold"
              type="number"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className={`${fieldClass} placeholder:text-muted-foreground`}
            />
          </div>
        </div>

        <button
          type="submit"
          className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold"
        >
          <Icon i="plus" size={15} />
          {t('stock.form.submit')}
        </button>
      </form>
    </div>
  );
}
