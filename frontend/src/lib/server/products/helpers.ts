import 'server-only';

export type StockStatus = 'ok' | 'low' | 'out';

/** Statut d'un produit dérivé de sa quantité et de son seuil d'alerte. */
export function deriveStockStatus(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}

/** Référence produit auto-générée (quand le client n'en fournit pas). */
export function generateRef(): string {
  return `P-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** Colonnes produit exposées par l'API (jamais les internes de scoping). */
export const PRODUCT_SELECT = {
  id: true,
  ref: true,
  name: true,
  category: true,
  buyPrice: true,
  sellPrice: true,
  prixGros: true,
  unite: true,
  qty: true,
  threshold: true,
  imageUrl: true,
  barcode: true,
  expiryDate: true,
} as const;

export interface ProductRow {
  id: string;
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  prixGros: number;
  unite: string;
  qty: number;
  threshold: number;
  imageUrl: string | null;
  barcode: string | null;
  expiryDate: Date | string | null;
}

/** Vue API d'un produit : colonnes + statut stock dérivé. `expiryDate` en ISO
 *  (le statut de péremption est dérivé côté client via computeExpiryStatus,
 *  qui a besoin du seuil `expiryAlertDays` de la boutique). */
export function productView(
  p: ProductRow,
): Omit<ProductRow, 'expiryDate'> & { expiryDate: string | null; status: StockStatus } {
  return {
    ...p,
    expiryDate: p.expiryDate
      ? p.expiryDate instanceof Date
        ? p.expiryDate.toISOString()
        : p.expiryDate
      : null,
    status: deriveStockStatus(p.qty, p.threshold),
  };
}

/** Convertit un 'YYYY-MM-DD' (saisie UI) en Date UTC midi, ou null. Renvoie
 *  `undefined` si l'entrée est undefined (→ ne pas modifier en PATCH). */
export function parseExpiryInput(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(`${v}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True si l'erreur Prisma est une violation de contrainte unique (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * Sur une violation P2002, indique quel champ produit est en cause — pour
 * renvoyer un code d'erreur précis (REF_TAKEN vs BARCODE_TAKEN). Lit
 * `meta.target` (nom de contrainte ou liste de colonnes selon le connecteur).
 */
export function uniqueViolationField(e: unknown): 'ref' | 'barcode' | null {
  if (!isUniqueViolation(e)) return null;
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  const s = Array.isArray(target) ? target.join(',') : String(target ?? '');
  if (s.includes('barcode')) return 'barcode';
  // Défaut : toute autre violation unique du produit est traitée comme la
  // référence (seules `ref` et `barcode` sont uniques ; `barcode` est détecté
  // ci-dessus via meta.target, présent en prod même s'il est absent des mocks).
  return 'ref';
}
