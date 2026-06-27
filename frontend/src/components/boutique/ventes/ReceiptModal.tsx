'use client';

import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';

export type ReceiptMethod = 'CASH' | 'MOBILE' | 'CREDIT';

export interface ReceiptData {
  number: string;
  createdAt: string; // ISO
  method: ReceiptMethod;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
}

interface OrgCurrent {
  organization: { name: string };
  settings: { city: string | null; invoiceNote: string | null };
}

const METHOD_KEY: Record<ReceiptMethod, string> = {
  CASH: 'method.cash',
  MOBILE: 'method.mobile',
  CREDIT: 'method.credit',
};

/**
 * Reçu de vente : ticket imprimable (couleurs « papier » fixes pour rester
 * lisible même en thème sombre + à l'impression) avec deux actions —
 * « Imprimer » (impression navigateur, ticket isolé via `.printable`) et
 * « Envoyer (WhatsApp) » (message texte, prérempli au numéro du client si connu).
 */
export default function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ReceiptData | null;
  onClose: () => void;
}) {
  const t = useT();
  const { data: org } = useApi<OrgCurrent>('/api/org/current');

  const shopName = org?.organization.name ?? 'Boutique';
  const city = org?.settings.city ?? '';
  const note = org?.settings.invoiceNote ?? '';

  const dateStr = receipt
    ? new Date(receipt.createdAt).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';

  function shareWhatsapp() {
    if (!receipt) return;
    const lines = receipt.items
      .map(
        (it) =>
          `• ${it.name} x${it.qty} — ${formatFCFA(it.qty * it.unitPrice)} ${t('common.fcfa')}`,
      )
      .join('\n');
    const text =
      `${shopName}\n` +
      `${t('receipt.title')} ${receipt.number} · ${dateStr}\n` +
      (receipt.customerName ? `${t('receipt.client')}: ${receipt.customerName}\n` : '') +
      `--------------------\n${lines}\n--------------------\n` +
      `${t('common.total')}: ${formatFCFA(receipt.total)} ${t('common.fcfa')}\n` +
      `${t('receipt.paidWith')}: ${t(METHOD_KEY[receipt.method])}\n` +
      `${note || t('receipt.thanks')}`;
    const digits = (receipt.customerPhone ?? '').replace(/\D/g, '');
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <Modal open={!!receipt} onClose={onClose} size="sm">
      {receipt && (
        <div className="flex flex-col gap-4">
          {/* Ticket — couleurs papier fixes (indépendantes du thème) */}
          <div className="printable rounded-lg border border-neutral-300 bg-white px-5 py-5 text-neutral-800">
            <div className="text-center">
              <p className="font-headings text-base font-bold text-neutral-900">{shopName}</p>
              {city && <p className="font-body text-xs text-neutral-500">{city}</p>}
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <div className="font-body flex justify-between text-xs text-neutral-500">
              <span>
                {t('receipt.title')} {receipt.number}
              </span>
              <span>{dateStr}</span>
            </div>
            {receipt.customerName && (
              <p className="font-body mt-1 text-xs text-neutral-500">
                {t('receipt.client')}: {receipt.customerName}
              </p>
            )}

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <div className="flex flex-col gap-1.5">
              {receipt.items.map((it, i) => (
                <div key={i} className="font-body flex justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 text-neutral-800">
                    {it.name}{' '}
                    <span className="text-neutral-400">
                      x{it.qty} · {formatFCFA(it.unitPrice)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-neutral-900">
                    {formatFCFA(it.qty * it.unitPrice)}
                  </span>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-neutral-300" />

            <div className="font-body flex justify-between text-base font-bold text-neutral-900">
              <span>{t('common.total')}</span>
              <span>
                {formatFCFA(receipt.total)} {t('common.fcfa')}
              </span>
            </div>
            <p className="font-body mt-1 text-xs text-neutral-500">
              {t('receipt.paidWith')}: {t(METHOD_KEY[receipt.method])}
            </p>

            <div className="my-3 border-t border-dashed border-neutral-300" />
            <p className="font-body text-center text-xs text-neutral-500">
              {note || t('receipt.thanks')}
            </p>
          </div>

          {/* Actions — non imprimées */}
          <div className="no-print flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="border-border bg-surface text-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
            >
              <Icon i="printer" size={15} />
              {t('receipt.print')}
            </button>
            <button
              type="button"
              onClick={shareWhatsapp}
              className="bg-primary text-primary-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
            >
              <Icon i="share-2" size={15} />
              {t('receipt.whatsapp')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
