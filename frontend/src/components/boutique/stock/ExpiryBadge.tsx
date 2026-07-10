'use client';

import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';
import { computeExpiryStatus } from '@/lib/boutique/expiry';

/** Pastille de péremption : rouge « périmé », orange « périme dans X j ».
 *  Ne rend rien si le produit n'a pas de date ou périme au-delà du seuil. */
export default function ExpiryBadge({
  expiryDate,
  alertDays,
  className = '',
}: {
  expiryDate: string | null;
  alertDays: number;
  className?: string;
}) {
  const t = useT();
  const v = computeExpiryStatus(expiryDate, alertDays, new Date());
  if (!v || v.status === 'ok') return null;

  const expired = v.status === 'expired';
  const cls = expired ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning';
  const label = expired
    ? t('expiry.badge.expired')
    : v.daysLeft === 0
      ? t('expiry.badge.today')
      : t('expiry.badge.inDays', { n: v.daysLeft });

  return (
    <span
      className={`font-body inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${cls} ${className}`}
    >
      <Icon i="calendar-clock" size={11} />
      {label}
    </span>
  );
}
