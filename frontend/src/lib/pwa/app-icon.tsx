import { ImageResponse } from 'next/og';

/**
 * Icône d'application (PWA / favicon / apple-touch) générée à la volée.
 * « S » blanc plein cadre sur fond vert (#0e9f6e, la couleur du logo in-app).
 * Plein cadre → sûr en « maskable » (la zone de sécurité Android est couverte).
 *
 * Temporaire : à remplacer par le vrai logo quand il sera prêt (il suffira de
 * changer le rendu ci-dessous, ou de servir un PNG statique).
 */
export function appIcon(size: number): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#0e9f6e',
        color: '#ffffff',
        fontSize: Math.round(size * 0.6),
        fontWeight: 700,
        fontFamily: 'sans-serif',
      }}
    >
      S
    </div>,
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=604800, immutable' },
    },
  );
}
