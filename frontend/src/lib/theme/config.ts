// Thème clair / sombre — cookie + helpers (préférence UI, pas un secret).
// Le sens technique : une classe `dark` posée sur <html> bascule les tokens
// de couleur (voir `globals.css`). Tout le reste suit via les variables CSS.

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'light';

/** Cookie lisible côté client (préférence UI). */
export const THEME_COOKIE = 'app-theme';

export function normalizeTheme(value: string | undefined | null): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
