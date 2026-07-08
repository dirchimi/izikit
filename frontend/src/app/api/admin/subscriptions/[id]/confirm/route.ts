// Phase 8 — POST /api/admin/subscriptions/[id]/confirm (SUPERADMIN-only)
//
// Confirme l'encaissement MANUEL d'une demande d'abonnement PENDING :
//   1. marque le paiement CONFIRMED (avec période couverte),
//   2. pose le plan + prolonge Organization.currentPeriodEnd (empilement des
//      renouvellements via extendPeriod),
//   3. journalise l'action (logAdminAction — traçabilité back-office).
// Le tout dans une transaction : org et paiement restent cohérents.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { extendPeriod } from '@/lib/subscription/status';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  // Optionnel : force une durée différente de celle demandée.
  months: z.number().int().min(1).max(24).optional(),
  note: z.string().max(500).optional(),
});

type Result = { kind: 'NOT_FOUND' } | { kind: 'NOT_PENDING' } | { kind: 'OK'; periodEnd: Date };

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
        select: {
          id: true,
          status: true,
          months: true,
          plan: true,
          amount: true,
          organizationId: true,
          organization: { select: { currentPeriodEnd: true } },
        },
      });
      if (!payment) return { kind: 'NOT_FOUND' as const };
      if (payment.status !== 'PENDING') return { kind: 'NOT_PENDING' as const };

      const months = parsed.data.months ?? payment.months;
      const { periodStart, periodEnd } = extendPeriod(
        payment.organization.currentPeriodEnd,
        now,
        months,
      );

      // Bascule atomique PENDING→CONFIRMED : le prédicat `status: 'PENDING'`
      // pose un verrou de ligne, donc sur deux confirmations simultanées une
      // seule voit count=1 ; la perdante obtient count=0 → NOT_PENDING. Évite
      // les doublons de journal d'audit et l'écrasement de la période.
      const claimed = await tx.subscriptionPayment.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'CONFIRMED',
          months,
          periodStart,
          periodEnd,
          confirmedById: auth.admin.id,
          confirmedAt: now,
          ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
        },
      });
      if (claimed.count === 0) return { kind: 'NOT_PENDING' as const };

      await tx.organization.update({
        where: { id: payment.organizationId },
        data: { plan: payment.plan, currentPeriodEnd: periodEnd },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'subscription.confirm',
        targetType: 'SubscriptionPayment',
        targetId: id,
        metadata: {
          organizationId: payment.organizationId,
          plan: payment.plan,
          amount: payment.amount,
          months,
          periodEnd: periodEnd.toISOString(),
        },
      });

      return { kind: 'OK' as const, periodEnd };
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
    return NextResponse.json(
      { status: 'CONFIRMED', currentPeriodEnd: result.periodEnd.toISOString() },
      { status: 200 },
    );
  });
}
