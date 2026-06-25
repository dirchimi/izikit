'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { useT } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';

/**
 * Assistant de configuration au PREMIER lancement (une seule fois, à vie, par
 * compte — source de vérité `User.onboardedAt`). Pose quelques questions et
 * pré-remplit les réglages de la boutique (PATCH /api/org/current). L'utilisateur
 * peut passer à tout moment ; on marque alors quand même le compte comme accueilli.
 */

interface BoutiqueCurrent {
  organization: { name: string };
  settings: {
    city: string | null;
    phone: string | null;
    businessType: string | null;
  };
}

// Types de commerce proposés (clé stockée + icône Lucide + clé i18n du libellé).
const BUSINESS_TYPES: Array<{ key: string; icon: string }> = [
  { key: 'alimentation', icon: 'shopping-basket' },
  { key: 'vetements', icon: 'shirt' },
  { key: 'electronique', icon: 'smartphone' },
  { key: 'cosmetiques', icon: 'sparkles' },
  { key: 'pharmacie', icon: 'pill' },
  { key: 'quincaillerie', icon: 'wrench' },
  { key: 'restauration', icon: 'utensils-crossed' },
  { key: 'autre', icon: 'store' },
];

// Raccourcis de démarrage (écran final).
const QUICK_STARTS: Array<{ icon: string; titleKey: string; bodyKey: string; href: string }> = [
  { icon: 'package-plus', titleKey: 'onb.s1.title', bodyKey: 'onb.s1.body', href: '/stock' },
  { icon: 'shopping-cart', titleKey: 'onb.s2.title', bodyKey: 'onb.s2.body', href: '/vendre' },
  {
    icon: 'chart-no-axes-combined',
    titleKey: 'onb.s3.title',
    bodyKey: 'onb.s3.body',
    href: '/rapports',
  },
];

const TOTAL_STEPS = 3; // 0=nom, 1=type, 2=contact ; 3=écran final

// Garde de session : une fois fermé, on ne rouvre plus même en navigant (le
// `user` en mémoire n'est pas rafraîchi instantanément). Source de vérité = serveur.
let dismissedThisSession = false;

const inputClass =
  'border-border bg-input text-foreground font-body focus:border-primary w-full rounded-md border px-3 py-2.5 text-sm outline-none';
const labelClass = 'text-foreground font-body text-sm font-semibold';

