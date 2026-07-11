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
import {
  normalizeCode,
  computeDiscountedAmount,
  validateDiscountCode,
} from '@/lib/subscription/discount';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  plan: z.enum(PLAN_IDS as unknown as [string, ...string[]]),
  method: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
  months: z.number().int().min(1).max(24).optional(),
  code: z.string().trim().min(1).max(40).optional(),
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

    const baseAmount = planPrice(plan, months);

    // Code de réduction optionnel : validation faisant autorité côté serveur.
    // La consommation (usedCount++) est atomique et intégrée à la transaction
    // de création plus bas, afin qu'un rollback (P2002) libère aussi l'usage.
    let discountCode: string | null = null;
    let finalAmount = baseAmount;
    if (parsed.data.code) {
      const code = normalizeCode(parsed.data.code);
      const record = await prisma.discountCode.findUnique({ where: { code } });
      const check = validateDiscountCode(record, new Date());
      if (!check.ok) {
        return NextResponse.json(
          { error: check.reason, message: 'Code de réduction invalide.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      discountCode = code;
      finalAmount = computeDiscountedAmount(baseAmount, check.type, check.value);
    }

    // Pré-check applicatif (message immédiat dans le cas courant).
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

    // Garde-fou race : deux POST simultanés passent tous deux le pré-check
    // ci-dessus, mais l'index unique partiel (migration 30) rejette le second
    // avec P2002 → on renvoie le même 409 SUB_REQUEST_PENDING.
    //
    // Transaction : la consommation du code (usedCount++, gardée atomiquement
    // par SQL brut) et la création de la demande vivent ensemble. Un rollback
    // (P2002 sur PENDING) libère donc aussi l'usage du code.
    const DISCOUNT_RACE = 'DISCOUNT_RACE_LOST';
    try {
      const payment = await prisma.$transaction(async (tx) => {
        if (discountCode) {
          const consumed = await tx.$executeRaw`
            UPDATE "DiscountCode"
            SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
            WHERE "code" = ${discountCode}
              AND "active" = true
              AND ("expiresAt" IS NULL OR "expiresAt" > now())
              AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
          if (consumed === 0) throw new Error(DISCOUNT_RACE);
        }
        return tx.subscriptionPayment.create({
          data: {
            organizationId: primary.organizationId,
            plan,
            method,
            months,
            amount: finalAmount,
            baseAmount,
            discountCode,
            status: 'PENDING',
            requestedById: auth.user.sub,
          },
          select: {
            id: true,
            plan: true,
            amount: true,
            baseAmount: true,
            discountCode: true,
            method: true,
            months: true,
            status: true,
            createdAt: true,
          },
        });
      });

      return NextResponse.json(
        { payment },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (e) {
      if (e instanceof Error && e.message === DISCOUNT_RACE) {
        return NextResponse.json(
          { error: 'DISCOUNT_EXHAUSTED', message: 'Ce code de réduction n’est plus disponible.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          {
            error: 'SUB_REQUEST_PENDING',
            message: 'Une demande de paiement est déjà en attente de validation.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }
  });
}
