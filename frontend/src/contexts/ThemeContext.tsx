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
import { DEFAULT_THEME, THEME_COOKIE, type Theme } from '@/lib/theme/config';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Fournit le thème courant + un setter aux composants clients.
 * `initialTheme` est lu côté serveur (cookie) → la classe `dark` est déjà posée
 * sur <html> au SSR, donc aucun flash. `setTheme` écrit le cookie et bascule la
 * classe `dark` directement (pur CSS, pas de `router.refresh()` → instantané).
 */
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    document.documentElement.classList.toggle('dark', next === 'dark');
    setThemeState(next);
  }, []);

  // Garde la classe <html> en phase avec l'état (sécurité après hydratation).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Repli sûr (hors provider, tests) : thème clair, setters no-op.
    return { theme: DEFAULT_THEME, setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}
