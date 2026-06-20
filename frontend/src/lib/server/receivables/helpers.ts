// Phase 4 — logique métier des créances (pure, testable sans Prisma).

export type ReceivableStatus = 'OPEN' | 'PARTIAL' | 'PAID';
/** Statut côté UI (aligné sur `CreditStatus` des fixtures / dictionnaire). */
export type CreditStatus = 'credit' | 'partial' | 'paid';

/** Statut d'une créance dérivé de (montant dû, cumul remboursé). */
export function deriveStatus(amount: number, amountPaid: number): ReceivableStatus {
  if (amountPaid <= 0) return 'OPEN';
  if (amountPaid >= amount) return 'PAID';
  return 'PARTIAL';
}

/** Traduit le statut stocké vers la clé attendue par le frontend. */
export function uiStatus(status: string): CreditStatus {
  if (status === 'PAID') return 'paid';
  if (status === 'PARTIAL') return 'partial';
  return 'credit';
}

export interface OpenReceivable {
  id: string;
  amount: number;
  amountPaid: number;
}

export interface Allocation {
  id: string;
  newPaid: number;
  status: ReceivableStatus;
}

/**
 * Répartit un paiement sur les créances ouvertes, les plus anciennes d'abord
 * (l'appelant fournit la liste déjà triée). On n'applique jamais plus que le dû
 * total : `applied = min(payment, Σ dû)`. Ne renvoie que les créances réellement
 * impactées. Fonction pure — la persistance se fait dans la transaction.
 */
export function allocateRepayment(
  open: OpenReceivable[],
  payment: number,
): { allocations: Allocation[]; applied: number } {
  let remaining = Math.max(0, Math.floor(payment));
  const allocations: Allocation[] = [];

  for (const r of open) {
    if (remaining <= 0) break;
    const due = r.amount - r.amountPaid;
    if (due <= 0) continue;
    const take = Math.min(remaining, due);
    const newPaid = r.amountPaid + take;
    allocations.push({ id: r.id, newPaid, status: deriveStatus(r.amount, newPaid) });
    remaining -= take;
  }

  return { allocations, applied: Math.max(0, Math.floor(payment)) - remaining };
}
