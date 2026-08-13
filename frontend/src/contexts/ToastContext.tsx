'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

type ToastType = 'success' | 'error' | 'info';

const TOAST_ICON: Record<ToastType, string> = {
  success: 'check-circle-2',
  error: 'alert-circle',
  info: 'info',
};

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
});

const TOAST_DURATION = 3000;
// Retour terrain : une ERREUR qui disparaît en 3 s est illisible sur le vif —
// impossible de diagnostiquer à distance (« un message rouge passe et
// disparaît »). Les erreurs restent 8 s et se ferment d'un tap.
const ERROR_TOAST_DURATION = 8000;
const FADE_OUT_DURATION = 300;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  /** Sortie anticipée (tap) — le timer auto déjà armé retombe ensuite sur un
   * no-op (map/filter sur un id déjà retiré). */
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, FADE_OUT_DURATION);
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextIdRef.current++;
    const duration = type === 'error' ? ERROR_TOAST_DURATION : TOAST_DURATION;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    }, duration);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration + FADE_OUT_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast: addToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed top-0 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`bg-surface border-border pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-start text-sm font-semibold shadow-xl transition-opacity ${
              t.exiting ? 'opacity-0' : 'animate-slide-in-right opacity-100'
            }`}
            style={{ maxWidth: '90vw' }}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                t.type === 'success'
                  ? 'bg-primary/15 text-primary'
                  : t.type === 'error'
                    ? 'bg-danger/15 text-danger'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon i={TOAST_ICON[t.type]} size={16} />
            </span>
            <span className="text-foreground">{t.message}</span>
            {t.type === 'error' && (
              <Icon i="x" size={14} className="text-muted-foreground shrink-0" />
            )}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
