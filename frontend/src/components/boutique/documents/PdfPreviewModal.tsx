'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { useT } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { fetchPdfBlob, downloadBlob, sharePdfViaWhatsapp } from '@/lib/boutique/pdfShare';

/**
 * LOT 3 — aperçu PDF dans une modale interne (plus de window.open). Récupère le
 * PDF en Blob, l'affiche dans un <iframe>, et propose « Télécharger » +
 * « Partager via WhatsApp » (partage natif du fichier sur mobile, wa.me sinon).
 */
export default function PdfPreviewModal({
  open,
  path,
  fileName,
  title,
  shareText,
  phone,
  onClose,
}: {
  open: boolean;
  path: string | null;
  fileName: string;
  title: string;
  shareText: string;
  phone?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    setBlob(null);
    setUrl(null);
    fetchPdfBlob(path)
      .then((b) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, path]);

  function handleDownload() {
    if (blob) downloadBlob(blob, fileName);
  }

  async function handleShare() {
    if (!blob || sharing) return;
    setSharing(true);
    try {
      await sharePdfViaWhatsapp({ blob, fileName, title, text: shareText, phone: phone ?? null });
    } catch {
      toast(t('async.error'), 'error');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="flex flex-col gap-4">
        {loading && (
          <div className="flex h-[55vh] items-center justify-center">
            <Icon i="loader-2" size={26} className="text-muted-foreground animate-spin" />
          </div>
        )}
        {error && (
          <div className="text-muted-foreground font-body flex h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm">
            <Icon i="file-x-2" size={26} />
            {t('documents.pdfError')}
          </div>
        )}
        {url && !loading && !error && (
          <iframe
            src={url}
            title={title}
            className="border-border h-[55vh] w-full rounded-md border bg-white"
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleShare}
            disabled={!blob || sharing}
            className="border-border bg-surface text-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            <Icon
              i={sharing ? 'loader-2' : 'share-2'}
              size={15}
              className={sharing ? 'animate-spin' : ''}
            />
            {t('documents.shareWhatsapp')}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!blob}
            className="bg-primary text-primary-foreground font-body flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            <Icon i="download" size={15} />
            {t('documents.downloadPdf')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
