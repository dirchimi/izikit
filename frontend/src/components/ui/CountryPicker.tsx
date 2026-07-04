'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useLocale } from '@/contexts/LocaleContext';
import { COUNTRIES, countryByCode, countryName } from '@/lib/boutique/countries';

/**
 * Sélecteur de pays moderne (Paramètres) — remplace le `<select>` natif.
 * Affiche le DRAPEAU en évidence, le nom traduit (fr/en/ar) et l'indicatif.
 * Recherche intégrée ; feuille du bas plein écran sur mobile, menu déroulant
 * sur desktop (même patron que le sélecteur de client du POS).
 */
export default function CountryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const { t, locale } = useLocale();
  const selected = countryByCode(value);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        countryName(c, locale).toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query, locale]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="border-border bg-input hover:border-primary flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors"
      >
        <span className="text-lg leading-none">{selected.flag}</span>
        <span className="font-body text-foreground min-w-0 flex-1 truncate text-start">
          {countryName(selected, locale)}
        </span>
        <span className="font-body text-muted-foreground shrink-0 text-xs">+{selected.dial}</span>
        <Icon
          i="chevron-down"
          size={15}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          {/* Fond sombre — mobile uniquement : ferme au toucher. */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Feuille du bas sur mobile, menu déroulant sur desktop. */}
          <div className="border-border bg-surface animate-scale-in fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-hidden rounded-t-2xl border shadow-xl sm:absolute sm:bottom-auto sm:mt-1.5 sm:max-h-none sm:rounded-xl">
            <div className="border-border flex items-center justify-between border-b px-4 py-3 sm:hidden">
              <span className="font-headings text-foreground text-sm font-bold">
                {t('parametres.field.country')}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="text-muted-foreground hover:text-foreground"
              >
                <Icon i="x" size={18} />
              </button>
            </div>

            <div className="border-border flex items-center gap-2 border-b px-3 py-2.5">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('parametres.field.countrySearch')}
                aria-label={t('parametres.field.countrySearch')}
                className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="max-h-[55vh] overflow-y-auto py-1 sm:max-h-64" role="listbox">
              {filtered.map((c) => {
                const active = c.code === selected.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(c.code)}
                    className={`font-body flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm transition-colors ${
                      active
                        ? 'bg-secondary text-secondary-foreground font-semibold'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="text-lg leading-none">{c.flag}</span>
                    <span className="min-w-0 flex-1 truncate">{countryName(c, locale)}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">+{c.dial}</span>
                    {active && <Icon i="check" size={15} className="text-primary shrink-0" />}
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className="text-muted-foreground font-body px-3 py-3 text-center text-sm">
                  {t('parametres.field.countryEmpty')}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
