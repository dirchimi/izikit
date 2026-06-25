'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { ACTIVE_LOCALES, LOCALE_LABELS } from '@/lib/i18n/config';

/**
 * Sélecteur de langue fonctionnel (FR / EN / AR).
 * Bascule la langue via cookie + refresh ; l'arabe passe l'UI en RTL
 * (le sens d'écriture est posé sur <html> par le layout via `dir(locale)`).
 */
export default function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Variante dense (TopBar) : segments plus petits pour gagner de la place. */
  compact?: boolean;
}) {
  const { locale, setLocale } = useLocale();
  const seg = compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div
      className={`border-border flex items-center overflow-hidden rounded-md border ${className ?? ''}`}
    >
      {ACTIVE_LOCALES.map((l, i) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(l)}
            className={`font-body ${seg} ${i > 0 ? 'border-border border-s' : ''} ${
              active ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'
            }`}
          >
            {LOCALE_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
