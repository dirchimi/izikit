import OnboardingModal from '@/components/boutique/OnboardingModal';
import DashboardManager from '@/components/boutique/DashboardManager';

export const metadata = { title: 'Tableau de bord — Sahilley' };

export default function DashboardPage() {
  return (
    <>
      <OnboardingModal />
      <DashboardManager />
    </>
  );
}
