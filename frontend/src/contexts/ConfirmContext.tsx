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
  const isDanger = variant === 'danger';
  const confirmClass = isDanger
    ? 'bg-danger text-danger-foreground shadow-sm shadow-danger/30'
    : 'bg-primary text-primary-foreground shadow-sm shadow-primary/30';
  // Halo concentrique autour de l'icône (effet premium, doux).
  const haloOuter = isDanger ? 'bg-danger/5' : 'bg-primary/5';
  const haloInner = isDanger ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={opts !== null} onClose={() => settle(false)} hideClose size="sm">
        {opts && (
          <div className="flex flex-col items-center gap-5 px-1 py-1 text-center">
            {/* Icône avec halo doux */}
            <div className={`flex h-20 w-20 items-center justify-center rounded-full ${haloOuter}`}>
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full ${haloInner}`}
              >
                <Icon i={opts.icon ?? (isDanger ? 'alert-triangle' : 'help-circle')} size={26} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-headings text-foreground text-xl font-bold">{opts.title}</h3>
              {opts.message && (
                <p className="text-muted-foreground font-body max-w-xs text-sm leading-relaxed">
                  {opts.message}
                </p>
              )}
            </div>
            <div className="mt-1 flex w-full flex-col-reverse gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => settle(false)}
                disabled={busy}
                className="border-border bg-surface text-foreground font-body flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
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
                className={`font-body flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-transform hover:scale-[1.02] disabled:opacity-50 ${confirmClass}`}
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
