// Statut de péremption d'un produit — isomorphe (client POS + serveur dashboard/
// cron). Aucun `server-only` ici. Comparaison en JOURS CALENDAIRES (UTC), l'heure
// est ignorée : la granularité utile de l'alerte est le jour.

export type ExpiryStatus = 'expired' | 'expiring' | 'ok';

export interface ExpiryView {
  status: ExpiryStatus;
  /** Jours calendaires jusqu'à la péremption : négatif si déjà périmé. */
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Statut de péremption, ou `null` si le produit n'a pas de date (non périssable).
 * - `expired`  : date de péremption dépassée (daysLeft < 0).
 * - `expiring` : périme dans ≤ `alertDays` jours (0 ≤ daysLeft ≤ alertDays).
 * - `ok`       : périme plus tard.
 */
export function computeExpiryStatus(
  expiryDate: string | Date | null | undefined,
  alertDays: number,
  now: Date,
): ExpiryView | null {
  if (!expiryDate) return null;
  const d = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(d.getTime())) return null;

  const daysLeft = Math.round((startOfDayUTC(d) - startOfDayUTC(now)) / DAY_MS);
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= Math.max(0, alertDays)) return { status: 'expiring', daysLeft };
  return { status: 'ok', daysLeft };
}
