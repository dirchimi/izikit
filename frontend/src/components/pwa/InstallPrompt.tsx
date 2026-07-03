'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

/** Événement non-standard émis par Chrome/Edge/Android quand l'app est installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';

/**
 * Bannière « Installer l'application » (PWA Niveau 1). On capte l'événement
 * `beforeinstallprompt`, on le diffère, puis on déclenche l'invite native au
 * clic. Masquée si déjà installée (standalone) ou si l'utilisateur a dit « Plus
 * tard ». iOS Safari n'émet pas cet événement → la bannière ne s'affiche pas là
 * (l'ajout se fait via Partager → « Sur l'écran d'accueil »).
 */
export default function InstallPrompt() {
  const t = useT();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    const e = evt;
    if (!e) return;
    setEvt(null);
    await e.prompt();
    await e.userChoice;
  }

  function later() {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setEvt(null);
  }

  if (!evt) return null;

  return (
    <div className="animate-fade-in-up fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[110] p-3 lg:bottom-0">
      <div className="bg-primary text-primary-foreground mx-auto flex max-w-2xl items-center gap-3 rounded-xl px-4 py-3 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <Icon i="download" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-headings truncate text-sm font-bold">{t('pwa.install.title')}</p>
          <p className="font-body truncate text-xs opacity-80">{t('pwa.install.body')}</p>
        </div>
        <button
          type="button"
          onClick={later}
          className="font-body shrink-0 rounded-md px-3 py-2 text-xs font-semibold opacity-80 hover:opacity-100"
        >
          {t('pwa.install.later')}
        </button>
        <button
          type="button"
          onClick={install}
          className="text-primary font-body shrink-0 rounded-md bg-white px-4 py-2 text-xs font-bold transition-transform hover:scale-[1.02]"
        >
          {t('pwa.install.cta')}
        </button>
      </div>
    </div>
  );
}
