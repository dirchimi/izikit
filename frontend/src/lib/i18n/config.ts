// Configuration i18n — langues, cookie, sens d'écriture.
// FR + EN + AR actifs. L'arabe est rendu en RTL (voir `dir()` posé sur <html>).

export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

/** Langues réellement traduites/sélectionnables. */
export const ACTIVE_LOCALES: readonly Locale[] = ['fr', 'en', 'ar'];

export const DEFAULT_LOCALE: Locale = 'fr';

/** Cookie lisible côté client (préférence UI, pas un secret). */
export const LOCALE_COOKIE = 'app-locale';

export const LOCALE_LABELS: Record<Locale, string> = { fr: 'FR', ar: 'AR', en: 'EN' };

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Renvoie une langue active valide (sinon la langue par défaut). */
export function normalizeLocale(value: string | undefined | null): Locale {
  return isLocale(value) && ACTIVE_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

export function dir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
