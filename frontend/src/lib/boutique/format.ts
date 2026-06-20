// Monnaie : FCFA (XOF) — montants ENTIERS, séparateur d'espace (convention fr-FR).
// 142500 → "142 500". Ne jamais stocker de décimales (cf. CLAUDE.md).
const fcfa = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function formatFCFA(amount: number): string {
  return fcfa.format(amount);
}
