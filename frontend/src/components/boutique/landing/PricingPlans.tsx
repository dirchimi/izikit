'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { CONTACT_WHATSAPP } from '@/lib/contact';
import { ltrIsolate } from '@/lib/i18n/bidi';

// Grille Premium (alignée sur SUB_PERIODS dans lib/subscription/plans.ts) :
// 35 000/mois · 95 000/trim (−10%) · 350 000/an (−17% = 2 mois offerts).
const PERIODS = [
  {
    id: 'monthly',
    labelKey: 'landing.pricing.per.monthly',
    total: '35 000',
    unitKey: 'landing.pricing.unit.monthly',
    perMonth: null,
    savePct: null,
  },
  {
    id: 'quarterly',
    labelKey: 'landing.pricing.per.quarterly',
    total: '95 000',
    unitKey: 'landing.pricing.unit.quarterly',
    perMonth: '≈ 31 700',
    savePct: 10,
  },
  {
    id: 'annual',
    labelKey: 'landing.pricing.per.annual',
    total: '350 000',
    unitKey: 'landing.pricing.unit.annual',
    perMonth: '≈ 29 200',
    savePct: 17,
  },
] as const;

const FREE_ITEMS = [
  'landing.pricing.free.i1',
  'landing.pricing.free.i2',
  'landing.pricing.free.i3',
  'landing.pricing.free.i4',
  'landing.pricing.free.i5',
];

const PREMIUM_ITEMS = [
  'landing.pricing.premium.i1',
  'landing.pricing.premium.i2',
  'landing.pricing.premium.i3',
  'landing.pricing.premium.i4',
  'landing.pricing.premium.i5',
  'landing.pricing.premium.i6',
  'landing.pricing.premium.i7',
];

const ENTREPRISE_ITEMS = [
  'landing.pricing.entreprise.i1',
  'landing.pricing.entreprise.i2',
  'landing.pricing.entreprise.i3',
  'landing.pricing.entreprise.i4',
  'landing.pricing.entreprise.i5',
];

