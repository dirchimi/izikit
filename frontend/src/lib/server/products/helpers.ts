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
  qty: true,
  threshold: true,
  imageUrl: true,
} as const;

export interface ProductRow {
  id: string;
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  threshold: number;
  imageUrl: string | null;
}

/** Vue API d'un produit : colonnes + statut stock dérivé. */
export function productView(p: ProductRow): ProductRow & { status: StockStatus } {
  return { ...p, status: deriveStockStatus(p.qty, p.threshold) };
}

/** True si l'erreur Prisma est une violation de contrainte unique (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}
