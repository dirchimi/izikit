// Liste d'attente Premium (teaser). GET = l'utilisateur est-il déjà inscrit ?
// POST = l'inscrire (idempotent : ne réécrase pas la 1re date). Pas de paiement
// ici — c'est un capteur d'intérêt en attendant la Phase 8 (abonnement).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { premiumInterestAt: true },
    });

    return NextResponse.json(
      { interested: !!user?.premiumInterestAt },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    // Idempotent : on ne renseigne la date que la première fois.
    await prisma.user.updateMany({
      where: { id: auth.user.sub, premiumInterestAt: null },
      data: { premiumInterestAt: new Date() },
    });

    return NextResponse.json(
      { ok: true, interested: true },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
