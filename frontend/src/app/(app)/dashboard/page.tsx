import { redirect } from 'next/navigation';
import OnboardingModal from '@/components/boutique/OnboardingModal';
import DashboardManager from '@/components/boutique/DashboardManager';
import { getCurrentOrgRole } from '@/lib/server/boutique/page-guard';

export const metadata = { title: 'Tableau de bord — Sahilley' };

export default async function DashboardPage() {
  // Réservé Manager/Patron : le Vendeur est renvoyé vers la caisse.
  const role = await getCurrentOrgRole();
  if (role === 'MEMBER') redirect('/vendre');

  return (
    <>
      <OnboardingModal />
      <DashboardManager />
    </>
  );
}
