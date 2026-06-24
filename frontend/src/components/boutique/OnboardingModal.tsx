'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { useT } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Accueil premier lancement — modale de bienvenue affichée une seule fois par
 * utilisateur (drapeau localStorage `sah_onboarded_<userId>`). Aucune dépendance
 * serveur : purement côté client, sûre à monter dans une page serveur.
 */
const STEPS: Array<{ icon: string; titleKey: string; bodyKey: string; href: string }> = [
  { icon: 'package-plus', titleKey: 'onb.s1.title', bodyKey: 'onb.s1.body', href: '/stock' },
  { icon: 'shopping-cart', titleKey: 'onb.s2.title', bodyKey: 'onb.s2.body', href: '/vendre' },
  {
    icon: 'chart-no-axes-combined',
    titleKey: 'onb.s3.title',
    bodyKey: 'onb.s3.body',
    href: '/rapports',
  },
];

export default function OnboardingModal() {
  const t = useT();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    const key = `sah_onboarded_${user.id}`;
    try {
      if (!window.localStorage.getItem(key)) setOpen(true);
    } catch {
      /* localStorage indisponible (mode privé) — on n'affiche rien. */
    }
  }, [loading, user]);

  function dismiss() {
    setOpen(false);
    if (user) {
      try {
        window.localStorage.setItem(`sah_onboarded_${user.id}`, '1');
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <Modal open={open} onClose={dismiss} size="md" hideClose>
      <div className="flex flex-col items-center text-center">
        <span className="bg-primary/10 text-primary mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          <Icon i="party-popper" size={28} />
        </span>
        <h2 className="font-headings text-foreground text-xl font-bold">{t('onb.title')}</h2>
        <p className="text-muted-foreground font-body mt-1.5 max-w-sm text-sm">{t('onb.sub')}</p>
      </div>

      <div className="stagger mt-6 flex flex-col gap-3">
        {STEPS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            onClick={dismiss}
            className="border-border bg-surface hover:border-primary hover-lift flex items-start gap-3 rounded-xl border p-3.5 text-start transition-colors"
          >
            <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              <Icon i={s.icon} size={18} />
            </span>
            <span className="min-w-0">
              <span className="font-body text-foreground block text-sm font-semibold">
                {t(s.titleKey)}
              </span>
              <span className="font-body text-muted-foreground block text-xs">{t(s.bodyKey)}</span>
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
        onClick={dismiss}
        className="bg-primary text-primary-foreground font-body mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-transform hover:scale-[1.01]"
      >
        {t('onb.start')}
      </button>
    </Modal>
  );
}
