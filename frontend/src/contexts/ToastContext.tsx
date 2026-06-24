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
const FADE_OUT_DURATION = 300;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    }, TOAST_DURATION);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION + FADE_OUT_DURATION);
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
          <div
            key={t.id}
            className={`bg-surface border-border pointer-events-auto flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-semibold shadow-xl transition-opacity ${
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
