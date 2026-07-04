// Phase 4 — POST /api/receivables/[id]/repay.
//
// `[id]` = identifiant du CLIENT (débiteur). Un remboursement est saisi au niveau
// du client puis réparti sur ses créances ouvertes (les plus anciennes d'abord)
// dans une transaction Serializable :
//   - charge les créances non soldées du client (org-scopé),
//   - applique min(montant, dû total) via allocateRepayment,
//   - met à jour amountPaid + statut de chaque créance impactée,
//   - écrit une ligne Repayment du montant réellement appliqué.
// 404 si le client n'est pas de la boutique. 409 NO_DEBT si rien à rembourser.
// method: cash | mobile. Rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { allocateRepayment } from '@/lib/server/receivables/helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['cash', 'mobile']),
  note: z.string().trim().max(200).optional(),
  // Date du remboursement (YYYY-MM-DD) — permet d'antidater une réception passée.
  // Absente → maintenant. Une date future est refusée.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Convertit un 'YYYY-MM-DD' en Date (midi local) ; null si future/invalide. */
function repaymentDate(ymd: string | undefined): Date | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Pas de remboursement daté dans le futur.
  if (d.getTime() > Date.now()) return null;
  return d;
}

type RepayResult =
  | { kind: 'CUSTOMER_NOT_FOUND' }
  | { kind: 'NO_DEBT' }
  | { kind: 'OK'; applied: number; remainingDebt: number };

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
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'montant positif et méthode requis' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id: customerId } = await ctx.params;
    const orgId = primary.organizationId;
    const userSub = auth.user.sub;
    const method = parsed.data.method.toUpperCase();
    const amount = parsed.data.amount;
    const note = parsed.data.note;
    const backdated = repaymentDate(parsed.data.date);

    const result: RepayResult = await prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { organizationId: true },
        });
        if (!customer || customer.organizationId !== orgId) {
          return { kind: 'CUSTOMER_NOT_FOUND' };
        }

        const open = await tx.receivable.findMany({
          where: { customerId, organizationId: orgId, status: { not: 'PAID' } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, amount: true, amountPaid: true },
        });

        const { allocations, applied } = allocateRepayment(open, amount);
        if (applied <= 0) return { kind: 'NO_DEBT' };

        for (const a of allocations) {
          await tx.receivable.update({
            where: { id: a.id },
            data: { amountPaid: a.newPaid, status: a.status },
          });
        }

        await tx.repayment.create({
          data: {
            organizationId: orgId,
            customerId,
            amount: applied,
            method,
            ...(note ? { note } : {}),
            ...(backdated ? { createdAt: backdated } : {}),
            createdById: userSub,
          },
        });

        const totalDue = open.reduce((sum, r) => sum + (r.amount - r.amountPaid), 0);
        return { kind: 'OK', applied, remainingDebt: totalDue - applied };
      },
      { isolationLevel: 'Serializable' },
    );

    if (result.kind === 'CUSTOMER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'CUSTOMER_NOT_FOUND', message: 'Client introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'NO_DEBT') {
      return NextResponse.json(
        { error: 'NO_DEBT', message: 'Ce client n’a aucune créance à rembourser' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { applied: result.applied, remainingDebt: result.remainingDebt },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
