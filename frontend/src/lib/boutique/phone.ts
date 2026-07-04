// Normalisation d'un numéro de téléphone pour un lien WhatsApp (wa.me attend
// des chiffres seuls, au format international, SANS « + »).
//
// Les utilisateurs locaux saisissent leur numéro national (ex. « 66 12 34 56 »)
// sans indicatif. On préfixe alors l'indicatif du pays de la boutique. On gère
// aussi les numéros déjà internationaux (« +235… », « 00235… », « 235… ») et un
// préfixe national « 0 » (trunk) éventuel.

/**
 * Recompose un numéro en format international (chiffres seuls) pour wa.me.
 * @param raw  numéro tel que saisi (espaces, +, tirets… tolérés)
 * @param dial indicatif du pays sans « + » (ex. "235")
 * @returns chiffres internationaux (ex. "23566123456") ou "" si vide
 */
export function toWhatsAppNumber(raw: string | null | undefined, dial: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const cc = (dial ?? '').replace(/\D/g, '');
  // Préfixe international « 00 » → équivaut à « + ».
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Déjà au format international (commence par l'indicatif) → tel quel.
  if (cc && digits.startsWith(cc)) return digits;
  // Numéro national : on retire un « 0 » de tête (trunk) puis on préfixe l'indicatif.
  if (digits.startsWith('0')) digits = digits.slice(1);
  return cc + digits;
}
