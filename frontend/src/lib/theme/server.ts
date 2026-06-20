import 'server-only';
import { cookies } from 'next/headers';
import { THEME_COOKIE, normalizeTheme, type Theme } from './config';

/** Thème courant côté serveur (lu depuis le cookie ; défaut clair).
 *  Lu dans le layout pour poser la classe `dark` sur <html> dès le SSR
 *  → pas de flash clair→sombre à l'hydratation. */
export async function getServerTheme(): Promise<Theme> {
  const store = await cookies();
  return normalizeTheme(store.get(THEME_COOKIE)?.value);
}
