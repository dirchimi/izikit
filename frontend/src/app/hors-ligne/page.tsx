'use client';

import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

/**
 * Page de repli servie par le service worker quand une navigation échoue
 * faute de réseau (et que la page demandée n'est pas en cache). Volontairement
 * autonome : aucune donnée à charger, juste un message clair + bouton réessayer.
 */
export default function HorsLignePage() {
  const t = useT();

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-2xl">
        <Icon i="cloud-off" size={30} className="text-muted-foreground" />
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
        <Icon i="refresh-cw" size={15} />
        {t('offline.retry')}
      </button>
    </div>
  );
}
