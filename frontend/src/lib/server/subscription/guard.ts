// Phase 8 — Garde d'abonnement (« appli douce »).
//
// À placer en tête des routes d'ÉCRITURE métier (ventes, stock, dépenses,
// créances, documents…) APRÈS `requireOrgRole`. Quand l'abonnement de la
// boutique est expiré au-delà de la période de grâce, renvoie 403
// SUBSCRIPTION_EXPIRED et l'écriture est refusée. La LECTURE (routes GET) et le
// PAIEMENT de l'abonnement (/api/subscription/request) ne passent jamais par ce
// garde, donc restent toujours accessibles pour permettre de payer et débloquer.
//
// Le statut n'est jamais stocké : il est dérivé des dates de l'Organization par
// computeSubscription. Fail-open si l'org est introuvable (l'appelant l'a déjà
// résolue via getPrimaryMembership) ou si aucune date n'est connue.
import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { computeSubscription } from '@/lib/subscription/status';

/**
 * @returns une réponse 403 si les écritures sont bloquées, sinon `null`
 * (l'appelant continue). Pattern d'usage identique aux autres gardes :
 *   const locked = await requireActiveSubscription(orgId);
 *   if (locked) return locked;
 */
export async function requireActiveSubscription(
  orgId: string,
  now: Date = new Date(),
): Promise<NextResponse | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, trialEndsAt: true, currentPeriodEnd: true, internal: true },
  });
  // Org absente : ne pas bloquer ici (cas déjà géré en amont par le 404 métier).
  if (!org) return null;

  // Compte interne / offert : jamais bloqué (accès gratuit permanent).
  if (org.internal) return null;

  const sub = computeSubscription(org, now);
  if (!sub.writeBlocked) return null;

  return NextResponse.json(
    {
      error: 'SUBSCRIPTION_EXPIRED',
      message:
        'L’abonnement de la boutique a expiré. Renouvelez l’abonnement pour continuer à enregistrer des opérations.',
      activeUntil: sub.activeUntil,
      graceEndsAt: sub.graceEndsAt,
    },
    { status: 403 },
  );
}
