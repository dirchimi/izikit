// Isolation bidirectionnelle (BiDi) pour l'affichage RTL (arabe).
//
// Un nombre latin — surtout avec séparateur d'espace (« 50 000 »), un signe
// (« −10% ») ou un symbole (« ≈ 41 700 ») — est réordonné par l'algorithme
// bidirectionnel quand il est posé dans du texte arabe : « 50 000 » peut
// s'afficher « 000 50 ». On entoure la valeur de caractères d'isolement LTR
// (LRI U+2066 … PDI U+2069, invisibles) pour la traiter comme un bloc LTR.
//
// Usage : uniquement pour des valeurs interpolées DANS une chaîne (t(), gabarit).
// Pour un fragment en JSX, préférer un élément avec dir="ltr".
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

export function ltrIsolate(value: string | number): string {
  return `${LRI}${value}${PDI}`;
}
