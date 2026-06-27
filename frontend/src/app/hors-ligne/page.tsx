'use client';

import { useEffect } from 'react';
import { useT } from '@/contexts/LocaleContext';

/**
 * Page de repli servie par le service worker quand une navigation échoue
 * faute de réseau (et que la page demandée n'est pas en cache). Volontairement
 * autonome : aucune donnée à charger. Les icônes sont en SVG **inline** (et non
 * via le chargeur d'icônes réseau) pour rester visibles hors-ligne. Recharge
 * automatiquement dès que la connexion revient.
 */
export default function HorsLignePage() {
  const t = useT();

  useEffect(() => {
    const onBack = () => window.location.reload();
    window.addEventListener('online', onBack);
    return () => window.removeEventListener('online', onBack);
  }, []);

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="bg-muted text-muted-foreground flex h-16 w-16 items-center justify-center rounded-2xl">
        {/* cloud-off (lucide) en inline */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m2 2 20 20" />
          <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
          <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-headings text-foreground text-xl font-bold">{t('offline.title')}</h1>
        <p className="text-muted-foreground font-body max-w-sm text-sm">{t('offline.body')}</p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground font-body inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
      >
        {/* refresh-cw (lucide) en inline */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        {t('offline.retry')}
      </button>
    </div>
  );
}
