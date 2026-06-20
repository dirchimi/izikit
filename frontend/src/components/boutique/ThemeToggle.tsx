'use client';

import Icon from '@/components/ui/Icon';
import { useTheme } from '@/contexts/ThemeContext';
import { useT } from '@/contexts/LocaleContext';

/**
 * Bascule Clair / Sombre (fonctionnelle). Deux segments comme le switcher de
 * langue ; le segment actif est mis en avant. Bascule instantanée (classe CSS).
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useT();
  const base = 'font-body flex items-center gap-1.5 px-3 py-1.5 text-xs';
  const on = 'bg-foreground text-background font-semibold';
  const off = 'text-muted-foreground';

  return (
    <div
      className={`border-border flex items-center overflow-hidden rounded-md border ${className ?? ''}`}
    >
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
        className={`${base} ${theme === 'light' ? on : off}`}
      >
        <Icon i="sun" size={12} />
        {t('topbar.light')}
      </button>
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
        className={`${base} border-border border-s ${theme === 'dark' ? on : off}`}
      >
        <Icon i="moon" size={12} />
        {t('topbar.dark')}
      </button>
    </div>
  );
}
