'use client';

import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { useApi } from '@/lib/useApi';
import { useT } from '@/contexts/LocaleContext';
import type { SubStatus } from '@/lib/subscription/plans';

interface SubResp {
  status: SubStatus;
  daysLeft: number;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

// Seuil d'alerte : on prévient dès qu'il reste ≤ 3 jours d'essai.
const WARN_DAYS = 3;

/**
 * Bandeau d'abonnement — application DOUCE (v1) : on avertit, on ne bloque pas.
 * Visible quand l'abonnement est expiré, ou quand l'essai touche à sa fin
 * (≤ 3 jours). Le patron y trouve un lien direct vers la gestion ; les autres
 * membres voient un message informatif. Partage le cache de /api/subscription.
 */
export default function SubscriptionBanner() {
  const t = useT();
  const { data } = useApi<SubResp>('/api/subscription');
  if (!data) return null;

  const expired = data.status === 'EXPIRED';
  const trialEnding = data.status === 'TRIAL' && data.daysLeft <= WARN_DAYS;
  if (!expired && !trialEnding) return null;

  const isOwner = data.role === 'OWNER';
  const tone = expired
    ? 'bg-danger/10 border-danger/30 text-danger'
    : 'bg-warning/10 border-warning/30 text-warning';

  const message = expired
    ? t('sub.banner.expired')
    : t('sub.banner.trialEnding', { n: data.daysLeft });

  return (
    <div className={`font-body flex items-center gap-2 border-b px-4 py-2 text-xs ${tone}`}>
      <Icon i={expired ? 'alert-triangle' : 'clock'} size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-semibold">{message}</span>
      {isOwner && (
        <Link
          href="/parametres?section=abonnement"
          className="shrink-0 rounded-md px-2 py-1 font-bold underline underline-offset-2"
        >
          {t('sub.banner.cta')}
        </Link>
      )}
    </div>
  );
}
