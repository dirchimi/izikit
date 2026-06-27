// Révocation d'une invitation en attente (rôle min ADMIN).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth, requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPrimaryMembership } from '@/lib/server/boutique/ensure-boutique';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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
    const gate = await requireOrgRole(primary.organizationId, 'ADMIN');
    if (gate instanceof NextResponse) return gate;

    const { id } = await context.params;
    // Garde-fou multi-tenant : ne supprime que si l'invitation est de cette boutique.
    const result = await prisma.invitation.deleteMany({
      where: { id, organizationId: primary.organizationId },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: 'INVITATION_NOT_FOUND', message: 'Invitation introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
