import { formatFCFA } from '@/lib/boutique/format';

export interface RecentSaleRowProps {
  time: string;
  product: string;
  qty: number;
  total: number;
  method: string;
  fcfa: string;
}

export default function RecentSaleRow({
  time,
  product,
  qty,
  total,
  method,
  fcfa,
}: RecentSaleRowProps) {
  return (
    <div className="border-border bg-surface flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
      <span className="font-body text-muted-foreground w-10 shrink-0 text-xs">{time}</span>
      <span className="font-body text-foreground flex-1 text-sm font-medium">{product}</span>
      <span className="font-body text-muted-foreground w-6 text-center text-xs">{qty}</span>
      <span className="font-body text-foreground w-24 text-end text-sm font-semibold">
        {formatFCFA(total)} {fcfa}
      </span>
      <span className="font-body text-muted-foreground w-20 text-center text-xs">{method}</span>
    </div>
  );
}
