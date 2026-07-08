// Phase 8 — POST /api/admin/subscriptions/[id]/reject (SUPERADMIN-only)
//
// Refuse une demande d'abonnement PENDING (paiement non reçu / annulé). Ne
// touche PAS l'Organization : le statut reste ce qu'il était (essai/expiré).
// Journalisé (logAdminAction).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ reason: z.string().max(500).optional() });

type Result = { kind: 'NOT_FOUND' } | { kind: 'NOT_PENDING' } | { kind: 'OK' };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400 },
      );
    }

    const now = new Date();
    const result: Result = await prisma.$transaction(async (tx) => {
      const payment = await tx.subscriptionPayment.findUnique({
        where: { id },
        select: { id: true, status: true, organizationId: true, plan: true, amount: true },
      });
      if (!payment) return { kind: 'NOT_FOUND' as const };
      if (payment.status !== 'PENDING') return { kind: 'NOT_PENDING' as const };

      // Bascule atomique PENDING→REJECTED (verrou de ligne via le prédicat de
      // statut) : sur deux refus simultanés, un seul journalise l'action.
      const claimed = await tx.subscriptionPayment.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          confirmedById: auth.admin.id,
          confirmedAt: now,
          ...(parsed.data.reason !== undefined ? { note: parsed.data.reason } : {}),
        },
      });
      if (claimed.count === 0) return { kind: 'NOT_PENDING' as const };

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'subscription.reject',
        targetType: 'SubscriptionPayment',
        targetId: id,
        metadata: {
          organizationId: payment.organizationId,
          plan: payment.plan,
          amount: payment.amount,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        },
      });

      return { kind: 'OK' as const };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'SUB_PAYMENT_NOT_FOUND', message: 'Demande introuvable.' },
        { status: 404 },
      );
    }
    if (result.kind === 'NOT_PENDING') {
      return NextResponse.json(
        { error: 'SUB_PAYMENT_NOT_PENDING', message: 'Demande déjà traitée.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ status: 'REJECTED' }, { status: 200 });
  });
}
