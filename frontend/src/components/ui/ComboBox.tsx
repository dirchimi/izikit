'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * Menu déroulant 100 % maison (charte Sahilley) — y compris la liste ouverte
 * (contrairement à un `<select>` natif dont les options gardent le style du
 * navigateur). Optionnellement :
 *  - `searchable` : champ de recherche pour filtrer les options ;
 *  - `creatable`  : l'utilisateur peut CRÉER une nouvelle valeur en la tapant
 *    (« Ajouter “…” ») — pensé pour des catégories propres à chaque boutique.
 *  - `allLabel`   : entrée en tête mappée sur la valeur '' (ex. « Toutes catégories »).
 */
export default function ComboBox({
  value,
  onChange,
  options,
  placeholder = 'Sélectionner…',
  allLabel,
  creatable = false,
  searchable = false,
  className = '',
  createLabel = (q) => `Ajouter « ${q} »`,
  emptyLabel = 'Aucun résultat',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  allLabel?: string;
  creatable?: boolean;
  searchable?: boolean;
  className?: string;
  createLabel?: (q: string) => string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showSearch = searchable || creatable;

  useEffect(() => {
    if (!open) return;
    if (showSearch) inputRef.current?.focus();
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
  }, [open, showSearch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const trimmed = query.trim();
  const canCreate =
    creatable &&
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  const displayLabel = value !== '' ? value : (allLabel ?? placeholder);
  const muted = value === '';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`border-border bg-surface focus:border-primary focus:ring-primary/20 flex w-full items-center justify-between gap-2 rounded-lg border py-2 ps-3 pe-2.5 text-sm outline-none transition-colors focus:ring-2 ${
          muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        <span className="font-body truncate">{displayLabel}</span>
        <Icon
          i="chevron-down"
          size={15}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="animate-scale-in border-border bg-surface absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border shadow-xl">
          {showSearch && (
            <div className="border-border flex items-center gap-2 border-b px-3 py-2">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    e.preventDefault();
                    pick(trimmed);
                  }
                }}
                placeholder={creatable ? 'Rechercher ou créer…' : 'Rechercher…'}
                aria-label={creatable ? 'Rechercher ou créer…' : 'Rechercher…'}
                className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1" role="listbox">
            {allLabel && !query && (
              <Row selected={value === ''} onClick={() => pick('')}>
                {allLabel}
              </Row>
            )}
            {filtered.map((o) => (
              <Row key={o} selected={o === value} onClick={() => pick(o)}>
                {o}
              </Row>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={() => pick(trimmed)}
                className="text-primary hover:bg-muted font-body flex w-full items-center gap-2 px-3 py-2 text-start text-sm font-semibold"
              >
                <Icon i="plus" size={14} />
                {createLabel(trimmed)}
              </button>
            )}
            {filtered.length === 0 && !canCreate && !allLabel && (
              <p className="text-muted-foreground font-body px-3 py-3 text-center text-sm">
                {emptyLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`font-body flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors ${
        selected
          ? 'bg-secondary text-secondary-foreground font-semibold'
          : 'text-foreground hover:bg-muted'
      }`}
    >
      <span className="truncate">{children}</span>
      {selected && <Icon i="check" size={14} className="text-primary shrink-0" />}
    </button>
  );
}
