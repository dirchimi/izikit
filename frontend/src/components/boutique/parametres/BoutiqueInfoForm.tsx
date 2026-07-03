'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import ComboBox from '@/components/ui/ComboBox';
import ImageCropModal from '@/components/boutique/ImageCropModal';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { ApiError } from '@/lib/api';
import { uploadImage } from '@/lib/upload';

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60';

// Mêmes clés que l'assistant d'onboarding ; libellés via les clés i18n onb.type.*.
const BIZ_KEYS = [
  'alimentation',
  'vetements',
  'electronique',
  'cosmetiques',
  'pharmacie',
  'quincaillerie',
  'restauration',
  'autre',
] as const;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface BoutiqueInfoValues {
  name: string;
  phone: string;
  city: string;
  businessType: string;
  address: string;
  note: string;
}

function logoUploadError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'FILE_TOO_LARGE':
        return t('parametres.logo.tooLarge');
      case 'INVALID_MIME':
      case 'MAGIC_BYTE_MISMATCH':
        return t('parametres.logo.invalidType');
      case 'STORAGE_NOT_CONFIGURED':
        return t('parametres.logo.notConfigured');
      default:
        return t('parametres.logo.uploadFailed');
    }
  }
  return t('parametres.logo.uploadFailed');
}

/** Carte « Informations de la boutique » — contrôlée par `initial`, save async. */
export default function BoutiqueInfoForm({
  initial,
  initialLogoUrl,
  onSave,
  onSaveLogo,
}: {
  initial: BoutiqueInfoValues;
  initialLogoUrl: string | null;
  onSave: (values: BoutiqueInfoValues) => Promise<void> | void;
  onSaveLogo: (logoUrl: string) => Promise<void>;
}) {
  const t = useT();
  const { toast } = useToast();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [city, setCity] = useState(initial.city);
  const [businessType, setBusinessType] = useState(initial.businessType);
  const [address, setAddress] = useState(initial.address);
  const [note, setNote] = useState(initial.note);
  const [saving, setSaving] = useState(false);

  // ComboBox affiche la valeur (un libellé) ; on convertit clé ↔ libellé.
  const bizLabel = (key: string) => (key ? t(`onb.type.${key}`) : '');
  const bizOptions = BIZ_KEYS.map((k) => t(`onb.type.${k}`));
  const keyFromLabel = (label: string) => BIZ_KEYS.find((k) => t(`onb.type.${k}`) === label) ?? '';

  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Re-synchronise l'aperçu quand le parent recharge la boutique (le state était
  // figé à la valeur initiale — le logo n'apparaissait pas après un refresh).
  useEffect(() => {
    setLogoUrl(initialLogoUrl);
  }, [initialLogoUrl]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, phone, city, businessType, address, note });
    } finally {
      setSaving(false);
    }
  }

  function handleLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // autorise la re-sélection du même fichier
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(t('parametres.logo.invalidType'), 'error');
      return;
    }
    setCropFile(file); // recadrage avant upload
  }

  async function uploadCroppedLogo(cropped: File) {
    setCropFile(null);
    setUploadingLogo(true);
    try {
      const { url } = await uploadImage(cropped);
      await onSaveLogo(url);
      setLogoUrl(url);
      toast(t('parametres.logo.updated'), 'success');
    } catch (err) {
      toast(logoUploadError(err, t), 'error');
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border-border rounded-lg border">
      <div className="border-border border-b px-5 py-4 md:px-6">
        <h2 className="font-headings text-foreground text-base font-bold">
          {t('parametres.info.title')}
        </h2>
        <p className="text-muted-foreground font-body mt-0.5 text-xs">
          {t('parametres.info.subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 md:px-6">
        {/* Logo */}
        <div className="flex items-center gap-5">
          <div className="bg-primary flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={t('parametres.logo.title')}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-headings text-primary-foreground text-2xl font-bold">S</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-body text-foreground text-sm font-semibold">
              {t('parametres.logo.title')}
            </span>
            <span className="text-muted-foreground font-body text-xs">
              {t('parametres.logo.hint')}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
              className="border-border bg-surface text-foreground font-body mt-1 flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              <Icon i="upload" size={12} />
              {uploadingLogo ? t('parametres.logo.uploading') : t('parametres.logo.change')}
            </button>
          </div>
        </div>

        {/* Champs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="bi-name">
              {t('parametres.field.name')}
            </label>
            <input
              id="bi-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="bi-phone">
              {t('parametres.field.phone')}
            </label>
            <input
              id="bi-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="bi-city">
              {t('parametres.field.city')}
            </label>
            <input
              id="bi-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>{t('parametres.field.businessType')}</label>
            <ComboBox
              value={bizLabel(businessType)}
              onChange={(label) => setBusinessType(keyFromLabel(label))}
              options={bizOptions}
              allLabel={t('parametres.field.businessTypeNone')}
              placeholder={t('parametres.field.businessTypePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="bi-address">
              {t('parametres.field.address')}
            </label>
            <input
              id="bi-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('parametres.field.addressPlaceholder')}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="bi-note">
            {t('parametres.field.note')}
          </label>
          <textarea
            id="bi-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('parametres.field.notePlaceholder')}
            className={`${fieldClass} min-h-14 resize-none`}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <Icon i="save" size={14} />
            {t('common.save')}
          </button>
        </div>
      </div>

      <ImageCropModal
        file={cropFile}
        aspect={1}
        round
        onCancel={() => setCropFile(null)}
        onConfirm={uploadCroppedLogo}
      />
    </form>
  );
}
