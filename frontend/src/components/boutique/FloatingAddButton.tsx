'use client';

import Icon from '@/components/ui/Icon';

/**
 * Bouton d'action flottant (FAB) « + » — visible uniquement sous `lg`
 * (mobile / tablette), pour lancer l'action d'ajout sans devoir scroller sous
 * les KPIs et les filtres. Positionné en bas de l'écran côté fin (RTL-safe),
 * au-dessus de la barre de navigation basse (`BottomNav`, ~4rem + safe-area).
 */
export default function FloatingAddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="bg-primary text-primary-foreground fixed end-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 lg:hidden"
    >
      <Icon i="plus" size={26} />
    </button>
  );
}
