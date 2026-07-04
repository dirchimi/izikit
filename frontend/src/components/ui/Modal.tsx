'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

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
  solidBackdrop = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
  /** Fond plein (cache l'arrière-plan) au lieu du voile semi-transparent. */
  solidBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // Restaure le focus sur l'élément déclencheur à la fermeture.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Piège de focus : Tab boucle à l'intérieur du panneau (a11y clavier).
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus initial sur le panneau (le lecteur d'écran annonce la modale).
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

  // Porté en fin de <body> : échappe à tout parent (overflow/transform) et
  // permet une impression propre (cf. globals.css @media print).
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      {...(title ? { 'aria-labelledby': titleId } : {})}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className={
          solidBackdrop
            ? 'bg-background absolute inset-0'
            : 'absolute inset-0 bg-black/45 backdrop-blur-[2px]'
        }
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`animate-scale-in bg-surface border-border relative z-10 flex max-h-[90vh] w-full flex-col ${width} overflow-hidden rounded-2xl border shadow-2xl outline-none`}
      >
        {(title || !hideClose) && (
          <div className="no-print border-border flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
            <h2 id={titleId} className="font-headings text-foreground text-base font-bold">
              {title}
            </h2>
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
    </div>,
    document.body,
  );
}
