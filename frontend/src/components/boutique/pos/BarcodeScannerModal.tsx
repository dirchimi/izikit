'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

// L'API BarcodeDetector n'est pas encore typée dans la lib DOM de TS — on en
// déclare le minimum nécessaire (pas de `any`).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}

// Cause d'échec de la caméra → message + aide adaptés.
// `inapp` : navigateur intégré (WhatsApp/Facebook…) qui bloque la caméra.
type ErrKind = 'denied' | 'none' | 'busy' | 'insecure' | 'inapp' | 'generic';

// Contrôleur de scan ZXing (repli iOS/Safari) — juste ce qu'on utilise.
interface ScannerControls {
  stop(): void;
}

/**
 * Détecte le contexte d'exécution (une fois, côté client) :
 *  - `isDesktop` : pointeur précis + pas de tactile → ordinateur. On n'affiche
 *    PAS l'alerte « caméra indisponible » : on invite à taper / lecteur physique.
 *  - `isInApp` : navigateur intégré (ouvert depuis WhatsApp, Facebook, Instagram…)
 *    qui bloque `getUserMedia`. La caméra n'y marchera pas → message dédié.
 */
function detectEnv(): { isDesktop: boolean; isInApp: boolean } {
  if (typeof window === 'undefined') return { isDesktop: false, isInApp: false };
  const ua = navigator.userAgent || '';
  const isInApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|WhatsApp|Snapchat|; wv\)/i.test(ua);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isDesktop = !coarse && !touch;
  return { isDesktop, isInApp };
}

/**
 * Ouvre la caméra arrière, avec repli : si `facingMode: environment` échoue
 * (Android sans caméra « environment » exposée, OverconstrainedError…), on
 * retente avec la caméra par défaut plutôt que d'abandonner.
 */
async function openCamera(md: MediaDevices): Promise<MediaStream> {
  try {
    return await md.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'TypeError') {
      return md.getUserMedia({ video: true });
    }
    throw e;
  }
}

/**
 * Scan de code-barres par la caméra (mobile), UNIVERSEL :
 *  - Android/Chrome : API native `BarcodeDetector` (rapide, zéro dépendance).
 *  - iOS/Safari & autres : repli sur ZXing (`@zxing/browser`, chargé à la volée)
 *    qui décode le même flux caméra en JS. Le scan marche donc sur tous les
 *    téléphones.
 *
 * On demande le flux caméra NOUS-MÊMES (gestion unifiée des permissions), puis
 * on le passe au décodeur adéquat. Ferme dès le premier code lu.
 *
 * En cas d'échec, l'écran reste SIMPLE pour un utilisateur non technique :
 * un bouton « Réessayer » (relance la demande d'autorisation), des étapes
 * concrètes pour débloquer, et surtout un bouton « Saisir à la main » — le
 * plan B fiable qui ne dépend d'aucun réglage.
 */
