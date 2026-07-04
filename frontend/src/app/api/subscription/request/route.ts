// Phase 8 — POST /api/subscription/request
//
// Le patron (OWNER) émet une DEMANDE de paiement d'abonnement (espèces ou
// mobile money). Elle est créée en statut PENDING : un SUPERADMIN la confirme
// ensuite (encaissement manuel v1), ce qui prolonge l'abonnement.
//
// Anti-doublon : une seule demande PENDING à la fois par boutique.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { PLAN_IDS, PAYMENT_METHODS, planPrice } from '@/lib/subscription/plans';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  plan: z.enum(PLAN_IDS as unknown as [string, ...string[]]),
  method: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
  months: z.number().int().min(1).max(24).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Seul le patron gère l'abonnement de la boutique.
    const gate = await requireOrgRole(primary.organizationId, 'OWNER');
    if (gate instanceof NextResponse) return gate;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const plan = parsed.data.plan as (typeof PLAN_IDS)[number];
    const method = parsed.data.method as (typeof PAYMENT_METHODS)[number];
    const months = parsed.data.months ?? 1;

    const existing = await prisma.subscriptionPayment.findFirst({
      where: { organizationId: primary.organizationId, status: 'PENDING' },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'SUB_REQUEST_PENDING',
          message: 'Une demande de paiement est déjà en attente de validation.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const payment = await prisma.subscriptionPayment.create({
      data: {
        organizationId: primary.organizationId,
        plan,
        method,
        months,
        amount: planPrice(plan, months),
        status: 'PENDING',
        requestedById: auth.user.sub,
      },
      select: {
        id: true,
        plan: true,
        amount: true,
        method: true,
        months: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { payment },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
