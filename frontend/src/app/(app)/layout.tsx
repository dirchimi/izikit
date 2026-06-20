import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken, COOKIE_NAME } from '@/lib/server/auth';
import AppShell from '@/components/boutique/AppShell';

// Gating server-side : toute l'app sous (app) exige une session valide.
// On vérifie le cookie d'accès AVANT de rendre le shell ; sinon redirection
// vers /connexion. (verifyToken/COOKIE_NAME sont consommés depuis auth.ts —
// fichier protégé, non modifié.)
export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/connexion');

  return <AppShell>{children}</AppShell>;
}
