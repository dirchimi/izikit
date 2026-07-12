// PUT /api/admin/boutiques/[id]/note — enregistre la note interne (mini-CRM) du
// SUPERADMIN sur une boutique. Texte libre, jamais visible côté patron/vendeurs.
// Chaîne vide → note effacée (null). SUPERADMIN, CSRF, audité.
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

const Body = z.object({ note: z.string().max(4000) });

export async function PUT(
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

    const existing = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'BOUTIQUE_NOT_FOUND', message: 'Boutique introuvable' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const note = parsed.data.note.trim();
    await prisma.organization.update({
      where: { id },
      data: { adminNote: note.length > 0 ? note : null },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'boutique.note',
      targetType: 'Organization',
      targetId: id,
      metadata: { name: existing.name, cleared: note.length === 0 },
    });

    return NextResponse.json(
      { ok: true, adminNote: note.length > 0 ? note : null },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
