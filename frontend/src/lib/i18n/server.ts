import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './config';
import { translate } from './dictionary';

/** Langue courante côté serveur (lue depuis le cookie ; défaut FR). */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Traducteur lié à la langue serveur — pour les composants serveur (landing, auth, layout). */
export async function getServerT(): Promise<{
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}> {
  const locale = await getServerLocale();
  return { locale, t: (key, vars) => translate(locale, key, vars) };
}
