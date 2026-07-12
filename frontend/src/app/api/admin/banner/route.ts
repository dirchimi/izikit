// Bannière d'information globale — gestion SUPERADMIN.
//   GET  /api/admin/banner — état courant (message, niveau, active).
//   PUT  /api/admin/banner — enregistre/active/désactive la bannière (singleton).
// SUPERADMIN. PUT : CSRF + audit `banner.set`.
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

const Body = z.object({
  message: z.string().max(280),
  level: z.enum(['INFO', 'WARNING', 'SUCCESS']),
  active: z.boolean(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const banner = await prisma.appBanner.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, message: true, level: true, active: true, updatedAt: true },
    });

    return NextResponse.json({ banner }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { message, level, active } = parsed.data;
    if (active && message.trim().length === 0) {
      return NextResponse.json(
        { error: 'MESSAGE_REQUIRED', message: 'Le message est requis pour activer la bannière' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Singleton : on met à jour l'unique enregistrement s'il existe, sinon on crée.
    const existing = await prisma.appBanner.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    const data = { message: message.trim(), level, active };
    const banner = existing
      ? await prisma.appBanner.update({ where: { id: existing.id }, data })
      : await prisma.appBanner.create({ data });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'banner.set',
      targetType: 'AppBanner',
      targetId: banner.id,
      metadata: { active, level },
    });

    return NextResponse.json(
      {
        ok: true,
        banner: {
          id: banner.id,
          message: banner.message,
          level: banner.level,
          active: banner.active,
        },
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
