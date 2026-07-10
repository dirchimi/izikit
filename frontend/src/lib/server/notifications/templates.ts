/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';

/**
 * Notification destinée au propriétaire de la boutique : même forme que
 * `CreateNotificationInput` mais sans `userId` (résolu par `notifyOwner` à
 * partir de `Organization.ownerId`).
 */
export type OwnerNotification = Omit<CreateNotificationInput, 'userId'>;

/** Types d'alertes boutique (clés stables — réutilisées par la cloche + les réglages). */
export const BOUTIQUE_NOTIFICATION_TYPES = [
  'LOW_STOCK',
  'EXPIRY_SOON',
  'RECEIVABLE_OVERDUE',
  'SALE_MADE',
  'BIG_EXPENSE',
] as const;

export type BoutiqueNotificationType = (typeof BOUTIQUE_NOTIFICATION_TYPES)[number];

/** Montant FCFA → chaîne lisible (séparateurs de milliers FR). */
function fmtAmount(n: number): string {
  return n.toLocaleString('fr-FR');
}

/** Stock d'un produit repassé sous son seuil d'alerte. dedupeKey à granularité
 * journalière : se redéclenche si le stock rechute un autre jour, sans spammer. */
export function lowStockNotification(
  productId: string,
  productName: string,
  qty: number,
  dateKey: string,
): OwnerNotification {
  return {
    type: 'LOW_STOCK',
    title: 'Stock bas',
    body:
      qty <= 0
        ? `${productName} : rupture de stock !`
        : `${productName} : il ne reste que ${qty} en stock.`,
    data: { productId, qty },
    dedupeKey: `low-stock:${productId}:${dateKey}`,
  };
}

/** Produit périmé ou proche de la péremption. dedupeKey = produit + date de
 * péremption → une seule alerte par produit pour une date donnée (pas de spam
 * si le produit reste dans la fenêtre plusieurs jours). */
export function expirySoonNotification(
  productId: string,
  productName: string,
  expiryKey: string, // YYYY-MM-DD de la date de péremption
  expired: boolean,
  daysLeft: number,
): OwnerNotification {
  return {
    type: 'EXPIRY_SOON',
    title: expired ? 'Produit périmé' : 'Péremption proche',
    body: expired
      ? `${productName} est périmé.`
      : daysLeft <= 0
        ? `${productName} périme aujourd'hui.`
        : `${productName} périme dans ${daysLeft} jour(s).`,
    data: { productId, expiry: expiryKey, daysLeft },
    dedupeKey: `expiry-soon:${productId}:${expiryKey}`,
  };
}

/** Créance impayée au-delà du délai réglé. Une seule alerte par créance. */
export function receivableOverdueNotification(
  receivableId: string,
  customerName: string,
  remaining: number,
  currency: string,
): OwnerNotification {
  return {
    type: 'RECEIVABLE_OVERDUE',
    title: 'Créance en retard',
    body: `${customerName} doit encore ${fmtAmount(remaining)} ${currency}.`,
    data: { receivableId, remaining },
    dedupeKey: `receivable-overdue:${receivableId}`,
  };
}

/** Vente enregistrée par un employé (le patron n'est pas notifié de ses propres ventes). */
export function saleMadeNotification(
  sale: { id: string; number: string; total: number },
  currency: string,
): OwnerNotification {
  return {
    type: 'SALE_MADE',
    title: 'Nouvelle vente',
    body: `Vente ${sale.number} : ${fmtAmount(sale.total)} ${currency}.`,
    data: { saleId: sale.id, number: sale.number, total: sale.total },
    dedupeKey: `sale-made:${sale.id}`,
  };
}

/** Dépense ≥ seuil réglé, saisie par un employé (pas par le patron lui-même). */
export function bigExpenseNotification(
  expense: { id: string; label: string; amount: number },
  currency: string,
): OwnerNotification {
  return {
    type: 'BIG_EXPENSE',
    title: 'Grosse dépense',
    body: `${expense.label} : ${fmtAmount(expense.amount)} ${currency}.`,
    data: { expenseId: expense.id, amount: expense.amount },
    dedupeKey: `big-expense:${expense.id}`,
  };
}

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Welcome!',
    body: `Glad to have you on board, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: `Order ${orderId} for ${amount} ${currency} confirmed.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}
