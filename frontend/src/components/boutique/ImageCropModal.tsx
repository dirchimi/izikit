'use client';

import { useEffect, useState, useCallback } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { useT } from '@/contexts/LocaleContext';

/** Charge une image (object URL) en HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('image load failed')));
    img.src = src;
  });
}

/**
 * Recadre la zone `area` (coordonnées pixels natifs, fournies par react-easy-crop)
 * et renvoie un JPEG. Sortie bornée à 800px pour garder un upload léger.
 */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const image = await loadImage(src);
  const maxSize = 800;
  const scale = Math.min(1, maxSize / Math.max(area.width, area.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9),
  );
}

/**
 * LOT 3 — recadrage + zoom d'une image avant upload (logo boutique, photo
 * produit). Prend un `File` source, laisse l'utilisateur cadrer/zoomer, puis
 * renvoie un `File` JPEG recadré via `onConfirm`. Aspect carré par défaut ;
 * `round` affiche un masque circulaire (utile pour un logo).
 */
export default function ImageCropModal({
  file,
  aspect = 1,
  round = false,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  aspect?: number;
  round?: boolean;
  onCancel: () => void;
  onConfirm: (cropped: File) => void | Promise<void>;
}) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setArea(areaPixels);
  }, []);

  async function handleApply() {
    if (!src || !area || busy) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(src, area);
      const baseName = (file?.name ?? 'image').replace(/\.[^./\\]+$/, '');
      const cropped = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
      await onConfirm(cropped);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={file !== null} onClose={onCancel} title={t('crop.title')} size="md">
      <div className="flex flex-col gap-4">
        <div className="bg-muted relative h-64 w-full overflow-hidden rounded-lg sm:h-72">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={round ? 'round' : 'rect'}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Icon i="zoom-out" size={16} className="text-muted-foreground shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t('crop.zoom')}
            className="accent-primary h-1.5 w-full cursor-pointer"
          />
          <Icon i="zoom-in" size={16} className="text-muted-foreground shrink-0" />
        </div>
        <p className="text-muted-foreground font-body -mt-2 text-[11px]">{t('crop.hint')}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-border bg-surface text-foreground font-body flex-1 rounded-md border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !area}
            className="bg-primary text-primary-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <Icon
              i={busy ? 'loader-2' : 'check'}
              size={15}
              className={busy ? 'animate-spin' : ''}
            />
            {busy ? t('crop.processing') : t('crop.apply')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
