// POST /api/auth/onboarded — marque l'accueil (modale de bienvenue) comme vu.
//
// Idempotent : ne renseigne `onboardedAt` que s'il est encore NULL (updateMany
// avec garde `where null`), donc rejouer l'appel ne réécrit pas la date. Sert à
// n'afficher la modale de bienvenue qu'une seule fois, à vie, par compte —
// indépendamment de l'appareil ou du navigateur (contrairement à un drapeau
// localStorage). Aucun corps de requête.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // Garde `onboardedAt: null` → premier appel seulement ; les suivants n'écrivent rien.
    await prisma.user.updateMany({
      where: { id: auth.user.sub, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });

    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
