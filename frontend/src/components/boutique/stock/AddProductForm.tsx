'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { ApiError } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { posCategories } from '@/lib/boutique/fixtures';

export interface NewProductInput {
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  threshold: number;
  imageUrl: string | null;
}

function imageUploadError(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'FILE_TOO_LARGE':
        return t('stock.photo.tooLarge');
      case 'INVALID_MIME':
      case 'MAGIC_BYTE_MISMATCH':
        return t('stock.photo.invalidType');
      case 'STORAGE_NOT_CONFIGURED':
        return t('stock.photo.notConfigured');
      default:
        return t('stock.photo.failed');
    }
  }
  return t('stock.photo.failed');
}

const categoryOptions = posCategories.filter((c) => c !== 'Tous');

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/**
 * Formulaire d'ajout de produit (contrôlé). Appelle onSubmit (async) et ne se
 * réinitialise QUE si la création a réussi (sinon l'utilisateur garde sa saisie).
 */
export default function AddProductForm({
  onSubmit,
}: {
  onSubmit: (p: NewProductInput) => Promise<boolean> | boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [qty, setQty] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [submitting, setSubmitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(t('stock.photo.invalidType'), 'error');
      return;
    }
    setUploadingImage(true);
    try {
      const { url } = await uploadImage(file);
      setImageUrl(url);
    } catch (err) {
      toast(imageUploadError(err, t), 'error');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await onSubmit({
        name: name.trim(),
        category: category || 'Alimentation',
        buyPrice: Number(buyPrice) || 0,
        sellPrice: Number(sellPrice) || 0,
        qty: Number(qty) || 0,
        threshold: Number(threshold) || 0,
        imageUrl,
      });
      if (ok) {
        setName('');
        setCategory('');
        setBuyPrice('');
        setSellPrice('');
        setQty('');
        setThreshold('5');
        setImageUrl(null);
      }
    } finally {
      setSubmitting(false);
    }
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
        {/* Photo */}
        <div className="flex items-center gap-3">
          <div className="bg-muted border-border flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border">
            {imageUrl ? (
              // next/image non utilisable (URLs Cloudinary distantes non déclarées).
              <img
                src={imageUrl}
                alt={t('stock.photo.label')}
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon i="image" size={18} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>{t('stock.photo.label')}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingImage}
              className="border-border bg-surface text-foreground font-body flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              <Icon i="upload" size={12} />
              {uploadingImage
                ? t('stock.photo.uploading')
                : imageUrl
                  ? t('stock.photo.change')
                  : t('stock.photo.add')}
            </button>
          </div>
        </div>

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
          disabled={submitting}
          className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
        >
          <Icon i="plus" size={15} />
          {t('stock.form.submit')}
        </button>
      </form>
    </div>
  );
}
