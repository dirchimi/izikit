// Phase 8 — PATCH /api/admin/discount-codes/[id] (SUPERADMIN-only)
//
// Active / désactive un code. La désactivation est le seul « delete » exposé :
// on conserve l'historique (usedCount, liens de demandes) plutôt que supprimer.
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

const Body = z.object({ active: z.boolean() });

export async function PATCH(
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
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.discountCode.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'DISCOUNT_NOT_FOUND', message: 'Code introuvable.' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.discountCode.update({
      where: { id },
      data: { active: parsed.data.active },
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        active: true,
        createdAt: true,
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: parsed.data.active ? 'discount.activate' : 'discount.deactivate',
      targetType: 'DiscountCode',
      targetId: id,
      metadata: { code: existing.code },
    });

    return NextResponse.json({ code: updated }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
