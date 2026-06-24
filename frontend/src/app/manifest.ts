import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sahilley — Gestion de boutique',
    short_name: 'Sahilley',
    description:
      'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. En FCFA, trilingue.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#faf8f3',
    theme_color: '#0a3d2e',
    lang: 'fr',
    categories: ['business', 'finance', 'productivity'],
  };
}
