import { reportBars, reportBarsMax, reportPeakIndex } from '@/lib/boutique/fixtures';

/**
 * Mini graphe en barres « Évolution des ventes » (CSS only). La hauteur de
 * remplissage est dynamique (% de la valeur max) → seul ce calcul passe par
 * `style`, le reste est en utilitaires Tailwind. Pic de la semaine mis en avant.
 */
export default function ReportBarChart() {
  return (
    <div className="flex h-[180px] items-end gap-2 sm:gap-3">
      {reportBars.map((bar, i) => {
        const pct = Math.round((bar.value / reportBarsMax) * 100);
        const peak = i === reportPeakIndex;
        return (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-body text-muted-foreground text-xs">{bar.value}</span>
            <div className="flex h-[140px] w-full flex-col justify-end">
              <div
                className={`w-full rounded-sm ${peak ? 'bg-primary' : 'bg-primary/65'}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="font-body text-muted-foreground text-xs">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}
