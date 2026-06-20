'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60';

export interface BoutiqueInfoValues {
  name: string;
  phone: string;
  city: string;
  address: string;
  note: string;
}

/** Carte « Informations de la boutique » — contrôlée par `initial`, save async. */
export default function BoutiqueInfoForm({
  initial,
  onSave,
  onLogo,
}: {
  initial: BoutiqueInfoValues;
  onSave: (values: BoutiqueInfoValues) => Promise<void> | void;
  onLogo: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [city, setCity] = useState(initial.city);
  const [address, setAddress] = useState(initial.address);
  const [note, setNote] = useState(initial.note);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, phone, city, address, note });
    } finally {
      setSaving(false);
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
          <div className="bg-primary flex h-16 w-16 shrink-0 items-center justify-center rounded-lg">
            <span className="font-headings text-primary-foreground text-2xl font-bold">S</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-body text-foreground text-sm font-semibold">
              {t('parametres.logo.title')}
            </span>
            <span className="text-muted-foreground font-body text-xs">
              {t('parametres.logo.hint')}
            </span>
            <button
              type="button"
              onClick={onLogo}
              className="border-border bg-surface text-foreground font-body mt-1 flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
            >
              <Icon i="upload" size={12} />
              {t('parametres.logo.change')}
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
    </form>
  );
}
