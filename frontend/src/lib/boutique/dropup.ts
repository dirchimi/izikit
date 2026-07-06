/**
 * Décide si un menu déroulant ancré sur `el` doit s'ouvrir vers le HAUT
 * (drop-up) plutôt que vers le bas : vrai quand il n'y a pas assez de place
 * sous l'ancre ET qu'il y a davantage de place au-dessus. Évite qu'un menu
 * placé bas dans l'écran (ex. sélecteur de client en bas du panier) soit coupé.
 *
 * `estimated` = hauteur approximative du menu en pixels. À n'utiliser que pour
 * l'affichage desktop (sur mobile le panneau est une feuille du bas).
 */
export function shouldDropUp(el: HTMLElement | null, estimated = 300): boolean {
  if (!el || typeof window === 'undefined') return false;
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  return spaceBelow < estimated && rect.top > spaceBelow;
}
