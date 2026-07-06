'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';

export interface ProductLite {
  id: string;
  name: string;
  sellPrice: number;
}
export interface PickedLine {
  name: string;
  unitPrice: number;
}

/**
 * Sélecteur de produit pour une ligne de proforma — branché sur le vrai
 * catalogue (`/api/products`, passé en prop pour n'être chargé qu'une fois par
 * le formulaire). Recherche par nom, affiche le prix, remplit nom + P.U. au
 * choix. « Ligne libre » : permet un article hors-catalogue (livraison, etc.).
 * Modelé sur ClientPicker (feuille du bas sur mobile, menu déroulant ≥ sm).
 */
export default function ProductLinePicker({
  value,
  products,
  onPick,
}: {
  value: string;
  products: ProductLite[];
  onPick: (p: PickedLine) => void;
}) {
  const t = useT();
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
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
    return list.slice(0, 8);
  }, [products, query]);

  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 && !products.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());

  function close() {
    setOpen(false);
    setQuery('');
  }
  function pickProduct(p: ProductLite) {
    onPick({ name: p.name, unitPrice: p.sellPrice });
    close();
  }
  function createFree() {
    if (!trimmed) return;
    onPick({ name: trimmed, unitPrice: 0 });
    close();
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`border-border bg-input focus:border-primary flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm ${
          value ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Icon i="package" size={14} className="text-muted-foreground shrink-0" />
        <span className="font-body min-w-0 flex-1 truncate text-start">
          {value || t('documents.line.pickProduct')}
        </span>
        <Icon
          i="chevron-down"
          size={15}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={close} aria-hidden />
          <div className="border-border bg-surface animate-scale-in fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-hidden rounded-t-2xl border shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:mt-1.5 sm:w-full sm:rounded-xl">
            <div className="border-border flex items-center gap-2 border-b px-3 py-2.5">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    e.preventDefault();
                    createFree();
                  }
                }}
                placeholder={t('documents.line.searchProduct')}
                aria-label={t('documents.line.searchProduct')}
                className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="max-h-[55vh] overflow-y-auto py-1 sm:max-h-56">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="font-body text-foreground hover:bg-muted flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-foreground shrink-0 text-xs font-semibold">
                    {formatFCFA(p.sellPrice)} {t('common.fcfa')}
                  </span>
                </button>
              ))}

              {canCreate && (
                <button
                  type="button"
                  onClick={createFree}
                  className="text-primary hover:bg-muted font-body flex w-full items-center gap-2 px-3 py-2 text-start text-sm font-semibold"
                >
                  <Icon i="plus" size={14} />
                  {t('documents.line.freeLine', { name: trimmed })}
                </button>
              )}

              {filtered.length === 0 && !canCreate && (
                <p className="text-muted-foreground font-body px-3 py-3 text-center text-sm">
                  {t('documents.line.noProduct')}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
