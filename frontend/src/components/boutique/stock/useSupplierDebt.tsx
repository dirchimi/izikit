'use client';

import { useState, type ReactNode } from 'react';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';

export interface SupplierDebtValue {
  amount: number;
  supplierName?: string;
}

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary';
const labelClass = 'text-foreground font-body text-xs font-semibold';

type Mode = 'full' | 'partial' | 'none';

/**
 * Bloc « Payé au fournisseur ? » partagé par l'ajout de produit et le
 * réapprovisionnement. Quand le commerçant prend son stock « en prêt », le
 * reste dû devient une dette fournisseur.
 *
 * `cost` = coût du stock ajouté (quantité × prix d'achat), calculé par le parent.
 * Le bloc ne s'affiche que si `cost > 0`. Renvoie `{ node, debt }` : le parent
 * insère `node` dans son formulaire et lit `debt` au moment de la soumission
 * (null = tout payé, rien à enregistrer).
 *
 * `hasQty` = une quantité est saisie mais le coût est nul (prix d'achat vide) :
 * on affiche alors une invite « renseignez un prix d'achat » plutôt que rien,
 * pour éviter qu'une dette prise « en prêt » ne soit silencieusement omise.
 */
export function useSupplierDebt(
  cost: number,
  hasQty = false,
): { node: ReactNode; debt: SupplierDebtValue | null } {
  const t = useT();
  const [mode, setMode] = useState<Mode>('full');
  const [paid, setPaid] = useState('');
  const [supplier, setSupplier] = useState('');

  const paidNum = Math.max(0, Math.trunc(Number(paid) || 0));
  const owed = mode === 'full' ? 0 : mode === 'none' ? cost : Math.max(0, cost - paidNum);
  const debt: SupplierDebtValue | null =
    owed > 0
      ? { amount: owed, ...(supplier.trim() ? { supplierName: supplier.trim() } : {}) }
      : null;

  const modes: { key: Mode; labelKey: string }[] = [
    { key: 'full', labelKey: 'stock.supplier.full' },
    { key: 'partial', labelKey: 'stock.supplier.partial' },
    { key: 'none', labelKey: 'stock.supplier.none' },
  ];

  // Quantité saisie mais coût nul (prix d'achat vide) → invite discrète.
  const hint =
    cost <= 0 && hasQty ? (
      <p className="text-muted-foreground font-body text-xs">{t('stock.supplier.needBuyPrice')}</p>
    ) : null;

  const node =
    cost <= 0 ? (
      hint
    ) : (
      <div className="border-border bg-muted/30 flex flex-col gap-2.5 rounded-md border p-3">
        <span className={labelClass}>{t('stock.supplier.question')}</span>
        <div className="border-border flex items-center overflow-hidden rounded-md border">
          {modes.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`font-body border-border flex-1 border-s px-2 py-1.5 text-xs first:border-s-0 ${
                  active
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-surface text-muted-foreground'
                }`}
              >
                {t(m.labelKey)}
              </button>
            );
          })}
        </div>

        {mode === 'partial' && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="sd-paid">
              {t('stock.supplier.paidAmount')}
            </label>
            <input
              id="sd-paid"
              type="number"
              min="0"
              max={cost}
              inputMode="numeric"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="0"
              className={`${fieldClass} placeholder:text-muted-foreground`}
            />
          </div>
        )}

        {mode !== 'full' && (
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="sd-supplier">
              {t('stock.supplier.name')}
            </label>
            <input
              id="sd-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={t('stock.supplier.namePlaceholder')}
              className={`${fieldClass} placeholder:text-muted-foreground`}
            />
          </div>
        )}

        {owed > 0 && (
          <div className="text-warning font-body flex items-center justify-between text-xs font-semibold">
            <span>{t('stock.supplier.remaining')}</span>
            <span>
              {formatFCFA(owed)} {t('common.fcfa')}
            </span>
          </div>
        )}
      </div>
    );

  return { node, debt };
}
