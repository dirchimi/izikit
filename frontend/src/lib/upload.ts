// Client d'upload d'image (multipart) — distinct du wrapper `api()` qui ne
// gère que du JSON. On NE fixe PAS `Content-Type` : le navigateur ajoute la
// frontière multipart lui-même. Le jeton CSRF est joint manuellement (mêmes
// règles que api.ts), et l'erreur est normalisée en `ApiError` pour que les
// appelants puissent brancher sur `err.code` (la route /api/upload renvoie le
// code dans le champ `code`, qu'on remappe vers `error`).

import { API_URL, COOKIE_PREFIX } from './constants';
import { ApiError } from './api';

const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf`;

function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_COOKIE_NAME);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export interface UploadedImage {
  /** URL HTTPS publique (Cloudinary) à stocker / afficher dans un <img>. */
  url: string;
}

/**
 * Envoie un fichier image vers `POST /api/upload` et renvoie son URL publique.
 * Lève `ApiError` (avec `.code` = ex. `FILE_TOO_LARGE`, `INVALID_MIME`,
 * `STORAGE_NOT_CONFIGURED`) en cas d'échec.
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};
  const csrf = readCsrfToken();
  if (csrf) headers['x-csrf-token'] = csrf;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      credentials: 'include',
      headers, // PAS de Content-Type : le navigateur gère la frontière multipart.
      body: form,
    });
  } catch {
    throw new ApiError(0, 'Network error. Please try again.');
  }

  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      // corps illisible
    }
    const code = typeof body.code === 'string' ? body.code : `Error ${res.status}`;
    const message = typeof body.message === 'string' ? body.message : code;
    // Remappe `code` → `error` pour que ApiError.code soit renseigné.
    throw new ApiError(res.status, message, { ...body, error: code });
  }

  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new ApiError(res.status, 'Upload returned no URL', { error: 'UPLOAD_NO_URL' });
  }
  return { url: data.url };
}
