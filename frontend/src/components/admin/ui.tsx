'use client';

import type { ReactNode } from 'react';
import Icon from '@/components/ui/Icon';

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

/** Carte KPI du tableau de bord admin. `accent` = carte verte mise en avant. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border px-5 py-5 ${
        accent ? 'bg-primary border-primary' : 'bg-surface border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-body text-sm font-medium ${
            accent ? 'text-primary-foreground/80' : 'text-muted-foreground'
          }`}
        >
          {label}
        </span>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            accent ? 'bg-primary-foreground/20' : 'bg-muted'
          }`}
        >
          <Icon
            i={icon}
            size={16}
            className={accent ? 'text-primary-foreground' : 'text-muted-foreground'}
          />
        </div>
      </div>
      <span
        className={`font-headings text-3xl leading-none font-bold ${
          accent ? 'text-primary-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </span>
      {sub ? (
        <span
          className={`font-body text-xs ${
            accent ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}

/** Carte/section avec en-tête + contenu. */
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface border-border flex flex-col rounded-lg border">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-headings text-foreground text-sm font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Mini graphe en barres (CSS only), hauteurs normalisées sur le max. */
export function MiniBars({
  data,
}: {
  data: Array<{ label: string; value: number; hint?: string }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="group flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              title={d.hint ?? `${d.label}: ${d.value}`}
              className="bg-primary/80 hover:bg-primary w-full rounded-sm transition-colors"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-muted-foreground font-body text-[10px]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Barre de progression horizontale (répartitions par rôle / statut). */
export function StatBar({
  label,
  value,
  total,
  tone = 'blue',
}: {
  label: string;
  value: number;
  total: number;
  tone?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const fill: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    neutral: 'bg-muted-foreground',
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-body text-foreground text-xs font-medium">{label}</span>
        <span className="font-body text-muted-foreground text-xs">
          {value} · {pct}%
        </span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${fill[tone] ?? fill.blue}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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
