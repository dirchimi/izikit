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

// Task 5.6 : l'allocation de remboursement (`allocateRepayment`, oldest-first)
// a été extraite vers `@/lib/shared/allocate-repayment` — fonction PURE sans
// `server-only` ni Prisma, importable aussi bien par la route serveur que par
// la couche offline client (Task 5.2). Elle ne vit plus ici pour éviter deux
// implémentations divergentes.
