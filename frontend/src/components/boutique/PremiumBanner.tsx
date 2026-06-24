'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import PremiumWaitlistModal from './PremiumWaitlistModal';

/** Bannière teaser Premium (large, pour le tableau de bord). */
export default function PremiumBanner() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 px-5 py-4 shadow-md md:px-7 md:py-5">
        {/* halo décoratif */}
        <div className="pointer-events-none absolute -end-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm">
              <Icon i="sparkles" size={22} />
            </span>
            <div>
              <p className="font-headings text-base font-bold text-white md:text-lg">
                {t('premium.banner.title')}
              </p>
              <p className="font-body text-sm text-white/85">{t('premium.banner.sub')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-body flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm transition-transform hover:scale-[1.03]"
          >
            <Icon i="bell-ring" size={15} />
            {t('premium.cta')}
          </button>
        </div>
      </div>
      <PremiumWaitlistModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
