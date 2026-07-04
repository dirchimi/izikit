'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Icon from '@/components/ui/Icon';
import ImageCropModal from '@/components/boutique/ImageCropModal';
import AsyncState from '@/components/boutique/AsyncState';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { useApi, setCache } from '@/lib/useApi';
import { uploadImage } from '@/lib/upload';
import { formatFCFA } from '@/lib/boutique/format';

interface OrgCurrent {
  organization: { name: string };
  settings: {
    city: string | null;
    phone: string | null;
    address: string | null;
    invoiceNote: string | null;
    logoUrl: string | null;
  };
}

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60';

/**
 * Réglages « Facturation » = APPARENCE DU REÇU. Pilote ce qui s'affiche sur le
 * ticket (logo, téléphone, adresse, note de bas) avec un aperçu en direct.
 * Les champs sont ceux de la boutique (laisser vide = ne pas afficher). Sauve
 * via PATCH /api/org/current (même contrat que l'onglet Boutique).
 */
export default function FacturationSection() {
  const t = useT();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<OrgCurrent>('/api/org/current');

  const [form, setForm] = useState<{ phone: string; address: string; note: string } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialise une seule fois (les revalidations n'écrasent pas la saisie).
  useEffect(() => {
    if (data && form === null) {
      setForm({
        phone: data.settings.phone ?? '',
        address: data.settings.address ?? '',
        note: data.settings.invoiceNote ?? '',
      });
      setLogoUrl(data.settings.logoUrl);
    }
  }, [data, form]);

  const shopName = data?.organization.name ?? 'Boutique';
  const city = data?.settings.city ?? '';

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api<OrgCurrent>('/api/org/current', {
        method: 'PATCH',
        body: {
          phone: form.phone || null,
          address: form.address || null,
          invoiceNote: form.note || null,
        },
      });
      setCache('/api/org/current', updated);
      toast(t('parametres.savedToast'), 'success');
      await refresh();
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
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
      await api('/api/org/current', { method: 'PATCH', body: { logoUrl: url } });
      setLogoUrl(url);
      toast(t('parametres.logo.updated'), 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('parametres.logo.uploadFailed'), 'error');
    } finally {
      setUploadingLogo(false);
    }
  }

  // Tant que le formulaire n'est pas initialisé : squelette / erreur+retry si le
  // GET a échoué (avant : chargement perpétuel silencieux).
  if (!form) {
    return (
      <AsyncState loading={loading} error={error} onRetry={refresh}>
        <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
          {t('common.loading')}
        </div>
      </AsyncState>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* Formulaire */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="bg-surface border-border flex-1 rounded-lg border"
      >
        <div className="border-border border-b px-5 py-4 md:px-6">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('parametres.facturation.title')}
          </h2>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {t('parametres.facturation.subtitle')}
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

          {/* Coordonnées affichées sur le reçu */}
          <p className="text-muted-foreground font-body -mb-1 text-xs">
            {t('parametres.facturation.hint')}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fac-phone">
                {t('parametres.field.phone')}
              </label>
              <input
                id="fac-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fac-address">
                {t('parametres.field.address')}
              </label>
              <input
                id="fac-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={t('parametres.field.addressPlaceholder')}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="fac-note">
              {t('parametres.facturation.note')}
            </label>
            <textarea
              id="fac-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t('receipt.thanks')}
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
      </form>

      {/* Aperçu du reçu */}
      <div className="lg:w-[300px]">
        <p className="font-body text-muted-foreground mb-2 text-xs font-semibold">
          {t('parametres.facturation.previewTitle')}
        </p>
        <div className="rounded-lg border border-neutral-300 bg-white px-5 py-5 text-neutral-800 shadow-sm">
          <div className="flex flex-col items-center gap-1 text-center">
            {logoUrl && (
              <img src={logoUrl} alt="" className="mb-1 h-12 w-12 rounded-md object-cover" />
            )}
            <p className="font-headings text-base font-bold text-neutral-900">{shopName}</p>
            {city && <p className="font-body text-xs text-neutral-500">{city}</p>}
            {form.phone && <p className="font-body text-xs text-neutral-500">{form.phone}</p>}
            {form.address && <p className="font-body text-xs text-neutral-500">{form.address}</p>}
          </div>
          <div className="my-3 border-t border-dashed border-neutral-300" />
          <div className="font-body flex justify-between text-sm">
            <span className="text-neutral-800">
              {t('common.article')} <span className="text-neutral-400">x1</span>
            </span>
            <span className="font-semibold text-neutral-900">{formatFCFA(1000)}</span>
          </div>
          <div className="my-3 border-t border-neutral-300" />
          <div className="font-body flex justify-between text-base font-bold text-neutral-900">
            <span>{t('common.total')}</span>
            <span>
              {formatFCFA(1000)} {t('common.fcfa')}
            </span>
          </div>
          <div className="my-3 border-t border-dashed border-neutral-300" />
          <p className="font-body text-center text-xs text-neutral-500">
            {form.note || t('receipt.thanks')}
          </p>
        </div>
      </div>

      <ImageCropModal
        file={cropFile}
        aspect={1}
        round
        onCancel={() => setCropFile(null)}
        onConfirm={uploadCroppedLogo}
      />
    </div>
  );
}
