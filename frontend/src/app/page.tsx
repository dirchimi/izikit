import type { Metadata } from 'next';
import LandingPage from '@/components/boutique/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Sahilley — Gérez votre boutique, simplement',
  description:
    'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. Consultation hors-ligne, en FCFA, trilingue. 30 jours d’essai gratuit.',
};

// Page d'accueil publique (marketing). Accessible à tous, y compris connecté :
// l'en-tête (MarketingHeader) lit lui-même la session et affiche « Mon tableau
// de bord » à un utilisateur connecté, sinon « Se connecter » + « Essai gratuit ».
export default function Home() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sahilley',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    description:
      'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. En FCFA, trilingue.',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sahilley.com',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'XAF' },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
