import type { Metadata } from 'next';
import LandingPage from '@/components/boutique/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Sahilley — Gérez votre boutique, même sans internet',
  description:
    'Caisse, stock, ventes à crédit, dépenses et rapports pour votre boutique. Fonctionne hors-ligne, en FCFA, trilingue. 30 jours d’essai gratuit.',
};

// Page d'accueil publique (marketing). L'app est sous /dashboard.
export default function Home() {
  return <LandingPage />;
}
