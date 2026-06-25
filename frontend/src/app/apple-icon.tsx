import { appIcon } from '@/lib/pwa/app-icon';

// Icône « Ajouter à l'écran d'accueil » iOS (généré via next/og).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return appIcon(180);
}
