'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALE_COOKIE, dir, type Locale } from '@/lib/i18n/config';
import { translate } from '@/lib/i18n/dictionary';

type Vars = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Fournit la langue courante + un traducteur `t` aux composants clients.
 * `initialLocale` est lu côté serveur (cookie) → pas de désync à l'hydratation.
 * `setLocale` écrit le cookie puis `router.refresh()` pour re-rendre aussi les
 * composants serveur (landing, auth, layout : lang/dir du <html>).
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      // Applique lang/dir DIRECTEMENT (comme ThemeContext pour la classe `dark`)
      // : Next ne re-patche pas les attributs du <html> côté client sur
      // router.refresh(), donc l'arabe (RTL + police Tajawal) ne s'appliquait
      // jamais — le texte changeait mais la mise en page restait LTR/latine.
      document.documentElement.lang = next;
      document.documentElement.dir = dir(next);
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  // Garde <html lang/dir> en phase avec l'état (filet après hydratation).
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir(locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Repli sûr (SSR hors provider, tests) : français, setLocale no-op.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
    };
  }
  return ctx;
}

/** Raccourci : récupère uniquement le traducteur. */
export function useT(): (key: string, vars?: Vars) => string {
  return useLocale().t;
}
