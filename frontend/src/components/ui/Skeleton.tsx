'use client';

/**
 * Squelettes de chargement (shimmer) — charte Sahilley. La classe `.skeleton`
 * (globals.css) porte l'animation. Variantes prêtes à l'emploi pour les écrans
 * boutique : cartes KPI, lignes de tableau, blocs de texte.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Grille de cartes KPI en chargement. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface border-border flex flex-col gap-3 rounded-lg border px-5 py-5"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Lignes de tableau/liste en chargement. */
export function SkeletonRows({ rows = 6, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`bg-surface border-border overflow-hidden rounded-lg border ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-border flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0"
        >
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