export default function BarcodeScannerModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [errKind, setErrKind] = useState<ErrKind | null>(null);
  // Incrémenté par « Réessayer » → relance l'effet (nouvelle demande caméra).
  const [attempt, setAttempt] = useState(0);
  // Contexte (ordi vs mobile, navigateur intégré) — calculé une seule fois.
  const [env] = useState(detectEnv);

  const ctor =
    typeof window !== 'undefined'
      ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      : undefined;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    let zxing: ScannerControls | null = null;
    setErrKind(null);

    (async () => {
      try {
        // getUserMedia n'existe qu'en contexte sécurisé (HTTPS ou localhost).
        // Servi en HTTP simple (ex. accès par IP LAN), `mediaDevices` est absent.
        if (!navigator.mediaDevices?.getUserMedia) {
          setErrKind('insecure');
          return;
        }
        stream = await openCamera(navigator.mediaDevices);
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;

        if (ctor) {
          // Chemin natif (Android/Chrome) : BarcodeDetector sur le flux vidéo.
          const detector = new ctor({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          });
          v.srcObject = stream;
          await v.play();
          const tick = async () => {
            if (cancelled) return;
            try {
              const codes = await detector.detect(v);
              const code = codes[0]?.rawValue;
              if (code) {
                onDetectedRef.current(String(code));
                return; // stop après le premier code
              }
            } catch {
              // frame illisible : on réessaie au tick suivant
            }
            raf = requestAnimationFrame(() => void tick());
          };
          raf = requestAnimationFrame(() => void tick());
        } else {
          // Repli universel (iOS/Safari…) : ZXing décode le même flux en JS.
          // Chargé à la volée pour ne pas alourdir le bundle initial.
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (cancelled) {
            stream.getTracks().forEach((tr) => tr.stop());
            return;
          }
          const reader = new BrowserMultiFormatReader();
          zxing = await reader.decodeFromStream(stream, v, (result) => {
            if (cancelled || !result) return;
            onDetectedRef.current(result.getText());
          });
          if (cancelled) zxing.stop();
        }
      } catch (e) {
        // Cause réelle (nom d'erreur DOM) → aide adaptée à l'écran.
        const name = e instanceof Error ? e.name : '';
        // Navigateur intégré : la caméra y est bloquée quelle que soit l'erreur.
        if (env.isInApp && (name === 'NotAllowedError' || name === 'SecurityError' || !name)) {
          setErrKind('inapp');
        } else if (name === 'NotAllowedError' || name === 'SecurityError') {
          setErrKind('denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setErrKind('none');
        } else if (name === 'NotReadableError') {
          setErrKind('busy');
        } else {
          setErrKind('generic');
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (zxing) {
        try {
          zxing.stop();
        } catch {
          // le contrôleur peut déjà être arrêté — sans conséquence
        }
      }
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, ctor, attempt, env]);

  // Message principal selon la cause.
  const errMessage: Record<ErrKind, string> = {
    denied: t('pos.scan.cameraDenied'),
    none: t('pos.scan.cameraNone'),
    busy: t('pos.scan.cameraBusy'),
    insecure: t('pos.scan.cameraInsecure'),
    inapp: t('pos.scan.inappHint'),
    generic: t('pos.scan.cameraError'),
  };

  /** Bouton « Saisir à la main » : ferme le scanner → le champ code reprend le focus. */
  function manualEntry() {
    onClose();
  }

  /** Rouvre la page dans le navigateur système (repli des navigateurs intégrés). */
  function openExternal() {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pos.scan.title')} size="sm">
      {errKind ? (
        env.isDesktop ? (
          // Ordinateur : pas d'alerte anxiogène — lecteur physique ou saisie.
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
                <Icon i="scan-barcode" size={22} />
              </div>
              <p className="font-headings text-foreground text-base font-bold">
                {t('pos.scan.title')}
              </p>
              <p className="font-body text-muted-foreground text-sm">{t('pos.scan.desktopHint')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={manualEntry}
                className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
              >
                <Icon i="keyboard" size={16} />
                {t('pos.scan.manual')}
              </button>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="border-border bg-surface text-foreground font-body flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
              >
                <Icon i="refresh-cw" size={15} />
                {t('pos.scan.retry')}
              </button>
            </div>
          </div>
        ) : errKind === 'inapp' ? (
          // Navigateur intégré (WhatsApp/Facebook…) : ouvrir dans le vrai navigateur.
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="bg-danger/10 text-danger flex h-12 w-12 items-center justify-center rounded-full">
                <Icon i="triangle-alert" size={22} />
              </div>
              <p className="font-headings text-foreground text-base font-bold">
                {t('pos.scan.inappTitle')}
              </p>
              <p className="font-body text-muted-foreground text-sm">{t('pos.scan.inappHint')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={openExternal}
                className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
              >
                <Icon i="external-link" size={16} />
                {t('pos.scan.openBrowser')}
              </button>
              <button
                type="button"
                onClick={manualEntry}
                className="border-border bg-surface text-foreground font-body flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
              >
                <Icon i="keyboard" size={16} />
                {t('pos.scan.manual')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="bg-danger/10 text-danger flex h-12 w-12 items-center justify-center rounded-full">
                <Icon i="camera-off" size={22} />
              </div>
              <p className="font-headings text-foreground text-base font-bold">
                {t('pos.scan.errTitle')}
              </p>
              <p className="font-body text-muted-foreground text-sm">{errMessage[errKind]}</p>
            </div>

            {/* Débloquer la caméra : étapes concrètes (utilisateur non technique). */}
            {errKind === 'denied' && (
              <ol className="bg-muted/50 border-border flex flex-col gap-2 rounded-lg border p-3">
                {[1, 2, 3].map((n) => (
                  <li
                    key={n}
                    className="font-body text-foreground flex items-start gap-2.5 text-sm"
                  >
                    <span className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                      {n}
                    </span>
                    <span>{t(`pos.scan.deniedStep${n}`)}</span>
                  </li>
                ))}
              </ol>
            )}

            <div className="flex flex-col gap-2">
              {/* Plan B fiable en premier : taper le code. */}
              <button
                type="button"
                onClick={manualEntry}
                className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
              >
                <Icon i="keyboard" size={16} />
                {t('pos.scan.manual')}
              </button>
              {/* Réessayer : relance la demande d'autorisation / la caméra. */}
              {errKind !== 'insecure' && (
                <button
                  type="button"
                  onClick={() => setAttempt((a) => a + 1)}
                  className="border-border bg-surface text-foreground font-body flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
                >
                  <Icon i="refresh-cw" size={15} />
                  {t('pos.scan.retry')}
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <video
            ref={videoRef}
            className="aspect-square w-full rounded-md bg-black object-cover"
            muted
            playsInline
          />
          <p className="font-body text-muted-foreground text-center text-xs">
            {t('pos.scan.hint')}
          </p>
          <button
            type="button"
            onClick={manualEntry}
            className="border-border bg-surface text-foreground font-body flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold"
          >
            <Icon i="keyboard" size={15} />
            {t('pos.scan.manual')}
          </button>
        </div>
      )}
    </Modal>
  );
}
