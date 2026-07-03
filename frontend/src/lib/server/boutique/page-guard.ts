// Garde de rôle pour les server components (pages). Résout le rôle org de
// l'utilisateur courant à partir du cookie de session, sans passer par une
// route API. Utilisé pour rediriger les pages réservées (tableau de bord,
// rapports) vers une page accessible au Vendeur.
import 'server-only';
import { cookies } from 'next/headers';
import { verifyToken, COOKIE_NAME } from '@/lib/server/auth';
import { getPrimaryMembership } from './ensure-boutique';
import type { OrgRole } from '@/lib/server/middleware/require-org-role';

/** Rôle org de l'utilisateur courant (server-component), ou null si absent. */
export async function getCurrentOrgRole(): Promise<OrgRole | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) return null;
  const membership = await getPrimaryMembership(session.sub);
  return membership?.role ?? null;
}
