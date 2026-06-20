'use client';

import type { ReactNode } from 'react';

export function AdminHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-headings text-foreground text-2xl font-bold">{title}</h1>
        {subtitle ? (
          <p className="text-muted-foreground font-body mt-0.5 text-sm">{subtitle}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

const TONES: Record<string, string> = {
  neutral: 'bg-muted text-muted-foreground',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
};

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={`font-body inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[tone] ?? TONES.neutral}`}
    >
      {children}
    </span>
  );
}

/** Bouton « Charger plus » pour la pagination par curseur. */
export function LoadMore({
  show,
  loading,
  onClick,
}: {
  show: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="border-border bg-surface text-foreground font-body self-start rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {loading ? 'Chargement…' : 'Charger plus'}
    </button>
  );
}

/** Champ de recherche + bouton, formulaire. */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex gap-2"
    >
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2 text-sm outline-none"
      />
      <button
        type="submit"
        className="bg-primary text-primary-foreground font-body rounded-md px-4 py-2 text-sm font-semibold"
      >
        Rechercher
      </button>
    </form>
  );
}
