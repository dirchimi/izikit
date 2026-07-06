'use client';

// Synchro « temps réel » (fondation gratuite) : après une mutation métier, on
// invalide TOUTES les ressources impactées. Les écrans montés se re-fetchent
// immédiatement (via le registre de useApi), et les écrans visités ensuite
// repartent d'un cache vide → plus besoin d'actualiser à la main.
//
// Chaque groupe liste les clés `useApi` (préfixes) qu'une action touche. Les
// clés à query-string (ex. /api/reports?range=...) sont couvertes par préfixe.
import { revalidateResources } from '@/lib/useApi';

const PRODUCTS = '/api/products';
const SALES = '/api/sales';
const DASHBOARD = '/api/dashboard';
const RECEIVABLES = '/api/receivables';
const DOCUMENTS = '/api/documents';
const EXPENSES = '/api/expenses';
const REPORTS = '/api/reports';
const ORG = '/api/org/current';

/** Vente encaissée / annulée : impacte quasiment tous les écrans. */
export function onSaleChange(): void {
  revalidateResources([PRODUCTS, SALES, DASHBOARD, RECEIVABLES, DOCUMENTS, REPORTS]);
}

/** Mouvement de stock, ajout/édition/suppression produit, photo produit. */
export function onStockChange(): void {
  revalidateResources([PRODUCTS, DASHBOARD, REPORTS]);
}

/** Remboursement d'une créance (le client vient payer). */
export function onRepayment(): void {
  revalidateResources([RECEIVABLES, DASHBOARD, DOCUMENTS]);
}

/** Ajout / suppression d'une dépense. */
export function onExpenseChange(): void {
  revalidateResources([EXPENSES, DASHBOARD, REPORTS]);
}

/** Génération d'une facture / proforma. */
export function onDocumentChange(): void {
  revalidateResources([DOCUMENTS]);
}

/** Changement des infos boutique (logo, nom…) affichées dans le shell. */
export function onOrgChange(): void {
  revalidateResources([ORG]);
}
