import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sahilley — Gestion de boutique',
    short_name: 'Sahilley',
    description:
      'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. En FCFA, trilingue.',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#faf8f3',
    theme_color: '#0a3d2e',
    lang: 'fr',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
