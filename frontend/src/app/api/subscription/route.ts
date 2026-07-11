// Phase 8 — GET /api/subscription
//
// Statut d'abonnement de la boutique du user (essai / actif / expiré), dérivé
// des dates via computeSubscription. Accessible à tout MEMBRE (la bannière
// d'expiration et le panneau Paramètres en dépendent) ; l'historique des
// paiements et les actions restent réservés au patron (rôle OWNER).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { computeSubscription } from '@/lib/subscription/status';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: primary.organizationId },
      select: { plan: true, trialEndsAt: true, currentPeriodEnd: true, internal: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const computed = computeSubscription(org, new Date());
    // Compte interne / offert : présenté comme ACTIF (jamais d'écritures bloquées,
    // pas de bannière d'expiration) + drapeau `internal` pour l'affichage dédié.
    const view = org.internal
      ? { ...computed, status: 'ACTIVE' as const, writeBlocked: false, internal: true }
      : { ...computed, internal: false };
    const isOwner = primary.role === 'OWNER';

    // Historique + demande en attente : patron uniquement.
    const payments = isOwner
      ? await prisma.subscriptionPayment.findMany({
          where: { organizationId: primary.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            plan: true,
            amount: true,
            method: true,
            months: true,
            status: true,
            periodEnd: true,
            createdAt: true,
          },
        })
      : [];

    return NextResponse.json(
      { ...view, role: primary.role, payments },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
