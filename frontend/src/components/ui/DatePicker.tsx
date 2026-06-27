'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { useLocale, useT } from '@/contexts/LocaleContext';

const BCP47: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar' };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Sélecteur de date 100 % maison (charte Sahilley) — remplace le calendrier
 * natif du navigateur (non stylisable). Popover : navigation mois, grille
 * lundi→dimanche, jour sélectionné/aujourd'hui mis en avant, bornes min/max,
 * « Aujourd'hui » et « Effacer ». Locale-aware (fr/en/ar).
 */
export default function DatePicker({
  value,
  onChange,
  placeholder,
  min,
  max,
  className = '',
}: {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
  className?: string;
}) {
  const { locale } = useLocale();
  const t = useT();
  const bcp = BCP47[locale] ?? 'fr-FR';

  const [open, setOpen] = useState(false);
  const selected = fromYmd(value);
  const [view, setView] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setView(startOfMonth(fromYmd(value) ?? new Date()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
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

  const minD = min ? fromYmd(min) : null;
  const maxD = max ? fromYmd(max) : null;
  const today = new Date();

  const days = useMemo(() => {
    const first = startOfMonth(view);
    const startDow = (first.getDay() + 6) % 7; // 0 = lundi
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - startDow);
    return Array.from(
      { length: 42 },
      (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
    );
  }, [view]);

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        // 1 jan 2024 = lundi → libellés lundi…dimanche
        new Date(2024, 0, 1 + i).toLocaleDateString(bcp, { weekday: 'short' }),
      ),
    [bcp],
  );

  function isDisabled(d: Date): boolean {
    if (minD && d.getTime() < minD.getTime()) return true;
    if (maxD && d.getTime() > maxD.getTime()) return true;
    return false;
  }
  function pick(d: Date): void {
    if (isDisabled(d)) return;
    onChange(toYmd(d));
    setOpen(false);
  }

  const triggerLabel = selected
    ? selected.toLocaleDateString(bcp, { day: '2-digit', month: 'short', year: 'numeric' })
    : (placeholder ?? '—');

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
      >
        <Icon i="calendar" size={14} className="text-muted-foreground shrink-0" />
        <span className={selected ? '' : 'text-muted-foreground'}>{triggerLabel}</span>
        <Icon
          i="chevron-down"
          size={14}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="animate-scale-in border-border bg-surface absolute z-50 mt-1.5 w-72 rounded-xl border p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mois précédent"
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
              className="hover:bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-md"
            >
              <Icon i="chevron-left" size={16} className="rtl:rotate-180" />
            </button>
            <span className="font-headings text-foreground text-sm font-bold capitalize">
              {view.toLocaleDateString(bcp, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              aria-label="Mois suivant"
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
              className="hover:bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-md"
            >
              <Icon i="chevron-right" size={16} className="rtl:rotate-180" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekdays.map((w, i) => (
              <span
                key={i}
                className="text-muted-foreground font-body text-center text-[10px] font-semibold uppercase"
              >
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === view.getMonth();
              const isSel = selected !== null && sameDay(d, selected);
              const isToday = sameDay(d, today);
              const dis = isDisabled(d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={dis}
                  onClick={() => pick(d)}
                  className={`font-body flex h-8 items-center justify-center rounded-md text-sm transition-colors ${
                    isSel
                      ? 'bg-primary text-primary-foreground font-bold'
                      : dis
                        ? 'text-muted-foreground/30'
                        : inMonth
                          ? 'text-foreground hover:bg-muted'
                          : 'text-muted-foreground/40 hover:bg-muted'
                  } ${isToday && !isSel ? 'ring-primary/40 ring-1' : ''}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="border-border mt-2 flex items-center justify-between border-t pt-2">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground font-body text-xs font-semibold"
            >
              {t('common.clear')}
            </button>
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="text-primary font-body text-xs font-semibold"
            >
              {t('common.today')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
