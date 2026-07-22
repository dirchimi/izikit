// POST /api/admin/subscriptions/[id]/amount (SUPERADMIN-only)
//
// Corrige le MONTANT d'un paiement d'abonnement déjà CONFIRMÉ — l'encaissement
// est manuel, et un montant enregistré peut différer de l'argent réellement
// reçu (remise verbale, ancien bug de recalcul au plein tarif qui écrasait la
// réduction code promo…). Ne touche NI le statut NI la période d'accès : c'est
// une correction comptable pure. Journalisée avec l'ancien et le nouveau
// montant (logAdminAction).
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

const Body = z.object({
  amount: z.number().int().min(0).max(50_000_000),
  note: z.string().max(500).optional(),
});

type Result = { kind: 'NOT_FOUND' } | { kind: 'NOT_CONFIRMED' } | { kind: 'OK'; amount: number };

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
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Montant invalide' },
        { status: 400 },
      );
    }

    const result: Result = await prisma.$transaction(async (tx) => {
      const payment = await tx.subscriptionPayment.findUnique({
        where: { id },
        select: { id: true, status: true, amount: true, organizationId: true, plan: true },
      });
      if (!payment) return { kind: 'NOT_FOUND' as const };
      // Seuls les paiements CONFIRMÉS se corrigent ici : un PENDING se corrige
      // à la confirmation (champ montant), un REJETÉ n'a pas d'encaissé.
      if (payment.status !== 'CONFIRMED') return { kind: 'NOT_CONFIRMED' as const };

      await tx.subscriptionPayment.update({
        where: { id },
        data: { amount: parsed.data.amount },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'subscription.amount_correct',
        targetType: 'SubscriptionPayment',
        targetId: id,
        metadata: {
          organizationId: payment.organizationId,
          plan: payment.plan,
          previousAmount: payment.amount,
          amount: parsed.data.amount,
          ...(parsed.data.note ? { note: parsed.data.note } : {}),
        },
      });

      return { kind: 'OK' as const, amount: parsed.data.amount };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'SUB_PAYMENT_NOT_FOUND', message: 'Paiement introuvable.' },
        { status: 404 },
      );
    }
    if (result.kind === 'NOT_CONFIRMED') {
      return NextResponse.json(
        { error: 'SUB_PAYMENT_NOT_CONFIRMED', message: 'Seul un paiement confirmé se corrige.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ amount: result.amount }, { status: 200 });
  });
}
