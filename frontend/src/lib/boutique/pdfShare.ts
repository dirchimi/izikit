// LOT 3 — helpers de partage / téléchargement de PDF côté client.
// On ne rouvre plus le PDF dans un nouvel onglet (pas de window.open pour le
// PDF) : on récupère un Blob authentifié (cookie de session), qu'on affiche
// dans une modale, télécharge, ou partage via l'API de partage native.
import { API_URL } from '@/lib/constants';

/**
 * Récupère un PDF authentifié en Blob. La session passe par le cookie httpOnly
 * (credentials: 'include') ; sur 401 on tente un unique refresh puis on rejoue.
 */
export async function fetchPdfBlob(path: string): Promise<Blob> {
  const doFetch = () => fetch(`${API_URL}${path}`, { credentials: 'include' });
  let res = await doFetch();
  if (res.status === 401) {
    await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' }).catch(
      () => {},
    );
    res = await doFetch();
  }
  if (!res.ok) throw new Error(`PDF ${res.status}`);
  return res.blob();
}

/** Le partage natif de ce fichier est-il disponible (mobile surtout) ? */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === 'function'
  );
}

/** Déclenche le téléchargement local d'un Blob sous le nom donné. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Partage un PDF via WhatsApp.
 * - Mobile : partage natif du fichier (WhatsApp apparaît dans la feuille de
 *   partage et le PDF est joint directement à la conversation).
 * - Sinon (PC / partage de fichier indisponible) : ouvre wa.me/<numéro> avec un
 *   message pré-rempli — le destinataire est ciblé, le PDF ayant été téléchargé.
 * Renvoie true si le partage natif du fichier a réussi.
 */
export async function sharePdfViaWhatsapp(opts: {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
  phone?: string | null;
}): Promise<boolean> {
  const file = new File([opts.blob], opts.fileName, { type: 'application/pdf' });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text });
      return true;
    } catch {
      // Annulé par l'utilisateur ou échec → repli wa.me ci-dessous.
    }
  }
  const digits = (opts.phone ?? '').replace(/\D/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(opts.text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return false;
}
