import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken, COOKIE_NAME } from '@/lib/server/auth';
import LandingPage from '@/components/boutique/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Sahilley — Gérez votre boutique, même sans internet',
  description:
    'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. Fonctionne hors-ligne, en FCFA, trilingue. 30 jours d’essai gratuit.',
};

// Page d'accueil publique (marketing). Un utilisateur déjà connecté est envoyé
// directement sur son tableau de bord — il ne revoit pas la landing.
export default async function Home() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (session) redirect('/dashboard');

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
