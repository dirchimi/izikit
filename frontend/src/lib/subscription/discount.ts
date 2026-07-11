// Phase 8 — Codes de réduction sur l'abonnement.
//
// Isomorphe (client + serveur) : les fonctions PURES ci-dessous servent au calcul
// d'aperçu côté client ET à la validation faisant autorité côté serveur. AUCUN
// `server-only` ici.
//
// Un code applique une remise sur le prix TOTAL de la période choisie :
//   - PERCENT : `value` = pourcentage (1–100), remise = prix × value / 100
//   - AMOUNT  : `value` = montant fixe en FCFA retranché du prix
// Le montant final est borné à 0 (jamais négatif).

export type DiscountType = 'PERCENT' | 'AMOUNT';

export const DISCOUNT_TYPES: readonly DiscountType[] = ['PERCENT', 'AMOUNT'] as const;

export function isDiscountType(v: unknown): v is DiscountType {
  return v === 'PERCENT' || v === 'AMOUNT';
}

/** Normalise un code saisi : trim + MAJUSCULES (les codes sont stockés en MAJ). */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Montant final (FCFA, entier) après application d'une remise sur `base`.
 * Toujours borné dans [0, base]. Le résultat est arrondi (entier FCFA).
 */
export function computeDiscountedAmount(base: number, type: DiscountType, value: number): number {
  if (base <= 0) return 0;
  let discounted: number;
  if (type === 'PERCENT') {
    const pct = Math.min(100, Math.max(0, value));
    discounted = base - (base * pct) / 100;
  } else {
    discounted = base - Math.max(0, value);
  }
  return Math.max(0, Math.round(discounted));
}

/** Forme minimale d'un code telle que persistée (sous-ensemble du modèle Prisma). */
export interface DiscountCodeRecord {
  code: string;
  type: string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  active: boolean;
}

export type DiscountRejection =
  | 'DISCOUNT_NOT_FOUND'
  | 'DISCOUNT_INACTIVE'
  | 'DISCOUNT_EXPIRED'
  | 'DISCOUNT_EXHAUSTED'
  | 'DISCOUNT_INVALID';

export type DiscountValidation =
  | { ok: true; type: DiscountType; value: number }
  | { ok: false; reason: DiscountRejection };

/**
 * Valide un code (autorité serveur). `record` est `null` si le code est
 * introuvable. `now` est injecté pour rester pur/testable.
 */
export function validateDiscountCode(
  record: DiscountCodeRecord | null,
  now: Date,
): DiscountValidation {
  if (!record) return { ok: false, reason: 'DISCOUNT_NOT_FOUND' };
  if (!record.active) return { ok: false, reason: 'DISCOUNT_INACTIVE' };
  if (!isDiscountType(record.type)) return { ok: false, reason: 'DISCOUNT_INVALID' };
  if (record.value <= 0) return { ok: false, reason: 'DISCOUNT_INVALID' };
  if (record.expiresAt && record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'DISCOUNT_EXPIRED' };
  }
  if (record.maxUses !== null && record.usedCount >= record.maxUses) {
    return { ok: false, reason: 'DISCOUNT_EXHAUSTED' };
  }
  return { ok: true, type: record.type, value: record.value };
}
