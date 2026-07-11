'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

/** Événement non-standard émis par Chrome/Edge/Android quand l'app est installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// « Plus tard » ne masque que pour la SESSION en cours (sessionStorage) : la
// bannière réapparaît à chaque nouvelle ouverture de l'app, tant qu'elle n'est
// pas installée. On évite ainsi le trou de 3 jours qui tuait l'installation
// pendant l'onboarding, sans harceler le client au sein d'une même visite.
const DISMISS_KEY = 'pwa-install-dismissed';

/** App déjà installée (lancée en mode autonome) — sur Android/desktop ET iOS. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari expose ce drapeau quand l'app est ouverte depuis l'écran d'accueil.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** « Plus tard » déjà cliqué durant cette session (repart à zéro à la réouverture). */
function isDismissedThisSession(): boolean {
  return window.sessionStorage.getItem(DISMISS_KEY) === '1';
}

/**
 * iPhone / iPad sous Safari : la seule voie d'installation est manuelle
 * (Partager → « Sur l'écran d'accueil »). Les autres navigateurs iOS (Chrome,
 * Firefox…) ne savent pas installer, on ne leur montre donc rien.
 */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ se déclare comme un Mac : on le repère au support tactile.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios|android/i.test(ua);
  return iOS && safari;
}

type Mode = 'hidden' | 'android' | 'ios';

/**
 * Bannière « Installer l'application » (PWA). Deux cas :
 *  - Android / Chrome / Edge : on capte `beforeinstallprompt` et on déclenche
 *    l'invite native au clic sur « Installer ».
 *  - iOS Safari : cet événement n'existe pas (restriction Apple) → on affiche
 *    une consigne pour ajouter l'app manuellement à l'écran d'accueil.
 * Masquée si déjà installée. « Plus tard » ne masque que la session en cours.
 */
export default function InstallPrompt() {
  const t = useT();
  const [mode, setMode] = useState<Mode>('hidden');
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isDismissedThisSession()) return;

    // iOS : aucune invite native → consigne manuelle immédiate.
    if (isIosSafari()) {
      setMode('ios');
      return;
    }

    // Android / Chrome / Edge : on attend le signal d'installabilité du navigateur.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setMode('android');
    };
    const onInstalled = () => {
      // Installée → plus rien à proposer. isStandalone() prendra le relais aux
      // ouvertures suivantes ; on marque la session pour éviter tout résidu.
      window.sessionStorage.setItem(DISMISS_KEY, '1');
      setEvt(null);
      setMode('hidden');
    };
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
    setMode('hidden');
    setEvt(null);
    await e.prompt();
    await e.userChoice;
  }

  function later() {
    // Masque pour cette session seulement : la bannière reviendra à la prochaine
    // ouverture de l'app, tant que le client n'a pas installé.
    window.sessionStorage.setItem(DISMISS_KEY, '1');
    setEvt(null);
    setMode('hidden');
  }

  if (mode === 'hidden') return null;

  const wrapperCls =
    'animate-fade-in-up fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[110] p-3 lg:bottom-0';

  // iOS : Apple interdit de déclencher l'installation depuis la page. On affiche
  // donc une carte de consignes en 2 étapes, en insistant sur le bouton Partager
  // de SAFARI (barre du bas de l'écran) — pas une icône cliquable de la bannière.
  if (mode === 'ios') {
    return (
      <div className={wrapperCls}>
        <div className="bg-primary text-primary-foreground mx-auto flex max-w-2xl flex-col gap-3 rounded-xl px-4 py-3 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icon i="share" size={18} />
              </div>
              <p className="font-headings text-sm font-bold">{t('pwa.ios.title')}</p>
            </div>
            <button
              type="button"
              onClick={later}
              className="font-body shrink-0 rounded-md px-3 py-2 text-xs font-semibold opacity-80 hover:opacity-100"
            >
              {t('pwa.install.later')}
            </button>
          </div>
          <ol className="font-body flex flex-col gap-2 text-xs">
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                1
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {t('pwa.ios.step1')}
                <Icon i="share" size={13} className="opacity-90" />
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                2
              </span>
              <span>{t('pwa.ios.step2')}</span>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  // Android / Chrome / Edge : invite native au clic sur « Installer ».
  return (
    <div className={wrapperCls}>
      <div className="bg-primary text-primary-foreground mx-auto flex max-w-2xl items-center gap-3 rounded-xl px-4 py-3 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <Icon i="download" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-headings truncate text-sm font-bold">{t('pwa.install.title')}</p>
          <p className="font-body text-xs opacity-80">{t('pwa.install.body')}</p>
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
