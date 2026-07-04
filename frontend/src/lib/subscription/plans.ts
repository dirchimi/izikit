// Phase 8 — Configuration des plans d'abonnement (SaaS billing).
//
// Isomorphe (client + serveur) : consommé par l'écran Paramètres → Abonnement,
// la bannière d'expiration et les routes API. AUCUN `server-only` ici.
//
// ⚠️ PRIX À CONFIRMER — valeurs de départ à ajuster selon ta tarification
// réelle (FCFA/mois). Un seul endroit à changer : `priceMonthly` ci-dessous.
//
// Différence Solo / Boutique = NOMBRE D'UTILISATEURS (décision produit) :
//   Solo     → 1 seul compte (le patron travaille seul).
//   Boutique → équipe (patron + gérants + vendeurs), illimité.

export const TRIAL_DAYS = 15;

export type PlanId = 'SOLO' | 'BOUTIQUE';
export type PaymentMethod = 'CASH' | 'MOBILE';
export type SubStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export interface PlanDef {
  id: PlanId;
  /** Clé i18n du nom du plan. */
  nameKey: string;
  /** Prix mensuel en FCFA (entier). */
  priceMonthly: number;
  /** Nombre max d'utilisateurs (null = illimité). */
  maxUsers: number | null;
}

export const PLANS: Record<PlanId, PlanDef> = {
  SOLO: { id: 'SOLO', nameKey: 'sub.plan.solo', priceMonthly: 5000, maxUsers: 1 },
  BOUTIQUE: { id: 'BOUTIQUE', nameKey: 'sub.plan.boutique', priceMonthly: 15000, maxUsers: null },
};

export const PLAN_IDS: readonly PlanId[] = ['SOLO', 'BOUTIQUE'] as const;
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'MOBILE'] as const;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'SOLO' || v === 'BOUTIQUE';
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return v === 'CASH' || v === 'MOBILE';
}

/** Montant total (FCFA) pour un plan sur `months` mois. */
export function planPrice(plan: PlanId, months: number): number {
  return PLANS[plan].priceMonthly * Math.max(1, Math.trunc(months));
}
