'use client';

import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import { docStatusConfig } from '@/lib/boutique/fixtures';
import type { ApiDocument, BoutiqueHeader } from './types';

function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Aperçu imprimable (facture OU proforma) — même gabarit, variantes par `type`.
 * Alimenté par l'instantané réel du document + l'en-tête de la boutique
 * (nom + ville, depuis /api/org/current).
 */
export default function DocumentPreview({ doc, org }: { doc: ApiDocument; org: BoutiqueHeader }) {
  const t = useT();
  const isProforma = doc.type === 'PROFORMA';
  const s = docStatusConfig[doc.status];

  return (
    <div className="bg-surface border-border flex-1 rounded-lg border">
      {/* En-tête du document */}
      <div className="border-border flex flex-col gap-4 border-b px-5 py-6 sm:flex-row sm:items-start sm:justify-between md:px-8">
        <div>
          {org.logoUrl ? (
            <img
              src={org.logoUrl}
              alt=""
              className="border-border mb-3 h-12 w-12 rounded-md border object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="bg-primary mb-3 flex h-10 w-10 items-center justify-center rounded-md">
              <span className="font-headings text-primary-foreground text-base font-bold">
                {org.name.charAt(0).toUpperCase() || 'B'}
              </span>
            </div>
          )}
          <p className="font-headings text-foreground text-base font-bold">{org.name}</p>
          <p className="text-muted-foreground font-body mt-1 text-xs">{org.city}</p>
        </div>
        <div className="sm:text-end">
          <p className="font-headings text-foreground text-2xl font-bold">
            {t(isProforma ? 'documents.preview.proformaTitle' : 'documents.preview.invoiceTitle')}
          </p>
          <p className="text-muted-foreground font-body mt-1 text-sm">{doc.number}</p>
          <p className="text-muted-foreground font-body mt-0.5 text-xs">
            {t('documents.preview.dateLabel')} {fmtLong(doc.issuedAt)}
          </p>
          {isProforma && (
            <p className="text-muted-foreground font-body mt-0.5 text-xs">
              {t('documents.preview.validityDays', { n: doc.validityDays ?? 30 })}
            </p>
          )}
          <span
            className={`font-body mt-2 inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${s.cls}`}
          >
            {t(`doc.status.${doc.status}`)}
          </span>
        </div>
      </div>

      {/* Destinataire */}
      <div className="border-border border-b px-5 py-4 md:px-8">
        <p className="text-muted-foreground font-body mb-1 text-xs font-semibold">
          {t(isProforma ? 'documents.preview.recipient' : 'documents.preview.billedTo')}
        </p>
        <p className="font-body text-foreground text-sm font-semibold">{doc.clientName}</p>
        {doc.clientPhone && (
          <p className="text-muted-foreground font-body text-xs">{doc.clientPhone}</p>
        )}
      </div>

      {/* Lignes */}
      <div className="px-5 py-4 md:px-8">
        <div className="overflow-x-auto">
          <div className="min-w-[460px]">
            <div className="border-border mb-2 flex items-center gap-4 border-b py-2">
              <span className="text-muted-foreground font-body flex-1 text-xs font-semibold">
                {t('common.article')}
              </span>
              <span className="text-muted-foreground font-body w-12 text-center text-xs font-semibold">
                {t('common.qty')}
              </span>
              <span className="text-muted-foreground font-body w-28 text-end text-xs font-semibold">
                {t('documents.preview.pu')}
              </span>
              <span className="text-muted-foreground font-body w-28 text-end text-xs font-semibold">
                {t('common.total')}
              </span>
            </div>

            {doc.lines.map((l, i) => (
              <div
                key={`${l.article}-${i}`}
                className="border-border flex items-center gap-4 border-b py-2.5"
              >
                <span className="font-body text-foreground flex-1 text-sm">{l.article}</span>
                <span className="text-muted-foreground font-body w-12 text-center text-sm">
                  {l.qty}
                </span>
                <span className="text-muted-foreground font-body w-28 text-end text-sm">
                  {formatFCFA(l.unitPrice)} {t('common.fcfa')}
                </span>
                <span className="font-body text-foreground w-28 text-end text-sm font-semibold">
                  {formatFCFA(l.qty * l.unitPrice)} {t('common.fcfa')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totaux — remise dérivée (brut des lignes − total net) si > 0. */}
        {(() => {
          const gross = doc.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
          const discount = gross - doc.total;
          return (
            <div className="mt-4 flex flex-col items-end gap-1">
              <div className="flex w-64 items-center gap-8">
                <span className="text-muted-foreground font-body flex-1 text-sm">
                  {t('documents.preview.subtotal')}
                </span>
                <span className="font-body text-foreground text-sm font-semibold">
                  {formatFCFA(gross)} {t('common.fcfa')}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex w-64 items-center gap-8">
                  <span className="text-muted-foreground font-body flex-1 text-sm">
                    {t('pos.discount')}
                  </span>
                  <span className="font-body text-success text-sm font-semibold">
                    − {formatFCFA(discount)} {t('common.fcfa')}
                  </span>
                </div>
              )}
              <div className="border-border mt-1 flex w-64 items-center gap-8 border-t pt-2">
                <span className="font-body text-foreground flex-1 text-base font-bold">
                  {t(isProforma ? 'documents.preview.totalEstimated' : 'common.total')}
                </span>
                <span className="font-headings text-primary text-base font-bold">
                  {formatFCFA(doc.total)} {t('common.fcfa')}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Note de pied */}
      <div className="border-border border-t px-5 py-4 md:px-8">
        <p className="text-muted-foreground font-body text-xs">
          {doc.note ||
            t(isProforma ? 'documents.preview.proformaFooter' : 'documents.preview.invoiceFooter')}
        </p>
      </div>
    </div>
  );
}
