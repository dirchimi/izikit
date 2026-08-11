// Phase 8 — Configuration de l'abonnement SaaS.
//
// Isomorphe (client + serveur) : consommé par l'écran Paramètres → Abonnement,
// la bannière d'expiration et les routes API. AUCUN `server-only` ici.
//
// Deux offres payantes (alignées sur le landing) : **Premium** (mensuel /
// trimestriel / annuel, remise croissante — ce n'est donc PAS un simple prix
// mensuel × mois) et **Entreprise** (annuel uniquement, « à partir de » 700 000
// — le prix négocié s'applique via un code de réduction créé par le superadmin).

export const TRIAL_DAYS = 15;

// Jours de tolérance après l'expiration avant le blocage effectif des écritures
// (« appli douce ») : un client qui paie avec un léger retard n'est pas coupé.
export const GRACE_DAYS = 3;

export type PlanId = 'PREMIUM' | 'ENTREPRISE';
// Modes de paiement proposés à la souscription : espèces ou virement bancaire.
// « MOBILE » n'est plus proposé mais reste une valeur possible en base pour les
// anciens paiements (affichage historique via la clé i18n sub.method.mobile).
export type PaymentMethod = 'CASH' | 'BANK';
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
  ENTREPRISE: { id: 'ENTREPRISE', nameKey: 'sub.plan.entreprise', maxUsers: null },
};

export const PLAN_IDS: readonly PlanId[] = ['PREMIUM', 'ENTREPRISE'] as const;
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'BANK'] as const;

/** Grille tarifaire par durée (prix TOTAL en FCFA, aligné sur le landing). */
export interface SubPeriod {
  months: number;
  price: number;
  labelKey: string;
}
export const SUB_PERIODS: readonly SubPeriod[] = [
  { months: 1, price: 35_000, labelKey: 'sub.period.monthly' },
  { months: 3, price: 95_000, labelKey: 'sub.period.quarterly' },
  { months: 12, price: 350_000, labelKey: 'sub.period.annual' },
] as const;

/** Durées proposées PAR PLAN (Entreprise : annuel uniquement). */
export const PLAN_PERIODS: Record<PlanId, readonly SubPeriod[]> = {
  PREMIUM: SUB_PERIODS,
  ENTREPRISE: [{ months: 12, price: 700_000, labelKey: 'sub.period.annual' }],
};

/** Prix mensuel de référence (mensuel sans remise) — sert au MRR admin. */
export const MONTHLY_PRICE = 35_000;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'PREMIUM' || v === 'ENTREPRISE';
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return v === 'CASH' || v === 'BANK';
}

/**
 * Prix total (FCFA) d'un abonnement de `months` mois. Utilise la grille du
 * plan (remises incluses) ; repli linéaire pour une durée non listée, au
 * tarif mensuel équivalent de la plus courte durée du plan (Premium : 35 000 ;
 * Entreprise : 700 000 / 12).
 */
export function planPrice(plan: PlanId, months: number): number {
  const grid = PLAN_PERIODS[plan];
  const p = grid.find((x) => x.months === months);
  if (p) return p.price;
  const base = grid[0] ?? { months: 1, price: MONTHLY_PRICE };
  return Math.round((base.price / base.months) * Math.max(1, Math.trunc(months)));
}
