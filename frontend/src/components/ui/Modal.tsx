'use client';

import { useEffect, type ReactNode } from 'react';
import Icon from './Icon';

/**
 * Modale maison (charte Sahilley) : fond flouté, panneau centré avec animation
 * d'apparition, fermeture par Échap / clic extérieur / bouton ✕. Verrouille le
 * scroll du body tant qu'elle est ouverte. Respecte prefers-reduced-motion via
 * les classes d'animation globales.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  hideClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        className={`animate-scale-in bg-surface border-border relative z-10 flex max-h-[90vh] w-full flex-col ${width} overflow-hidden rounded-2xl border shadow-2xl`}
      >
        {(title || !hideClose) && (
          <div className="border-border flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
            <h2 className="font-headings text-foreground text-base font-bold">{title}</h2>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              >
                <Icon i="x" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
