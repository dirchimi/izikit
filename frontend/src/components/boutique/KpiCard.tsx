import type { ReactNode } from 'react';

/** Carte KPI compacte (label / valeur / sous-label). Partagée Stock + Dépenses + Ventes + Rapports. */
export default function KpiCard({
  label,
  value,
  sublabel,
  accent = false,
  valueClass,
}: {
  label: string;
  value: string;
  sublabel: ReactNode;
  accent?: boolean;
  valueClass?: string;
}) {
  if (accent) {
    return (
      <div className="bg-primary flex flex-col gap-1 rounded-lg px-5 py-4">
        <span className="text-primary-foreground font-body text-xs opacity-70">{label}</span>
        <span className="font-headings text-primary-foreground text-2xl font-bold">{value}</span>
        <span className="text-primary-foreground font-body text-xs opacity-60">{sublabel}</span>
      </div>
    );
  }
  return (
    <div className="bg-surface border-border flex flex-col gap-1 rounded-lg border px-5 py-4">
      <span className="text-muted-foreground font-body text-xs">{label}</span>
      <span className={`font-headings text-2xl font-bold ${valueClass ?? 'text-foreground'}`}>
        {value}
      </span>
      <span className="text-muted-foreground font-body text-xs">{sublabel}</span>
    </div>
  );
}
