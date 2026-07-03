import { redirect } from 'next/navigation';
import RapportsManager from '@/components/boutique/rapports/RapportsManager';
import { getCurrentOrgRole } from '@/lib/server/boutique/page-guard';

export const metadata = { title: 'Rapports — Sahilley' };

export default async function RapportsPage() {
  // Réservé Manager/Patron : le Vendeur est renvoyé vers la caisse.
  const role = await getCurrentOrgRole();
  if (role === 'MEMBER') redirect('/vendre');

  return <RapportsManager />;
}
