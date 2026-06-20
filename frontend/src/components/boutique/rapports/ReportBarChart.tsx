'use client';

export interface ChartBar {
  label: string;
  value: number; // FCFA
}

function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

/**
 * Mini graphe en barres « Évolution des ventes » (CSS only). Hauteur = % du max.
 * Le pic est mis en avant. Les étiquettes de valeur ne s'affichent que quand le
 * nombre de barres reste lisible (≤ 12) pour éviter l'encombrement (vue mois).
 */
export default function ReportBarChart({ bars }: { bars: ChartBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peakIndex = bars.reduce(
    (best, b, i, arr) => (b.value > (arr[best]?.value ?? 0) ? i : best),
    0,
  );
  const showValues = bars.length <= 12;

  if (bars.length === 0) {
    return (
      <div className="text-muted-foreground font-body flex h-[180px] items-center text-sm">—</div>
    );
  }

  return (
    <div className="flex h-[180px] items-end gap-1 sm:gap-2">
      {bars.map((bar, i) => {
        const pct = Math.round((bar.value / max) * 100);
        const peak = i === peakIndex && bar.value > 0;
        return (
          <div key={`${bar.label}-${i}`} className="flex flex-1 flex-col items-center gap-1">
            {showValues && (
              <span className="font-body text-muted-foreground text-[10px] sm:text-xs">
                {compact(bar.value)}
              </span>
            )}
            <div className="flex h-[140px] w-full flex-col justify-end">
              <div
                className={`w-full rounded-sm ${peak ? 'bg-primary' : 'bg-primary/65'}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="font-body text-muted-foreground truncate text-[10px] sm:text-xs">
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
