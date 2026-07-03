'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
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

/**
 * Scan de code-barres par la caméra (mobile). Utilise l'API native
 * BarcodeDetector quand elle est disponible (Chrome/Android — cible PWA). Si
 * indisponible (ex. iOS/Safari), on l'annonce : la saisie manuelle / le lecteur
 * physique restent utilisables sur la page. Ferme dès le premier code lu.
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
  const [err, setErr] = useState<string | null>(null);

  const ctor =
    typeof window !== 'undefined'
      ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      : undefined;
  const supported = !!ctor;

  useEffect(() => {
    if (!open || !ctor) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    setErr(null);
    const detector = new ctor({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
    });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
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
      } catch {
        setErr(t('pos.scan.cameraError'));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, ctor, t]);

  return (
    <Modal open={open} onClose={onClose} title={t('pos.scan.title')} size="sm">
      {!supported ? (
        <p className="font-body text-muted-foreground text-sm">{t('pos.scan.unsupported')}</p>
      ) : err ? (
        <p className="font-body text-danger text-sm">{err}</p>
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
        </div>
      )}
    </Modal>
  );
}
