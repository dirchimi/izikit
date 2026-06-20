'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import AsyncState from '@/components/boutique/AsyncState';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';

interface ApiSale {
  id: string;
  number: string;
  total: number;
  createdAt: string;
  customerName: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
}

/**
 * Sélecteur de vente → facture. Liste les ventes pas encore facturées
 * (`invoicedSaleIds` = ventes déjà liées à un document). Clic = génération.
 */
export default function GenerateInvoicePanel({
  invoicedSaleIds,
  onClose,
  onGenerate,
}: {
  invoicedSaleIds: Set<string>;
  onClose: () => void;
  onGenerate: (saleId: string) => Promise<boolean>;
}) {
  const t = useT();
  const { data, loading, error, refresh } = useApi<{ sales: ApiSale[] }>('/api/sales');
  const [busyId, setBusyId] = useState<string | null>(null);

  const candidates = useMemo(
    () => (data?.sales ?? []).filter((s) => !invoicedSaleIds.has(s.id)),
    [data, invoicedSaleIds],
  );

  async function generate(id: string) {
    setBusyId(id);
    const ok = await onGenerate(id);
    setBusyId(null);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="bg-surface border-border flex max-h-[85vh] w-full flex-col rounded-t-xl border sm:max-w-lg sm:rounded-xl">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('documents.invoiceFromSale')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon i="x" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <AsyncState
            loading={loading}
            error={error}
            onRetry={refresh}
            isEmpty={candidates.length === 0}
            emptyLabel={t('documents.noUninvoicedSale')}
            emptyIcon="receipt"
          >
            <div className="flex flex-col gap-2">
              {candidates.map((s) => {
                const label =
                  (s.items[0]?.name ?? '—') + (s.items.length > 1 ? ` +${s.items.length - 1}` : '');
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => generate(s.id)}
                    className="border-border hover:border-primary flex items-center gap-3 rounded-md border px-4 py-3 text-start disabled:opacity-60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-mono text-xs">{s.number}</span>
                        <span className="font-body text-foreground text-sm font-bold">
                          {formatFCFA(s.total)} {t('common.fcfa')}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="font-body text-foreground truncate text-sm">{label}</span>
                        <span className="text-muted-foreground font-body shrink-0 text-xs">
                          {s.customerName ?? t('documents.cashClient')}
                        </span>
                      </div>
                    </div>
                    <Icon
                      i={busyId === s.id ? 'loader-2' : 'chevron-right'}
                      size={16}
                      className={`text-muted-foreground ${busyId === s.id ? 'animate-spin' : ''}`}
                    />
                  </button>
                );
              })}
            </div>
          </AsyncState>
        </div>
      </div>
    </div>
  );
}
