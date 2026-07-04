// Phase 6 — logique métier des documents (pure, testable sans Prisma).
import { z } from 'zod';

export type DocType = 'FACTURE' | 'PROFORMA' | 'RECU';
export type DocStatus = 'PAID' | 'PENDING' | 'CREDIT';
/** Statut côté UI (aligné sur `DocStatus` des fixtures / dictionnaire). */
export type UiDocStatus = 'paid' | 'pending' | 'credit';

export const LINE_SCHEMA = z.object({
  article: z.string().trim().min(1).max(160),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
});
export type DocLine = z.infer<typeof LINE_SCHEMA>;

const LINES_SCHEMA = z.array(LINE_SCHEMA);

/** Lit/normalise un instantané JSON de lignes (renvoie [] si la forme est cassée). */
export function coerceLines(value: unknown): DocLine[] {
  const parsed = LINES_SCHEMA.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Total figé = Σ(qté × prix unitaire). Pas de taxe dans ce design. */
export function linesTotal(lines: DocLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

/** Numéro séquentiel par (boutique, type) : F-0001 / PRO-0001 / R-0001 (reçu). */
export function docNumber(type: DocType, countForType: number): string {
  const prefix = type === 'FACTURE' ? 'F' : type === 'RECU' ? 'R' : 'PRO';
  return `${prefix}-${String(countForType + 1).padStart(4, '0')}`;
}

/** Libellé instantané FR d'un mode de remboursement (stocké dans la ligne du reçu). */
export function repaymentLineLabel(method: string): string {
  return method === 'MOBILE' ? 'Remboursement (Mobile Money)' : 'Remboursement (Espèces)';
}

/** Statut d'une facture dérivé du mode de paiement de la vente. */
export function saleMethodToStatus(method: string): DocStatus {
  return method === 'CREDIT' ? 'CREDIT' : 'PAID';
}

/** Traduit le statut stocké vers la clé attendue par le frontend. */
export function uiDocStatus(status: string): UiDocStatus {
  if (status === 'PAID') return 'paid';
  if (status === 'CREDIT') return 'credit';
  return 'pending';
}
