import Icon from '@/components/ui/Icon';

export interface StatCardProps {
  label: string;
  value: string;
  unit: string;
  icon: string;
  trend: string;
  trendUp: boolean;
  accent?: boolean;
  /** Libellé « vs hier » déjà traduit (fourni par la page). */
  vsLabel: string;
}

export default function StatCard({
  label,
  value,
  unit,
  icon,
  trend,
  trendUp,
  accent = false,
  vsLabel,
}: StatCardProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border px-5 py-5 ${
        accent ? 'bg-primary border-primary' : 'bg-surface border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-body text-sm font-medium ${
            accent ? 'text-primary-foreground opacity-80' : 'text-muted-foreground'
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
      <div className="flex items-end gap-2">
        <span
          className={`font-headings text-3xl leading-none font-bold ${
            accent ? 'text-primary-foreground' : 'text-foreground'
          }`}
        >
          {value}
        </span>
        <span
          className={`font-body mb-0.5 text-sm ${
            accent ? 'text-primary-foreground opacity-70' : 'text-muted-foreground'
          }`}
        >
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Icon
          i={trendUp ? 'arrow-up-right' : 'arrow-down-right'}
          size={13}
          className={accent ? 'text-primary-foreground' : trendUp ? 'text-success' : 'text-danger'}
        />
        <span
          className={`font-body text-xs font-semibold ${
            accent ? 'text-primary-foreground' : trendUp ? 'text-success' : 'text-danger'
          }`}
        >
          {trend}
        </span>
        <span
          className={`font-body text-xs ${
            accent ? 'text-primary-foreground opacity-50' : 'text-muted-foreground'
          }`}
        >
          {vsLabel}
        </span>
      </div>
    </div>
  );
}
