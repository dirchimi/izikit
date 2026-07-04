'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/useApi';
import { useT } from '@/contexts/LocaleContext';
import { countryByCode } from '@/lib/boutique/countries';

interface OrgCurrentLite {
  settings: { country: string };
}

/** Client choisi : soit un existant (avec id), soit un nouveau (nom seul). */
export interface PickedClient {
  id?: string;
  name: string;
  phone?: string | null;
}

interface ApiCustomer {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * Sélecteur de client (POS) — branché sur les VRAIS clients de la boutique
 * (`/api/customers`) : recherche, choix d'un existant (évite les doublons via
 * son id) ou création à la volée (« Ajouter “…” »). Optionnel par défaut ;
 * `required` ne change que l'habillage (la validation reste côté parent).
 */
export default function ClientPicker({
  value,
  onChange,
  required = false,
}: {
  value: PickedClient | null;
  onChange: (c: PickedClient | null) => void;
  required?: boolean;
}) {
  const t = useT();
  const { data } = useApi<{ customers: ApiCustomer[] }>('/api/customers');
  const customers = data?.customers ?? [];
  // Indicatif du pays de la boutique → préfixe affiché (le client saisit local).
  const { data: org } = useApi<OrgCurrentLite>('/api/org/current');
  const country = countryByCode(org?.settings.country);

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
    const list = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 8); // clients récents / liste courte
  }, [customers, query]);

  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 && !customers.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());

  function pickExisting(c: ApiCustomer) {
    onChange({ id: c.id, name: c.name, phone: c.phone });
    setOpen(false);
    setQuery('');
  }
  function create() {
    if (!trimmed) return;
    // Le numéro se saisit sous le sélecteur (ligne toujours visible après choix).
    onChange({ name: trimmed });
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`bg-surface flex items-center rounded-md border ${
          value ? 'border-primary' : required ? 'border-warning' : 'border-border'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm ${value ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          <Icon i="user" size={14} className="text-muted-foreground shrink-0" />
          <span className="font-body min-w-0 flex-1 truncate text-start">
            {value ? value.name : t('pos.client.choose')}
          </span>
          {!value && (
            <Icon
              i="chevron-down"
              size={15}
              className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('pos.client.clear')}
            className="text-muted-foreground hover:text-foreground shrink-0 px-2.5 py-2"
          >
            <Icon i="x" size={14} />
          </button>
        )}
      </div>

      {/* Numéro du client — toujours visible dès qu'un client est choisi.
          Le client saisit son numéro LOCAL ; l'indicatif du pays est préfixé
          (ex. 🇹🇩 +235) et l'envoi WhatsApp recompose le numéro international. */}
      {value && (
        <div className="border-border bg-input focus-within:border-primary mt-1.5 flex items-center gap-2 rounded-md border px-2.5 py-1.5">
          <span className="font-body text-muted-foreground shrink-0 text-xs font-semibold">
            {country.flag} +{country.dial}
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={value.phone ?? ''}
            onChange={(e) =>
              onChange({ ...value, phone: e.target.value.trim() === '' ? null : e.target.value })
            }
            placeholder={t('pos.client.phoneAdd')}
            aria-label={t('pos.client.phoneAdd')}
            className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
          />
        </div>
      )}

      {open && (
        <>
          {/* Fond sombre — mobile uniquement : ferme au toucher. */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Panneau : feuille du bas plein écran sur mobile (toujours atteignable,
              au-dessus du clavier), menu déroulant classique sur desktop (≥ sm). */}
          <div className="border-border bg-surface animate-scale-in fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-hidden rounded-t-2xl border shadow-xl sm:absolute sm:bottom-auto sm:mt-1.5 sm:max-h-none sm:rounded-xl">
            {/* En-tête (mobile) : titre + fermer. */}
            <div className="border-border flex items-center justify-between border-b px-4 py-3 sm:hidden">
              <span className="font-headings text-foreground text-sm font-bold">
                {t('pos.client.choose')}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canCreate) {
                    e.preventDefault();
                    create();
                  }
                }}
                placeholder={t('pos.client.searchOrCreate')}
                aria-label={t('pos.client.searchOrCreate')}
                className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="max-h-[55vh] overflow-y-auto py-1 sm:max-h-56">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickExisting(c)}
                  className={`font-body flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition-colors ${
                    value?.id === c.id
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                    <Icon i="user" size={12} className="text-muted-foreground" />
                  </div>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.phone && (
                    <span className="text-muted-foreground shrink-0 text-xs">{c.phone}</span>
                  )}
                </button>
              ))}

              {canCreate && (
                <button
                  type="button"
                  onClick={create}
                  className="text-primary hover:bg-muted font-body flex w-full items-center gap-2 px-3 py-2 text-start text-sm font-semibold"
                >
                  <Icon i="plus" size={14} />
                  {t('pos.client.create', { name: trimmed })}
                </button>
              )}

              {filtered.length === 0 && !canCreate && (
                <p className="text-muted-foreground font-body px-3 py-3 text-center text-sm">
                  {t('pos.client.empty')}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
