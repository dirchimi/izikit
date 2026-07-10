'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import ComboBox from '@/components/ui/ComboBox';
import DatePicker from '@/components/ui/DatePicker';
import { useT } from '@/contexts/LocaleContext';
import { UNIT_OPTIONS } from './AddProductForm';

export interface EditProductInput {
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  threshold: number;
  barcode: string | null;
  expiryDate: string | null; // YYYY-MM-DD ou null (efface la date)
}

export interface EditableProduct {
  id: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  threshold: number;
  qty: number;
  barcode: string | null;
  expiryDate: string | null; // ISO ou null
}

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/**
 * Édition d'un produit (métadonnées). La QUANTITÉ ne se modifie PAS ici : elle
 * ne bouge que via un mouvement de stock (la photo se change depuis la liste).
 * Appelle `onSave` (async) et ferme via `onDone` si la mise à jour a réussi.
 */
export default function EditProductForm({
  product,
  categories = [],
  onSave,
  onDone,
}: {
  product: EditableProduct;
  categories?: string[];
  onSave: (id: string, patch: EditProductInput) => Promise<boolean> | boolean;
  onDone?: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [buyPrice, setBuyPrice] = useState(String(product.buyPrice));
  const [sellPrice, setSellPrice] = useState(String(product.sellPrice));
  const [prixGros, setPrixGros] = useState(String(product.prixGros));
  const [unite, setUnite] = useState(product.unite || 'pièce');
  const [threshold, setThreshold] = useState(String(product.threshold));
  const [barcode, setBarcode] = useState(product.barcode ?? '');
  // ISO complet → YYYY-MM-DD attendu par le DatePicker (chaîne vide = aucune).
  const [expiryDate, setExpiryDate] = useState(product.expiryDate?.slice(0, 10) ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await onSave(product.id, {
        name: name.trim(),
        category: category.trim() || 'Divers',
        buyPrice: Number(buyPrice) || 0,
        sellPrice: Number(sellPrice) || 0,
        prixGros: Number(prixGros) || 0,
        unite: unite.trim() || 'pièce',
        threshold: Number(threshold) || 0,
        barcode: barcode.trim() || null,
        expiryDate: expiryDate || null,
      });
      if (ok) onDone?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="ep-name">
          {t('stock.form.name')}
        </label>
        <input
          id="ep-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${fieldClass} placeholder:text-muted-foreground`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>{t('common.category')}</label>
        <ComboBox
          value={category}
          onChange={setCategory}
          options={categories}
          creatable
          placeholder={t('stock.form.categoryPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="ep-barcode">
          {t('stock.form.barcode')}
        </label>
        <div className={`${fieldClass} flex items-center gap-2 focus-within:border-primary`}>
          <Icon i="scan-barcode" size={15} className="text-muted-foreground shrink-0" />
          <input
            id="ep-barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder={t('stock.form.barcodePlaceholder')}
            className="text-foreground placeholder:text-muted-foreground w-full bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>{t('stock.form.expiry')}</label>
        <DatePicker value={expiryDate} onChange={setExpiryDate} />
        <p className="text-muted-foreground font-body text-[11px]">{t('stock.form.expiryHint')}</p>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="ep-buy">
            {t('stock.col.buyPrice')}
          </label>
          <input
            id="ep-buy"
            type="number"
            min="0"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="ep-sell">
            {t('stock.col.sellPrice')}
          </label>
          <input
            id="ep-sell"
            type="number"
            min="0"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="ep-gros">
            {t('stock.form.wholesalePrice')}
          </label>
          <input
            id="ep-gros"
            type="number"
            min="0"
            value={prixGros}
            onChange={(e) => setPrixGros(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass}>{t('stock.form.unit')}</label>
          <ComboBox
            value={unite}
            onChange={setUnite}
            options={UNIT_OPTIONS}
            creatable
            placeholder={t('stock.form.unitPlaceholder')}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass} htmlFor="ep-threshold">
            {t('stock.form.thresholdField')}
          </label>
          <input
            id="ep-threshold"
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass}>{t('stock.col.stock')}</label>
          <div className="border-border bg-muted/40 text-muted-foreground font-body flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
            <Icon i="lock" size={12} />
            {product.qty}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground font-body -mt-2 text-[11px]">{t('stock.edit.qtyNote')}</p>

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
      >
        <Icon i="check" size={15} />
        {t('stock.edit.submit')}
      </button>
    </form>
  );
}
