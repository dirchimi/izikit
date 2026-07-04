// Phase 6 — types partagés de l'écran Documents (forme renvoyée par /api/documents).
export type DocType = 'FACTURE' | 'PROFORMA' | 'RECU';
export type UiDocStatus = 'paid' | 'pending' | 'credit';

export interface ApiDocLine {
  article: string;
  qty: number;
  unitPrice: number;
}

export interface ApiDocument {
  id: string;
  type: DocType;
  number: string;
  saleId: string | null;
  clientName: string;
  clientPhone: string;
  status: UiDocStatus;
  total: number;
  balanceAfter: number | null; // RECU : solde restant après remboursement
  note: string;
  lines: ApiDocLine[];
  validityDays: number | null;
  issuedAt: string; // ISO
}

/** Infos boutique pour l'en-tête de l'aperçu (depuis /api/org/current). */
export interface BoutiqueHeader {
  name: string;
  city: string;
  logoUrl: string | null;
}
