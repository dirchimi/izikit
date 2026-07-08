// Phase 8 — Dérivation du statut d'abonnement.
//
// Le statut n'est JAMAIS stocké : il est calculé à partir des trois champs de
// l'Organization (plan / trialEndsAt / currentPeriodEnd) et de l'instant `now`.
// Règle :
//   - abonnement payé encore valable (currentPeriodEnd >= now) → ACTIVE
//   - sinon essai encore valable (trialEndsAt >= now)          → TRIAL
//   - sinon                                                     → EXPIRED
//
// `activeUntil` = date jusqu'à laquelle l'accès reste valable (max des deux
// bornes utiles selon le statut). `daysLeft` = jours pleins restants (0 si
// expiré). Fonction PURE — `now` est injecté pour la testabilité.

import type { PlanId, SubStatus } from './plans';
import { isPlanId } from './plans';

export interface SubInput {
  plan: string | null;
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
}

export interface SubView {
  status: SubStatus;
  plan: PlanId | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  /** Date (ISO) jusqu'à laquelle l'accès est valable (null si jamais d'essai/abo). */
  activeUntil: string | null;
  /** Jours pleins restants avant `activeUntil` (0 si expiré ou passé). */
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(v: Date | string | null): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeSubscription(input: SubInput, now: Date): SubView {
  const trialEnds = toDate(input.trialEndsAt);
  const periodEnd = toDate(input.currentPeriodEnd);
  const plan = isPlanId(input.plan) ? input.plan : null;

  let status: SubStatus;
  let activeUntil: Date | null;

  if (periodEnd && periodEnd.getTime() >= now.getTime()) {
    status = 'ACTIVE';
    activeUntil = periodEnd;
  } else if (trialEnds && trialEnds.getTime() >= now.getTime()) {
    status = 'TRIAL';
    activeUntil = trialEnds;
  } else {
    status = 'EXPIRED';
    // Pour l'affichage « expiré depuis », on garde la borne la plus récente.
    activeUntil = periodEnd ?? trialEnds;
  }

  const daysLeft =
    status === 'EXPIRED' || !activeUntil
      ? 0
      : Math.max(0, Math.ceil((activeUntil.getTime() - now.getTime()) / DAY_MS));

  return {
    status,
    plan,
    trialEndsAt: trialEnds ? trialEnds.toISOString() : null,
    currentPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
    activeUntil: activeUntil ? activeUntil.toISOString() : null,
    daysLeft,
  };
}

/**
 * Nouvelle période après confirmation d'un paiement de `months` mois :
 * on prolonge à partir de la fin d'abonnement en cours si elle est encore dans
 * le futur (empilement des renouvellements), sinon à partir de `now`.
 */
export function extendPeriod(
  currentPeriodEnd: Date | null,
  now: Date,
  months: number,
): { periodStart: Date; periodEnd: Date } {
  const base =
    currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
  const periodEnd = new Date(base.getTime());
  const day = periodEnd.getDate();
  periodEnd.setMonth(periodEnd.getMonth() + Math.max(1, Math.trunc(months)));
  // Anti-débordement `setMonth` : si le jour d'origine n'existe pas dans le mois
  // cible (31 jan +1 → « 31 fév » qui roule au 3 mars), on ramène au dernier
  // jour du mois voulu (setDate(0) = jour 0 = fin du mois précédent).
  if (periodEnd.getDate() !== day) periodEnd.setDate(0);
  return { periodStart: base, periodEnd };
}
