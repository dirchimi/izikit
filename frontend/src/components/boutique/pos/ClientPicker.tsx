'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/useApi';
import { useT } from '@/contexts/LocaleContext';

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

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [newPhone, setNewPhone] = useState('');
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
    setNewPhone('');
  }
  function create() {
    if (!trimmed) return;
    const phone = newPhone.trim();
    // Numéro capturé à la création → reçu + envoi WhatsApp direct au client.
    onChange(phone ? { name: trimmed, phone } : { name: trimmed });
    setOpen(false);
    setQuery('');
    setNewPhone('');
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`bg-surface flex items-center rounded-md border ${
          value ? 'border-primary' : required ? 'border-amber-400' : 'border-border'
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

      {open && (
        <div className="animate-scale-in border-border bg-surface absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border shadow-xl">
          <div className="border-border flex items-center gap-2 border-b px-3 py-2">
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
              className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
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
              <div className="flex flex-col gap-2 px-3 py-2">
                <div className="border-border bg-input flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                  <Icon i="phone" size={13} className="text-muted-foreground shrink-0" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        create();
                      }
                    }}
                    placeholder={t('pos.client.phonePlaceholder')}
                    className="text-foreground placeholder:text-muted-foreground font-body w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={create}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-body flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
                >
                  <Icon i="plus" size={14} />
                  {t('pos.client.create', { name: trimmed })}
                </button>
              </div>
            )}

            {filtered.length === 0 && !canCreate && (
              <p className="text-muted-foreground font-body px-3 py-3 text-center text-sm">
                {t('pos.client.empty')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
