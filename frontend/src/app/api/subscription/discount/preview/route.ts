// Phase 8 — POST /api/subscription/discount/preview
//
// Aperçu d'un code de réduction AVANT l'émission de la demande : le patron saisit
// un code + une durée, le serveur renvoie le prix de base et le prix remisé.
// Ne consomme PAS le code (aucun usedCount++). L'autorité finale reste la route
// /api/subscription/request, qui revalide et consomme atomiquement.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { PLAN_IDS, planPrice } from '@/lib/subscription/plans';
import {
  normalizeCode,
  computeDiscountedAmount,
  validateDiscountCode,
} from '@/lib/subscription/discount';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  plan: z.enum(PLAN_IDS as unknown as [string, ...string[]]),
  months: z.number().int().min(1).max(24).optional(),
  code: z.string().trim().min(1).max(40),
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
    const months = parsed.data.months ?? 1;
    const baseAmount = planPrice(plan, months);

    const code = normalizeCode(parsed.data.code);
    const record = await prisma.discountCode.findUnique({ where: { code } });
    const check = validateDiscountCode(record, new Date());
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason, message: 'Code de réduction invalide.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const finalAmount = computeDiscountedAmount(baseAmount, check.type, check.value);
    return NextResponse.json(
      { code, baseAmount, finalAmount, discount: baseAmount - finalAmount },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
