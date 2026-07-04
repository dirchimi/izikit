'use client';

import { DynamicIcon, type IconName } from 'lucide-react/dynamic';

/**
 * Lucide icon wrapper matching the Banani `<Icon i="..." />` API.
 * `i` is a kebab-case Lucide icon name (e.g. "shopping-cart"). Unknown
 * names render nothing rather than crashing — keeps the build safe as new
 * screens introduce icons.
 */
export default function Icon({
  i,
  size = 16,
  className,
}: {
  i: string;
  size?: number;
  className?: string;
}) {
  // Icônes décoratives : masquées des lecteurs d'écran (le nom accessible vient
  // du bouton/lien parent, jamais de l'icône).
  return <DynamicIcon name={i as IconName} size={size} className={className} aria-hidden="true" />;
}
