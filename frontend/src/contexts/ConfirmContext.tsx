'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` = bouton rouge (action destructive) ; `primary` = vert. */
  variant?: 'danger' | 'primary';
  icon?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/**
 * Fournit `useConfirm()` : une fonction qui ouvre une modale de confirmation
 * maison et renvoie une Promise<boolean>. Usage :
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Se déconnecter ?', variant: 'danger' })) { ... }
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setBusy(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  const variant = opts?.variant ?? 'primary';
  const confirmClass =
    variant === 'danger'
      ? 'bg-danger text-danger-foreground'
      : 'bg-primary text-primary-foreground';
  const iconWrap = variant === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={opts !== null} onClose={() => settle(false)} hideClose>
        {opts && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${iconWrap}`}>
              <Icon
                i={opts.icon ?? (variant === 'danger' ? 'alert-triangle' : 'help-circle')}
                size={24}
              />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-headings text-foreground text-lg font-bold">{opts.title}</h3>
              {opts.message && (
                <p className="text-muted-foreground font-body text-sm">{opts.message}</p>
              )}
            </div>
            <div className="mt-1 flex w-full gap-3">
              <button
                type="button"
                onClick={() => settle(false)}
                disabled={busy}
                className="border-border bg-surface text-foreground font-body flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
              >
                {opts.cancelLabel ?? 'Annuler'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBusy(true);
                  settle(true);
                }}
                disabled={busy}
                className={`font-body flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50 ${confirmClass}`}
              >
                {opts.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
