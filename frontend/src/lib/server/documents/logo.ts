// LOT 3 — récupération du logo boutique pour l'incruster dans le PDF.
// @react-pdf/renderer ne sait décoder que PNG et JPEG (pas WebP). Un logo
// uploadé en WebP ferait donc échouer tout le rendu. On force donc un JPEG via
// une transformation Cloudinary (f_jpg) quand l'URL est un asset Cloudinary,
// puis on télécharge les octets et on renvoie une data-URI base64. Toute erreur
// (réseau, format, taille) => null : le logo est décoratif, jamais bloquant.
import 'server-only';

const MAX_LOGO_BYTES = 2_000_000; // garde-fou : ignore un asset anormalement lourd
const FETCH_TIMEOUT_MS = 4000;

/** Force un JPEG borné en largeur si l'URL est un asset Cloudinary `/upload/`. */
function normalizeForPdf(url: string): string {
  const marker = '/upload/';
  const i = url.indexOf(marker);
  if (!url.includes('res.cloudinary.com') || i === -1) return url;
  const insertAt = i + marker.length;
  return `${url.slice(0, insertAt)}f_jpg,q_80,w_240/${url.slice(insertAt)}`;
}

/**
 * Télécharge le logo et renvoie une data-URI `data:image/...;base64,...`
 * consommable par `<Image>` de @react-pdf. Renvoie null si absent/échec.
 */
export async function fetchLogoDataUri(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(normalizeForPdf(logoUrl), { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    // @react-pdf ne gère que JPEG/PNG — refuse tout le reste (WebP, SVG…).
    if (!/^image\/(jpe?g|png)$/i.test(contentType)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return null;
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
