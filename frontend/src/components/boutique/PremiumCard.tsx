'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import PremiumWaitlistModal from './PremiumWaitlistModal';

/** Carte teaser Premium compacte (sidebar). Ouvre la modale de liste d'attente. */
export default function PremiumCard() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover-lift group relative w-full overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/90 to-amber-700/90 px-3.5 py-3 text-start shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
            <Icon i="sparkles" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-bold text-white">{t('premium.card.title')}</p>
            <p className="font-body text-[11px] text-white/80">{t('premium.card.sub')}</p>
          </div>
          <Icon i="chevron-right" size={16} className="text-white/80 rtl:rotate-180" />
        </div>
      </button>
      <PremiumWaitlistModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
