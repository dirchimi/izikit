// Task 5.6 — allocation de remboursement, fonction PURE partagée client + serveur.
//
// Historique : cette logique vivait dans `frontend/src/lib/server/receivables/
// helpers.ts` et n'était appelée que par la route `POST /api/receivables/[id]/
// repay`. Task 5.2 (allocation optimiste hors-ligne dans `createRepayOffline`)
// a besoin de calculer EXACTEMENT la même répartition côté client, avant toute
// synchronisation — d'où l'extraction ici, sous `lib/shared/`, sans
// `server-only` ni dépendance Prisma/Dexie : uniquement des données en entrée,
// des données en sortie.
//
// Contrat d'ordre : cette fonction NE TRIE PAS `openReceivables` — elle fait
// confiance à l'ordre fourni par l'appelant (le serveur les charge `orderBy:
// { createdAt: 'asc' }`, donc « les plus anciennes d'abord » ; côté client,
// l'appelant doit reproduire le même tri sur les créances locales avant
// d'appeler cette fonction). Documenté ici plutôt qu'imposé en interne pour
// rester une fonction pure sans notion de date/horloge.

export type ReceivableStatus = 'OPEN' | 'PARTIAL' | 'PAID';

export interface OpenReceivable {
  id: string;
  amount: number;
  amountPaid: number;
}

export interface RepaymentAllocation {
  id: string;
  newAmountPaid: number;
  status: ReceivableStatus;
}

export interface AllocateRepaymentResult {
  allocations: RepaymentAllocation[];
  applied: number;
  remainingDebt: number;
}

/** Statut d'une créance dérivé de (montant dû, cumul remboursé). */
function deriveStatus(amount: number, amountPaid: number): ReceivableStatus {
  if (amountPaid <= 0) return 'OPEN';
  if (amountPaid >= amount) return 'PAID';
  return 'PARTIAL';
}

/**
 * Répartit un paiement sur des créances ouvertes, dans l'ORDRE FOURNI (les
 * plus anciennes d'abord — voir contrat ci-dessus). On n'applique jamais plus
 * que le dû total : `applied = min(payment, Σ dû)`. `remainingDebt` est le dû
 * total restant sur `openReceivables` APRÈS allocation (toutes les créances,
 * y compris celles non touchées faute de reliquat). Montants entiers,
 * aucune dérive flottante ; fonction pure — aucune E/S, aucune horloge.
 */
export function allocateRepayment(
  openReceivables: OpenReceivable[],
  payment: number,
): AllocateRepaymentResult {
  let remaining = Math.max(0, Math.floor(payment));
  const allocations: RepaymentAllocation[] = [];
  let remainingDebt = 0;

  for (const r of openReceivables) {
    const due = r.amount - r.amountPaid;
    if (due <= 0) continue;

    const take = remaining > 0 ? Math.min(remaining, due) : 0;
    const newAmountPaid = r.amountPaid + take;

    if (take > 0) {
      allocations.push({
        id: r.id,
        newAmountPaid,
        status: deriveStatus(r.amount, newAmountPaid),
      });
      remaining -= take;
    }

    remainingDebt += r.amount - newAmountPaid;
  }

  const applied = Math.max(0, Math.floor(payment)) - remaining;
  return { allocations, applied, remainingDebt };
}
