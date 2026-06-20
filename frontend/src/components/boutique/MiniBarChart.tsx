import type { WeekdayBar } from '@/lib/boutique/fixtures';

/**
 * Mini graphe en barres (CSS only). La hauteur de chaque barre est
 * data-driven (valeur 0–100 → px), seul cas légitime de style inline.
 */
export default function MiniBarChart({
  data,
  todayIndex,
}: {
  data: WeekdayBar[];
  todayIndex: number;
}) {
  return (
    <div className="flex h-20 items-end gap-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`w-full rounded-sm ${i === todayIndex ? 'bg-primary' : 'bg-muted'}`}
            style={{ height: `${d.value * 0.68}px` }}
          />
          <span
            className={`font-body text-xs ${
              i === todayIndex ? 'text-primary font-semibold' : 'text-muted-foreground'
            }`}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}
