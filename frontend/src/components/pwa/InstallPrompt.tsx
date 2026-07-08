'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

/** Événement non-standard émis par Chrome/Edge/Android quand l'app est installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// « Plus tard » n'est plus définitif : on mémorise l'horodatage du dernier refus
// et on ré-invite après 3 jours, tant que l'app n'est pas installée.
const SNOOZE_KEY = 'pwa-install-snooze';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/** App déjà installée (lancée en mode autonome) — sur Android/desktop ET iOS. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari expose ce drapeau quand l'app est ouverte depuis l'écran d'accueil.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Rappel encore « en sommeil » (moins de 3 jours depuis le dernier « Plus tard »). */
function isSnoozed(): boolean {
  const ts = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
  return Number.isFinite(ts) && ts > 0 && Date.now() - ts < SNOOZE_MS;
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
 * Masquée si déjà installée. « Plus tard » reporte le rappel de 3 jours.
 */
export default function InstallPrompt() {
  const t = useT();
  const [mode, setMode] = useState<Mode>('hidden');
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isSnoozed()) return;

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
      // Installée → on ne rappellera plus (et pas de rappel résiduel).
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
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
    // Reporte le rappel de 3 jours (au lieu de le masquer définitivement).
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setEvt(null);
    setMode('hidden');
  }

  if (mode === 'hidden') return null;
  const isIos = mode === 'ios';

  return (
    <div className="animate-fade-in-up fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[110] p-3 lg:bottom-0">
      <div className="bg-primary text-primary-foreground mx-auto flex max-w-2xl items-center gap-3 rounded-xl px-4 py-3 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <Icon i={isIos ? 'share' : 'download'} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-headings truncate text-sm font-bold">
            {t(isIos ? 'pwa.ios.title' : 'pwa.install.title')}
          </p>
          <p className="font-body text-xs opacity-80">
            {t(isIos ? 'pwa.ios.body' : 'pwa.install.body')}
          </p>
        </div>
        <button
          type="button"
          onClick={later}
          className="font-body shrink-0 rounded-md px-3 py-2 text-xs font-semibold opacity-80 hover:opacity-100"
        >
          {t('pwa.install.later')}
        </button>
        {!isIos && (
          <button
            type="button"
            onClick={install}
            className="text-primary font-body shrink-0 rounded-md bg-white px-4 py-2 text-xs font-bold transition-transform hover:scale-[1.02]"
          >
            {t('pwa.install.cta')}
          </button>
        )}
      </div>
    </div>
  );
}
