// Phase 8 — Configuration de l'abonnement SaaS.
//
// Isomorphe (client + serveur) : consommé par l'écran Paramètres → Abonnement,
// la bannière d'expiration et les routes API. AUCUN `server-only` ici.
//
// Une seule offre payante : **Premium** (aligné sur le landing). Le prix dépend
// de la DURÉE choisie (mensuel / trimestriel / annuel), avec remise croissante
// — ce n'est donc PAS un simple prix mensuel × mois.

export const TRIAL_DAYS = 15;

// Jours de tolérance après l'expiration avant le blocage effectif des écritures
// (« appli douce ») : un client qui paie avec un léger retard n'est pas coupé.
export const GRACE_DAYS = 3;

export type PlanId = 'PREMIUM';
export type PaymentMethod = 'CASH' | 'MOBILE';
export type SubStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export interface PlanDef {
  id: PlanId;
  /** Clé i18n du nom du plan. */
  nameKey: string;
  /** Nombre max d'utilisateurs (null = illimité). */
  maxUsers: number | null;
}

export const PLANS: Record<PlanId, PlanDef> = {
  PREMIUM: { id: 'PREMIUM', nameKey: 'sub.plan.premium', maxUsers: null },
};

export const PLAN_IDS: readonly PlanId[] = ['PREMIUM'] as const;
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'MOBILE'] as const;

/** Grille tarifaire par durée (prix TOTAL en FCFA, aligné sur le landing). */
export interface SubPeriod {
  months: number;
  price: number;
  labelKey: string;
}
export const SUB_PERIODS: readonly SubPeriod[] = [
  { months: 1, price: 50_000, labelKey: 'sub.period.monthly' },
  { months: 3, price: 135_000, labelKey: 'sub.period.quarterly' },
  { months: 12, price: 500_000, labelKey: 'sub.period.annual' },
] as const;

/** Prix mensuel de référence (mensuel sans remise) — sert au MRR admin. */
export const MONTHLY_PRICE = 50_000;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'PREMIUM';
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return v === 'CASH' || v === 'MOBILE';
}

/**
 * Prix total (FCFA) d'un abonnement de `months` mois. Utilise la grille par
 * durée (remises incluses) ; repli linéaire au tarif mensuel pour une durée non
 * listée. `plan` conservé pour compat (une seule offre aujourd'hui).
 */
export function planPrice(_plan: PlanId, months: number): number {
  const p = SUB_PERIODS.find((x) => x.months === months);
  if (p) return p.price;
  return MONTHLY_PRICE * Math.max(1, Math.trunc(months));
}
