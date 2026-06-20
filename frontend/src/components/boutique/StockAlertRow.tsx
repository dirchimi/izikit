export interface StockAlertRowProps {
  name: string;
  remaining: number;
  unit: string;
  critical: boolean;
}

export default function StockAlertRow({ name, remaining, unit, critical }: StockAlertRowProps) {
  return (
    <div className="border-border flex items-center gap-3 border-b px-4 py-3">
      <div className={`h-2 w-2 shrink-0 rounded-full ${critical ? 'bg-danger' : 'bg-warning'}`} />
      <span className="font-body text-foreground flex-1 text-sm">{name}</span>
      <span
        className={`font-body rounded-sm px-2 py-0.5 text-xs font-semibold ${
          critical ? 'bg-danger text-danger-foreground' : 'bg-warning text-warning-foreground'
        }`}
      >
        {remaining} {unit}
      </span>
    </div>
  );
}
