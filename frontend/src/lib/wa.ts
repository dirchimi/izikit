// Construit un lien WhatsApp (wa.me) à partir d'un numéro saisi librement.
// Marché principal : Tchad (indicatif 235). Un numéro local à 8 chiffres est
// préfixé par 235 ; sinon on garde les chiffres tels quels (déjà au format
// international). Retourne null si le numéro est vide ou trop court.
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 8) digits = `235${digits}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}
