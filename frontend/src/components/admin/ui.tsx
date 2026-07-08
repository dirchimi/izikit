'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
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

/**
 * Carte KPI du tableau de bord admin.
 * - `accent` : carte pleine (vert primaire) mise en avant (ex. MRR).
 * - `warn`   : accent « attention » (ambre) — valeur + icône colorées, ex. file
 *   de paiements à valider quand elle n'est pas vide.
 * - `href`   : rend la carte cliquable (drill-down) — anneau au survol + flèche.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = false,
  warn = false,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  accent?: boolean;
  warn?: boolean;
  href?: string;
}) {
  const clickable = !!href;
  const shell = [
    'group relative flex flex-col gap-3 rounded-lg border px-5 py-5 transition-all',
    accent
      ? 'bg-primary border-primary'
      : warn
        ? 'bg-amber-50 border-amber-200'
        : 'bg-surface border-border',
    clickable ? 'hover:ring-primary/40 hover:-translate-y-0.5 hover:shadow-sm hover:ring-2' : '',
  ].join(' ');

  const labelCls = accent
    ? 'text-primary-foreground/80'
    : warn
      ? 'text-amber-700'
      : 'text-muted-foreground';
  const iconBox = accent ? 'bg-primary-foreground/20' : warn ? 'bg-amber-200/60' : 'bg-muted';
  const iconCol = accent
    ? 'text-primary-foreground'
    : warn
      ? 'text-amber-700'
      : 'text-muted-foreground';
  const valueCls = accent ? 'text-primary-foreground' : warn ? 'text-amber-800' : 'text-foreground';
  const subCls = accent
    ? 'text-primary-foreground/70'
    : warn
      ? 'text-amber-600'
      : 'text-muted-foreground';

  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className={`font-body text-sm font-medium ${labelCls}`}>{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBox}`}>
          <Icon i={icon} size={16} className={iconCol} />
        </div>
      </div>
      <span className={`font-headings text-3xl leading-none font-bold ${valueCls}`}>{value}</span>
      {sub ? <span className={`font-body text-xs ${subCls}`}>{sub}</span> : null}
      {clickable ? (
        <Icon
          i="arrow-right"
          size={14}
          className={`absolute right-4 bottom-4 opacity-0 transition-opacity group-hover:opacity-100 ${iconCol}`}
        />
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
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
