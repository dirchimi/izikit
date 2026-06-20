'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { ACTIVE_LOCALES, LOCALE_LABELS } from '@/lib/i18n/config';

/**
 * Sélecteur de langue fonctionnel (FR / EN / AR).
 * Bascule la langue via cookie + refresh ; l'arabe passe l'UI en RTL
 * (le sens d'écriture est posé sur <html> par le layout via `dir(locale)`).
 */
export default function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

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
            className={`font-body px-3 py-1.5 text-xs ${i > 0 ? 'border-border border-s' : ''} ${
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
