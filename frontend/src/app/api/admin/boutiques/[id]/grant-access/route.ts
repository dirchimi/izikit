// POST /api/admin/boutiques/[id]/grant-access — prolonge l'accès d'une boutique
// de N jours, GRATUITEMENT (geste commercial, cash encaissé de la main à la
// main, dépannage). N'écrit AUCUN paiement → n'entre pas dans le chiffre
// d'affaires ; l'action est tracée dans le journal d'audit.
//
// La période s'empile : on prolonge à partir de la fin d'accès en cours si elle
// est encore dans le futur, sinon à partir de maintenant. Pose le plan PREMIUM
// (le statut devient ACTIF). SUPERADMIN uniquement, CSRF, audité.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DAY_MS = 24 * 60 * 60 * 1000;
const Body = z.object({ days: z.number().int().min(1).max(3650) });

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
        { error: 'VALIDATION_FAILED', message: 'Nombre de jours invalide (1–3650).' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, currentPeriodEnd: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'BOUTIQUE_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const now = new Date();
    const base =
      org.currentPeriodEnd && org.currentPeriodEnd.getTime() > now.getTime()
        ? org.currentPeriodEnd
        : now;
    const newEnd = new Date(base.getTime() + parsed.data.days * DAY_MS);

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { plan: 'PREMIUM', currentPeriodEnd: newEnd },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'boutique.grant_access',
        targetType: 'Organization',
        targetId: id,
        metadata: { name: org.name, days: parsed.data.days, until: newEnd.toISOString() },
      });
    });

    return NextResponse.json(
      { ok: true, currentPeriodEnd: newEnd.toISOString() },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
