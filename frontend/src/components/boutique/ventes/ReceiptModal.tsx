'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { formatFCFA } from '@/lib/boutique/format';
import { dialCodeFor } from '@/lib/boutique/countries';
import { toWhatsAppNumber } from '@/lib/boutique/phone';

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
  total: number; // total NET (après remise)
  // Sous-total (brut) + remise — affichés seulement si une remise a été accordée.
  subtotal?: number;
  discount?: number;
  // Ventilation du paiement (mixte). Absent → affichage mono-méthode (`method`).
  payments?: { cash: number; mobile: number; credit: number };
  customerName: string | null;
  customerPhone: string | null;
  items: { name: string; qty: number; unitPrice: number }[];
  // Jeton du lien public de reçu (partage WhatsApp avec lien de téléchargement).
  publicToken?: string | null;
  // Vente annulée : bandeau d'information À L'ÉCRAN uniquement (`no-print`,
  // jamais dessiné sur l'image partagée) — le ticket client reste intact.
  cancelled?: { at: string | null; byName: string | null; reason: string } | null;
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
    country: string;
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
  const dial = dialCodeFor(org?.settings.country);

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
    // Sous-total + remise (2 lignes) si une remise a été accordée.
    const hasDiscount = (receipt.discount ?? 0) > 0;
    if (hasDiscount) H += 32;

    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Reçu en mise en page LTR (libellé à gauche, montant à droite). On fixe la
    // direction en LTR pour que les numéros (téléphone…) ne se retournent pas
    // quand l'app est en arabe (RTL) — le glyphe arabe des libellés reste correct.
    ctx.direction = 'ltr';
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
    // Sous-total + remise (avant le total NET) si une remise a été accordée.
    if (hasDiscount) {
      ctx.fillStyle = '#737373';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(t('common.subtotal'), PAD, y);
      ctx.textAlign = 'right';
      ctx.fillText(
        `${formatFCFA(receipt.subtotal ?? receipt.total)} ${t('common.fcfa')}`,
        W - PAD,
        y,
      );
      y += 16;
      ctx.textAlign = 'left';
      ctx.fillText(t('pos.discount'), PAD, y);
      ctx.textAlign = 'right';
      ctx.fillText(`- ${formatFCFA(receipt.discount ?? 0)} ${t('common.fcfa')}`, W - PAD, y);
      y += 16;
    }
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

  /** Message court + lien PUBLIC de téléchargement du reçu (pour l'envoi texte). */
  function receiptLinkText(): string {
    if (!receipt) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = receipt.publicToken ? `${origin}/r/${receipt.publicToken}` : '';
    return (
      `${shopName}\n${t('receipt.title')} ${receipt.number} · ` +
      `${formatFCFA(receipt.total)} ${t('common.fcfa')}\n` +
      (link ? `${t('receipt.downloadLine')} ${link}\n` : '') +
      `${note || t('receipt.thanks')}`
    );
  }

  /**
   * Envoi au client par WhatsApp sous forme de TEXTE + lien de téléchargement du
   * reçu (PDF). Marche sur téléphone ET PC : un lien wa.me ne peut pas joindre de
   * fichier, mais il peut porter un lien que le client ouvre pour télécharger.
   * Ciblé sur son numéro si connu, sinon WhatsApp propose de choisir le contact.
   */
  function sendLinkWhatsapp() {
    if (!receipt) return;
    const digits = receipt.customerPhone ? toWhatsAppNumber(receipt.customerPhone, dial) : '';
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(receiptLinkText())}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  /**
   * Bouton WhatsApp unique — envoie le reçu en IMAGE, au client en priorité.
   *  • Téléphone : partage natif (`navigator.share` avec le fichier) → on choisit
   *    WhatsApp puis le client, la photo part telle quelle. (WhatsApp n'autorise
   *    pas de joindre un fichier à un numéro pré-ciblé via un lien — le partage
   *    natif est le seul moyen d'envoyer réellement l'image.)
   *  • PC / partage fichier indispo : télécharge l'image ET ouvre la conversation
   *    du client (wa.me/<son numéro>, texte du reçu) pour joindre l'image d'un geste.
   *  • Ultime repli (canvas indispo) : message texte vers le numéro du client.
   */
  async function shareWhatsapp() {
    if (!receipt || busy) return;
    setBusy(true);
    try {
      const blob = await buildReceiptImage();
      const fileName = `recu-${receipt.number || 'vente'}.png`;
      const digits = receipt.customerPhone ? toWhatsAppNumber(receipt.customerPhone, dial) : '';
      const caption = receiptText();
      if (blob) {
        const file = new File([blob], fileName, { type: 'image/png' });
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
        // PC : télécharge l'image puis ouvre la conversation du client (texte).
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        if (digits) {
          window.open(
            `https://wa.me/${digits}?text=${encodeURIComponent(caption)}`,
            '_blank',
            'noopener,noreferrer',
          );
        }
        return;
      }
      // Repli texte (canvas indisponible).
      if (digits) {
        window.open(
          `https://wa.me/${digits}?text=${encodeURIComponent(caption)}`,
          '_blank',
          'noopener,noreferrer',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!receipt} onClose={onClose} size="sm">
      {receipt && (
        <div className="flex flex-col gap-4">
          {receipt.cancelled && (
            <div className="no-print bg-danger/10 text-danger font-body rounded-md px-4 py-3 text-sm">
              <p className="font-bold">{t('ventes.cancelled')}</p>
              <p className="mt-0.5">
                {receipt.cancelled.reason}
                {receipt.cancelled.byName ? ` — ${receipt.cancelled.byName}` : ''}
                {receipt.cancelled.at
                  ? ` · ${new Date(receipt.cancelled.at).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}`
                  : ''}
              </p>
            </div>
          )}
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
              {phone && (
                <p className="font-body text-xs text-neutral-500">
                  <span dir="ltr">{phone}</span>
                </p>
              )}
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
                {t('common.phone')}: <span dir="ltr">{receipt.customerPhone}</span>
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

            {(receipt.discount ?? 0) > 0 && (
              <div className="font-body mb-1 flex flex-col gap-0.5 text-xs text-neutral-500">
                <div className="flex justify-between">
                  <span>{t('common.subtotal')}</span>
                  <span>
                    {formatFCFA(receipt.subtotal ?? receipt.total)} {t('common.fcfa')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('pos.discount')}</span>
                  <span>
                    − {formatFCFA(receipt.discount ?? 0)} {t('common.fcfa')}
                  </span>
                </div>
              </div>
            )}

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

          {/* Actions — non imprimées. Trois voies d'envoi :
              1) « Envoyer au client » → WhatsApp texte + lien de téléchargement
                 (marche partout, même sans enregistrer le numéro en contact) ;
              2) « Partager le reçu » → partage natif du fichier image (le seul
                 moyen de joindre réellement le reçu dans la conversation) ;
              3) « Imprimer ». */}
          <div className="no-print flex flex-col gap-2">
            <button
              type="button"
              onClick={sendLinkWhatsapp}
              className="bg-success text-success-foreground font-body flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
            >
              <Icon i="send" size={15} />
              {t('receipt.sendToClient')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={shareWhatsapp}
                disabled={busy}
                className="border-border bg-surface text-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                <Icon
                  i={busy ? 'loader-2' : 'share-2'}
                  size={15}
                  className={busy ? 'animate-spin' : ''}
                />
                {t('receipt.shareFile')}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="border-border bg-surface text-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
              >
                <Icon i="printer" size={15} />
                {t('receipt.print')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
