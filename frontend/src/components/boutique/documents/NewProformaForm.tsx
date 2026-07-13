'use client';

import { useState, type FormEvent } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';
import ProductLinePicker, { type ProductLite } from './ProductLinePicker';

interface LineDraft {
  article: string;
  qty: string;
  unitPrice: string;
}
export interface ProformaPayload {
  clientName: string;
  clientPhone?: string;
  validityDays?: number;
  discount?: number;
  lines: { article: string; qty: number; unitPrice: number }[];
}

const fieldClass =
  'border-border bg-input text-foreground font-body rounded-md border px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-muted-foreground';
const labelClass = 'text-foreground font-body text-xs font-semibold';

const emptyLine = (): LineDraft => ({ article: '', qty: '1', unitPrice: '' });
const num = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

/** Devis proforma : destinataire + lignes issues du catalogue (ou libres) + remise. */
export default function NewProformaForm({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: ProformaPayload) => Promise<boolean>;
}) {
  const t = useT();
  // Catalogue chargé une fois : les lignes piochent dedans (nom + prix auto).
  const { data: prodData } = useApi<{ products: ProductLite[] }>('/api/products');
  const products = prodData?.products ?? [];

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [discount, setDiscount] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const parsed = lines
    .map((l) => ({
      article: l.article.trim(),
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }))
    .filter((l) => l.article !== '' && l.qty > 0);
  const subtotal = parsed.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const discountAmount = Math.min(num(discount), subtotal);
  const total = subtotal - discountAmount;
  const canSubmit = clientName.trim() !== '' && parsed.length > 0 && !submitting;

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const days = Number(validityDays);
    const ok = await onCreate({
      clientName: clientName.trim(),
      ...(clientPhone.trim() ? { clientPhone: clientPhone.trim() } : {}),
      ...(Number.isInteger(days) && days > 0 ? { validityDays: days } : {}),
      ...(discountAmount > 0 ? { discount: discountAmount } : {}),
      lines: parsed,
    });
    setSubmitting(false);
    if (ok) onClose();
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border-border animate-scale-in flex max-h-[90vh] w-full flex-col rounded-t-2xl border shadow-xl sm:max-w-xl sm:rounded-2xl"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-headings text-foreground text-base font-bold">
            {t('documents.newProforma')}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="pf-client">
                {t('documents.preview.recipient')}
              </label>
              <input
                id="pf-client"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t('documents.clientNamePlaceholder')}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="pf-phone">
                {t('common.phone')}
              </label>
              <input
                id="pf-phone"
                dir="ltr"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+235 …"
                className={`${fieldClass} rtl:text-right`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="pf-validity">
                {t('documents.validityField')}
              </label>
              <input
                id="pf-validity"
                type="number"
                min="1"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          {/* Lignes — chaque article se choisit dans le catalogue (nom + prix
              auto-remplis) ou en saisie libre. Qté et P.U. restent modifiables. */}
          <div className="mt-4 flex flex-col gap-2">
            <span className={labelClass}>{t('documents.lines')}</span>
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <ProductLinePicker
                  value={l.article}
                  products={products}
                  onPick={(p) =>
                    updateLine(i, {
                      article: p.name,
                      unitPrice: p.unitPrice ? String(p.unitPrice) : '',
                    })
                  }
                />
                <input
                  type="number"
                  min="1"
                  value={l.qty}
                  onChange={(e) => updateLine(i, { qty: e.target.value })}
                  aria-label={t('common.qty')}
                  className={`${fieldClass} w-16 text-center`}
                />
                <input
                  type="number"
                  min="0"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  placeholder={t('documents.preview.pu')}
                  aria-label={t('documents.preview.pu')}
                  className={`${fieldClass} w-28`}
                />
                <button
                  type="button"
                  aria-label={t('cart.remove')}
                  onClick={() => removeLine(i)}
                  disabled={lines.length <= 1}
                  className="text-muted-foreground hover:text-danger shrink-0 disabled:opacity-40"
                >
                  <Icon i="x" size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addLine}
              className="text-primary font-body flex items-center gap-1 self-start text-xs font-semibold"
            >
              <Icon i="plus" size={13} />
              {t('documents.addLine')}
            </button>
          </div>
        </div>

        {/* Pied : sous-total, remise, total + valider */}
        <div className="border-border flex flex-col gap-3 border-t px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <div className="font-body text-muted-foreground flex items-center justify-between text-sm">
              <span>{t('common.subtotal')}</span>
              <span>
                {formatFCFA(subtotal)} {t('common.fcfa')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="pf-discount"
                className="font-body text-muted-foreground flex items-center gap-1.5 text-sm"
              >
                <Icon i="badge-percent" size={14} />
                {t('pos.discount')}
              </label>
              <div className="border-border bg-input focus-within:border-primary flex w-32 items-center gap-1 rounded-md border px-2 py-1">
                <input
                  id="pf-discount"
                  type="number"
                  min="0"
                  max={subtotal}
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-end text-sm outline-none"
                />
                <span className="text-muted-foreground text-[11px]">{t('common.fcfa')}</span>
              </div>
            </div>
            <div className="font-body text-foreground flex items-center justify-between text-base font-bold">
              <span>{t('common.total')}</span>
              <span>
                {formatFCFA(total)} {t('common.fcfa')}
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-primary text-primary-foreground font-body flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <Icon i="check" size={15} />
            {t('documents.createProforma')}
          </button>
        </div>
      </form>
    </div>
  );
}
