import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { verifyToken, COOKIE_NAME } from '@/lib/server/auth';
import LandingPage from '@/components/boutique/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Sahilley — Gérez votre boutique, même sans internet',
  description:
    'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. Fonctionne hors-ligne, en FCFA, trilingue. 30 jours d’essai gratuit.',
};

// Page d'accueil publique (marketing). Accessible à tous, y compris connecté :
// un utilisateur déjà connecté voit un bouton « Mon tableau de bord » (au lieu
// d'être redirigé de force) pour pouvoir consulter la page librement.
export default async function Home() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  const authenticated = !!session;

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
      <LandingPage authenticated={authenticated} />
    </>
  );
}