export default function OnboardingModal() {
  const t = useT();
  const { user, loading, refresh } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');

  // Ouverture : compte jamais accueilli (onboardedAt === null), une seule fois.
  useEffect(() => {
    if (loading || !user) return;
    if (!dismissedThisSession && user.onboardedAt === null) setOpen(true);
  }, [loading, user]);

  // Pré-remplissage depuis la boutique courante (nom auto, ville, téléphone…).
  useEffect(() => {
    if (!open || prefilled) return;
    let alive = true;
    void api<BoutiqueCurrent>('/api/org/current')
      .then((b) => {
        if (!alive) return;
        setName(b.organization.name ?? '');
        setCity(b.settings.city ?? '');
        setPhone(b.settings.phone ?? '');
        setBusinessType(b.settings.businessType ?? '');
        setPrefilled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, prefilled]);

  async function markOnboarded() {
    try {
      await api('/api/auth/onboarded', { method: 'POST' });
      await refresh();
    } catch {
      /* le garde de session empêche la réouverture même si l'appel échoue */
    }
  }

  function close() {
    dismissedThisSession = true;
    setOpen(false);
  }

  function skip() {
    close();
    void markOnboarded();
  }

  async function finishSetup() {
    setSaving(true);
    try {
      await api('/api/org/current', {
        method: 'PATCH',
        body: {
          ...(name.trim() ? { name: name.trim() } : {}),
          businessType: businessType || null,
          city: city.trim() || null,
          phone: phone.trim() || null,
        },
      });
      toast(t('onb.savedToast'), 'success');
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setSaving(false);
    }
    await markOnboarded();
    setStep(TOTAL_STEPS); // écran final
  }

  return (
    <Modal open={open} onClose={skip} size="md" hideClose>
      {step < TOTAL_STEPS ? (
        <div className="flex flex-col">
          {/* Progression + Passer */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? 'bg-primary w-6'
                      : i < step
                        ? 'bg-primary/40 w-1.5'
                        : 'bg-muted w-1.5'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={skip}
              className="text-muted-foreground hover:text-foreground font-body text-xs font-semibold"
            >
              {t('onb.skip')}
            </button>
          </div>

          {/* Étape 0 — Nom */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="bg-primary/10 text-primary flex h-14 w-14 items-center justify-center rounded-2xl">
                  <Icon i="party-popper" size={28} />
                </span>
                <h2 className="font-headings text-foreground text-xl font-bold">
                  {t('onb.title')}
                </h2>
                <p className="text-muted-foreground font-body max-w-sm text-sm">
                  {t('onb.wizard.intro')}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="onb-name">
                  {t('onb.q.name')}
                </label>
                <input
                  id="onb-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('onb.q.namePlaceholder')}
                  className={inputClass}
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Étape 1 — Type de commerce */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-headings text-foreground text-lg font-bold">
                  {t('onb.q.type')}
                </h2>
                <p className="text-muted-foreground font-body text-sm">{t('onb.q.typeHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {BUSINESS_TYPES.map((b) => {
                  const active = businessType === b.key;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBusinessType(b.key)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                        active
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/60'
                      }`}
                    >
                      <Icon i={b.icon} size={22} />
                      <span className="font-body text-foreground text-center text-xs font-medium">
                        {t(`onb.type.${b.key}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Étape 2 — Ville + téléphone */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-headings text-foreground text-lg font-bold">
                  {t('onb.q.contact')}
                </h2>
                <p className="text-muted-foreground font-body text-sm">{t('onb.q.contactHint')}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="onb-city">
                  {t('onb.q.city')}
                </label>
                <input
                  id="onb-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('onb.q.cityPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="onb-phone">
                  {t('onb.q.phone')}
                </label>
                <input
                  id="onb-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('onb.q.phonePlaceholder')}
                  className={inputClass}
                  inputMode="tel"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={saving}
                className="border-border bg-surface text-foreground font-body rounded-xl border px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
              >
                {t('onb.back')}
              </button>
            )}
            <button
              type="button"
              onClick={() => (step === TOTAL_STEPS - 1 ? finishSetup() : setStep((s) => s + 1))}
              disabled={saving}
              className="bg-primary text-primary-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {saving ? (
                <Icon i="loader-2" size={16} className="animate-spin" />
              ) : (
                <>
                  {step === TOTAL_STEPS - 1 ? t('onb.finish') : t('onb.next')}
                  <Icon i="arrow-right" size={15} className="rtl:rotate-180" />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Écran final — raccourcis de démarrage */
        <div className="flex flex-col">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="bg-primary/10 text-primary flex h-14 w-14 items-center justify-center rounded-2xl">
              <Icon i="party-popper" size={28} />
            </span>
            <h2 className="font-headings text-foreground text-xl font-bold">
              {t('onb.done.title')}
            </h2>
            <p className="text-muted-foreground font-body max-w-sm text-sm">{t('onb.done.sub')}</p>
          </div>

          <div className="stagger mt-6 flex flex-col gap-3">
            {QUICK_STARTS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={close}
                className="border-border bg-surface hover:border-primary hover-lift flex items-start gap-3 rounded-xl border p-3.5 text-start transition-colors"
              >
                <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon i={s.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="font-body text-foreground block text-sm font-semibold">
                    {t(s.titleKey)}
                  </span>
                  <span className="font-body text-muted-foreground block text-xs">
                    {t(s.bodyKey)}
                  </span>
                </span>
                <Icon
                  i="arrow-right"
                  size={16}
                  className="text-muted-foreground mt-1 ms-auto shrink-0 rtl:rotate-180"
                />
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={close}
            className="bg-primary text-primary-foreground font-body mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-transform hover:scale-[1.01]"
          >
            {t('onb.done.cta')}
          </button>
        </div>
      )}
    </Modal>
  );
}
