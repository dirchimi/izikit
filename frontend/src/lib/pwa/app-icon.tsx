import { ImageResponse } from 'next/og';

/**
 * Icône d'application (PWA / favicon / apple-touch) générée à la volée.
 *
 * Le vrai logo Sahilley : le « S » crème sur le carré vert de marque. On pose la
 * marque sur un fond vert PLEIN CADRE (même vert que le carré du logo) : les
 * coins arrondis du carré se fondent dans le fond, ce qui rend l'icône sûre en
 * « maskable » (la zone de sécurité Android est couverte, pas de coin transparent).
 *
 * La marque est inlinée en SVG (mêmes tracés que public/logo-mark.svg) pour être
 * rendue par Satori sans accès disque.
 */
const BRAND_GREEN = '#0C8A5E';

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72.72" height="73.68" viewBox="0 0 72.72 73.68"><path fill="#0C8A5E" d="M 46.339844 67.582031 L 26.335938 67.582031 C 15.105469 67.582031 6 58.476562 6 47.246094 L 6 26.289062 C 6 15.058594 15.105469 5.953125 26.335938 5.953125 L 46.339844 5.953125 C 57.574219 5.953125 66.679688 15.058594 66.679688 26.289062 L 66.679688 47.246094 C 66.679688 58.476562 57.574219 67.582031 46.339844 67.582031 "/><path fill="#ECE7DB" d="M 39.386719 32.535156 L 29.164062 40.8125 C 29.164062 40.8125 15.839844 35.285156 15.902344 25.441406 C 15.902344 25.441406 15.519531 11.894531 35.074219 10.425781 C 35.074219 10.425781 48.175781 9.660156 52.582031 14.195312 L 36.609375 14.261719 C 36.609375 14.261719 35.683594 14.132812 35.363281 14.996094 L 35.363281 23.367188 C 35.363281 23.367188 31.273438 23.847656 29.132812 25.410156 C 29.132812 25.410156 30.152344 27.007812 35.203125 29.40625 L 35.332031 31.707031 L 35.96875 32.503906 Z M 39.386719 32.535156 "/><path fill="#ECE7DB" d="M 45.074219 34.230469 L 33.988281 43.113281 C 33.988281 43.113281 41.558594 46.371094 43.859375 48.957031 C 43.859375 48.957031 44.425781 51.238281 37.183594 52.558594 C 37.183594 52.558594 30.664062 53.539062 27.257812 51.449219 L 27.683594 53.15625 L 14.902344 53.15625 C 14.902344 53.15625 14.09375 63.933594 29.644531 65.59375 C 29.644531 65.59375 49.367188 67.386719 55.160156 55.796875 C 55.160156 55.796875 59.292969 48 54.265625 41.097656 C 54.265625 41.097656 48.878906 35.410156 45.074219 34.230469 "/></svg>`;

const MARK_DATA_URI = `data:image/svg+xml;base64,${btoa(MARK_SVG)}`;

export function appIcon(size: number): ImageResponse {
  const inner = Math.round(size * 0.94);
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: BRAND_GREEN,
      }}
    >
      <img src={MARK_DATA_URI} width={inner} height={inner} alt="" />
    </div>,
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=604800, immutable' },
    },
  );
}
