// GET /api/search?q=... — recherche globale boutique (produits, clients, ventes,
// dépenses), scopée à l'organisation de l'utilisateur. Lecture seule, rôle min MEMBER.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { globalSearch } from '@/lib/server/search/global-search';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const primary = await getPrimaryMembership(auth.user.sub);
    if (!primary) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'Aucune boutique pour cet utilisateur' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const gate = await requireOrgRole(primary.organizationId, 'MEMBER');
    if (gate instanceof NextResponse) return gate;

    const q = req.nextUrl.searchParams.get('q') ?? '';
    const results = await globalSearch(prisma, primary.organizationId, q);

    return NextResponse.json(results, { headers: { 'x-request-id': ctx.requestId } });
  });
}