export default function PricingPlans() {
  const t = useT();
  // On démarre sur le MENSUEL : 35 000 rassure, 350 000 d'entrée fait fuir —
  // le visiteur découvre les remises trimestrielle/annuelle en cliquant.
  const [periodId, setPeriodId] = useState<(typeof PERIODS)[number]['id']>('monthly');
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[0];

  return (
    <div className="flex w-full max-w-[1200px] flex-col items-center gap-8">
      {/* Sélecteur de durée (n'affecte que Premium) */}
      <div className="border-border bg-surface inline-flex items-center gap-1 rounded-full border p-1 shadow-sm">
        {PERIODS.map((p) => {
          const active = p.id === periodId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodId(p.id)}
              className={`font-body cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(p.labelKey)}
              {p.savePct && !active && (
                <span dir="ltr" className="text-primary ms-1 text-xs font-bold">
                  −{p.savePct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-3">
        {/* GRATUIT */}
        <div className="bg-background border-border flex flex-col gap-5 rounded-xl border px-7 py-8 shadow-sm">
          <div>
            <p className="text-muted-foreground font-body mb-1 text-xs font-semibold tracking-widest uppercase">
              {t('landing.pricing.free.name')}
            </p>
            <div className="flex items-end gap-1">
              <span className="font-headings text-foreground text-[40px] leading-none font-bold">
                0
              </span>
              <span className="text-muted-foreground font-body pb-1 text-sm">
                {t('common.fcfa')}
              </span>
            </div>
            <p className="text-primary font-body mt-1 text-xs font-semibold">
              {t('landing.pricing.freeForever')}
            </p>
            <p className="text-muted-foreground font-body mt-2 text-sm">
              {t('landing.pricing.free.desc')}
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            {FREE_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <Icon i="check" size={14} className="text-primary" />
                <span className="text-foreground font-body text-sm">{t(item)}</span>
              </div>
            ))}
          </div>
          <Link
            href="/inscription"
            className="border-primary text-primary font-body mt-auto w-full rounded-md border py-3 text-center text-sm font-bold transition hover:opacity-90"
          >
            {t('landing.pricing.free.cta')}
          </Link>
        </div>

        {/* PREMIUM (mis en avant) */}
        <div className="bg-primary border-primary relative flex flex-col gap-5 rounded-xl border px-7 py-8 shadow-[0_24px_48px_-20px] shadow-primary/50 lg:-mt-3 lg:mb-3">
          <span className="bg-primary-foreground text-primary font-body absolute -top-3 end-6 rounded-full px-3 py-0.5 text-xs font-bold shadow-sm">
            {t('landing.pricing.popular')}
          </span>
          <div>
            <p className="text-primary-foreground font-body mb-1 text-xs font-semibold tracking-widest uppercase opacity-70">
              {t('landing.pricing.premium.name')}
            </p>
            <div className="flex items-end gap-1">
              <span
                dir="ltr"
                className="font-headings text-primary-foreground text-[40px] leading-none font-bold"
              >
                {period.total}
              </span>
              <span className="text-primary-foreground font-body pb-1 text-sm opacity-70">
                {t(period.unitKey)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {period.perMonth && (
                <span className="text-primary-foreground font-body text-xs opacity-80">
                  {t('landing.pricing.perMonth', { amount: ltrIsolate(period.perMonth) })}
                </span>
              )}
              {period.savePct && (
                <span className="bg-primary-foreground/20 text-primary-foreground font-body rounded-full px-2 py-0.5 text-xs font-bold">
                  {t('landing.pricing.save', { pct: ltrIsolate(`${period.savePct}%`) })}
                </span>
              )}
            </div>
            <p className="text-primary-foreground font-body mt-2 text-sm opacity-80">
              {t('landing.pricing.premium.desc')}
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            {PREMIUM_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <Icon i="check" size={14} className="text-primary-foreground" />
                <span className="text-primary-foreground font-body text-sm">{t(item)}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <Link
              href="/inscription"
              className="bg-primary-foreground text-primary font-body w-full rounded-md border border-transparent py-3 text-center text-sm font-bold transition hover:opacity-90"
            >
              {t('landing.pricing.premium.cta')}
            </Link>
            <p className="text-primary-foreground font-body text-center text-xs opacity-70">
              {t('landing.pricing.trialNote')}
            </p>
          </div>
        </div>

        {/* ENTREPRISE (sur devis) */}
        <div className="bg-background border-border flex flex-col gap-5 rounded-xl border px-7 py-8 shadow-sm">
          <div>
            <p className="text-muted-foreground font-body mb-1 text-xs font-semibold tracking-widest uppercase">
              {t('landing.pricing.entreprise.name')}
            </p>
            {/* Ancre haute assumée : à côté de 700 000, le Premium à 350 000
                devient « le choix raisonnable ». */}
            <p className="text-muted-foreground font-body text-sm">
              {t('landing.pricing.entreprise.from')}
            </p>
            <div className="flex items-end gap-1">
              <span
                dir="ltr"
                className="font-headings text-foreground text-[28px] leading-none font-bold"
              >
                700 000
              </span>
              <span className="text-muted-foreground font-body pb-0.5 text-sm">
                {t('landing.pricing.unit.annual')}
              </span>
            </div>
            <p className="text-muted-foreground font-body mt-2 text-sm">
              {t('landing.pricing.entreprise.desc')}
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            {ENTREPRISE_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <Icon i="check" size={14} className="text-primary" />
                <span className="text-foreground font-body text-sm">{t(item)}</span>
              </div>
            ))}
          </div>
          <a
            href={CONTACT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="border-primary text-primary font-body mt-auto flex w-full items-center justify-center gap-2 rounded-md border py-3 text-center text-sm font-bold transition hover:opacity-90"
          >
            <Icon i="message-circle" size={14} />
            {t('landing.pricing.entreprise.cta')}
          </a>
        </div>
      </div>

      {/* Petits commerces : canal discret vers les remises négociées sur le
          terrain — on n'affiche jamais de prix cassé public. */}
      <p className="text-muted-foreground font-body text-center text-sm">
        {t('landing.pricing.smallBiz')}{' '}
        <a
          href={CONTACT_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-semibold hover:underline"
        >
          {t('landing.pricing.smallBizCta')}
        </a>
      </p>
    </div>
  );
}
