// Mappe les libellés de paiement (stockés en français dans les fixtures) vers
// leur clé i18n, pour traduire l'affichage sans changer la valeur stockée.

const PAYMENT_KEYS: Record<string, string> = {
  Espèces: 'method.cash',
  'Mobile Money': 'method.mobile',
  Crédit: 'method.credit',
  Virement: 'method.transfer',
};

export function paymentLabelKey(method: string): string {
  return PAYMENT_KEYS[method] ?? method;
}
