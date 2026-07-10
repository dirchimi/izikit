import Icon from '@/components/ui/Icon';

/**
 * Tuile « argent encaissé » (caisse miroir) — partagée par le tableau de bord
 * et les rapports. Affiche une somme réellement encaissée (espèces / mobile) ou
 * en attente (crédit), avec une icône et une couleur de ton.
 */
export default function CashTile({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  /** Classe de couleur (ex. `text-primary`, `text-blue-600`, `text-warning`). */
  tone: string;
}) {
  return (
    <div className="bg-muted/40 border-border flex items-center gap-3 rounded-lg border px-4 py-3">
      <div className="bg-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
        <Icon i={icon} size={18} className={tone} />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground font-body text-xs">{label}</p>
        <p className={`font-headings text-lg font-bold ${tone}`}>
          {value} <span className="text-muted-foreground text-xs font-normal">{unit}</span>
        </p>
      </div>
    </div>
  );
}
