'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';

const BCP47: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar' };

/**
 * Date (et heure optionnelle) RÉELLES, formatées dans la langue courante.
 * Rend `null` au premier rendu (SSR) pour éviter tout écart d'hydratation, puis
 * affiche `new Date()`. Avec `withTime`, l'heure se rafraîchit chaque minute.
 */
export default function LiveDateTime({ withTime = false }: { withTime?: boolean }) {
  const { locale } = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    if (!withTime) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [withTime]);

  if (!now) return null;

  const bcp = BCP47[locale] ?? 'fr-FR';
  const date = now.toLocaleDateString(bcp, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const label = withTime
    ? `${date} · ${now.toLocaleTimeString(bcp, { hour: '2-digit', minute: '2-digit' })}`
    : date;

  return <>{label.charAt(0).toUpperCase() + label.slice(1)}</>;
}
