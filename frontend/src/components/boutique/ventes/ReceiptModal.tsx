'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';

export type ReceiptMethod = 'CASH' | 'MOBILE' | 'CREDIT' | 'MIXED';

/** Trait pointillé horizontal sur le canvas du reçu. */
function dashed(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number): void {
  ctx.strokeStyle = '#d4d4d4';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export interface ReceiptData {
  number: string;
  createdAt: string; // ISO
  method: ReceiptMethod;
  total: number;
  // Ventilation du paiement (mixte). Absent → affichage mono-méthode (`method`).
  payments?: { cash: number; mobile: number; credit: number };
  customerName: string | null;
  customerPhone: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
}

/** Lignes de paiement non nulles à afficher sur le reçu (ventilation ou méthode unique). */
function paymentLines(r: ReceiptData): { key: ReceiptMethod; amount: number }[] {
  if (r.payments) {
    const rows: { key: ReceiptMethod; amount: number }[] = [];
    if (r.payments.cash > 0) rows.push({ key: 'CASH', amount: r.payments.cash });
    if (r.payments.mobile > 0) rows.push({ key: 'MOBILE', amount: r.payments.mobile });
    if (r.payments.credit > 0) rows.push({ key: 'CREDIT', amount: r.payments.credit });
    if (rows.length > 0) return rows;
  }
  return [{ key: r.method, amount: r.total }];
}

interface OrgCurrent {
  organization: { name: string };
  settings: {
    city: string | null;
    phone: string | null;
    address: string | null;
    invoiceNote: string | null;
    logoUrl: string | null;
  };
}

/** Charge une image (logo) en respectant CORS — null si échec (pas de canvas taint). */
function loadImageSafe(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const METHOD_KEY: Record<ReceiptMethod, string> = {
  CASH: 'method.cash',
  MOBILE: 'method.mobile',
  CREDIT: 'method.credit',
  MIXED: 'method.mixed',
};

/**
 * Reçu de vente : ticket imprimable (couleurs « papier » fixes pour rester
 * lisible même en thème sombre + à l'impression) avec deux actions —
 * « Imprimer » (impression navigateur, ticket isolé via `.printable`) et
 * « Envoyer (WhatsApp) » (reçu rendu en IMAGE puis partagé en fichier).
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
  const [busy, setBusy] = useState(false);

  const shopName = org?.organization.name ?? 'Boutique';
  const city = org?.settings.city ?? '';
  const phone = org?.settings.phone ?? '';
  const address = org?.settings.address ?? '';
  const logoUrl = org?.settings.logoUrl ?? '';
  const note = org?.settings.invoiceNote ?? '';

  const dateStr = receipt
    ? new Date(receipt.createdAt).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';

  /** Dessine le reçu sur un canvas et renvoie un PNG (image nette, 2×). */
  async function buildReceiptImage(): Promise<Blob | null> {
    if (!receipt) return null;
    const W = 380;
    const PAD = 24;
    const payLines = paymentLines(receipt);
    const logo = logoUrl ? await loadImageSafe(logoUrl) : null;
    const logoH = logo ? 56 : 0;
    // Hauteur calculée à l'avance (le canvas est de taille fixe).
    let H = PAD + logoH + 24 + (city ? 18 : 6) + (phone ? 14 : 0) + (address ? 14 : 0) + 24 + 26;
    if (receipt.customerName) H += 18;
    if (receipt.customerPhone) H += 16;
    H += 18 + receipt.items.length * 22 + 26 + 28 + 20 + 24 + 18 + PAD;
    // Lignes de paiement supplémentaires (ventilation mixte) : +16px chacune.
    H += 16 * Math.max(0, payLines.length - 1);

    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    let y = PAD + 14;
    // Logo (optionnel, centré)
    if (logo) {
      ctx.drawImage(logo, (W - 48) / 2, PAD, 48, 48);
      y = PAD + 48 + 8 + 14;
    }
    // En-tête
    ctx.fillStyle = '#171717';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(shopName, W / 2, y);
    y += 18;
    if (city) {
      ctx.fillStyle = '#737373';
      ctx.font = '12px sans-serif';
      ctx.fillText(city, W / 2, y);
      y += 14;
    }
    if (phone) {
      ctx.fillStyle = '#737373';
      ctx.font = '12px sans-serif';
      ctx.fillText(phone, W / 2, y);
      y += 14;
    }
    if (address) {
      ctx.fillStyle = '#737373';
      ctx.font = '12px sans-serif';
      ctx.fillText(address, W / 2, y);
      y += 14;
    }
    y += 8;
    dashed(ctx, PAD, W - PAD, y);
    y += 18;
    // Reçu n° + date
    ctx.fillStyle = '#737373';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${t('receipt.title')} ${receipt.number}`, PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, W - PAD, y);
    y += 18;
    if (receipt.customerName) {
      ctx.textAlign = 'left';
      ctx.fillText(`${t('receipt.client')}: ${receipt.customerName}`, PAD, y);
      y += 18;
    }
    if (receipt.customerPhone) {
      ctx.textAlign = 'left';
      ctx.fillText(`${t('common.phone')}: ${receipt.customerPhone}`, PAD, y);
      y += 16;
    }
    y += 2;
    dashed(ctx, PAD, W - PAD, y);
    y += 20;
    // Articles
    for (const it of receipt.items) {
      ctx.fillStyle = '#262626';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${it.name}  x${it.qty} · ${formatFCFA(it.unitPrice)}`, PAD, y);
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatFCFA(it.qty * it.unitPrice), W - PAD, y);
      y += 22;
    }
    y += 2;
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 24;
    // Total
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t('common.total'), PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${formatFCFA(receipt.total)} ${t('common.fcfa')}`, W - PAD, y);
    y += 18;
    // Paiement — une ligne par méthode réglée (ventilation mixte).
    ctx.fillStyle = '#737373';
    ctx.font = '11px sans-serif';
    for (const line of payLines) {
      ctx.textAlign = 'left';
      ctx.fillText(`${t(METHOD_KEY[line.key])}`, PAD, y);
      ctx.textAlign = 'right';
      ctx.fillText(`${formatFCFA(line.amount)} ${t('common.fcfa')}`, W - PAD, y);
      y += 16;
    }
    y += 4;
    dashed(ctx, PAD, W - PAD, y);
    y += 18;
    ctx.fillStyle = '#737373';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(note || t('receipt.thanks'), W / 2, y);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }

  /** Reçu en texte brut (repli image + envoi direct au client par wa.me). */
  function receiptText(): string {
    if (!receipt) return '';
    const lines = receipt.items
      .map((it) => `• ${it.name} x${it.qty} — ${formatFCFA(it.qty * it.unitPrice)}`)
      .join('\n');
    return (
      `${shopName}\n${t('receipt.title')} ${receipt.number} · ${dateStr}\n` +
      (receipt.customerName ? `${t('receipt.client')}: ${receipt.customerName}\n` : '') +
      `--------------------\n${lines}\n--------------------\n` +
      `${t('common.total')}: ${formatFCFA(receipt.total)} ${t('common.fcfa')}\n` +
      `${note || t('receipt.thanks')}`
    );
  }

  /**
   * Envoi direct au client : ouvre la conversation WhatsApp de SON numéro
   * (wa.me/<numéro>) avec le reçu en texte — aucun numéro à ressaisir. Affiché
   * seulement quand le client a un téléphone enregistré.
   */
  function sendToClient() {
    if (!receipt?.customerPhone) return;
    const digits = receipt.customerPhone.replace(/\D/g, '');
    if (!digits) return;
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(receiptText())}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  /**
   * Envoi du reçu en IMAGE. Sur téléphone : partage natif (`navigator.share`)
   * avec le fichier → WhatsApp apparaît dans la liste et envoie la photo. Sur
   * PC (ou partage de fichier indisponible) : téléchargement de l'image. Ultime
   * repli (canvas indispo) : message texte via wa.me, comme avant.
   */
  async function shareWhatsapp() {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      const blob = await buildReceiptImage();
      const fileName = `recu-${receipt.number || 'vente'}.png`;
      if (blob) {
        const file = new File([blob], fileName, { type: 'image/png' });
        const caption = `${shopName} · ${t('receipt.title')} ${receipt.number} · ${formatFCFA(
          receipt.total,
        )} ${t('common.fcfa')}`;
        if (
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] }) &&
          typeof navigator.share === 'function'
        ) {
          try {
            await navigator.share({ files: [file], title: shopName, text: caption });
            return;
          } catch {
            // Annulé par l'utilisateur ou non supporté → repli téléchargement.
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      // Repli texte (canvas indisponible).
      const digits = (receipt.customerPhone ?? '').replace(/\D/g, '');
      window.open(
        `https://wa.me/${digits}?text=${encodeURIComponent(receiptText())}`,
        '_blank',
        'noopener,noreferrer',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!receipt} onClose={onClose} size="sm">
      {receipt && (
        <div className="flex flex-col gap-4">
          {/* Ticket — couleurs papier fixes (indépendantes du thème) */}
          <div className="printable rounded-lg border border-neutral-300 bg-white px-5 py-5 text-neutral-800">
            <div className="flex flex-col items-center text-center">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="mb-1.5 h-12 w-12 rounded-md object-cover"
                  crossOrigin="anonymous"
                />
              )}
              <p className="font-headings text-base font-bold text-neutral-900">{shopName}</p>
              {city && <p className="font-body text-xs text-neutral-500">{city}</p>}
              {phone && <p className="font-body text-xs text-neutral-500">{phone}</p>}
              {address && <p className="font-body text-xs text-neutral-500">{address}</p>}
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
            {receipt.customerPhone && (
              <p className="font-body text-xs text-neutral-500">
                {t('common.phone')}: {receipt.customerPhone}
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
            <div className="font-body mt-1 flex flex-col gap-0.5 text-xs text-neutral-500">
              {paymentLines(receipt).map((line) => (
                <div key={line.key} className="flex justify-between">
                  <span>{t(METHOD_KEY[line.key])}</span>
                  <span>
                    {formatFCFA(line.amount)} {t('common.fcfa')}
                  </span>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />
            <p className="font-body text-center text-xs text-neutral-500">
              {note || t('receipt.thanks')}
            </p>
          </div>

          {/* Actions — non imprimées */}
          <div className="no-print flex flex-col gap-2">
            {/* Envoi direct au client : ouvre SA conversation WhatsApp (numéro
                enregistré), aucun numéro à ressaisir. */}
            {receipt.customerPhone && (
              <button
                type="button"
                onClick={sendToClient}
                className="bg-success text-success-foreground font-body flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
              >
                <Icon i="send" size={15} />
                {t('receipt.sendToClient')}
              </button>
            )}
            <div className="flex gap-2">
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
                disabled={busy}
                className="bg-primary text-primary-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                <Icon
                  i={busy ? 'loader-2' : 'share-2'}
                  size={15}
                  className={busy ? 'animate-spin' : ''}
                />
                {t('receipt.whatsapp')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
