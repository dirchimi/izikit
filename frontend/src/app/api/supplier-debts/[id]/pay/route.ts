// Dettes fournisseurs — POST /api/supplier-debts/[id]/pay.
//
// Enregistre un remboursement (total ou partiel) sur UNE dette fournisseur.
// `[id]` = identifiant de la dette. Le montant est borné au reste dû ; le statut
// passe à PARTIAL puis PAID quand tout est réglé. Transaction Serializable
// (pas de double-paiement sous concurrence). 404 si la dette n'est pas de la
// boutique, 409 si déjà soldée. Réservé au Patron (OWNER) / Manager (ADMIN).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { requireActiveSubscription } from '@/lib/server/subscription/guard';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { withTxRetry } from '@/lib/server/db/retry-transaction';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  amount: z.number().int().positive(),
});

type PayResult =
  | { kind: 'NOT_FOUND' }
  | { kind: 'ALREADY_PAID' }
  | { kind: 'OK'; applied: number; remaining: number; status: string };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    // « Appli douce » : abonnement expiré (hors grâce) → écriture refusée.
    const locked = await requireActiveSubscription(primary.organizationId);
    if (locked) return locked;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'montant positif requis' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id } = await ctx.params;
    const orgId = primary.organizationId;
    const amount = parsed.data.amount;

    // Rejoue la tx si deux paiements simultanés sur la même dette entrent en
    // conflit de sérialisation (au lieu de renvoyer une 500).
    const result: PayResult = await withTxRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const debt = await tx.supplierDebt.findUnique({
            where: { id },
            select: { organizationId: true, amount: true, amountPaid: true, status: true },
          });
          if (!debt || debt.organizationId !== orgId) return { kind: 'NOT_FOUND' };
          if (debt.status === 'PAID') return { kind: 'ALREADY_PAID' };

          const remainingBefore = debt.amount - debt.amountPaid;
          const applied = Math.min(amount, remainingBefore);
          const newPaid = debt.amountPaid + applied;
          const status = newPaid >= debt.amount ? 'PAID' : 'PARTIAL';

          await tx.supplierDebt.update({
            where: { id },
            data: { amountPaid: newPaid, status },
          });

          return { kind: 'OK', applied, remaining: debt.amount - newPaid, status };
        },
        { isolationLevel: 'Serializable' },
      ),
    );

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'DEBT_NOT_FOUND', message: 'Dette introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'ALREADY_PAID') {
      return NextResponse.json(
        { error: 'ALREADY_PAID', message: 'Cette dette est déjà soldée' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { applied: result.applied, remaining: result.remaining, status: result.status },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
