// GET /api/banner — bannière d'information globale active (ou null). Lue par
// l'app boutique pour l'afficher en haut à tous les utilisateurs connectés.
// Lecture seule, tout utilisateur authentifié.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const banner = await prisma.appBanner.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, message: true, level: true },
    });

    return NextResponse.json({ banner }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
