'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import ComboBox from '@/components/ui/ComboBox';
import ImageCropModal from '@/components/boutique/ImageCropModal';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { ApiError } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { useSupplierDebt, type SupplierDebtValue } from './useSupplierDebt';

export interface NewProductInput {
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  qty: number;
  threshold: number;
  imageUrl: string | null;
  barcode: string | null;
  supplierDebt?: SupplierDebtValue;
}

/** Unités de vente proposées par défaut (l'utilisateur peut en créer d'autres). */
export const UNIT_OPTIONS = ['pièce', 'carton', 'kg', 'sac', 'litre', 'sachet', 'paquet', 'bidon'];

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

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

/**
 * Formulaire d'ajout de produit (contrôlé). Appelle onSubmit (async) et ne se
 * réinitialise QUE si la création a réussi (sinon l'utilisateur garde sa saisie).
 */
export default function AddProductForm({
  onSubmit,
  onDone,
  categories = [],
}: {
  onSubmit: (p: NewProductInput) => Promise<boolean> | boolean;
  /** Appelé après une création réussie (ferme la modale parente). */
  onDone?: () => void;
  /** Catégories déjà utilisées par la boutique (l'utilisateur peut en créer d'autres). */
  categories?: string[];
}) {
  const t = useT();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [prixGros, setPrixGros] = useState('');
  const [unite, setUnite] = useState('pièce');
  const [qty, setQty] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bloc « payé au fournisseur ? » — le reste dû devient une dette fournisseur.
  const cost = (Number(qty) || 0) * (Number(buyPrice) || 0);
  const { node: supplierNode, debt: supplierDebt } = useSupplierDebt(cost);

  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  function handleImageFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(t('stock.photo.invalidType'), 'error');
      return;
    }
    setCropFile(file); // ouvre le recadrage ; l'upload se fait après validation
  }

  async function uploadCropped(cropped: File) {
    setCropFile(null);
    setUploadingImage(true);
    try {
      const { url } = await uploadImage(cropped);
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
        category: category.trim() || 'Divers',
        buyPrice: Number(buyPrice) || 0,
        sellPrice: Number(sellPrice) || 0,
        prixGros: Number(prixGros) || 0,
        unite: unite.trim() || 'pièce',
        qty: Number(qty) || 0,
        threshold: Number(threshold) || 0,
        imageUrl,
        barcode: barcode.trim() || null,
        ...(supplierDebt ? { supplierDebt } : {}),
      });
      if (ok) {
        setName('');
        setCategory('');
        setBuyPrice('');
        setSellPrice('');
        setPrixGros('');
        setUnite('pièce');
        setQty('');
        setThreshold('5');
        setBarcode('');
        setImageUrl(null);
        onDone?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-muted-foreground font-body -mt-1 text-xs">{t('stock.form.subtitle')}</p>
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
        <label className={labelClass}>{t('common.category')}</label>
        <ComboBox
          value={category}
          onChange={setCategory}
          options={categories}
          creatable
          placeholder={t('stock.form.categoryPlaceholder')}
        />
        <p className="text-muted-foreground font-body text-[11px]">
          {t('stock.form.categoryHint')}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="np-barcode">
          {t('stock.form.barcode')}
        </label>
        <div className={`${fieldClass} flex items-center gap-2 focus-within:border-primary`}>
          <Icon i="scan-barcode" size={15} className="text-muted-foreground shrink-0" />
          <input
            id="np-barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder={t('stock.form.barcodePlaceholder')}
            className="text-foreground placeholder:text-muted-foreground w-full bg-transparent outline-none"
          />
        </div>
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
          <label className={labelClass} htmlFor="np-gros">
            {t('stock.form.wholesalePrice')}
          </label>
          <input
            id="np-gros"
            type="number"
            min="0"
            value={prixGros}
            onChange={(e) => setPrixGros(e.target.value)}
            placeholder="0"
            className={`${fieldClass} placeholder:text-muted-foreground`}
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

      {supplierNode}

      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground font-body mt-1 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold disabled:opacity-60"
      >
        <Icon i="plus" size={15} />
        {t('stock.form.submit')}
      </button>

      <ImageCropModal
        file={cropFile}
        aspect={1}
        onCancel={() => setCropFile(null)}
        onConfirm={uploadCropped}
      />
    </form>
  );
}
