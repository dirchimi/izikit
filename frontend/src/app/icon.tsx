import { appIcon } from '@/lib/pwa/app-icon';

// Favicon de l'onglet (généré via next/og).
export const size = { width: 256, height: 256 };
export const contentType = 'image/png';

export default function Icon() {
  return appIcon(256);
}
